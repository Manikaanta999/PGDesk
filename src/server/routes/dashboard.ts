import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { reconcileInvoiceWithPayments } from '../../lib/billing.ts';
import { formatMonthYear } from '../../lib/format.ts';
import { AuthRequest, getAllowedPropertyIds, requireAuth, requireRole } from '../../middleware/auth.ts';
import { resolvePropertyFilter } from './authorization.ts';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const orgId = user.organizationId;

    const orgProperties = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, orgId), isNull(schema.properties.deletedAt)));

    const allowedIds = getAllowedPropertyIds(
      user,
      orgProperties.map((p) => p.id)
    );
    const propertyFilter = resolvePropertyFilter(req.query.propertyId, allowedIds);
    if (propertyFilter.kind === 'invalid') {
      return res.status(400).json({ error: 'Invalid propertyId filter' });
    }
    if (propertyFilter.kind === 'forbidden') {
      return res.status(403).json({ error: 'Access denied to this property' });
    }
    const activePropertyIds = propertyFilter.kind === 'selected' ? [propertyFilter.propertyId] : allowedIds;

    if (activePropertyIds.length === 0) {
      return res.json({
        kpis: {
          occupancyPct: 0,
          totalBeds: 0,
          occupiedBeds: 0,
          vacantBeds: 0,
          reservedBeds: 0,
          maintenanceBeds: 0,
          totalStudents: 0,
          collectedThisMonth: 0,
          pendingThisMonth: 0,
          openComplaints: 0,
          newLeads: 0,
          pendingUpiApprovals: 0,
        },
        revenueSeries: [],
        overdueTenants: [],
        unpaidInvoices: [],
        overdueTotalCount: 0,
        upcomingMoveOuts: [],
        financialSummary: {
          periodLabel: formatMonthYear(new Date().getMonth() + 1, new Date().getFullYear()),
          monthlyIncome: 0,
          monthlyExpenses: 0,
          netProfit: 0,
        },
        needsAttention: {
          overdueInvoices: [],
          partialInvoices: [],
          unresolvedComplaints: [],
          newEnquiries: [],
          maintenanceBeds: [],
        },
        properties: [],
      });
    }

    const [allBeds, allRooms, allTenants, allInvoices, allExpenses, allComplaints, allEnquiries, allPayments] =
      await Promise.all([
        db
          .select()
          .from(schema.beds)
          .where(and(eq(schema.beds.organizationId, orgId), inArray(schema.beds.propertyId, activePropertyIds))),
        db
          .select()
          .from(schema.rooms)
          .where(and(eq(schema.rooms.organizationId, orgId), inArray(schema.rooms.propertyId, activePropertyIds))),
        db
          .select()
          .from(schema.tenants)
          .where(
            and(
              eq(schema.tenants.organizationId, orgId),
              inArray(schema.tenants.propertyId, activePropertyIds),
              isNull(schema.tenants.deletedAt)
            )
          ),
        db
          .select()
          .from(schema.invoices)
          .where(and(eq(schema.invoices.organizationId, orgId), inArray(schema.invoices.propertyId, activePropertyIds))),
        db
          .select()
          .from(schema.expenses)
          .where(and(eq(schema.expenses.organizationId, orgId), inArray(schema.expenses.propertyId, activePropertyIds))),
        db
          .select()
          .from(schema.complaints)
          .where(and(eq(schema.complaints.organizationId, orgId), inArray(schema.complaints.propertyId, activePropertyIds))),
        db
          .select()
          .from(schema.enquiries)
          .where(and(eq(schema.enquiries.organizationId, orgId), inArray(schema.enquiries.propertyId, activePropertyIds))),
        db
          .select()
          .from(schema.payments)
          .where(
            and(
              eq(schema.payments.organizationId, orgId),
              inArray(
                schema.payments.invoiceId,
                db
                  .select({ id: schema.invoices.id })
                  .from(schema.invoices)
                  .where(
                    and(
                      eq(schema.invoices.organizationId, orgId),
                      inArray(schema.invoices.propertyId, activePropertyIds)
                    )
                  )
              )
            )
          )
          .orderBy(desc(schema.payments.createdAt)),
      ]);

    const totalBeds = allBeds.length;
    const occupiedBeds = allBeds.filter((b) => b.status === 'OCCUPIED').length;
    const vacantBeds = allBeds.filter((b) => b.status === 'VACANT').length;
    const reservedBeds = allBeds.filter((b) => b.status === 'RESERVED').length;
    const maintenanceBeds = allBeds.filter((b) => b.status === 'MAINTENANCE').length;
    const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
    const totalStudents = allTenants.filter((t) => t.status === 'ACTIVE' || t.status === 'NOTICE').length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (p.approvalStatus === 'APPROVED') {
        const arr = paymentsByInvoice.get(p.invoiceId) ?? [];
        arr.push(p);
        paymentsByInvoice.set(p.invoiceId, arr);
      }
    }

    const reconciledInvoices = allInvoices.map((inv) => {
      const reconciled = reconcileInvoiceWithPayments(inv, paymentsByInvoice.get(inv.id) ?? [], todayStr);
      return {
        ...inv,
        reconciledPaidAmount: reconciled.paidAmount,
        reconciledBalanceDue: reconciled.balanceDue,
        reconciledStatus: reconciled.status,
      };
    });

    // Determine current period based on latest invoice period or current calendar date
    const now = new Date();
    const latestPeriod = reconciledInvoices.reduce(
      (acc, inv) => {
        if (inv.periodYear > acc.year || (inv.periodYear === acc.year && inv.periodMonth > acc.month)) {
          return { year: inv.periodYear, month: inv.periodMonth };
        }
        return acc;
      },
      { year: now.getFullYear(), month: now.getMonth() + 1 }
    );

    const currentMonthInvoices = reconciledInvoices.filter(
      (inv) => inv.periodYear === latestPeriod.year && inv.periodMonth === latestPeriod.month
    );
    // Count only genuine APPROVED recorded payments as collected rent
    const collectedThisMonth = currentMonthInvoices.reduce((sum, inv) => sum + inv.reconciledPaidAmount, 0);
    // Include all outstanding unpaid balances across open invoices
    const pendingThisMonth = reconciledInvoices.reduce((sum, inv) => sum + inv.reconciledBalanceDue, 0);

    const activeInvIds = new Set(allInvoices.map((i) => i.id));
    const openComplaints = allComplaints.filter((c) => c.status !== 'RESOLVED').length;
    const newLeads = allEnquiries.filter((e) => e.status === 'NEW_ENQUIRY').length;
    const pendingUpiApprovals = allPayments.filter(
      (p) => p.approvalStatus === 'PENDING_APPROVAL' && activeInvIds.has(p.invoiceId)
    ).length;

    // 6-month revenue & expense series
    const monthBuckets: Array<{ year: number; month: number }> = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(Date.UTC(latestPeriod.year, latestPeriod.month - 1 - offset, 1));
      monthBuckets.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    }

    const revenueSeries = monthBuckets.map(({ year, month }) => {
      const mStr = `${year}-${String(month).padStart(2, '0')}`;
      const mInvs = reconciledInvoices.filter((i) => i.periodYear === year && i.periodMonth === month);
      const collected = mInvs.reduce((s, i) => s + i.reconciledPaidAmount, 0);
      const billed = mInvs.reduce((s, i) => s + i.amount, 0);
      const pending = mInvs.reduce((s, i) => s + i.reconciledBalanceDue, 0);
      const expense = allExpenses
        .filter((e) => e.expenseDate.startsWith(mStr))
        .reduce((s, e) => s + e.amount, 0);
      return {
        label: formatMonthYear(month, year),
        billed,
        collected,
        pending,
        expense,
      };
    });

    const tenantMap = new Map(allTenants.map((t) => [t.id, t]));
    const propMap = new Map(orgProperties.map((p) => [p.id, p]));
    const bedMap = new Map(allBeds.map((b) => [b.id, b]));
    const roomMap = new Map(allRooms.map((r) => [r.id, r]));

    const statusOrder: Record<string, number> = { OVERDUE: 0, PARTIAL: 1, UNPAID: 2, PENDING: 2 };
    const unpaidInvoices = reconciledInvoices
      .filter((inv) => inv.reconciledStatus !== 'PAID' && inv.reconciledBalanceDue > 0)
      .map((inv) => {
        const t = tenantMap.get(inv.tenantId);
        const p = propMap.get(inv.propertyId);
        const bed = t?.bedId ? bedMap.get(t.bedId) : undefined;
        const room = bed ? roomMap.get(bed.roomId) : undefined;
        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          tenantId: inv.tenantId,
          tenantName: t?.name || 'Resident',
          tenantPhone: t?.phone || '',
          propertyName: p?.name || '',
          roomNumber: room?.roomNumber || '',
          bedLabel: bed?.bedLabel || '',
          dueDate: inv.dueDate,
          balanceDue: inv.reconciledBalanceDue,
          status: inv.reconciledStatus,
          periodLabel: formatMonthYear(inv.periodMonth, inv.periodYear),
        };
      })
      .sort((a, b) => {
        const sDiff = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
        return sDiff !== 0 ? sDiff : b.balanceDue - a.balanceDue;
      });

    const upcomingMoveOuts = allTenants
      .filter((t) => t.status === 'NOTICE')
      .map((t) => {
        const bed = t.bedId ? bedMap.get(t.bedId) : undefined;
        const room = bed ? roomMap.get(bed.roomId) : undefined;
        return {
          id: t.id,
          name: t.name,
          phone: t.phone,
          propertyName: propMap.get(t.propertyId)?.name || '',
          roomNumber: room?.roomNumber || '',
          bedLabel: bed?.bedLabel || '',
          leaveDate: t.leaveDate,
          noticeRequestedAt: t.noticeRequestedAt,
          securityDeposit: t.securityDeposit,
        };
      });

    const currentMonthPrefix = `${latestPeriod.year}-${String(latestPeriod.month).padStart(2, '0')}`;
    const currentMonthExpenseTotal = allExpenses
      .filter((e) => e.expenseDate.startsWith(currentMonthPrefix))
      .reduce((s, e) => s + e.amount, 0);

    const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const unresolvedComplaints = allComplaints
      .filter((c) => c.status !== 'RESOLVED')
      .map((c) => {
        const t = c.tenantId ? tenantMap.get(c.tenantId) : undefined;
        const p = propMap.get(c.propertyId);
        const bed = t?.bedId ? bedMap.get(t.bedId) : undefined;
        const room = bed ? roomMap.get(bed.roomId) : undefined;
        return {
          id: c.id,
          title: c.title,
          category: c.category,
          priority: c.priority,
          status: c.status,
          tenantName: t?.name || 'Resident',
          tenantPhone: t?.phone || '',
          propertyName: p?.name || '',
          roomNumber: room?.roomNumber || '',
          bedLabel: bed?.bedLabel || '',
          createdAt: c.createdAt,
        };
      })
      .sort((a, b) => {
        const pDiff = (priorityRank[a.priority] ?? 4) - (priorityRank[b.priority] ?? 4);
        return pDiff !== 0 ? pDiff : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const newEnquiries = allEnquiries
      .filter((e) => e.status === 'NEW_ENQUIRY')
      .map((e) => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        propertyName: propMap.get(e.propertyId)?.name || '',
        sharingPreference: e.preferredRoomType,
        expectedMoveIn: e.moveInDate,
        createdAt: e.createdAt,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const maintenanceBedsList = allBeds
      .filter((b) => b.status === 'MAINTENANCE')
      .map((b) => {
        const room = roomMap.get(b.roomId);
        const prop = propMap.get(b.propertyId);
        return {
          bedId: b.id,
          bedLabel: b.bedLabel,
          roomNumber: room?.roomNumber || '',
          propertyId: b.propertyId,
          propertyName: prop?.name || '',
          notes: b.notes || '',
        };
      });

    return res.json({
      periodLabel: formatMonthYear(latestPeriod.month, latestPeriod.year),
      kpis: {
        occupancyPct,
        totalBeds,
        occupiedBeds,
        vacantBeds,
        reservedBeds,
        maintenanceBeds,
        totalStudents,
        collectedThisMonth,
        pendingThisMonth,
        openComplaints,
        newLeads,
        pendingUpiApprovals,
      },
      financialSummary: {
        periodLabel: formatMonthYear(latestPeriod.month, latestPeriod.year),
        monthlyIncome: collectedThisMonth,
        monthlyExpenses: currentMonthExpenseTotal,
        netProfit: collectedThisMonth - currentMonthExpenseTotal,
      },
      revenueSeries,
      overdueTenants: unpaidInvoices.slice(0, 6),
      unpaidInvoices,
      overdueTotalCount: unpaidInvoices.length,
      upcomingMoveOuts,
      needsAttention: {
        overdueInvoices: unpaidInvoices.filter((i) => i.status === 'OVERDUE'),
        partialInvoices: unpaidInvoices.filter((i) => i.status === 'PARTIAL'),
        unresolvedComplaints,
        newEnquiries,
        maintenanceBeds: maintenanceBedsList,
      },
      properties: orgProperties.filter((p) => allowedIds.includes(p.id)),
    });
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});
