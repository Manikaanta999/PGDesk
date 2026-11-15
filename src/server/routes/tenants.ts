import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { calculateDepositSettlement, calculateGstBreakdown, calculateProRataRent } from '../../lib/billing.ts';
import { generateStudentLinkCode } from '../../lib/platformAuth.ts';
import { hashToken } from '../../lib/security.ts';
import {
  createTenantSchema,
  moveOutTenantSchema,
  ownerMoveOutReviewSchema,
  updateTenantProfileSchema,
} from '../../lib/validation.ts';
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
      const { linkCodeHash: _lch, ...safeTenant } = t;
      return {
        ...safeTenant,
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
          (t.phone || '').includes(search) ||
          (t.email || '').toLowerCase().includes(search) ||
          t.bedLabel.toLowerCase().includes(search) ||
          (t.roomNumber || '').toLowerCase().includes(search) ||
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

    const cleanPhone = data.phone && data.phone.trim() ? data.phone.replace(/\D/g, '').slice(-10) : null;
    const emergencyPhone = data.emergencyContactPhone
      ? data.emergencyContactPhone.replace(/\D/g, '').slice(-10)
      : '';
    const emailLower = data.email && data.email.trim() ? data.email.trim().toLowerCase() : null;

    // Owner creates student record directly without creating or auto-linking any student login account
    const [tenant] = await db
      .insert(schema.tenants)
      .values({
        organizationId: user.organizationId,
        propertyId: data.propertyId,
        bedId: bed.id,
        userId: null,
        accountLinkStatus: 'NO_ACCOUNT',
        name: data.name,
        phone: cleanPhone,
        email: emailLower,
        idType: data.idType || 'Aadhaar',
        idNumberMasked: data.idNumberMasked || '',
        idDocumentUrl: data.idDocumentUrl || null,
        occupation: data.occupation || 'Resident',
        companyOrCollege: data.companyOrCollege || '',
        permanentAddress: data.permanentAddress || '',
        emergencyContactName: data.emergencyContactName || '',
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

    if (data.enquiryId) {
      await db
        .update(schema.enquiries)
        .set({
          status: 'CONVERTED_TO_STUDENT',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.enquiries.id, data.enquiryId),
            eq(schema.enquiries.organizationId, user.organizationId)
          )
        );
    }

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

    const [propRows, bedRows, tenantInvoices, tenantPayments, tenantComplaints, tenantMoveOutRequests] = await Promise.all([
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
      db
        .select()
        .from(schema.moveOutRequests)
        .where(and(eq(schema.moveOutRequests.tenantId, tenant.id), eq(schema.moveOutRequests.organizationId, user.organizationId)))
        .orderBy(desc(schema.moveOutRequests.createdAt)),
    ]);

    const bed = bedRows[0] || null;
    let room = null;
    if (bed) {
      const rRows = await db.select().from(schema.rooms).where(eq(schema.rooms.id, bed.roomId)).limit(1);
      room = rRows[0] || null;
    }

    const unpaidBalance = tenantInvoices.reduce((s, inv) => s + Math.max(0, inv.amount - inv.paidAmount), 0);
    let linkRequester: { id: number; name: string; email: string } | null = null;
    if (tenant.linkRequestedByUserId) {
      const [reqUser] = await db
        .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, tenant.linkRequestedByUserId))
        .limit(1);
      linkRequester = reqUser || null;
    }

    const { linkCodeHash: _lch, ...safeTenant } = tenant;

    return res.json({
      tenant: safeTenant,
      linkRequester,
      property: propRows[0] || null,
      bed,
      room,
      invoices: tenantInvoices,
      payments: tenantPayments,
      complaints: tenantComplaints,
      moveOutRequests: tenantMoveOutRequests,
      unpaidBalance,
    });
  } catch (err) {
    console.error('GET /api/tenants/:id error:', err);
    return res.status(500).json({ error: 'Failed to load tenant profile' });
  }
});

tenantsRouter.patch('/:id', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
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

    const parsed = updateTenantProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid tenant details' });
    }

    const d = parsed.data;
    const nextPhone = d.phone ? d.phone.replace(/\D/g, '').slice(-10) : tenant.phone;
    const nextEmergencyPhone = d.emergencyContactPhone
      ? d.emergencyContactPhone.replace(/\D/g, '').slice(-10)
      : '';

    const [updated] = await db
      .update(schema.tenants)
      .set({
        name: d.name,
        phone: nextPhone,
        ...(d.photoUrl !== undefined ? { photoUrl: d.photoUrl || null } : {}),
        ...(d.dateOfBirth !== undefined ? { dateOfBirth: d.dateOfBirth || null } : {}),
        occupation: d.occupation || tenant.occupation,
        companyOrCollege: d.companyOrCollege ?? '',
        permanentAddress: d.permanentAddress ?? '',
        emergencyContactName: d.emergencyContactName ?? '',
        emergencyContactRelation: d.emergencyContactRelation ?? tenant.emergencyContactRelation ?? '',
        emergencyContactPhone: nextEmergencyPhone,
        idType: d.idType || tenant.idType,
        idNumberMasked: d.idNumberMasked ?? '',
        idDocumentUrl: d.idDocumentUrl !== undefined ? d.idDocumentUrl : tenant.idDocumentUrl,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id))
      .returning();

    return res.json({ tenant: updated });
  } catch (err) {
    console.error('PATCH /api/tenants/:id error:', err);
    return res.status(500).json({ error: 'Failed to update tenant profile' });
  }
});

tenantsRouter.patch('/:id/kyc-status', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenantId = Number(req.params.id);
    const status = String(req.body?.status || '').toUpperCase();
    if (!['VERIFIED', 'PENDING', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid KYC status' });
    }

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(and(eq(schema.tenants.id, tenantId), eq(schema.tenants.organizationId, user.organizationId), isNull(schema.tenants.deletedAt)))
      .limit(1);

    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!canAccessProperty(user, tenant.propertyId)) return res.status(403).json({ error: 'Access denied' });

    const [updated] = await db
      .update(schema.tenants)
      .set({ kycVerifiedStatus: status, updatedAt: new Date() })
      .where(eq(schema.tenants.id, tenant.id))
      .returning();

    await logAudit({
      user,
      action: 'TENANT_KYC_STATUS_UPDATED',
      entityType: 'TENANT',
      entityId: tenant.id,
      metadata: { kycVerifiedStatus: status },
    });

    return res.json({ tenant: updated });
  } catch (err) {
    console.error('PATCH /api/tenants/:id/kyc-status error:', err);
    return res.status(500).json({ error: 'Failed to update KYC verification status' });
  }
});

tenantsRouter.patch(
  '/:id/move-out-requests/:requestId',
  requireAuth,
  requireRole('OWNER', 'MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const tenantId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      const parsed = ownerMoveOutReviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid review update' });
      }

      const [tenant] = await db
        .select()
        .from(schema.tenants)
        .where(and(eq(schema.tenants.id, tenantId), eq(schema.tenants.organizationId, user.organizationId)))
        .limit(1);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      if (!canAccessProperty(user, tenant.propertyId)) return res.status(403).json({ error: 'Access denied' });

      const [updatedReq] = await db
        .update(schema.moveOutRequests)
        .set({
          status: parsed.data.status,
          ownerNote: parsed.data.ownerNote || '',
          reviewedByUserId: user.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.moveOutRequests.id, requestId),
            eq(schema.moveOutRequests.tenantId, tenant.id),
            eq(schema.moveOutRequests.organizationId, user.organizationId)
          )
        )
        .returning();

      if (!updatedReq) return res.status(404).json({ error: 'Move-out request not found' });

      if (parsed.data.status === 'REJECTED' && tenant.status === 'NOTICE') {
        await db
          .update(schema.tenants)
          .set({ status: 'ACTIVE', leaveDate: null, updatedAt: new Date() })
          .where(eq(schema.tenants.id, tenant.id));
      }

      return res.json({ moveOutRequest: updatedReq });
    } catch (err) {
      console.error('PATCH /api/tenants/:id/move-out-requests/:requestId error:', err);
      return res.status(500).json({ error: 'Failed to update move-out request' });
    }
  }
);

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

    await db
      .update(schema.moveOutRequests)
      .set({
        status: 'APPROVED',
        reviewedByUserId: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.moveOutRequests.tenantId, tenant.id),
          eq(schema.moveOutRequests.organizationId, user.organizationId),
          inArray(schema.moveOutRequests.status, ['SUBMITTED', 'UNDER_REVIEW'])
        )
      );

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

tenantsRouter.post('/:id/invite-link', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
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

    if (!tenant) return res.status(404).json({ error: 'Student record not found' });
    if (!canAccessProperty(user, tenant.propertyId)) return res.status(403).json({ error: 'Access denied' });
    if (tenant.userId) {
      return res.status(409).json({ error: 'This student record is already linked to a student account.' });
    }

    const linkCode = generateStudentLinkCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db
      .update(schema.tenants)
      .set({
        linkCodeHash: hashToken(linkCode),
        linkCodeExpiresAt: expiresAt,
        accountLinkStatus: 'LINK_PENDING',
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id));

    await logAudit({
      user,
      action: 'STUDENT_LINK_CODE_GENERATED',
      entityType: 'TENANT',
      entityId: tenant.id,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    return res.json({
      linkCode,
      expiresAt,
      message: 'One-time link code generated. Share this code with the student so they can link their account.',
    });
  } catch (err) {
    console.error('POST /api/tenants/:id/invite-link error:', err);
    return res.status(500).json({ error: 'Failed to generate student link code' });
  }
});

tenantsRouter.post('/:id/link-decision', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenantId = Number(req.params.id);
    const decision = String(req.body?.decision || '').toUpperCase();
    if (!['APPROVE', 'REJECT', 'UNLINK'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be APPROVE, REJECT, or UNLINK' });
    }

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

    if (!tenant) return res.status(404).json({ error: 'Student record not found' });
    if (!canAccessProperty(user, tenant.propertyId)) return res.status(403).json({ error: 'Access denied' });

    if (decision === 'APPROVE') {
      if (!tenant.linkRequestedByUserId) {
        return res.status(400).json({ error: 'No pending student account link request on this record.' });
      }
      const targetUserId = tenant.linkRequestedByUserId;
      const [linked] = await db
        .update(schema.tenants)
        .set({
          userId: targetUserId,
          accountLinkStatus: 'LINKED',
          linkedAt: new Date(),
          linkCodeHash: null,
          linkCodeExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.tenants.id, tenant.id),
            isNull(schema.tenants.userId),
            isNull(schema.tenants.deletedAt)
          )
        )
        .returning();

      if (!linked) {
        return res.status(409).json({ error: 'This student record is already linked to another account.' });
      }

      const [studentUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, targetUserId))
        .limit(1);

      if (studentUser && studentUser.role === 'TENANT') {
        const nextPropIds = Array.from(new Set([...(studentUser.assignedPropertyIds || []), tenant.propertyId]));
        await db
          .update(schema.users)
          .set({
            organizationId: tenant.organizationId,
            assignedPropertyIds: nextPropIds,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, studentUser.id));
      }

      await logAudit({
        user,
        action: 'STUDENT_LINK_APPROVED',
        entityType: 'TENANT',
        entityId: tenant.id,
        metadata: { linkedUserId: targetUserId },
      });

      return res.json({ ok: true, tenant: linked });
    }

    if (decision === 'REJECT') {
      const [rejected] = await db
        .update(schema.tenants)
        .set({
          accountLinkStatus: 'LINK_REJECTED',
          linkRequestedByUserId: null,
          linkRequestedAt: null,
          linkCodeHash: null,
          linkCodeExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenants.id, tenant.id))
        .returning();

      await logAudit({
        user,
        action: 'STUDENT_LINK_REJECTED',
        entityType: 'TENANT',
        entityId: tenant.id,
      });

      return res.json({ ok: true, tenant: rejected });
    }

    // UNLINK
    const [unlinked] = await db
      .update(schema.tenants)
      .set({
        userId: null,
        accountLinkStatus: 'NO_ACCOUNT',
        linkedAt: null,
        linkRequestedByUserId: null,
        linkRequestedAt: null,
        linkCodeHash: null,
        linkCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id))
      .returning();

    await logAudit({
      user,
      action: 'STUDENT_UNLINKED',
      entityType: 'TENANT',
      entityId: tenant.id,
    });

    return res.json({ ok: true, tenant: unlinked });
  } catch (err) {
    console.error('POST /api/tenants/:id/link-decision error:', err);
    return res.status(500).json({ error: 'Failed to process account link action' });
  }
});
