import { Router } from 'express';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { formatMonthYear } from '../../lib/format.ts';
import { AuthRequest, getAllowedPropertyIds, requireAuth, requireRole } from '../../middleware/auth.ts';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, requireRole('OWNER', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const orgId = user.organizationId;
    const filterPropertyId = req.query.propertyId ? Number(req.query.propertyId) : null;

    const orgProperties = await db
      .select()
      .from(schema.properties)
      .where(and(eq(schema.properties.organizationId, orgId), isNull(schema.properties.deletedAt)));

    const allowedIds = getAllowedPropertyIds(
      user,
      orgProperties.map((p) => p.id)
    );
    const activePropertyIds =
      filterPropertyId && allowedIds.includes(filterPropertyId) ? [filterPropertyId] : allowedIds;

    if (activePropertyIds.length === 0) {
      return res.json({
        kpis: {
          occupancyPct: 0,
          totalBeds: 0,
          occupiedBeds: 0,
          vacantBeds: 0,
          reservedBeds: 0,
          maintenanceBeds: 0,
          collectedThisMonth: 0,
          pendingThisMonth: 0,
          openComplaints: 0,
          newLeads: 0,
          pendingUpiApprovals: 0,
        },
        revenueSeries: [],
        overdueTenants: [],
        upcomingMoveOuts: [],
        properties: orgProperties,
      });
    }

    const [allBeds, allTenants, allInvoices, allExpenses, allComplaints, allEnquiries, allPayments] =
      await Promise.all([
        db
          .select()
          .from(schema.beds)
          .where(and(eq(schema.beds.organizationId, orgId), inArray(schema.beds.propertyId, activePropertyIds))),
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
          .where(eq(schema.payments.organizationId, orgId))
          .orderBy(desc(schema.payments.createdAt)),
      ]);

    const totalBeds = allBeds.length;
    const occupiedBeds = allBeds.filter((b) => b.status === 'OCCUPIED').length;
    const vacantBeds = allBeds.filter((b) => b.status === 'VACANT').length;
    const reservedBeds = allBeds.filter((b) => b.status === 'RESERVED').length;
    const maintenanceBeds = allBeds.filter((b) => b.status === 'MAINTENANCE').length;
    const occupancyPct = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // Determine current period based on latest invoice period or current calendar date
    const now = new Date();
    const latestPeriod = allInvoices.reduce(
      (acc, inv) => {
        if (inv.periodYear > acc.year || (inv.periodYear === acc.year && inv.periodMonth > acc.month)) {
          return { year: inv.periodYear, month: inv.periodMonth };
        }
        return acc;
      },
      { year: now.getFullYear(), month: now.getMonth() + 1 }
    );

    const currentMonthInvoices = allInvoices.filter(
      (inv) => inv.periodYear === latestPeriod.year && inv.periodMonth === latestPeriod.month
    );
    const collectedThisMonth = currentMonthInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const pendingThisMonth = currentMonthInvoices.reduce(
      (sum, inv) => sum + Math.max(0, inv.amount - inv.paidAmount),
      0
    );

    const openComplaints = allComplaints.filter((c) => c.status !== 'RESOLVED').length;
    const newLeads = allEnquiries.filter((e) => e.status === 'NEW').length;
    const pendingUpiApprovals = allPayments.filter((p) => p.approvalStatus === 'PENDING_APPROVAL').length;

    // 6-month revenue & expense series
    const monthBuckets: Array<{ year: number; month: number }> = [];
    for (let offset = 5; offset >= 0; offset--) {
      const d = new Date(Date.UTC(latestPeriod.year, latestPeriod.month - 1 - offset, 1));
      monthBuckets.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    }

    const revenueSeries = monthBuckets.map(({ year, month }) => {
      const mStr = `${year}-${String(month).padStart(2, '0')}`;
      const mInvs = allInvoices.filter((i) => i.periodYear === year && i.periodMonth === month);
      const collected = mInvs.reduce((s, i) => s + i.paidAmount, 0);
      const billed = mInvs.reduce((s, i) => s + i.amount, 0);
      const expense = allExpenses
        .filter((e) => e.expenseDate.startsWith(mStr))
        .reduce((s, e) => s + e.amount, 0);
      return {
        label: formatMonthYear(month, year),
        billed,
        collected,
        pending: Math.max(0, billed - collected),
        expense,
      };
    });

    const tenantMap = new Map(allTenants.map((t) => [t.id, t]));
    const propMap = new Map(orgProperties.map((p) => [p.id, p]));

    const overdueTenants = allInvoices
      .filter((inv) => inv.status === 'OVERDUE' || inv.status === 'PARTIAL')
      .map((inv) => {
        const t = tenantMap.get(inv.tenantId);
        const p = propMap.get(inv.propertyId);
        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          tenantId: inv.tenantId,
          tenantName: t?.name || 'Resident',
          tenantPhone: t?.phone || '',
          propertyName: p?.name || '',
          dueDate: inv.dueDate,
          balanceDue: Math.max(0, inv.amount - inv.paidAmount),
          status: inv.status,
          periodLabel: formatMonthYear(inv.periodMonth, inv.periodYear),
        };
      })
      .sort((a, b) => b.balanceDue - a.balanceDue)
      .slice(0, 8);

    const upcomingMoveOuts = allTenants
      .filter((t) => t.status === 'NOTICE')
      .map((t) => ({
        id: t.id,
        name: t.name,
        phone: t.phone,
        propertyName: propMap.get(t.propertyId)?.name || '',
        leaveDate: t.leaveDate,
        noticeRequestedAt: t.noticeRequestedAt,
        securityDeposit: t.securityDeposit,
      }));

    return res.json({
      periodLabel: formatMonthYear(latestPeriod.month, latestPeriod.year),
      kpis: {
        occupancyPct,
        totalBeds,
        occupiedBeds,
        vacantBeds,
        reservedBeds,
        maintenanceBeds,
        collectedThisMonth,
        pendingThisMonth,
        openComplaints,
        newLeads,
        pendingUpiApprovals,
      },
      revenueSeries,
      overdueTenants,
      upcomingMoveOuts,
      properties: orgProperties.filter((p) => allowedIds.includes(p.id)),
    });
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard metrics' });
  }
});
