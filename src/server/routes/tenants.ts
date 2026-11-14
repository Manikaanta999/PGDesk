import crypto from 'node:crypto';
import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { calculateDepositSettlement, calculateGstBreakdown, calculateProRataRent } from '../../lib/billing.ts';
import { hashPassword } from '../../lib/security.ts';
import { createTenantSchema, moveOutTenantSchema } from '../../lib/validation.ts';
import {
  AuthRequest,
  canAccessProperty,
  getAllowedPropertyIds,
  requireAuth,
  requireRole,
} from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';
import { allocateNextFyInvoiceNumber } from '../billingEngine.ts';

export const tenantsRouter = Router();

tenantsRouter.get('/', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));
    const search = String(req.query.search || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'ALL').toUpperCase();
    const propertyIdFilter = req.query.propertyId ? Number(req.query.propertyId) : null;
    const dueOnly = String(req.query.dueOnly || 'false') === 'true';

    const orgProps = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));

    const allowedIds = getAllowedPropertyIds(user, orgProps.map((p) => p.id));
    if (allowedIds.length === 0) {
      return res.json({ tenants: [], total: 0, page, pageSize });
    }

    const [allTenants, allBeds, allRooms, allInvoices] = await Promise.all([
      db
        .select()
        .from(schema.tenants)
        .where(
          and(
            eq(schema.tenants.organizationId, user.organizationId),
            inArray(schema.tenants.propertyId, allowedIds),
            isNull(schema.tenants.deletedAt)
          )
        )
        .orderBy(desc(schema.tenants.createdAt)),
      db.select().from(schema.beds).where(eq(schema.beds.organizationId, user.organizationId)),
      db.select().from(schema.rooms).where(eq(schema.rooms.organizationId, user.organizationId)),
      db.select().from(schema.invoices).where(eq(schema.invoices.organizationId, user.organizationId)),
    ]);

    const propMap = new Map(orgProps.map((p) => [p.id, p]));
    const bedMap = new Map(allBeds.map((b) => [b.id, b]));
    const roomMap = new Map(allRooms.map((r) => [r.id, r]));

    const dueByTenant = new Map<number, number>();
    for (const inv of allInvoices) {
      const bal = Math.max(0, inv.amount - inv.paidAmount);
      if (bal > 0) {
        dueByTenant.set(inv.tenantId, (dueByTenant.get(inv.tenantId) ?? 0) + bal);
      }
    }

    let enriched = allTenants.map((t) => {
      const bed = t.bedId ? bedMap.get(t.bedId) : undefined;
      const room = bed ? roomMap.get(bed.roomId) : undefined;
      const prop = propMap.get(t.propertyId);
      const balanceDue = dueByTenant.get(t.id) ?? 0;
      return {
        ...t,
        propertyName: prop?.name || '',
        bedLabel: bed?.bedLabel || 'Unassigned',
        roomNumber: room?.roomNumber || '',
        roomType: room?.roomType || '',
        balanceDue,
      };
    });

    if (propertyIdFilter) {
      enriched = enriched.filter((t) => t.propertyId === propertyIdFilter);
    }
    if (statusFilter !== 'ALL') {
      enriched = enriched.filter((t) => t.status === statusFilter);
    }
    if (dueOnly) {
      enriched = enriched.filter((t) => t.balanceDue > 0);
    }
    if (search) {
      enriched = enriched.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.phone.includes(search) ||
          t.bedLabel.toLowerCase().includes(search) ||
          (t.companyOrCollege || '').toLowerCase().includes(search)
      );
    }

    const total = enriched.length;
    const start = (page - 1) * pageSize;
    const items = enriched.slice(start, start + pageSize);

    return res.json({ tenants: items, total, page, pageSize });
  } catch (err) {
    console.error('GET /api/tenants error:', err);
    return res.status(500).json({ error: 'Failed to load tenants' });
  }
});

tenantsRouter.post('/', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid tenant data' });
    }

    const data = parsed.data;
    if (!canAccessProperty(user, data.propertyId)) {
      return res.status(403).json({ error: 'Access denied to this property' });
    }

    const [bed] = await db
      .select()
      .from(schema.beds)
      .where(
        and(
          eq(schema.beds.id, data.bedId),
          eq(schema.beds.propertyId, data.propertyId),
          eq(schema.beds.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!bed) {
      return res.status(404).json({ error: 'Selected bed not found in this property' });
    }
    if (bed.status === 'OCCUPIED' || bed.status === 'MAINTENANCE') {
      return res.status(409).json({ error: `Bed ${bed.bedLabel} is currently ${bed.status} and cannot be assigned.` });
    }

    const cleanPhone = data.phone.replace(/\D/g, '').slice(-10);
    const emergencyPhone = data.emergencyContactPhone.replace(/\D/g, '').slice(-10);

    // Optionally link or create a portal user for this tenant if email is provided
    let linkedUserId: number | null = null;
    if (data.email) {
      const existingUsers = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, data.email.toLowerCase()))
        .limit(1);
      if (existingUsers[0]) {
        linkedUserId = existingUsers[0].id;
      } else {
        const [portalUser] = await db
          .insert(schema.users)
          .values({
            organizationId: user.organizationId,
            name: data.name,
            email: data.email.toLowerCase(),
            phone: cleanPhone,
            passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
            role: 'TENANT',
            assignedPropertyIds: [data.propertyId],
            isActive: true,
            emailVerified: false,
          })
          .returning();
        linkedUserId = portalUser.id;
      }
    }

    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        organizationId: user.organizationId,
        propertyId: data.propertyId,
        bedId: bed.id,
        userId: linkedUserId,
        name: data.name,
        phone: cleanPhone,
        email: data.email || null,
        idType: data.idType,
        idNumberMasked: data.idNumberMasked,
        idDocumentUrl: data.idDocumentUrl || null,
        occupation: data.occupation,
        companyOrCollege: data.companyOrCollege,
        permanentAddress: data.permanentAddress,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: emergencyPhone,
        joinDate: data.joinDate,
        status: 'ACTIVE',
        monthlyRent: data.monthlyRent,
        securityDeposit: data.securityDeposit,
        depositStatus: 'HELD',
      })
      .returning();

    await db
      .update(schema.beds)
      .set({ status: 'OCCUPIED', updatedAt: new Date() })
      .where(eq(schema.beds.id, bed.id));

    // Auto-generate pro-rata joining month invoice if enabled
    let createdInvoice = null;
    if (data.generateJoiningInvoice) {
      const [jy, jm] = data.joinDate.split('-').map(Number);
      const calc = calculateProRataRent({
        monthlyRent: data.monthlyRent,
        year: jy,
        month: jm,
        joinDate: data.joinDate,
      });

      if (calc.amount > 0) {
        const [org] = await db
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, user.organizationId))
          .limit(1);
        const invNum = await allocateNextFyInvoiceNumber(user.organizationId, jy, jm);
        const dueDate = `${jy}-${String(jm).padStart(2, '0')}-${String(
          Math.min(28, Number(data.joinDate.split('-')[2]) + 3)
        ).padStart(2, '0')}`;
        const gst = calculateGstBreakdown(calc.amount, org?.gstRatePct ?? 0);
        const invItems: schema.InvoiceLineItem[] = [
          {
            label: calc.isProRata
              ? `Pro-rata Rent (${calc.billableDays}/${calc.totalDaysInMonth} days)`
              : 'Monthly Bed Rent',
            type: 'RENT',
            amount: gst.taxableValue,
          },
        ];
        if (gst.gstRatePct > 0) {
          invItems.push(
            { label: `CGST (${gst.cgstRatePct}%)`, type: 'OTHER', amount: gst.cgstAmount },
            { label: `SGST (${gst.sgstRatePct}%)`, type: 'OTHER', amount: gst.sgstAmount }
          );
        }
        const [inv] = await db
          .insert(schema.invoices)
          .values({
            organizationId: user.organizationId,
            propertyId: data.propertyId,
            tenantId: tenant.id,
            invoiceNumber: invNum,
            periodMonth: jm,
            periodYear: jy,
            periodStart: calc.periodStart,
            periodEnd: calc.periodEnd,
            items: invItems,
            amount: gst.totalWithGst,
            paidAmount: 0,
            dueDate,
            status: 'PENDING',
            isProRata: calc.isProRata,
          })
          .returning();
        createdInvoice = inv;
      }
    }

    await logAudit({
      user,
      action: 'TENANT_ONBOARDED',
      entityType: 'TENANT',
      entityId: tenant.id,
      metadata: { name: tenant.name, bedId: bed.id, bedLabel: bed.bedLabel },
    });

    return res.status(201).json({ tenant, invoice: createdInvoice });
  } catch (err) {
    console.error('POST /api/tenants error:', err);
    return res.status(500).json({ error: 'Failed to onboard tenant' });
  }
});

tenantsRouter.get('/:id', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenantId = Number(req.params.id);

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(
        and(
          eq(schema.tenants.id, tenantId),
          eq(schema.tenants.organizationId, user.organizationId),
          isNull(schema.tenants.deletedAt)
        )
      )
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    if (!canAccessProperty(user, tenant.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [propRows, bedRows, tenantInvoices, tenantPayments, tenantComplaints] = await Promise.all([
      db.select().from(schema.properties).where(eq(schema.properties.id, tenant.propertyId)).limit(1),
      tenant.bedId ? db.select().from(schema.beds).where(eq(schema.beds.id, tenant.bedId)).limit(1) : Promise.resolve([]),
      db
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.tenantId, tenant.id))
        .orderBy(desc(schema.invoices.periodYear), desc(schema.invoices.periodMonth)),
      db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.tenantId, tenant.id))
        .orderBy(desc(schema.payments.createdAt)),
      db
        .select()
        .from(schema.complaints)
        .where(eq(schema.complaints.tenantId, tenant.id))
        .orderBy(desc(schema.complaints.createdAt)),
    ]);

    const bed = bedRows[0] || null;
    let room = null;
    if (bed) {
      const rRows = await db.select().from(schema.rooms).where(eq(schema.rooms.id, bed.roomId)).limit(1);
      room = rRows[0] || null;
    }

    const unpaidBalance = tenantInvoices.reduce((s, inv) => s + Math.max(0, inv.amount - inv.paidAmount), 0);

    return res.json({
      tenant,
      property: propRows[0] || null,
      bed,
      room,
      invoices: tenantInvoices,
      payments: tenantPayments,
      complaints: tenantComplaints,
      unpaidBalance,
    });
  } catch (err) {
    console.error('GET /api/tenants/:id error:', err);
    return res.status(500).json({ error: 'Failed to load tenant profile' });
  }
});

tenantsRouter.post('/:id/move-out', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenantId = Number(req.params.id);
    const parsed = moveOutTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid move-out details' });
    }

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(and(eq(schema.tenants.id, tenantId), eq(schema.tenants.organizationId, user.organizationId)))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    if (!canAccessProperty(user, tenant.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tenantInvoices = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.tenantId, tenant.id));
    const unpaidBalance = tenantInvoices.reduce((s, inv) => s + Math.max(0, inv.amount - inv.paidAmount), 0);

    const settlement = calculateDepositSettlement({
      securityDeposit: tenant.securityDeposit,
      unpaidInvoicesBalance: unpaidBalance,
      damageOrNoticeDeductions: parsed.data.depositDeductions,
    });

    const [updated] = await db
      .update(schema.tenants)
      .set({
        status: 'LEFT',
        leaveDate: parsed.data.leaveDate,
        depositStatus: parsed.data.depositStatus,
        depositDeductions: parsed.data.depositDeductions,
        depositSettlementNote: parsed.data.depositSettlementNote,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id))
      .returning();

    if (tenant.bedId) {
      await db
        .update(schema.beds)
        .set({ status: 'VACANT', updatedAt: new Date() })
        .where(eq(schema.beds.id, tenant.bedId));
    }

    await logAudit({
      user,
      action: 'TENANT_MOVED_OUT',
      entityType: 'TENANT',
      entityId: tenant.id,
      metadata: {
        leaveDate: parsed.data.leaveDate,
        netRefundable: settlement.netRefundable,
        depositStatus: parsed.data.depositStatus,
      },
    });

    return res.json({ tenant: updated, settlement });
  } catch (err) {
    console.error('POST /api/tenants/:id/move-out error:', err);
    return res.status(500).json({ error: 'Failed to complete move-out settlement' });
  }
});
