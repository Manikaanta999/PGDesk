import { Router } from 'express';
import { and, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { reconcileInvoiceWithPayments } from '../../lib/billing.ts';
import { getActiveEntitlement, SUBSCRIPTIONS_ENABLED } from '../../lib/entitlements.ts';
import { formatMonthYear } from '../../lib/format.ts';
import { hashPassword } from '../../lib/security.ts';
import { storageService } from '../../lib/storage.ts';
import {
  createComplaintSchema,
  createExpenseSchema,
  createNoticeSchema,
  inviteStaffSchema,
  updateComplaintSchema,
  updateEnquirySchema,
  updateSettingsSchema,
} from '../../lib/validation.ts';
import {
  AuthRequest,
  canAccessProperty,
  getAllowedPropertyIds,
  requireAuth,
  requireRole,
} from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';

export const operationsRouter = Router();

// ---------- COMPLAINTS ----------
operationsRouter.get('/complaints', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const orgProps = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));
    const allowedIds = getAllowedPropertyIds(user, orgProps.map((p) => p.id));
    if (allowedIds.length === 0) return res.json({ complaints: [], staff: [] });

    const [rows, tenants, beds, rooms, staff, comments] = await Promise.all([
      db
        .select()
        .from(schema.complaints)
        .where(
          and(
            eq(schema.complaints.organizationId, user.organizationId),
            inArray(schema.complaints.propertyId, allowedIds)
          )
        )
        .orderBy(desc(schema.complaints.createdAt)),
      db.select().from(schema.tenants).where(eq(schema.tenants.organizationId, user.organizationId)),
      db.select().from(schema.beds).where(eq(schema.beds.organizationId, user.organizationId)),
      db.select().from(schema.rooms).where(eq(schema.rooms.organizationId, user.organizationId)),
      db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          role: schema.users.role,
        })
        .from(schema.users)
        .where(eq(schema.users.organizationId, user.organizationId)),
      db
        .select()
        .from(schema.complaintComments)
        .where(eq(schema.complaintComments.organizationId, user.organizationId))
        .orderBy(schema.complaintComments.createdAt),
    ]);

    const propMap = new Map(orgProps.map((p) => [p.id, p]));
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));
    const bedMap = new Map(beds.map((b) => [b.id, b]));
    const roomMap = new Map(rooms.map((r) => [r.id, r]));
    const staffMap = new Map(staff.map((s) => [s.id, s]));

    const enriched = rows.map((c) => {
      const tenant = tenantMap.get(c.tenantId);
      const bed = tenant?.bedId ? bedMap.get(tenant.bedId) : undefined;
      const room = bed ? roomMap.get(bed.roomId) : undefined;
      return {
        ...c,
        propertyName: propMap.get(c.propertyId)?.name || '',
        tenantName: tenant?.name || 'Resident',
        tenantPhone: tenant?.phone || '',
        roomNumber: room?.roomNumber || '',
        bedLabel: bed?.bedLabel || '',
        assignedToName: c.assignedToUserId ? staffMap.get(c.assignedToUserId)?.name || null : null,
        comments: comments.filter((cm) => cm.complaintId === c.id),
      };
    });

    return res.json({
      complaints: enriched,
      staff: staff.filter((s) => s.role === 'OWNER' || s.role === 'MANAGER'),
    });
  } catch (err) {
    console.error('GET /api/complaints error:', err);
    return res.status(500).json({ error: 'Failed to load complaints' });
  }
});

operationsRouter.post('/complaints', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = createComplaintSchema.safeParse(req.body);
    if (!parsed.success || !parsed.data.tenantId) {
      return res.status(400).json({ error: 'Valid tenant and complaint details are required' });
    }

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(
        and(eq(schema.tenants.id, parsed.data.tenantId), eq(schema.tenants.organizationId, user.organizationId))
      )
      .limit(1);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!canAccessProperty(user, tenant.propertyId)) return res.status(403).json({ error: 'Access denied' });

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
    console.error('POST /api/complaints error:', err);
    return res.status(500).json({ error: 'Failed to log complaint' });
  }
});

operationsRouter.patch('/complaints/:id', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const id = Number(req.params.id);
    const parsed = updateComplaintSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update' });
    }

    const [existing] = await db
      .select()
      .from(schema.complaints)
      .where(and(eq(schema.complaints.id, id), eq(schema.complaints.organizationId, user.organizationId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Complaint not found' });
    if (!canAccessProperty(user, existing.propertyId)) return res.status(403).json({ error: 'Access denied' });

    const [updated] = await db
      .update(schema.complaints)
      .set({
        status: parsed.data.status ?? existing.status,
        priority: parsed.data.priority ?? existing.priority,
        assignedToUserId:
          parsed.data.assignedToUserId !== undefined ? parsed.data.assignedToUserId : existing.assignedToUserId,
        resolvedAt: parsed.data.status === 'RESOLVED' ? new Date() : existing.resolvedAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.complaints.id, id))
      .returning();

    return res.json({ complaint: updated });
  } catch (err) {
    console.error('PATCH /api/complaints/:id error:', err);
    return res.status(500).json({ error: 'Failed to update complaint' });
  }
});

operationsRouter.post('/complaints/:id/comments', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const complaintId = Number(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (body.length < 2) return res.status(400).json({ error: 'Comment text is required' });

    const [existing] = await db
      .select()
      .from(schema.complaints)
      .where(and(eq(schema.complaints.id, complaintId), eq(schema.complaints.organizationId, user.organizationId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Complaint not found' });
    if (!canAccessProperty(user, existing.propertyId)) return res.status(403).json({ error: 'Access denied' });

    const [comment] = await db
      .insert(schema.complaintComments)
      .values({
        organizationId: user.organizationId,
        complaintId,
        authorUserId: user.id,
        authorName: user.name,
        authorRole: user.role,
        body,
      })
      .returning();

    return res.status(201).json({ comment });
  } catch (err) {
    console.error('POST /api/complaints/:id/comments error:', err);
    return res.status(500).json({ error: 'Failed to post comment' });
  }
});

// ---------- NOTICES ----------
operationsRouter.get('/notices', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const [rows, props] = await Promise.all([
      db
        .select()
        .from(schema.notices)
        .where(eq(schema.notices.organizationId, user.organizationId))
        .orderBy(desc(schema.notices.pinned), desc(schema.notices.createdAt)),
      db
        .select()
        .from(schema.properties)
        .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt))),
    ]);

    const propMap = new Map(props.map((p) => [p.id, p]));
    const allowedSet = new Set(getAllowedPropertyIds(user, props.map((p) => p.id)));

    const visible = rows
      .filter((n) => n.propertyId === null || allowedSet.has(n.propertyId))
      .map((n) => ({
        ...n,
        propertyName: n.propertyId ? propMap.get(n.propertyId)?.name || 'Property' : 'All Properties',
      }));

    return res.json({ notices: visible });
  } catch (err) {
    console.error('GET /api/notices error:', err);
    return res.status(500).json({ error: 'Failed to load notices' });
  }
});

operationsRouter.post('/notices', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = createNoticeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid notice' });
    }
    if (parsed.data.propertyId && !canAccessProperty(user, parsed.data.propertyId)) {
      return res.status(403).json({ error: 'Access denied to target property' });
    }

    const [created] = await db
      .insert(schema.notices)
      .values({
        organizationId: user.organizationId,
        propertyId: parsed.data.propertyId ?? null,
        title: parsed.data.title,
        body: parsed.data.body,
        pinned: parsed.data.pinned,
        createdByUserId: user.id,
        createdByName: user.name,
      })
      .returning();

    return res.status(201).json({ notice: created });
  } catch (err) {
    console.error('POST /api/notices error:', err);
    return res.status(500).json({ error: 'Failed to publish notice' });
  }
});

operationsRouter.patch('/notices/:id', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(schema.notices)
      .where(and(eq(schema.notices.id, id), eq(schema.notices.organizationId, user.organizationId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Notice not found' });
    if (existing.propertyId && !canAccessProperty(user, existing.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const parsed = createNoticeSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid notice update' });
    }
    if (parsed.data.propertyId && !canAccessProperty(user, parsed.data.propertyId)) {
      return res.status(403).json({ error: 'Access denied to target property' });
    }

    const [updated] = await db
      .update(schema.notices)
      .set({
        title: parsed.data.title ?? existing.title,
        body: parsed.data.body ?? existing.body,
        propertyId: parsed.data.propertyId !== undefined ? parsed.data.propertyId : existing.propertyId,
        pinned: parsed.data.pinned !== undefined ? parsed.data.pinned : existing.pinned,
        updatedAt: new Date(),
      })
      .where(eq(schema.notices.id, id))
      .returning();

    return res.json({ notice: updated });
  } catch (err) {
    console.error('PATCH /api/notices/:id error:', err);
    return res.status(500).json({ error: 'Failed to update notice' });
  }
});

operationsRouter.delete('/notices/:id', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const id = Number(req.params.id);
    const [existing] = await db
      .select()
      .from(schema.notices)
      .where(and(eq(schema.notices.id, id), eq(schema.notices.organizationId, user.organizationId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Notice not found' });
    if (existing.propertyId && !canAccessProperty(user, existing.propertyId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await db
      .delete(schema.notices)
      .where(and(eq(schema.notices.id, id), eq(schema.notices.organizationId, user.organizationId)));
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/notices/:id error:', err);
    return res.status(500).json({ error: 'Failed to delete notice' });
  }
});

// ---------- ENQUIRIES / LEADS ----------
operationsRouter.get('/enquiries', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const props = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));
    const allowedIds = getAllowedPropertyIds(user, props.map((p) => p.id));
    if (allowedIds.length === 0) return res.json({ enquiries: [] });

    const rows = await db
      .select()
      .from(schema.enquiries)
      .where(
        and(
          eq(schema.enquiries.organizationId, user.organizationId),
          inArray(schema.enquiries.propertyId, allowedIds)
        )
      )
      .orderBy(desc(schema.enquiries.createdAt));

    const propMap = new Map(props.map((p) => [p.id, p]));
    return res.json({
      enquiries: rows.map((e) => ({
        ...e,
        propertyName: propMap.get(e.propertyId)?.name || '',
      })),
    });
  } catch (err) {
    console.error('GET /api/enquiries error:', err);
    return res.status(500).json({ error: 'Failed to load enquiries' });
  }
});

operationsRouter.patch('/enquiries/:id', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const id = Number(req.params.id);
    const parsed = updateEnquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid enquiry update' });
    }

    const [existing] = await db
      .select()
      .from(schema.enquiries)
      .where(and(eq(schema.enquiries.id, id), eq(schema.enquiries.organizationId, user.organizationId)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: 'Enquiry not found' });
    if (!canAccessProperty(user, existing.propertyId)) return res.status(403).json({ error: 'Access denied' });

    const [updated] = await db
      .update(schema.enquiries)
      .set({
        status: parsed.data.status,
        notes: parsed.data.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.enquiries.id, id))
      .returning();

    return res.json({ enquiry: updated });
  } catch (err) {
    console.error('PATCH /api/enquiries/:id error:', err);
    return res.status(500).json({ error: 'Failed to update enquiry' });
  }
});

// ---------- EXPENSES & P&L REPORT ----------
operationsRouter.get('/expenses', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : null;
    const props = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));
    const allowedIds = getAllowedPropertyIds(user, props.map((p) => p.id));
    const targetIds = propertyId && allowedIds.includes(propertyId) ? [propertyId] : allowedIds;
    if (targetIds.length === 0) return res.json({ expenses: [], pnl: [] });

    const [expenseRows, invoiceRows, approvedPaymentRows] = await Promise.all([
      db
        .select()
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.organizationId, user.organizationId),
            inArray(schema.expenses.propertyId, targetIds)
          )
        )
        .orderBy(desc(schema.expenses.expenseDate)),
      db
        .select()
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.organizationId, user.organizationId),
            inArray(schema.invoices.propertyId, targetIds)
          )
        ),
      db
        .select()
        .from(schema.payments)
        .where(
          and(
            eq(schema.payments.organizationId, user.organizationId),
            eq(schema.payments.approvalStatus, 'APPROVED')
          )
        ),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const paymentsByInvoice = new Map<number, typeof approvedPaymentRows>();
    for (const p of approvedPaymentRows) {
      const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
      arr.push(p);
      paymentsByInvoice.set(p.invoiceId, arr);
    }

    const reconciledInvoices = invoiceRows.map((inv) => ({
      ...inv,
      reconciledPaidAmount: reconcileInvoiceWithPayments(inv, paymentsByInvoice.get(inv.id) ?? [], todayStr)
        .paidAmount,
    }));

    const propMap = new Map(props.map((p) => [p.id, p]));
    const monthSet = new Set<string>();
    for (const inv of reconciledInvoices) {
      monthSet.add(`${inv.periodYear}-${String(inv.periodMonth).padStart(2, '0')}`);
    }
    for (const exp of expenseRows) {
      monthSet.add(exp.expenseDate.slice(0, 7));
    }

    const sortedMonths = Array.from(monthSet).sort().reverse().slice(0, 12);
    const pnl = sortedMonths.map((ym) => {
      const [y, m] = ym.split('-').map(Number);
      const rev = reconciledInvoices
        .filter((i) => i.periodYear === y && i.periodMonth === m)
        .reduce((s, i) => s + i.reconciledPaidAmount, 0);
      const exp = expenseRows
        .filter((e) => e.expenseDate.startsWith(ym))
        .reduce((s, e) => s + e.amount, 0);
      return {
        monthKey: ym,
        label: formatMonthYear(m, y),
        revenue: rev,
        expenses: exp,
        netProfit: rev - exp,
      };
    });

    return res.json({
      expenses: expenseRows.map((e) => ({
        ...e,
        propertyName: propMap.get(e.propertyId)?.name || '',
      })),
      pnl,
    });
  } catch (err) {
    console.error('GET /api/expenses error:', err);
    return res.status(500).json({ error: 'Failed to load expenses and P&L' });
  }
});

operationsRouter.post('/expenses', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = createExpenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid expense' });
    }
    if (!canAccessProperty(user, parsed.data.propertyId)) {
      return res.status(403).json({ error: 'Access denied to this property' });
    }

    const [created] = await db
      .insert(schema.expenses)
      .values({
        organizationId: user.organizationId,
        propertyId: parsed.data.propertyId,
        category: parsed.data.category,
        amount: parsed.data.amount,
        expenseDate: parsed.data.expenseDate,
        vendor: parsed.data.vendor,
        note: parsed.data.note,
        recordedByUserId: user.id,
      })
      .returning();

    return res.status(201).json({ expense: created });
  } catch (err) {
    console.error('POST /api/expenses error:', err);
    return res.status(500).json({ error: 'Failed to log expense' });
  }
});

operationsRouter.get('/reports/pnl.csv', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : null;
    const props = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt)));
    const allowedIds = getAllowedPropertyIds(user, props.map((p) => p.id));
    const targetIds = propertyId && allowedIds.includes(propertyId) ? [propertyId] : allowedIds;

    if (targetIds.length === 0) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pgdesk-pnl-report.csv"');
      return res.send('Month,Collected Rent (INR),Total Expenses (INR),Net Operating Profit (INR)');
    }

    const [expenseRows, invoiceRows, approvedPaymentRows] = await Promise.all([
      db
        .select()
        .from(schema.expenses)
        .where(and(eq(schema.expenses.organizationId, user.organizationId), inArray(schema.expenses.propertyId, targetIds))),
      db
        .select()
        .from(schema.invoices)
        .where(and(eq(schema.invoices.organizationId, user.organizationId), inArray(schema.invoices.propertyId, targetIds))),
      db
        .select()
        .from(schema.payments)
        .where(and(eq(schema.payments.organizationId, user.organizationId), eq(schema.payments.approvalStatus, 'APPROVED'))),
    ]);

    const todayStr = new Date().toISOString().slice(0, 10);
    const paymentsByInvoice = new Map<number, typeof approvedPaymentRows>();
    for (const p of approvedPaymentRows) {
      const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
      arr.push(p);
      paymentsByInvoice.set(p.invoiceId, arr);
    }

    const reconciledInvoices = invoiceRows.map((inv) => ({
      ...inv,
      reconciledPaidAmount: reconcileInvoiceWithPayments(inv, paymentsByInvoice.get(inv.id) ?? [], todayStr)
        .paidAmount,
    }));

    const monthSet = new Set<string>();
    reconciledInvoices.forEach((i) => monthSet.add(`${i.periodYear}-${String(i.periodMonth).padStart(2, '0')}`));
    expenseRows.forEach((e) => monthSet.add(e.expenseDate.slice(0, 7)));

    const lines = ['Month,Collected Rent (INR),Total Expenses (INR),Net Operating Profit (INR)'];
    for (const ym of Array.from(monthSet).sort()) {
      const [y, m] = ym.split('-').map(Number);
      const rev = reconciledInvoices
        .filter((i) => i.periodYear === y && i.periodMonth === m)
        .reduce((s, i) => s + i.reconciledPaidAmount, 0);
      const exp = expenseRows
        .filter((e) => e.expenseDate.startsWith(ym))
        .reduce((s, e) => s + e.amount, 0);
      lines.push(`${formatMonthYear(m, y)},${rev},${exp},${rev - exp}`);
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pgdesk-pnl-report.csv"');
    return res.send(lines.join('\n'));
  } catch (err) {
    console.error('GET /api/reports/pnl.csv error:', err);
    return res.status(500).json({ error: 'Failed to export P&L CSV' });
  }
});

// ---------- SETTINGS & STAFF (OWNER ONLY FOR SENSITIVE CHANGES) ----------
operationsRouter.get('/settings', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    const staff =
      user.role === 'OWNER'
        ? await db
            .select({
              id: schema.users.id,
              name: schema.users.name,
              email: schema.users.email,
              phone: schema.users.phone,
              role: schema.users.role,
              assignedPropertyIds: schema.users.assignedPropertyIds,
              isActive: schema.users.isActive,
            })
            .from(schema.users)
            .where(eq(schema.users.organizationId, user.organizationId))
        : [];

    const auditLogs =
      user.role === 'OWNER'
        ? await db
            .select()
            .from(schema.auditLogs)
            .where(eq(schema.auditLogs.organizationId, user.organizationId))
            .orderBy(desc(schema.auditLogs.createdAt))
            .limit(20)
        : [];

    const [[propCountRow], [bedCountRow]] = await Promise.all([
      db
        .select({ total: count() })
        .from(schema.properties)
        .where(and(eq(schema.properties.organizationId, user.organizationId), isNull(schema.properties.deletedAt))),
      db.select({ total: count() }).from(schema.beds).where(eq(schema.beds.organizationId, user.organizationId)),
    ]);

    const limits = getActiveEntitlement(org?.planTier, SUBSCRIPTIONS_ENABLED);

    return res.json({
      organization: org,
      subscriptionsEnabled: SUBSCRIPTIONS_ENABLED,
      quota: {
        propertiesCount: propCountRow?.total ?? 0,
        bedsCount: bedCountRow?.total ?? 0,
        limits,
      },
      staff: staff.filter((s) => s.role !== 'TENANT'),
      auditLogs,
    });
  } catch (err) {
    console.error('GET /api/settings error:', err);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

operationsRouter.patch('/settings', requireAuth, requireRole('OWNER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings' });
    }

    const [updated] = await db
      .update(schema.organizations)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(schema.organizations.id, user.organizationId))
      .returning();

    await logAudit({
      user,
      action: 'ORG_SETTINGS_UPDATED',
      entityType: 'ORGANIZATION',
      entityId: user.organizationId,
      metadata: {
        upiId: parsed.data.upiId,
        lateFeePerDay: parsed.data.lateFeePerDay,
        gstin: parsed.data.gstin,
        gstRatePct: parsed.data.gstRatePct,
        planTier: parsed.data.planTier,
      },
    });

    return res.json({ organization: updated });
  } catch (err) {
    console.error('PATCH /api/settings error:', err);
    return res.status(500).json({ error: 'Failed to update organization settings' });
  }
});

operationsRouter.post('/staff', requireAuth, requireRole('OWNER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parsed = inviteStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid staff details' });
    }

    const cleanPhone = parsed.data.phone.replace(/\D/g, '').slice(-10);
    const [created] = await db
      .insert(schema.users)
      .values({
        organizationId: user.organizationId,
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        phone: cleanPhone,
        passwordHash: hashPassword(parsed.data.password),
        role: parsed.data.role,
        assignedPropertyIds: parsed.data.assignedPropertyIds,
        isActive: true,
      })
      .returning({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        phone: schema.users.phone,
        role: schema.users.role,
        assignedPropertyIds: schema.users.assignedPropertyIds,
        isActive: schema.users.isActive,
      });

    await logAudit({
      user,
      action: 'STAFF_INVITED',
      entityType: 'USER',
      entityId: created.id,
      metadata: { email: created.email, role: created.role },
    });

    return res.status(201).json({ staff: created });
  } catch (err: any) {
    if (err?.code === '23505') {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    console.error('POST /api/staff error:', err);
    return res.status(500).json({ error: 'Failed to invite staff member' });
  }
});

// ---------- PRIVATE FILE UPLOAD / DOWNLOAD ----------
operationsRouter.post('/files/upload', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const fileName = String(req.body?.fileName || 'document.jpg');
    const mimeType = String(req.body?.mimeType || 'image/jpeg');
    const base64Data = String(req.body?.base64Data || '');
    const rawFolder = String(req.body?.folder || 'id-docs');
    const ALLOWED_FOLDERS = ['id-docs', 'complaints', 'receipts', 'properties', 'avatars'] as const;
    const folder = ALLOWED_FOLDERS.includes(rawFolder as any)
      ? (rawFolder as (typeof ALLOWED_FOLDERS)[number])
      : 'id-docs';

    if (!base64Data) {
      return res.status(400).json({ error: 'File content is required' });
    }

    const saved = await storageService.saveBase64File({
      fileName,
      mimeType,
      base64Data,
      organizationId: user.organizationId,
      folder,
    });

    const [record] = await db
      .insert(schema.uploadedFiles)
      .values({
        organizationId: user.organizationId,
        ownerUserId: user.id,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
        storageKey: saved.storageKey,
        provider: saved.provider,
        externalUrl: saved.externalUrl || null,
        contentBase64: saved.contentBase64 || null,
        isPrivate: folder === 'id-docs',
      })
      .returning();

    return res.status(201).json({
      file: {
        id: record.id,
        url: `/api/files/${record.id}`,
        fileName: record.fileName,
        mimeType: record.mimeType,
        provider: record.provider,
      },
    });
  } catch (err: any) {
    console.error('POST /api/files/upload error:', err);
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }
});

operationsRouter.get('/files/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const fileId = Number(req.params.id);
    const [file] = await db
      .select()
      .from(schema.uploadedFiles)
      .where(eq(schema.uploadedFiles.id, fileId))
      .limit(1);

    if (!file) return res.status(404).json({ error: 'File not found' });

    if (user.role !== 'TENANT') {
      if (file.organizationId !== user.organizationId) {
        return res.status(404).json({ error: 'File not found' });
      }
    } else if (file.isPrivate && file.ownerUserId !== user.id) {
      const ownTenants = await db
        .select({ idDocumentUrl: schema.tenants.idDocumentUrl })
        .from(schema.tenants)
        .where(and(eq(schema.tenants.userId, user.id), isNull(schema.tenants.deletedAt)));
      const matches = ownTenants.some((t) => t.idDocumentUrl === `/api/files/${file.id}`);
      if (!matches) {
        return res.status(403).json({ error: 'Access denied to private ID document' });
      }
    } else if (!file.isPrivate && file.organizationId !== user.organizationId && file.ownerUserId !== user.id) {
      return res.status(404).json({ error: 'File not found' });
    }

    if ((file.provider === 'gcs' || file.provider === 's3') && storageService.getSignedDownloadUrl) {
      const signedUrl = await storageService.getSignedDownloadUrl(file.storageKey, 600);
      if (signedUrl) {
        return res.redirect(302, signedUrl);
      }
    }

    const buffer = await storageService.readFileBuffer(file.storageKey, file.contentBase64);
    if (!buffer) return res.status(404).json({ error: 'File content unavailable' });

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    return res.send(buffer);
  } catch (err) {
    console.error('GET /api/files/:id error:', err);
    return res.status(500).json({ error: 'Failed to retrieve file' });
  }
});
