import { Router } from 'express';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { formatDateIN, formatMonthYear } from '../../lib/format.ts';
import { generateReceiptPdfBytes } from '../../lib/pdfReceipt.ts';
import { createComplaintSchema, tenantUpiSubmissionSchema } from '../../lib/validation.ts';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth.ts';

export const tenantPortalRouter = Router();

async function resolveTenantRecord(userId: number, organizationId: number, email: string) {
  const rows = await db
    .select()
    .from(schema.tenants)
    .where(
      and(
        eq(schema.tenants.organizationId, organizationId),
        isNull(schema.tenants.deletedAt),
        or(eq(schema.tenants.userId, userId), eq(schema.tenants.email, email))
      )
    )
    .limit(1);
  return rows[0] || null;
}

tenantPortalRouter.get('/overview', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenant = await resolveTenantRecord(user.id, user.organizationId, user.email);
    if (!tenant) {
      return res.json({
        unassigned: true,
        tenant: null,
        organization: null,
        property: null,
        bed: null,
        room: null,
        invoices: [],
        payments: [],
        complaints: [],
        notices: [],
      });
    }

    const [orgRows, propRows, bedRows, tenantInvoices, tenantPayments, tenantComplaints, tenantNotices] =
      await Promise.all([
        db.select().from(schema.organizations).where(eq(schema.organizations.id, user.organizationId)).limit(1),
        db.select().from(schema.properties).where(eq(schema.properties.id, tenant.propertyId)).limit(1),
        tenant.bedId ? db.select().from(schema.beds).where(eq(schema.beds.id, tenant.bedId)).limit(1) : Promise.resolve([]),
        db
          .select()
          .from(schema.invoices)
          .where(and(eq(schema.invoices.tenantId, tenant.id), eq(schema.invoices.organizationId, user.organizationId)))
          .orderBy(desc(schema.invoices.periodYear), desc(schema.invoices.periodMonth)),
        db
          .select()
          .from(schema.payments)
          .where(and(eq(schema.payments.tenantId, tenant.id), eq(schema.payments.organizationId, user.organizationId)))
          .orderBy(desc(schema.payments.createdAt)),
        db
          .select()
          .from(schema.complaints)
          .where(and(eq(schema.complaints.tenantId, tenant.id), eq(schema.complaints.organizationId, user.organizationId)))
          .orderBy(desc(schema.complaints.createdAt)),
        db
          .select()
          .from(schema.notices)
          .where(
            and(
              eq(schema.notices.organizationId, user.organizationId),
              or(isNull(schema.notices.propertyId), eq(schema.notices.propertyId, tenant.propertyId))
            )
          )
          .orderBy(desc(schema.notices.pinned), desc(schema.notices.createdAt)),
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
      .where(eq(schema.complaintComments.organizationId, user.organizationId))
      .orderBy(schema.complaintComments.createdAt);

    return res.json({
      tenant,
      organization: orgRows[0] || null,
      property: propRows[0] || null,
      bed,
      room,
      invoices: tenantInvoices.map((i) => ({
        ...i,
        periodLabel: formatMonthYear(i.periodMonth, i.periodYear),
        balanceDue: Math.max(0, i.amount - i.paidAmount),
      })),
      payments: tenantPayments,
      complaints: tenantComplaints.map((c) => ({
        ...c,
        comments: comments.filter((cm) => cm.complaintId === c.id),
      })),
      notices: tenantNotices,
    });
  } catch (err) {
    console.error('GET /api/tenant/overview error:', err);
    return res.status(500).json({ error: 'Failed to load tenant portal' });
  }
});

tenantPortalRouter.post('/payments', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenant = await resolveTenantRecord(user.id, user.organizationId, user.email);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });

    const parsed = tenantUpiSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid UPI submission' });
    }

    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.id, parsed.data.invoiceId),
          eq(schema.invoices.tenantId, tenant.id),
          eq(schema.invoices.organizationId, user.organizationId)
        )
      )
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found for your account' });
    }

    const [payment] = await db
      .insert(schema.payments)
      .values({
        organizationId: user.organizationId,
        invoiceId: invoice.id,
        tenantId: tenant.id,
        amount: parsed.data.amount,
        method: 'UPI',
        reference: parsed.data.reference,
        screenshotUrl: parsed.data.screenshotUrl || null,
        approvalStatus: 'PENDING_APPROVAL',
        paidAt: new Date().toISOString().slice(0, 10),
        notes: parsed.data.notes || 'Submitted by resident via Tenant Portal',
      })
      .returning();

    return res.status(201).json({
      payment,
      message: 'UPI payment proof submitted for owner verification.',
    });
  } catch (err) {
    console.error('POST /api/tenant/payments error:', err);
    return res.status(500).json({ error: 'Failed to submit payment proof' });
  }
});

tenantPortalRouter.post('/complaints', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenant = await resolveTenantRecord(user.id, user.organizationId, user.email);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });

    const parsed = createComplaintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid complaint' });
    }

    const [created] = await db
      .insert(schema.complaints)
      .values({
        organizationId: user.organizationId,
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
    const tenant = await resolveTenantRecord(user.id, user.organizationId, user.email);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });

    const complaintId = Number(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (body.length < 2) return res.status(400).json({ error: 'Comment text is required' });

    const [complaint] = await db
      .select()
      .from(schema.complaints)
      .where(and(eq(schema.complaints.id, complaintId), eq(schema.complaints.tenantId, tenant.id)))
      .limit(1);
    if (!complaint) return res.status(404).json({ error: 'Complaint not found' });

    const [comment] = await db
      .insert(schema.complaintComments)
      .values({
        organizationId: user.organizationId,
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
    const tenant = await resolveTenantRecord(user.id, user.organizationId, user.email);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });

    const leaveDate = String(req.body?.leaveDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leaveDate)) {
      return res.status(400).json({ error: 'Valid planned move-out date (YYYY-MM-DD) is required' });
    }

    const [updated] = await db
      .update(schema.tenants)
      .set({
        status: 'NOTICE',
        leaveDate,
        noticeRequestedAt: new Date().toISOString().slice(0, 10),
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenant.id))
      .returning();

    return res.json({ tenant: updated });
  } catch (err) {
    console.error('POST /api/tenant/move-out-request error:', err);
    return res.status(500).json({ error: 'Failed to submit move-out notice' });
  }
});

tenantPortalRouter.get('/invoices/:id/receipt.pdf', requireAuth, requireRole('TENANT'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const tenant = await resolveTenantRecord(user.id, user.organizationId, user.email);
    if (!tenant) return res.status(404).json({ error: 'Tenant profile not found' });

    const invoiceId = Number(req.params.id);
    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.tenantId, tenant.id)))
      .limit(1);

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const [orgRows, propRows, invPayments] = await Promise.all([
      db.select().from(schema.organizations).where(eq(schema.organizations.id, user.organizationId)).limit(1),
      db.select().from(schema.properties).where(eq(schema.properties.id, invoice.propertyId)).limit(1),
      db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.invoiceId, invoice.id), eq(schema.payments.approvalStatus, 'APPROVED'))),
    ]);

    const org = orgRows[0];
    const prop = propRows[0];
    let roomBedLabel = 'Assigned Bed';
    if (tenant.bedId) {
      const [bed] = await db.select().from(schema.beds).where(eq(schema.beds.id, tenant.bedId)).limit(1);
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
      status: invoice.status,
      tenantName: tenant.name,
      tenantPhone: tenant.phone,
      roomBedLabel,
      items: invoice.items,
      totalAmount: invoice.amount,
      paidAmount: invoice.paidAmount,
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
