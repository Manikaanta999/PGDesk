import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import {
  deriveInvoiceStatus,
} from '../../lib/billing.ts';
import { formatDateIN, formatMonthYear } from '../../lib/format.ts';
import { generateReceiptPdfBytes } from '../../lib/pdfReceipt.ts';
import { generateInvoicesSchema, recordPaymentSchema } from '../../lib/validation.ts';
import {
  AuthRequest,
  canAccessProperty,
  getAllowedPropertyIds,
  requireAuth,
  requireRole,
} from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';
import { runBillingCycleForOrg } from '../billingEngine.ts';

export const billingRouter = Router();

billingRouter.get('/invoices', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 25)));
    const statusFilter = String(req.query.status || 'ALL').toUpperCase();
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : null;
    const search = String(req.query.search || '').trim().toLowerCase();

    const orgProps = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));

    const allowedIds = getAllowedPropertyIds(user, orgProps.map((p) => p.id));
    if (allowedIds.length === 0) {
      return res.json({ invoices: [], total: 0, page, pageSize, pendingApprovals: [] });
    }

    const [allInvoices, allTenants, allPayments, orgRows] = await Promise.all([
      db
        .select()
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.organizationId, user.organizationId),
            inArray(schema.invoices.propertyId, allowedIds)
          )
        )
        .orderBy(desc(schema.invoices.periodYear), desc(schema.invoices.periodMonth), desc(schema.invoices.id)),
      db.select().from(schema.tenants).where(eq(schema.tenants.organizationId, user.organizationId)),
      db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.organizationId, user.organizationId))
        .orderBy(desc(schema.payments.createdAt)),
      db.select().from(schema.organizations).where(eq(schema.organizations.id, user.organizationId)).limit(1),
    ]);

    const tenantMap = new Map(allTenants.map((t) => [t.id, t]));
    const propMap = new Map(orgProps.map((p) => [p.id, p]));
    const org = orgRows[0];

    let rows = allInvoices.map((inv) => {
      const tenant = tenantMap.get(inv.tenantId);
      const prop = propMap.get(inv.propertyId);
      return {
        ...inv,
        tenantName: tenant?.name || 'Resident',
        tenantPhone: tenant?.phone || '',
        propertyName: prop?.name || '',
        periodLabel: formatMonthYear(inv.periodMonth, inv.periodYear),
        balanceDue: Math.max(0, inv.amount - inv.paidAmount),
        upiId: org?.upiId || 'pgdesk@okicici',
      };
    });

    if (propertyId) {
      rows = rows.filter((r) => r.propertyId === propertyId);
    }
    if (statusFilter !== 'ALL') {
      rows = rows.filter((r) => r.status === statusFilter);
    }
    if (search) {
      rows = rows.filter(
        (r) =>
          r.tenantName.toLowerCase().includes(search) ||
          r.invoiceNumber.toLowerCase().includes(search) ||
          r.tenantPhone.includes(search)
      );
    }

    const pendingApprovals = allPayments
      .filter((p) => p.approvalStatus === 'PENDING_APPROVAL')
      .map((p) => {
        const tenant = tenantMap.get(p.tenantId);
        const inv = allInvoices.find((i) => i.id === p.invoiceId);
        return {
          ...p,
          tenantName: tenant?.name || 'Resident',
          invoiceNumber: inv?.invoiceNumber || '',
          propertyName: inv ? propMap.get(inv.propertyId)?.name || '' : '',
        };
      });

    const total = rows.length;
    const start = (page - 1) * pageSize;
    return res.json({
      invoices: rows.slice(start, start + pageSize),
      total,
      page,
      pageSize,
      pendingApprovals,
    });
  } catch (err) {
    console.error('GET /api/billing/invoices error:', err);
    return res.status(500).json({ error: 'Failed to load invoices' });
  }
});

billingRouter.post('/generate', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = generateInvoicesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid invoice generation request' });
    }

    const { month, year, propertyId, applyLateFees } = parsed.data;
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    const orgProps = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));

    const allowedIds = getAllowedPropertyIds(user, orgProps.map((p) => p.id));
    const targetPropIds = propertyId && allowedIds.includes(propertyId) ? [propertyId] : allowedIds;

    if (targetPropIds.length === 0 || !org) {
      return res.status(400).json({ error: 'No accessible properties found' });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const { createdCount, updatedOverdueCount } = await runBillingCycleForOrg({
      org,
      targetPropertyIds: targetPropIds,
      year,
      month,
      asOfDate: todayStr,
      applyLateFees,
      respectBillingDay: false,
    });

    await logAudit({
      user,
      action: 'INVOICES_GENERATED',
      entityType: 'INVOICE_BATCH',
      entityId: `${year}-${month}`,
      metadata: { createdCount, updatedOverdueCount },
    });

    return res.json({ createdCount, updatedOverdueCount });
  } catch (err) {
    console.error('POST /api/billing/generate error:', err);
    return res.status(500).json({ error: 'Failed to generate monthly invoices' });
  }
});

billingRouter.post('/payments', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = recordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid payment payload' });
    }

    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, parsed.data.invoiceId), eq(schema.invoices.organizationId, user.organizationId)))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!canAccessProperty(user, invoice.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [payment] = await db
      .insert(schema.payments)
      .values({
        organizationId: user.organizationId,
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        amount: parsed.data.amount,
        method: parsed.data.method,
        reference: parsed.data.reference,
        approvalStatus: 'APPROVED',
        paidAt: parsed.data.paidAt,
        recordedByUserId: user.id,
        notes: parsed.data.notes || null,
      })
      .returning();

    const newPaid = invoice.paidAmount + parsed.data.amount;
    const todayStr = new Date().toISOString().slice(0, 10);
    const nextStatus = deriveInvoiceStatus({
      amount: invoice.amount,
      paidAmount: newPaid,
      dueDate: invoice.dueDate,
      asOfDate: todayStr,
    });

    const [updatedInvoice] = await db
      .update(schema.invoices)
      .set({ paidAmount: newPaid, status: nextStatus, updatedAt: new Date() })
      .where(eq(schema.invoices.id, invoice.id))
      .returning();

    await logAudit({
      user,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: payment.id,
      metadata: { invoiceId: invoice.id, amount: parsed.data.amount, method: parsed.data.method },
    });

    return res.status(201).json({ payment, invoice: updatedInvoice });
  } catch (err) {
    console.error('POST /api/billing/payments error:', err);
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

billingRouter.post('/payments/:id/review', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const paymentId = Number(req.params.id);
    const decision = String(req.body?.decision || '').toUpperCase();
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      return res.status(400).json({ error: 'Decision must be APPROVE or REJECT' });
    }

    const [payment] = await db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.organizationId, user.organizationId)))
      .limit(1);

    if (!payment || payment.approvalStatus !== 'PENDING_APPROVAL') {
      return res.status(404).json({ error: 'Pending payment submission not found' });
    }

    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, payment.invoiceId))
      .limit(1);

    if (!invoice || !canAccessProperty(user, invoice.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const newApprovalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await db
      .update(schema.payments)
      .set({
        approvalStatus: newApprovalStatus,
        recordedByUserId: user.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.payments.id, payment.id));

    if (decision === 'APPROVE') {
      const newPaid = invoice.paidAmount + payment.amount;
      const nextStatus = deriveInvoiceStatus({
        amount: invoice.amount,
        paidAmount: newPaid,
        dueDate: invoice.dueDate,
        asOfDate: new Date().toISOString().slice(0, 10),
      });
      await db
        .update(schema.invoices)
        .set({ paidAmount: newPaid, status: nextStatus, updatedAt: new Date() })
        .where(eq(schema.invoices.id, invoice.id));
    }

    await logAudit({
      user,
      action: `UPI_PAYMENT_${decision}D`,
      entityType: 'PAYMENT',
      entityId: payment.id,
      metadata: { amount: payment.amount, reference: payment.reference },
    });

    return res.json({ ok: true, approvalStatus: newApprovalStatus });
  } catch (err) {
    console.error('POST /api/billing/payments/:id/review error:', err);
    return res.status(500).json({ error: 'Failed to review UPI payment' });
  }
});

billingRouter.get('/invoices/:id/receipt.pdf', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const invoiceId = Number(req.params.id);

    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.organizationId, user.organizationId)))
      .limit(1);

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }
    if (!canAccessProperty(user, invoice.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [orgRows, propRows, tenantRows, invPayments] = await Promise.all([
      db.select().from(schema.organizations).where(eq(schema.organizations.id, user.organizationId)).limit(1),
      db.select().from(schema.properties).where(eq(schema.properties.id, invoice.propertyId)).limit(1),
      db.select().from(schema.tenants).where(eq(schema.tenants.id, invoice.tenantId)).limit(1),
      db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.invoiceId, invoice.id), eq(schema.payments.approvalStatus, 'APPROVED'))),
    ]);

    const org = orgRows[0];
    const prop = propRows[0];
    const tenant = tenantRows[0];
    let roomBedLabel = 'Assigned Bed';
    if (tenant?.bedId) {
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
      tenantName: tenant?.name || 'Resident',
      tenantPhone: tenant?.phone || '',
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
    console.error('GET /api/billing/invoices/:id/receipt.pdf error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF receipt' });
  }
});
