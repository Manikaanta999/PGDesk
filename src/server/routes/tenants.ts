import { Router } from 'express';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import {
  calculateAdmissionInvoice,
  calculateDepositSettlement,
  deriveInvoiceStatus,
  reconcileInvoiceWithPayments,
} from '../../lib/billing.ts';
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
import {
  canAssociateTenantDocument,
  canLinkAdmissionUser,
  parseUploadedFileId,
  resolvePropertyFilter,
} from './authorization.ts';
import { logAudit } from '../audit.ts';
import { allocateNextFyInvoiceNumber } from '../billingEngine.ts';

class AdmissionHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const tenantsRouter = Router();

tenantsRouter.get('/', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 20)));
    const search = String(req.query.search || '').trim().toLowerCase();
    const statusFilter = String(req.query.status || 'ALL').toUpperCase();
    const dueOnly = String(req.query.dueOnly || 'false') === 'true';

    const orgProps = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));

    const allowedIds = getAllowedPropertyIds(user, orgProps.map((p) => p.id));
    const propertyFilter = resolvePropertyFilter(req.query.propertyId, allowedIds);
    if (propertyFilter.kind === 'invalid') {
      return res.status(400).json({ error: 'Invalid propertyId filter' });
    }
    if (propertyFilter.kind === 'forbidden') {
      return res.status(403).json({ error: 'Access denied to this property' });
    }
    const propertyIdFilter = propertyFilter.kind === 'selected' ? propertyFilter.propertyId : null;
    if (allowedIds.length === 0) {
      return res.json({ tenants: [], total: 0, page, pageSize });
    }

    const [allTenants, allBeds, allRooms, allInvoices, approvedPayments] = await Promise.all([
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
      db
        .select()
        .from(schema.beds)
        .where(
          and(
            eq(schema.beds.organizationId, user.organizationId),
            inArray(schema.beds.propertyId, allowedIds)
          )
        ),
      db
        .select()
        .from(schema.rooms)
        .where(
          and(
            eq(schema.rooms.organizationId, user.organizationId),
            inArray(schema.rooms.propertyId, allowedIds)
          )
        ),
      db
        .select()
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.organizationId, user.organizationId),
            inArray(schema.invoices.propertyId, allowedIds)
          )
        ),
      db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.organizationId, user.organizationId),
            inArray(
              schema.payments.invoiceId,
              db
                .select({ id: schema.invoices.id })
                .from(schema.invoices)
                .where(
                  and(
                    eq(schema.invoices.organizationId, user.organizationId),
                    inArray(schema.invoices.propertyId, allowedIds)
                  )
                )
            ),
            eq(schema.payments.approvalStatus, 'APPROVED')
          )
        ),
    ]);

    const propMap = new Map(orgProps.map((p) => [p.id, p]));
    const bedMap = new Map(allBeds.map((b) => [b.id, b]));
    const roomMap = new Map(allRooms.map((r) => [r.id, r]));

    const paymentsByInvoice = new Map<number, typeof approvedPayments>();
    for (const p of approvedPayments) {
      const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
      arr.push(p);
      paymentsByInvoice.set(p.invoiceId, arr);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const statsByTenant = new Map<
      number,
      { balanceDue: number; paidTotal: number; invoiceCount: number; hasOverdue: boolean; hasPartial: boolean }
    >();

    for (const inv of allInvoices) {
      const reconciled = reconcileInvoiceWithPayments(inv, paymentsByInvoice.get(inv.id) ?? [], todayStr);
      const prev = statsByTenant.get(inv.tenantId) ?? {
        balanceDue: 0,
        paidTotal: 0,
        invoiceCount: 0,
        hasOverdue: false,
        hasPartial: false,
      };
      prev.balanceDue += reconciled.balanceDue;
      prev.paidTotal += reconciled.paidAmount;
      prev.invoiceCount += 1;
      if (reconciled.status === 'OVERDUE') prev.hasOverdue = true;
      if (reconciled.status === 'PARTIAL' || (reconciled.balanceDue > 0 && reconciled.paidAmount > 0)) {
        prev.hasPartial = true;
      }
      statsByTenant.set(inv.tenantId, prev);
    }

    let enriched = allTenants.map((t) => {
      const bed = t.bedId ? bedMap.get(t.bedId) : undefined;
      const room = bed ? roomMap.get(bed.roomId) : undefined;
      const prop = propMap.get(t.propertyId);
      const stats = statsByTenant.get(t.id);
      const balanceDue = stats?.balanceDue ?? 0;
      const paidTotal = stats?.paidTotal ?? 0;
      const invoiceCount = stats?.invoiceCount ?? 0;

      let rentStatus: 'NO_INVOICE' | 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UNPAID' = 'NO_INVOICE';
      if (invoiceCount > 0) {
        if (balanceDue <= 0) rentStatus = 'PAID';
        else if (stats?.hasOverdue) rentStatus = 'OVERDUE';
        else if (stats?.hasPartial) rentStatus = 'PARTIAL';
        else rentStatus = 'UNPAID';
      }

      return {
        ...t,
        propertyName: prop?.name || '',
        bedLabel: bed?.bedLabel || 'Unassigned',
        roomNumber: room?.roomNumber || '',
        roomType: room?.roomType || '',
        balanceDue,
        paidTotal,
        invoiceCount,
        rentStatus,
      };
    });

    if (propertyIdFilter) {
      enriched = enriched.filter((t) => t.propertyId === propertyIdFilter);
    }
    if (statusFilter !== 'ALL') {
      enriched = enriched.filter((t) => t.status === statusFilter);
    }
    if (dueOnly) {
      enriched = enriched.filter((t) => t.balanceDue > 0 || t.invoiceCount === 0);
    }
    if (search) {
      enriched = enriched.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          (t.phone || '').includes(search) ||
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

    const cleanPhone = data.phone.replace(/\D/g, '').slice(-10);
    const emergencyPhone = data.emergencyContactPhone
      ? data.emergencyContactPhone.replace(/\D/g, '').slice(-10)
      : '';
    const emailLower = data.email ? data.email.trim().toLowerCase() : null;
    const todayStr = new Date().toISOString().slice(0, 10);
    const idDocumentFileId = data.idDocumentUrl ? parseUploadedFileId(data.idDocumentUrl) : null;
    if (data.idDocumentUrl && idDocumentFileId === null) {
      return res.status(400).json({ error: 'ID documents must be uploaded before they can be assigned' });
    }

    const result = await db.transaction(async (tx) => {
      if (idDocumentFileId !== null) {
        const [file] = await tx
          .select()
          .from(schema.uploadedFiles)
          .where(eq(schema.uploadedFiles.id, idDocumentFileId))
          .for('update')
          .limit(1);
        if (
          !file ||
          file.organizationId !== user.organizationId ||
          file.ownerUserId !== user.id ||
          !file.isPrivate ||
          file.tenantId !== null
        ) {
          throw new AdmissionHttpError(403, 'Only your own unassigned ID document can be linked to a tenant.');
        }
      }

      if (data.idempotencyKey) {
        const [dupPay] = await tx
          .select({ id: schema.payments.id })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.organizationId, user.organizationId),
              eq(schema.payments.idempotencyKey, data.idempotencyKey)
            )
          )
          .limit(1);
        if (dupPay) {
          throw new AdmissionHttpError(409, 'Duplicate submission detected. Admission payment already recorded.');
        }
      }

      const [bed] = await tx
        .select()
        .from(schema.beds)
        .where(
          and(
            eq(schema.beds.id, data.bedId),
            eq(schema.beds.propertyId, data.propertyId),
            eq(schema.beds.organizationId, user.organizationId)
          )
        )
        .for('update')
        .limit(1);

      if (!bed) {
        throw new AdmissionHttpError(404, 'Selected bed not found in this property');
      }
      if (bed.status === 'OCCUPIED' || bed.status === 'MAINTENANCE') {
        throw new AdmissionHttpError(
          409,
          `Bed ${bed.bedLabel} is currently ${bed.status} and cannot be assigned.`
        );
      }

      // Link an existing portal user (matched by email or 10-digit phone) or create one if email is provided
      let linkedUserId: number | null = null;
      const matchedUsers = await tx
        .select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.organizationId, user.organizationId),
            emailLower
              ? or(eq(schema.users.email, emailLower), eq(schema.users.phone, cleanPhone))
              : eq(schema.users.phone, cleanPhone)
          )
        )
        .limit(2)
        .for('update');

      if (matchedUsers[0]) {
        if (matchedUsers.length > 1 || !canLinkAdmissionUser(matchedUsers[0], user.organizationId)) {
          throw new AdmissionHttpError(409, 'A matching account cannot be linked to this tenant.');
        }
        const existingUser = matchedUsers[0];
        linkedUserId = existingUser.id;
        const nextPropIds = Array.from(new Set([...existingUser.assignedPropertyIds, data.propertyId]));
        const [linkedUser] = await tx
          .update(schema.users)
          .set({ assignedPropertyIds: nextPropIds, updatedAt: new Date() })
          .where(
            and(
              eq(schema.users.id, existingUser.id),
              eq(schema.users.organizationId, user.organizationId),
              eq(schema.users.role, 'TENANT')
            )
          )
          .returning({ id: schema.users.id });
        if (!linkedUser) {
          throw new AdmissionHttpError(409, 'A matching account cannot be linked to this tenant.');
        }
      } else if (emailLower) {
        const [portalUser] = await tx
          .insert(schema.users)
          .values({
            organizationId: user.organizationId,
            name: data.name,
            email: emailLower,
            phone: cleanPhone,
            passwordHash: null,
            role: 'TENANT',
            assignedPropertyIds: [data.propertyId],
            isActive: true,
            emailVerified: true,
          })
          .onConflictDoNothing({ target: schema.users.email })
          .returning();
        linkedUserId = portalUser?.id ?? null;
      }

      const [tenant] = await tx
        .insert(schema.tenants)
        .values({
          organizationId: user.organizationId,
          propertyId: data.propertyId,
          bedId: bed.id,
          userId: linkedUserId,
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

      if (idDocumentFileId !== null) {
        const [associatedFile] = await tx
          .update(schema.uploadedFiles)
          .set({ tenantId: tenant.id })
          .where(
            and(
              eq(schema.uploadedFiles.id, idDocumentFileId),
              eq(schema.uploadedFiles.organizationId, tenant.organizationId),
              eq(schema.uploadedFiles.ownerUserId, user.id),
              eq(schema.uploadedFiles.isPrivate, true),
              isNull(schema.uploadedFiles.tenantId)
            )
          )
          .returning({ id: schema.uploadedFiles.id });
        if (!associatedFile) {
          throw new AdmissionHttpError(409, 'ID document association changed while creating the tenant.');
        }
      }

      await tx
        .update(schema.beds)
        .set({ status: 'OCCUPIED', updatedAt: new Date() })
        .where(eq(schema.beds.id, bed.id));

      // Always create applicable admission rent invoice defaulting to UNPAID (paidAmount: 0)
      const [org] = await tx
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, user.organizationId))
        .limit(1);

      const admissionInv = calculateAdmissionInvoice({
        monthlyRent: data.monthlyRent,
        joinDate: data.joinDate,
        gstRatePct: org?.gstRatePct ?? 0,
        dueDaysAfterInvoice: org?.dueDaysAfterInvoice ?? 5,
        asOfDate: todayStr,
      });

      let createdInvoice: typeof schema.invoices.$inferSelect | null = null;
      let createdPayment: typeof schema.payments.$inferSelect | null = null;

      if (admissionInv.amount > 0) {
        const invNum = await allocateNextFyInvoiceNumber(
          user.organizationId,
          admissionInv.periodYear,
          admissionInv.periodMonth,
          tx
        );

        const [inv] = await tx
          .insert(schema.invoices)
          .values({
            organizationId: user.organizationId,
            propertyId: data.propertyId,
            tenantId: tenant.id,
            invoiceNumber: invNum,
            periodMonth: admissionInv.periodMonth,
            periodYear: admissionInv.periodYear,
            periodStart: admissionInv.periodStart,
            periodEnd: admissionInv.periodEnd,
            items: admissionInv.items,
            amount: admissionInv.amount,
            paidAmount: 0,
            dueDate: admissionInv.dueDate,
            status: admissionInv.status,
            isProRata: admissionInv.isProRata,
          })
          .returning();
        createdInvoice = inv;

        // Only record a payment transaction when the owner explicitly selects PAYMENT_RECEIVED
        if (data.paymentOption === 'PAYMENT_RECEIVED') {
          const receivedAmount = Math.round(data.initialPaymentAmount || 0);
          if (receivedAmount <= 0) {
            throw new AdmissionHttpError(400, 'Enter a valid amount received greater than ₹0.');
          }
          if (receivedAmount > inv.amount) {
            throw new AdmissionHttpError(
              400,
              `Payment amount cannot exceed billed admission rent of ₹${inv.amount.toLocaleString('en-IN')}.`
            );
          }

          const [payRow] = await tx
            .insert(schema.payments)
            .values({
              organizationId: user.organizationId,
              invoiceId: inv.id,
              tenantId: tenant.id,
              amount: receivedAmount,
              method: data.initialPaymentMethod!,
              reference: data.initialPaymentReference || '',
              approvalStatus: 'APPROVED',
              paidAt: data.initialPaymentDate || todayStr,
              recordedByUserId: user.id,
              idempotencyKey: data.idempotencyKey || null,
              notes: 'Payment recorded during student admission',
            })
            .returning();
          createdPayment = payRow;

          const nextStatus = deriveInvoiceStatus({
            amount: inv.amount,
            paidAmount: receivedAmount,
            dueDate: inv.dueDate,
            asOfDate: todayStr,
          });

          const [updatedInv] = await tx
            .update(schema.invoices)
            .set({
              paidAmount: receivedAmount,
              status: nextStatus,
              updatedAt: new Date(),
            })
            .where(eq(schema.invoices.id, inv.id))
            .returning();
          createdInvoice = updatedInv;
        }
      } else if (data.paymentOption === 'PAYMENT_RECEIVED') {
        throw new AdmissionHttpError(400, 'No billed admission rent due for the selected join date.');
      }

      return { tenant, bed, invoice: createdInvoice, payment: createdPayment };
    });

    await logAudit({
      user,
      action: 'TENANT_ONBOARDED',
      entityType: 'TENANT',
      entityId: result.tenant.id,
      metadata: {
        name: result.tenant.name,
        bedId: result.bed.id,
        bedLabel: result.bed.bedLabel,
        invoiceId: result.invoice?.id ?? null,
        invoiceStatus: result.invoice?.status ?? null,
        initialPaidAmount: result.payment?.amount ?? 0,
      },
    });

    return res.status(201).json({
      tenant: result.tenant,
      invoice: result.invoice,
      payment: result.payment,
    });
  } catch (err: any) {
    if (err instanceof AdmissionHttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err?.code === '23505' || err?.cause?.code === '23505') {
      return res.status(409).json({ error: 'Duplicate submission detected.' });
    }
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

    const todayStr = new Date().toISOString().slice(0, 10);
    const paymentsByInvoice = new Map<number, typeof tenantPayments>();
    for (const p of tenantPayments) {
      if (p.approvalStatus === 'APPROVED') {
        const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
        arr.push(p);
        paymentsByInvoice.set(p.invoiceId, arr);
      }
    }

    const reconciledInvoices = tenantInvoices.map((inv) => {
      const reconciled = reconcileInvoiceWithPayments(inv, paymentsByInvoice.get(inv.id) ?? [], todayStr);
      return {
        ...inv,
        paidAmount: reconciled.paidAmount,
        balanceDue: reconciled.balanceDue,
        status: reconciled.status,
        approvedPaymentCount: reconciled.approvedCount,
      };
    });

    const unpaidBalance = reconciledInvoices.reduce((s, inv) => s + inv.balanceDue, 0);

    return res.json({
      tenant,
      property: propRows[0] || null,
      bed,
      room,
      invoices: reconciledInvoices,
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
    const documentChanged = d.idDocumentUrl !== undefined && d.idDocumentUrl !== tenant.idDocumentUrl;
    const nextDocumentUrl = d.idDocumentUrl || null;
    let nextDocumentFileId: number | null = null;
    if (documentChanged && nextDocumentUrl) {
      nextDocumentFileId = parseUploadedFileId(nextDocumentUrl);
      if (nextDocumentFileId === null) {
        return res.status(400).json({ error: 'ID documents must be uploaded before they can be assigned' });
      }

      const [file] = await db
        .select()
        .from(schema.uploadedFiles)
        .where(eq(schema.uploadedFiles.id, nextDocumentFileId))
        .limit(1);
      if (!file || !canAssociateTenantDocument(user, tenant, file)) {
        return res.status(403).json({ error: 'Only your own uploaded ID documents can be assigned to a tenant' });
      }
    }

    const [updated] = await db.transaction(async (tx) => {
      if (documentChanged) {
        const previousFileId = parseUploadedFileId(tenant.idDocumentUrl);
        if (previousFileId !== null) {
          await tx
            .update(schema.uploadedFiles)
            .set({ tenantId: null })
            .where(
              and(
                eq(schema.uploadedFiles.id, previousFileId),
                eq(schema.uploadedFiles.tenantId, tenant.id)
              )
            );
        }

        if (nextDocumentFileId !== null) {
          const [associatedFile] = await tx
            .update(schema.uploadedFiles)
            .set({ tenantId: tenant.id })
            .where(
              and(
                eq(schema.uploadedFiles.id, nextDocumentFileId),
                eq(schema.uploadedFiles.organizationId, tenant.organizationId),
                eq(schema.uploadedFiles.ownerUserId, user.id),
                eq(schema.uploadedFiles.isPrivate, true),
                or(isNull(schema.uploadedFiles.tenantId), eq(schema.uploadedFiles.tenantId, tenant.id))
              )
            )
            .returning({ id: schema.uploadedFiles.id });
          if (!associatedFile) {
            throw new AdmissionHttpError(409, 'ID document association changed while updating the tenant.');
          }
        }
      }

      return tx
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
    });

    return res.json({ tenant: updated });
  } catch (err) {
    if (err instanceof AdmissionHttpError) {
      return res.status(err.status).json({ error: err.message });
    }
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

    const [tenantInvoices, tenantPayments] = await Promise.all([
      db.select().from(schema.invoices).where(eq(schema.invoices.tenantId, tenant.id)),
      db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.tenantId, tenant.id), eq(schema.payments.approvalStatus, 'APPROVED'))),
    ]);
    const todayStr = new Date().toISOString().slice(0, 10);
    const paymentsByInvoice = new Map<number, typeof tenantPayments>();
    for (const p of tenantPayments) {
      const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
      arr.push(p);
      paymentsByInvoice.set(p.invoiceId, arr);
    }
    const unpaidBalance = tenantInvoices.reduce((s, inv) => {
      const reconciled = reconcileInvoiceWithPayments(inv, paymentsByInvoice.get(inv.id) ?? [], todayStr);
      return s + reconciled.balanceDue;
    }, 0);

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
