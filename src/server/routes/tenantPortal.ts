import { Router } from 'express';
import { and, desc, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import {
  canDownloadInvoiceReceipt,
  computeApprovedPaidAmount,
  reconcileInvoiceWithPayments,
} from '../../lib/billing.ts';
import { formatDateIN, formatMonthYear } from '../../lib/format.ts';
import { generateReceiptPdfBytes } from '../../lib/pdfReceipt.ts';
import {
  isValidStudentLinkCodeFormat,
  normalizeTokenCode,
  PLATFORM_ORG_SLUG,
} from '../../lib/platformAuth.ts';
import { checkRateLimit, hashToken, isDemoModeEnabled } from '../../lib/security.ts';
import { splitActiveAndPastStays } from '../../lib/studentPortalHelpers.ts';
import {
  createComplaintSchema,
  studentMoveOutRequestSchema,
  tenantUpiSubmissionSchema,
  updateTenantProfileSchema,
} from '../../lib/validation.ts';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';

export const tenantPortalRouter = Router();

function normalizePhone10(raw: string | null | undefined): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.slice(-10);
}

async function resolveAllTenantStays(user: NonNullable<AuthRequest['user']>) {
  // Strictly load ONLY records explicitly linked to this userId (never auto-claim by email or phone)
  const allStays = await db
    .select()
    .from(schema.tenants)
    .where(and(eq(schema.tenants.userId, user.id), isNull(schema.tenants.deletedAt)))
    .orderBy(desc(schema.tenants.createdAt));

  const { activeStay, pastStays } = splitActiveAndPastStays(allStays);

  if (activeStay && activeStay.organizationId !== user.organizationId) {
    await db
      .update(schema.users)
      .set({
        organizationId: activeStay.organizationId,
        assignedPropertyIds: [activeStay.propertyId],
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));
  }

  return {
    activeTenant: activeStay,
    pastTenants: pastStays,
    allStays,
  };
}

async function buildPastStaysPayload(pastTenants: Array<typeof schema.tenants.$inferSelect>) {
  if (pastTenants.length === 0) return [];

  const pastTenantIds = pastTenants.map((t) => t.id);
  const pastPropIds = Array.from(new Set(pastTenants.map((t) => t.propertyId)));
  const pastBedIds = Array.from(new Set(pastTenants.map((t) => t.bedId).filter((id): id is number => Boolean(id))));

  const [pastProps, pastBeds, pastInvoices, pastPayments] = await Promise.all([
    db.select().from(schema.properties).where(inArray(schema.properties.id, pastPropIds)),
    pastBedIds.length > 0
      ? db.select().from(schema.beds).where(inArray(schema.beds.id, pastBedIds))
      : Promise.resolve([]),
    db
      .select()
      .from(schema.invoices)
      .where(inArray(schema.invoices.tenantId, pastTenantIds))
      .orderBy(desc(schema.invoices.periodYear), desc(schema.invoices.periodMonth)),
    db
      .select()
      .from(schema.payments)
      .where(inArray(schema.payments.tenantId, pastTenantIds))
      .orderBy(desc(schema.payments.createdAt)),
  ]);

  const pastRoomIds = Array.from(new Set(pastBeds.map((b) => b.roomId)));
  const pastRooms =
    pastRoomIds.length > 0
      ? await db.select().from(schema.rooms).where(inArray(schema.rooms.id, pastRoomIds))
      : [];

  const propMap = new Map(pastProps.map((p) => [p.id, p]));
  const bedMap = new Map(pastBeds.map((b) => [b.id, b]));
  const roomMap = new Map(pastRooms.map((r) => [r.id, r]));
  const todayStr = new Date().toISOString().slice(0, 10);

  return pastTenants.map((t) => {
    const prop = propMap.get(t.propertyId);
    const bed = t.bedId ? bedMap.get(t.bedId) : undefined;
    const room = bed ? roomMap.get(bed.roomId) : undefined;
    const stayPayments = pastPayments.filter((p) => p.tenantId === t.id);
    const stayInvoices = pastInvoices
      .filter((i) => i.tenantId === t.id)
      .map((i) => {
        const reconciled = reconcileInvoiceWithPayments(
          i,
          stayPayments.filter((p) => p.invoiceId === i.id),
          todayStr
        );
        return {
          ...i,
          paidAmount: reconciled.paidAmount,
          status: reconciled.status,
          balanceDue: reconciled.balanceDue,
          approvedPaymentCount: reconciled.approvedCount,
          periodLabel: formatMonthYear(i.periodMonth, i.periodYear),
        };
      });

    return {
      stayId: t.id,
      status: t.status,
      joinDate: t.joinDate,
      leaveDate: t.leaveDate,
      monthlyRent: t.monthlyRent,
      securityDeposit: t.securityDeposit,
      depositStatus: t.depositStatus,
      depositDeductions: t.depositDeductions,
      depositSettlementNote: t.depositSettlementNote,
      propertyName: prop?.name || 'Previous Hostel',
      propertyAddress: prop ? `${prop.address}, ${prop.locality}, ${prop.city}` : '',
      roomNumber: room?.roomNumber || '',
      roomType: room?.roomType || '',
      bedLabel: bed?.bedLabel || '',
      invoices: stayInvoices,
      payments: stayPayments,
    };
  });
}

tenantPortalRouter.get('/overview', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { activeTenant, pastTenants } = await resolveAllTenantStays(user);
    const pastStays = await buildPastStaysPayload(pastTenants);

    if (!activeTenant) {
      const latestAny = pastTenants[0] || null;
      const demoEnabled = isDemoModeEnabled();
      const [pendingReqs, publicHostels] = await Promise.all([
        db
          .select({
            id: schema.tenants.id,
            propertyId: schema.tenants.propertyId,
            requestedAt: schema.tenants.linkRequestedAt,
          })
          .from(schema.tenants)
          .where(
            and(
              eq(schema.tenants.linkRequestedByUserId, user.id),
              eq(schema.tenants.accountLinkStatus, 'LINK_PENDING'),
              isNull(schema.tenants.deletedAt)
            )
          ),
        db
          .select({
            id: schema.properties.id,
            name: schema.properties.name,
            locality: schema.properties.locality,
            city: schema.properties.city,
          })
          .from(schema.properties)
          .innerJoin(schema.organizations, eq(schema.properties.organizationId, schema.organizations.id))
          .where(
            demoEnabled
              ? and(
                  eq(schema.properties.isPublic, true),
                  isNull(schema.properties.deletedAt),
                  ne(schema.organizations.slug, PLATFORM_ORG_SLUG)
                )
              : and(
                  eq(schema.properties.isPublic, true),
                  isNull(schema.properties.deletedAt),
                  ne(schema.organizations.slug, PLATFORM_ORG_SLUG),
                  ne(schema.organizations.slug, 'sharma-residency')
                )
          ),
      ]);

      const hostelMap = new Map(publicHostels.map((h) => [h.id, h]));

      return res.json({
        hasActiveStay: false,
        unassigned: pastTenants.length === 0,
        isPastStay: pastTenants.length > 0,
        userProfile: {
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          photoUrl: user.photoUrl || latestAny?.photoUrl || null,
        },
        pendingLinkRequests: pendingReqs.map((r) => ({
          id: r.id,
          propertyName: hostelMap.get(r.propertyId)?.name || 'Hostel',
          requestedAt: r.requestedAt,
        })),
        availableHostels: publicHostels,
        tenant: null,
        organization: null,
        property: null,
        bed: null,
        room: null,
        invoices: [],
        payments: [],
        complaints: [],
        notices: [],
        moveOutRequests: [],
        pastStays,
      });
    }

    const effectiveOrgId = activeTenant.organizationId;

    const [
      orgRows,
      propRows,
      bedRows,
      tenantInvoices,
      tenantPayments,
      tenantComplaints,
      tenantNotices,
      tenantMoveOutRequests,
    ] = await Promise.all([
      db.select().from(schema.organizations).where(eq(schema.organizations.id, effectiveOrgId)).limit(1),
      db.select().from(schema.properties).where(eq(schema.properties.id, activeTenant.propertyId)).limit(1),
      activeTenant.bedId ? db.select().from(schema.beds).where(eq(schema.beds.id, activeTenant.bedId)).limit(1) : Promise.resolve([]),
      db
        .select()
        .from(schema.invoices)
        .where(and(eq(schema.invoices.tenantId, activeTenant.id), eq(schema.invoices.organizationId, effectiveOrgId)))
        .orderBy(desc(schema.invoices.periodYear), desc(schema.invoices.periodMonth)),
      db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.tenantId, activeTenant.id), eq(schema.payments.organizationId, effectiveOrgId)))
        .orderBy(desc(schema.payments.createdAt)),
      db
        .select()
        .from(schema.complaints)
        .where(and(eq(schema.complaints.tenantId, activeTenant.id), eq(schema.complaints.organizationId, effectiveOrgId)))
        .orderBy(desc(schema.complaints.createdAt)),
      db
        .select()
        .from(schema.notices)
        .where(
          and(
            eq(schema.notices.organizationId, effectiveOrgId),
            or(isNull(schema.notices.propertyId), eq(schema.notices.propertyId, activeTenant.propertyId))
          )
        )
        .orderBy(desc(schema.notices.pinned), desc(schema.notices.createdAt)),
      db
        .select()
        .from(schema.moveOutRequests)
        .where(and(eq(schema.moveOutRequests.tenantId, activeTenant.id), eq(schema.moveOutRequests.organizationId, effectiveOrgId)))
        .orderBy(desc(schema.moveOutRequests.createdAt)),
    ]);

    const bed = bedRows[0] || null;
    let room = null;
    if (bed) {
      const rRows = await db.select().from(schema.rooms).where(eq(schema.rooms.id, bed.roomId)).limit(1);
      room = rRows[0] || null;
    }

    const comments = await db
      .select()
      .from(schema.complaintComments)
      .where(eq(schema.complaintComments.organizationId, effectiveOrgId))
      .orderBy(schema.complaintComments.createdAt);

    const org = orgRows[0] || null;
    const prop = propRows[0] || null;

    return res.json({
      hasActiveStay: true,
      unassigned: false,
      isPastStay: false,
      userProfile: {
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        photoUrl: user.photoUrl || activeTenant.photoUrl || null,
      },
      tenant: (() => {
        const { linkCodeHash: _lch, ...safeActive } = activeTenant;
        return safeActive;
      })(),
      organization: org
        ? {
            name: org.name,
            upiId: org.upiId,
            upiPayeeName: org.upiPayeeName,
            phone: org.phone,
            email: org.email,
            address: org.address,
            noticePeriodDays: org.noticePeriodDays,
            bankDetails: org.bankDetails || '',
            paymentInstructions: org.paymentInstructions || '',
          }
        : null,
      property: prop
        ? {
            id: prop.id,
            name: prop.name,
            address: prop.address,
            locality: prop.locality,
            city: prop.city,
            contactName: prop.contactName,
            contactPhone: prop.contactPhone,
          }
        : null,
      bed,
      room,
      invoices: tenantInvoices.map((i) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const reconciled = reconcileInvoiceWithPayments(
          i,
          tenantPayments.filter((p) => p.invoiceId === i.id),
          todayStr
        );
        return {
          ...i,
          paidAmount: reconciled.paidAmount,
          status: reconciled.status,
          balanceDue: reconciled.balanceDue,
          approvedPaymentCount: reconciled.approvedCount,
          periodLabel: formatMonthYear(i.periodMonth, i.periodYear),
        };
      }),
      payments: tenantPayments,
      complaints: tenantComplaints.map((c) => ({
        ...c,
        comments: comments.filter((cm) => cm.complaintId === c.id),
      })),
      notices: tenantNotices,
      moveOutRequests: tenantMoveOutRequests,
      pastStays,
    });
  } catch (err) {
    console.error('GET /api/tenant/overview error:', err);
    return res.status(500).json({ error: 'Failed to load tenant portal' });
  }
});

tenantPortalRouter.patch('/profile', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = updateTenantProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile details' });
    }

    const d = parsed.data;
    const cleanPhone = d.phone ? normalizePhone10(d.phone) : normalizePhone10(user.phone);
    const cleanEmergencyPhone = d.emergencyContactPhone ? normalizePhone10(d.emergencyContactPhone) : '';

    const { activeTenant, pastTenants } = await resolveAllTenantStays(user);
    const tenant = activeTenant ?? pastTenants[0] ?? null;

    // Protect verified KYC fields from student tampering
    if (tenant && tenant.kycVerifiedStatus === 'VERIFIED') {
      const idTypeChanged = d.idType && d.idType !== tenant.idType;
      const idNumberChanged = (d.idNumberMasked ?? '') !== (tenant.idNumberMasked ?? '');
      const idDocChanged = d.idDocumentUrl !== undefined && d.idDocumentUrl !== tenant.idDocumentUrl;
      if (idTypeChanged || idNumberChanged || idDocChanged) {
        return res.status(403).json({
          error: 'Your KYC verification is already marked Verified. Contact your hostel owner to update verified ID details.',
        });
      }
    }

    await db
      .update(schema.users)
      .set({
        name: d.name,
        phone: cleanPhone || user.phone,
        ...(d.photoUrl !== undefined ? { photoUrl: d.photoUrl || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));

    if (!tenant) {
      return res.json({
        userProfile: {
          name: d.name,
          email: user.email,
          phone: cleanPhone || user.phone || '',
          photoUrl: d.photoUrl !== undefined ? d.photoUrl : user.photoUrl || null,
        },
        tenant: null,
      });
    }

    let nextKycStatus = tenant.kycVerifiedStatus;
    if (
      tenant.kycVerifiedStatus === 'REJECTED' &&
      ((d.idDocumentUrl && d.idDocumentUrl !== tenant.idDocumentUrl) ||
        (d.idNumberMasked && d.idNumberMasked !== tenant.idNumberMasked))
    ) {
      nextKycStatus = 'PENDING';
    }

    const [updatedTenant] = await db
      .update(schema.tenants)
      .set({
        name: d.name,
        phone: cleanPhone || tenant.phone,
        ...(d.photoUrl !== undefined ? { photoUrl: d.photoUrl || null } : {}),
        ...(d.dateOfBirth !== undefined ? { dateOfBirth: d.dateOfBirth || null } : {}),
        occupation: d.occupation || tenant.occupation || 'Resident',
        companyOrCollege: d.companyOrCollege ?? '',
        permanentAddress: d.permanentAddress ?? '',
        emergencyContactName: d.emergencyContactName ?? '',
        emergencyContactRelation: d.emergencyContactRelation ?? '',
        emergencyContactPhone: cleanEmergencyPhone,
        idType: d.idType || tenant.idType || 'Aadhaar',
        idNumberMasked: d.idNumberMasked ?? '',
        idDocumentUrl: d.idDocumentUrl !== undefined ? d.idDocumentUrl : tenant.idDocumentUrl,
        kycVerifiedStatus: nextKycStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id))
      .returning();

    return res.json({ tenant: updatedTenant });
  } catch (err) {
    console.error('PATCH /api/tenant/profile error:', err);
    return res.status(500).json({ error: 'Failed to update resident profile' });
  }
});

tenantPortalRouter.post('/payments', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { activeTenant: tenant } = await resolveAllTenantStays(user);
    if (!tenant) return res.status(404).json({ error: 'No active hostel stay found' });

    const parsed = tenantUpiSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid UPI submission' });
    }

    const d = parsed.data;
    const result = await db.transaction(async (tx) => {
      if (d.idempotencyKey) {
        const [dupByKey] = await tx
          .select({ id: schema.payments.id })
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.organizationId, tenant.organizationId),
              eq(schema.payments.idempotencyKey, d.idempotencyKey)
            )
          )
          .limit(1);
        if (dupByKey) {
          return { errorStatus: 409 as const, error: 'Duplicate payment proof submission detected.' };
        }
      }

      const [invoice] = await tx
        .select()
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.id, d.invoiceId),
            eq(schema.invoices.tenantId, tenant.id),
            eq(schema.invoices.organizationId, tenant.organizationId)
          )
        )
        .for('update')
        .limit(1);

      if (!invoice) {
        return { errorStatus: 404 as const, error: 'Invoice not found for your account' };
      }

      const invPayments = await tx
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.invoiceId, invoice.id),
            eq(schema.payments.organizationId, tenant.organizationId)
          )
        );

      const paidAmount = computeApprovedPaidAmount(invPayments);
      const balanceDue = Math.max(0, invoice.amount - paidAmount);
      if (balanceDue <= 0) {
        return { errorStatus: 400 as const, error: 'This invoice has already been paid in full.' };
      }
      if (d.amount > balanceDue) {
        return {
          errorStatus: 400 as const,
          error: `Submitted amount exceeds remaining balance of ₹${balanceDue.toLocaleString('en-IN')}.`,
        };
      }

      const normalizedRef = d.reference.trim().toLowerCase();
      const dupUtr = invPayments.some(
        (p) =>
          (p.approvalStatus === 'PENDING_APPROVAL' || p.approvalStatus === 'APPROVED') &&
          p.reference.trim().toLowerCase() === normalizedRef
      );
      if (dupUtr) {
        return {
          errorStatus: 409 as const,
          error: 'This UPI/UTR reference has already been submitted for this invoice.',
        };
      }

      // Strictly record as PENDING_APPROVAL: students can never mark their own invoices as PAID
      const [payment] = await tx
        .insert(schema.payments)
        .values({
          organizationId: tenant.organizationId,
          invoiceId: invoice.id,
          tenantId: tenant.id,
          amount: d.amount,
          method: 'UPI',
          reference: d.reference,
          screenshotUrl: d.screenshotUrl || null,
          approvalStatus: 'PENDING_APPROVAL',
          paidAt: new Date().toISOString().slice(0, 10),
          idempotencyKey: d.idempotencyKey || null,
          notes: d.notes || 'Submitted by resident via Student Portal',
        })
        .returning();

      return { payment };
    });

    if ('errorStatus' in result && result.errorStatus) {
      return res.status(result.errorStatus).json({ error: result.error });
    }

    return res.status(201).json({
      payment: result.payment,
      message: 'UPI payment proof submitted for owner verification.',
    });
  } catch (err: any) {
    if (err?.code === '23505' || err?.cause?.code === '23505') {
      return res.status(409).json({ error: 'Duplicate payment proof submission prevented.' });
    }
    console.error('POST /api/tenant/payments error:', err);
    return res.status(500).json({ error: 'Failed to submit payment proof' });
  }
});

tenantPortalRouter.post('/complaints', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { activeTenant: tenant } = await resolveAllTenantStays(user);
    if (!tenant) return res.status(404).json({ error: 'No active hostel stay found' });

    const parsed = createComplaintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid complaint' });
    }

    const [created] = await db
      .insert(schema.complaints)
      .values({
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        tenantId: tenant.id,
        title: parsed.data.title,
        category: parsed.data.category,
        priority: parsed.data.priority,
        description: parsed.data.description,
        photoUrl: parsed.data.photoUrl || null,
        status: 'OPEN',
      })
      .returning();

    return res.status(201).json({ complaint: created });
  } catch (err) {
    console.error('POST /api/tenant/complaints error:', err);
    return res.status(500).json({ error: 'Failed to submit complaint' });
  }
});

tenantPortalRouter.post('/complaints/:id/comments', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { activeTenant: tenant } = await resolveAllTenantStays(user);
    if (!tenant) return res.status(404).json({ error: 'No active hostel stay found' });

    const complaintId = Number(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (body.length < 2) return res.status(400).json({ error: 'Comment text is required' });

    const [complaint] = await db
      .select()
      .from(schema.complaints)
      .where(and(eq(schema.complaints.id, complaintId), eq(schema.complaints.tenantId, tenant.id)))
      .limit(1);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    if (complaint.status === 'RESOLVED') {
      return res.status(400).json({
        error: 'This complaint is already resolved. Please raise a new complaint if you still need assistance.',
      });
    }

    const [comment] = await db
      .insert(schema.complaintComments)
      .values({
        organizationId: tenant.organizationId,
        complaintId,
        authorUserId: user.id,
        authorName: tenant.name,
        authorRole: 'TENANT',
        body,
      })
      .returning();

    return res.status(201).json({ comment });
  } catch (err) {
    console.error('POST /api/tenant/complaints/:id/comments error:', err);
    return res.status(500).json({ error: 'Failed to post comment' });
  }
});

tenantPortalRouter.post('/move-out-request', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { activeTenant: tenant } = await resolveAllTenantStays(user);
    if (!tenant) return res.status(404).json({ error: 'No active hostel stay found' });

    if (tenant.status === 'LEFT') {
      return res.status(400).json({ error: 'You have already moved out of this stay.' });
    }

    const parsed = studentMoveOutRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid move-out request' });
    }

    const existingPending = await db
      .select({ id: schema.moveOutRequests.id })
      .from(schema.moveOutRequests)
      .where(
        and(
          eq(schema.moveOutRequests.tenantId, tenant.id),
          inArray(schema.moveOutRequests.status, ['SUBMITTED', 'UNDER_REVIEW'])
        )
      )
      .limit(1);

    if (existingPending[0]) {
      return res.status(409).json({
        error: 'You already have an active move-out request under review by your hostel owner.',
      });
    }

    const [createdRequest] = await db
      .insert(schema.moveOutRequests)
      .values({
        organizationId: tenant.organizationId,
        propertyId: tenant.propertyId,
        tenantId: tenant.id,
        requestedLeaveDate: parsed.data.requestedLeaveDate,
        reason: parsed.data.reason,
        notes: parsed.data.notes || '',
        status: 'SUBMITTED',
      })
      .returning();

    // Update tentative notice metadata without releasing bed or marking LEFT
    const [updatedTenant] = await db
      .update(schema.tenants)
      .set({
        status: tenant.status === 'ACTIVE' ? 'NOTICE' : tenant.status,
        leaveDate: parsed.data.requestedLeaveDate,
        noticeRequestedAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id))
      .returning();

    await logAudit({
      user,
      action: 'STUDENT_MOVE_OUT_REQUESTED',
      entityType: 'TENANT',
      entityId: tenant.id,
      metadata: {
        requestId: createdRequest.id,
        requestedLeaveDate: parsed.data.requestedLeaveDate,
      },
    });

    return res.status(201).json({
      moveOutRequest: createdRequest,
      tenant: updatedTenant,
      message: 'Move-out request submitted for owner review. Your bed remains assigned until move-out is finalized.',
    });
  } catch (err) {
    console.error('POST /api/tenant/move-out-request error:', err);
    return res.status(500).json({ error: 'Failed to submit move-out request' });
  }
});

tenantPortalRouter.get('/invoices/:id/receipt.pdf', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { allStays } = await resolveAllTenantStays(user);
    if (allStays.length === 0) return res.status(404).json({ error: 'Tenant profile not found' });

    const invoiceId = Number(req.params.id);
    const allStayIds = allStays.map((s) => s.id);
    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId), inArray(schema.invoices.tenantId, allStayIds)))
      .limit(1);

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const stayTenant = allStays.find((s) => s.id === invoice.tenantId) || allStays[0];
    const effectiveOrgId = stayTenant.organizationId;
    const [orgRows, propRows, invPayments] = await Promise.all([
      db.select().from(schema.organizations).where(eq(schema.organizations.id, effectiveOrgId)).limit(1),
      db.select().from(schema.properties).where(eq(schema.properties.id, invoice.propertyId)).limit(1),
      db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.invoiceId, invoice.id), eq(schema.payments.approvalStatus, 'APPROVED'))),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const reconciled = reconcileInvoiceWithPayments(invoice, invPayments, todayStr);
    if (!canDownloadInvoiceReceipt({ paidAmount: reconciled.paidAmount, approvedCount: reconciled.approvedCount })) {
      return res.status(400).json({
        error: 'Receipt cannot be downloaded because no verified payment has been recorded for this invoice yet.',
      });
    }

    const org = orgRows[0];
    const prop = propRows[0];
    let roomBedLabel = 'Assigned Bed';
    if (stayTenant.bedId) {
      const [bed] = await db.select().from(schema.beds).where(eq(schema.beds.id, stayTenant.bedId)).limit(1);
      if (bed) roomBedLabel = bed.bedLabel;
    }

    const baseAppUrl = (process.env.APP_URL || '').replace(/\/$/, '');
    const pdfBytes = await generateReceiptPdfBytes({
      organizationName: org?.name || 'PGDesk Residence',
      organizationAddress: org?.address || '',
      organizationPhone: org?.phone || '',
      gstin: org?.gstin || undefined,
      gstRatePct: org?.gstRatePct ?? 0,
      upiId: org?.upiId || 'pgdesk@okicici',
      propertyName: prop?.name || 'PG Residence',
      propertyAddress: prop?.address || '',
      invoiceNumber: invoice.invoiceNumber,
      periodLabel: formatMonthYear(invoice.periodMonth, invoice.periodYear),
      issuedDate: formatDateIN(invoice.createdAt),
      dueDate: formatDateIN(invoice.dueDate),
      status: reconciled.status,
      tenantName: stayTenant.name,
      tenantPhone: stayTenant.phone || stayTenant.email || 'Not provided',
      roomBedLabel,
      items: invoice.items,
      totalAmount: invoice.amount,
      paidAmount: reconciled.paidAmount,
      payments: invPayments.map((p) => ({
        paidAt: formatDateIN(p.paidAt),
        method: p.method,
        reference: p.reference,
        amount: p.amount,
      })),
      verificationUrl: baseAppUrl ? `${baseAppUrl}/tenant` : undefined,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt-${invoice.invoiceNumber}.pdf"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('GET /api/tenant/invoices/:id/receipt.pdf error:', err);
    return res.status(500).json({ error: 'Failed to generate receipt' });
  }
});

tenantPortalRouter.post('/link-code', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    if (!checkRateLimit(`tenant-link-code:${user.id}`, 15, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many link attempts. Please wait a few minutes.' });
    }

    const code = normalizeTokenCode(req.body?.code);
    if (!isValidStudentLinkCodeFormat(code)) {
      return res.status(400).json({ error: 'Enter a valid student link code (e.g. PGDESKSTU-XXXX-XXXX).' });
    }

    const codeHash = hashToken(code);
    const [claimed] = await db
      .update(schema.tenants)
      .set({
        userId: user.id,
        accountLinkStatus: 'LINKED',
        linkedAt: new Date(),
        linkCodeHash: null,
        linkCodeExpiresAt: null,
        linkRequestedByUserId: null,
        linkRequestedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.tenants.linkCodeHash, codeHash),
          gt(schema.tenants.linkCodeExpiresAt, new Date()),
          isNull(schema.tenants.userId),
          isNull(schema.tenants.deletedAt)
        )
      )
      .returning();

    if (!claimed) {
      return res.status(400).json({ error: 'Invalid, expired, or already-used student link code.' });
    }

    const nextPropIds = Array.from(new Set([...(user.assignedPropertyIds || []), claimed.propertyId]));
    await db
      .update(schema.users)
      .set({
        organizationId: claimed.organizationId,
        assignedPropertyIds: nextPropIds,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));

    await logAudit({
      user,
      action: 'STUDENT_LINKED_VIA_CODE',
      entityType: 'TENANT',
      entityId: claimed.id,
      metadata: { propertyId: claimed.propertyId },
    });

    const { linkCodeHash: _lch, ...safeClaimed } = claimed;
    return res.json({
      ok: true,
      tenant: safeClaimed,
      message: 'Your hostel record has been linked to your account.',
    });
  } catch (err) {
    console.error('POST /api/tenant/link-code error:', err);
    return res.status(500).json({ error: 'Failed to redeem student link code' });
  }
});

tenantPortalRouter.post('/link-request', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    if (!checkRateLimit(`tenant-link-req:${user.id}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many link requests. Please wait a few minutes.' });
    }

    const propertyId = Number(req.body?.propertyId);
    if (!Number.isFinite(propertyId) || propertyId <= 0) {
      return res.status(400).json({ error: 'Select the hostel where your record is stored.' });
    }

    const rawPhone = String(req.body?.phone || user.phone || '').trim();
    const rawEmail = String(req.body?.email || user.email || '').trim().toLowerCase();
    const phone10 = normalizePhone10(rawPhone);

    if (phone10.length !== 10 && !rawEmail) {
      return res.status(400).json({ error: 'Provide the mobile number or email registered by your hostel owner.' });
    }

    const [prop] = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.id, propertyId), isNull(schema.properties.deletedAt)))
      .limit(1);

    if (!prop) {
      return res.status(404).json({ error: 'Selected hostel was not found.' });
    }

    const contactCond =
      phone10.length === 10 && rawEmail
        ? or(eq(schema.tenants.phone, phone10), eq(schema.tenants.email, rawEmail))
        : phone10.length === 10
          ? eq(schema.tenants.phone, phone10)
          : eq(schema.tenants.email, rawEmail);

    const [matched] = await db
      .select()
      .from(schema.tenants)
      .where(
        and(
          eq(schema.tenants.propertyId, propertyId),
          isNull(schema.tenants.userId),
          isNull(schema.tenants.deletedAt),
          inArray(schema.tenants.status, ['ACTIVE', 'NOTICE']),
          contactCond
        )
      )
      .limit(1);

    if (matched) {
      await db
        .update(schema.tenants)
        .set({
          accountLinkStatus: 'LINK_PENDING',
          linkRequestedByUserId: user.id,
          linkRequestedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.tenants.id, matched.id), isNull(schema.tenants.userId)));

      await logAudit({
        user,
        action: 'STUDENT_LINK_REQUESTED',
        entityType: 'TENANT',
        entityId: matched.id,
        metadata: { propertyId },
      });
    }

    // Neutral response so unlinked tenant existence is never leaked prior to owner approval
    return res.json({
      ok: true,
      message:
        'Link request submitted. If a matching resident record exists at this hostel, the owner can approve your request from their Students dashboard.',
    });
  } catch (err) {
    console.error('POST /api/tenant/link-request error:', err);
    return res.status(500).json({ error: 'Failed to submit link request' });
  }
});
