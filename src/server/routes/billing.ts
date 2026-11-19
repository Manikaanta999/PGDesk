import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import {
  canDownloadInvoiceReceipt,
  computeApprovedPaidAmount,
  deriveInvoiceStatus,
  reconcileInvoiceWithPayments,
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

class BillingHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const billingRouter = Router();

billingRouter.get('/invoices', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize || 25)));
    const statusFilter = String(req.query.status || 'ALL').toUpperCase();
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : null;
    const monthFilter = String(req.query.month || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    const orgProps = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));

    const allowedIds = getAllowedPropertyIds(user, orgProps.map((p) => p.id));
    if (allowedIds.length === 0) {
      return res.json({
        invoices: [],
        total: 0,
        page,
        pageSize,
        pendingApprovals: [],
        availableMonths: [],
        summary: { totalBilled: 0, totalCollected: 0, totalPending: 0, overdueCount: 0 },
      });
    }

    const [allInvoices, allTenants, allBeds, allRooms, allPayments, orgRows] = await Promise.all([
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
      db.select().from(schema.beds).where(eq(schema.beds.organizationId, user.organizationId)),
      db.select().from(schema.rooms).where(eq(schema.rooms.organizationId, user.organizationId)),
      db
        .select()
        .from(schema.payments)
        .where(eq(schema.payments.organizationId, user.organizationId))
        .orderBy(desc(schema.payments.createdAt)),
      db.select().from(schema.organizations).where(eq(schema.organizations.id, user.organizationId)).limit(1),
    ]);

    const tenantMap = new Map(allTenants.map((t) => [t.id, t]));
    const propMap = new Map(orgProps.map((p) => [p.id, p]));
    const bedMap = new Map(allBeds.map((b) => [b.id, b]));
    const roomMap = new Map(allRooms.map((r) => [r.id, r]));
    const org = orgRows[0];
    const todayStr = new Date().toISOString().slice(0, 10);

    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
      arr.push(p);
      paymentsByInvoice.set(p.invoiceId, arr);
    }

    const monthOptionsMap = new Map<string, string>();
    for (const inv of allInvoices) {
      const key = `${inv.periodYear}-${String(inv.periodMonth).padStart(2, '0')}`;
      if (!monthOptionsMap.has(key)) {
        monthOptionsMap.set(key, formatMonthYear(inv.periodMonth, inv.periodYear));
      }
    }
    const availableMonths = Array.from(monthOptionsMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, label]) => ({ key, label }));

    let rows = allInvoices.map((inv) => {
      const tenant = tenantMap.get(inv.tenantId);
      const prop = propMap.get(inv.propertyId);
      const bed = tenant?.bedId ? bedMap.get(tenant.bedId) : undefined;
      const room = bed ? roomMap.get(bed.roomId) : undefined;
      const invPayments = paymentsByInvoice.get(inv.id) ?? [];
      const reconciled = reconcileInvoiceWithPayments(inv, invPayments, todayStr);
      return {
        ...inv,
        paidAmount: reconciled.paidAmount,
        status: reconciled.status,
        balanceDue: reconciled.balanceDue,
        approvedPaymentCount: reconciled.approvedCount,
        payments: invPayments.filter((p) => p.approvalStatus === 'APPROVED'),
        tenantName: tenant?.name || 'Resident',
        tenantPhone: tenant?.phone || '',
        propertyName: prop?.name || '',
        roomNumber: room?.roomNumber || '',
        bedLabel: bed?.bedLabel || '',
        periodKey: `${inv.periodYear}-${String(inv.periodMonth).padStart(2, '0')}`,
        periodLabel: formatMonthYear(inv.periodMonth, inv.periodYear),
        upiId: org?.upiId || 'pgdesk@okicici',
      };
    });

    if (propertyId) {
      rows = rows.filter((r) => r.propertyId === propertyId);
    }
    if (monthFilter) {
      rows = rows.filter((r) => r.periodKey === monthFilter);
    }
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'UNPAID' || statusFilter === 'PENDING') {
        rows = rows.filter((r) => r.status === 'UNPAID' || (r.status as string) === 'PENDING');
      } else {
        rows = rows.filter((r) => r.status === statusFilter);
      }
    }
    if (search) {
      rows = rows.filter(
        (r) =>
          r.tenantName.toLowerCase().includes(search) ||
          r.invoiceNumber.toLowerCase().includes(search) ||
          r.tenantPhone.includes(search) ||
          r.roomNumber.toLowerCase().includes(search) ||
          r.bedLabel.toLowerCase().includes(search)
      );
    }

    const summary = {
      totalBilled: rows.reduce((s, r) => s + r.amount, 0),
      totalCollected: rows.reduce((s, r) => s + r.paidAmount, 0),
      totalPending: rows.reduce((s, r) => s + r.balanceDue, 0),
      overdueCount: rows.filter((r) => r.status === 'OVERDUE').length,
    };

    const allowedPropSet = new Set(allowedIds);
    const invMap = new Map(allInvoices.map((i) => [i.id, i]));
    const pendingApprovals = allPayments
      .filter((p) => {
        if (p.approvalStatus !== 'PENDING_APPROVAL') return false;
        const inv = invMap.get(p.invoiceId);
        return Boolean(inv && allowedPropSet.has(inv.propertyId));
      })
      .map((p) => {
        const tenant = tenantMap.get(p.tenantId);
        const inv = invMap.get(p.invoiceId);
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
      availableMonths,
      summary,
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

    const d = parsed.data;
    const todayStr = new Date().toISOString().slice(0, 10);

    const result = await db.transaction(async (tx) => {
      if (d.idempotencyKey) {
        const [dupByKey] = await tx
          .select()
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.organizationId, user.organizationId),
              eq(schema.payments.idempotencyKey, d.idempotencyKey)
            )
          )
          .limit(1);
        if (dupByKey) {
          throw new BillingHttpError(409, 'Duplicate payment submission prevented. This payment was already recorded.');
        }
      }

      const [invoice] = await tx
        .select()
        .from(schema.invoices)
        .where(and(eq(schema.invoices.id, d.invoiceId), eq(schema.invoices.organizationId, user.organizationId)))
        .for('update')
        .limit(1);

      if (!invoice) {
        throw new BillingHttpError(404, 'Invoice not found');
      }
      if (!canAccessProperty(user, invoice.propertyId)) {
        throw new BillingHttpError(403, 'Access denied');
      }

      const existingPayments = await tx
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.invoiceId, invoice.id),
            eq(schema.payments.organizationId, user.organizationId)
          )
        );

      const recentCutoff = new Date(Date.now() - 15_000);
      const hasRecentIdentical = existingPayments.some(
        (p) =>
          p.approvalStatus === 'APPROVED' &&
          p.amount === d.amount &&
          p.method === d.method &&
          p.paidAt === d.paidAt &&
          (p.reference || '') === (d.reference || '') &&
          new Date(p.createdAt) >= recentCutoff
      );
      if (hasRecentIdentical) {
        throw new BillingHttpError(409, 'Duplicate payment submission prevented. Identical payment recorded moments ago.');
      }

      const currentPaid = computeApprovedPaidAmount(existingPayments);
      const balanceDue = Math.max(0, invoice.amount - currentPaid);
      if (balanceDue <= 0) {
        throw new BillingHttpError(400, 'This invoice has already been paid in full.');
      }
      if (d.amount > balanceDue) {
        throw new BillingHttpError(
          400,
          `Payment amount exceeds remaining balance of ₹${balanceDue.toLocaleString('en-IN')}.`
        );
      }

      const [payment] = await tx
        .insert(schema.payments)
        .values({
          organizationId: user.organizationId,
          invoiceId: invoice.id,
          tenantId: invoice.tenantId,
          amount: d.amount,
          method: d.method,
          reference: d.reference,
          approvalStatus: 'APPROVED',
          paidAt: d.paidAt,
          recordedByUserId: user.id,
          idempotencyKey: d.idempotencyKey || null,
          notes: d.notes || null,
        })
        .returning();

      const newPaid = currentPaid + d.amount;
      const nextStatus = deriveInvoiceStatus({
        amount: invoice.amount,
        paidAmount: newPaid,
        dueDate: invoice.dueDate,
        asOfDate: todayStr,
      });

      const [updatedInvoice] = await tx
        .update(schema.invoices)
        .set({ paidAmount: newPaid, status: nextStatus, updatedAt: new Date() })
        .where(eq(schema.invoices.id, invoice.id))
        .returning();

      return { payment, invoice: updatedInvoice };
    });

    await logAudit({
      user,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: result.payment.id,
      metadata: { invoiceId: result.invoice.id, amount: d.amount, method: d.method },
    });

    return res.status(201).json(result);
  } catch (err: any) {
    if (err instanceof BillingHttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err?.code === '23505' || err?.cause?.code === '23505') {
      return res.status(409).json({ error: 'Duplicate payment submission prevented.' });
    }
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

    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.organizationId, user.organizationId)))
        .for('update')
        .limit(1);

      if (!payment || payment.approvalStatus !== 'PENDING_APPROVAL') {
        throw new BillingHttpError(404, 'Pending payment submission not found or already reviewed');
      }

      const [invoice] = await tx
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, payment.invoiceId))
        .for('update')
        .limit(1);

      if (!invoice || !canAccessProperty(user, invoice.propertyId)) {
        throw new BillingHttpError(403, 'Access denied');
      }

      const newApprovalStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const [updatedPayment] = await tx
        .update(schema.payments)
        .set({
          approvalStatus: newApprovalStatus,
          recordedByUserId: user.id,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.payments.id, payment.id), eq(schema.payments.approvalStatus, 'PENDING_APPROVAL')))
        .returning();

      if (!updatedPayment) {
        throw new BillingHttpError(409, 'Payment was already reviewed.');
      }

      if (decision === 'APPROVE') {
        const invPayments = await tx
          .select()
          .from(schema.payments)
          .where(and(eq(schema.payments.invoiceId, invoice.id), eq(schema.payments.approvalStatus, 'APPROVED')));
        const newPaid = computeApprovedPaidAmount(invPayments);
        if (newPaid > invoice.amount) {
          throw new BillingHttpError(
            400,
            `Approving ₹${payment.amount.toLocaleString('en-IN')} exceeds invoice remaining balance.`
          );
        }
        const nextStatus = deriveInvoiceStatus({
          amount: invoice.amount,
          paidAmount: newPaid,
          dueDate: invoice.dueDate,
          asOfDate: new Date().toISOString().slice(0, 10),
        });
        await tx
          .update(schema.invoices)
          .set({ paidAmount: newPaid, status: nextStatus, updatedAt: new Date() })
          .where(eq(schema.invoices.id, invoice.id));
      }

      return { payment: updatedPayment, newApprovalStatus };
    });

    await logAudit({
      user,
      action: `UPI_PAYMENT_${decision}D`,
      entityType: 'PAYMENT',
      entityId: result.payment.id,
      metadata: { amount: result.payment.amount, reference: result.payment.reference },
    });

    return res.json({ ok: true, approvalStatus: result.newApprovalStatus });
  } catch (err: any) {
    if (err instanceof BillingHttpError) {
      return res.status(err.status).json({ error: err.message });
    }
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

    const todayStr = new Date().toISOString().slice(0, 10);
    const reconciled = reconcileInvoiceWithPayments(invoice, invPayments, todayStr);
    if (!canDownloadInvoiceReceipt({ paidAmount: reconciled.paidAmount, approvedCount: reconciled.approvedCount })) {
      return res.status(400).json({
        error: 'Receipt cannot be generated for an unpaid invoice. Record a payment first.',
      });
    }

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
      status: reconciled.status,
      tenantName: tenant?.name || 'Resident',
      tenantPhone: tenant?.phone || '',
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
    console.error('GET /api/billing/invoices/:id/receipt.pdf error:', err);
    return res.status(500).json({ error: 'Failed to generate PDF receipt' });
  }
});
