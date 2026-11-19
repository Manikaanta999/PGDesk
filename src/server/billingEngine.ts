import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import {
  addDaysYmd,
  calculateGstBreakdown,
  calculateProRataRent,
  computeLateFee,
  formatFyInvoiceNumber,
  reconcileInvoiceWithPayments,
} from '../lib/billing.ts';

type DbExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>;

export async function allocateNextFyInvoiceNumber(
  organizationId: number,
  year: number,
  month: number,
  executor: DbExecutor = db
): Promise<string> {
  const [updated] = await executor
    .update(schema.organizations)
    .set({
      invoiceSeq: sql`${schema.organizations.invoiceSeq} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, organizationId))
    .returning({ invoiceSeq: schema.organizations.invoiceSeq });

  const seq = updated?.invoiceSeq ?? Math.floor(Date.now() % 10000);
  return formatFyInvoiceNumber('PGD', year, month, seq);
}

export interface RunBillingCycleParams {
  org: typeof schema.organizations.$inferSelect;
  targetPropertyIds?: number[];
  year: number;
  month: number;
  asOfDate: string; // YYYY-MM-DD
  applyLateFees: boolean;
  respectBillingDay: boolean;
}

export interface RunBillingCycleResult {
  createdCount: number;
  updatedOverdueCount: number;
}

export async function runBillingCycleForOrg(
  params: RunBillingCycleParams
): Promise<RunBillingCycleResult> {
  const { org, year, month, asOfDate, applyLateFees, respectBillingDay } = params;

  const orgProps = await db
    .select()
    .from(schema.properties)
    .where(and(eq(schema.properties.organizationId, org.id), isNull(schema.properties.deletedAt)));

  const allowedIds = params.targetPropertyIds
    ? orgProps.filter((p) => params.targetPropertyIds!.includes(p.id)).map((p) => p.id)
    : orgProps.map((p) => p.id);

  if (allowedIds.length === 0) {
    return { createdCount: 0, updatedOverdueCount: 0 };
  }

  const propMap = new Map(orgProps.map((p) => [p.id, p]));
  const [activeTenants, existingPeriodInvoices, openInvoices, orgApprovedPayments] = await Promise.all([
    db
      .select()
      .from(schema.tenants)
      .where(
        and(
          eq(schema.tenants.organizationId, org.id),
          inArray(schema.tenants.propertyId, allowedIds),
          isNull(schema.tenants.deletedAt)
        )
      ),
    db
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.organizationId, org.id),
          eq(schema.invoices.periodMonth, month),
          eq(schema.invoices.periodYear, year)
        )
      ),
    db
      .select()
      .from(schema.invoices)
      .where(
        and(
          eq(schema.invoices.organizationId, org.id),
          inArray(schema.invoices.propertyId, allowedIds)
        )
      ),
    db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.organizationId, org.id),
          eq(schema.payments.approvalStatus, 'APPROVED')
        )
      ),
  ]);

  const approvedByInvoice = new Map<number, typeof orgApprovedPayments>();
  for (const p of orgApprovedPayments) {
    const arr = approvedByInvoice.get(p.invoiceId) ?? [];
    arr.push(p);
    approvedByInvoice.set(p.invoiceId, arr);
  }

  let updatedOverdueCount = 0;
  for (const inv of openInvoices) {
    const invPayments = approvedByInvoice.get(inv.id) ?? [];
    const reconciled = reconcileInvoiceWithPayments(inv, invPayments, asOfDate);

    const items = [...inv.items];
    let nextAmount = inv.amount;
    if (applyLateFees && reconciled.status === 'OVERDUE' && !items.some((it) => it.type === 'LATE_FEE')) {
      const fee = computeLateFee({
        dueDate: inv.dueDate,
        asOfDate,
        graceDays: org.graceDays,
        lateFeePerDay: org.lateFeePerDay,
        balanceDue: reconciled.balanceDue,
      });
      if (fee > 0) {
        items.push({ label: 'Late Payment Fee', type: 'LATE_FEE', amount: fee });
        nextAmount += fee;
      }
    }

    const finalReconciled =
      nextAmount !== inv.amount
        ? reconcileInvoiceWithPayments({ amount: nextAmount, dueDate: inv.dueDate }, invPayments, asOfDate)
        : reconciled;

    if (
      finalReconciled.status !== inv.status ||
      finalReconciled.paidAmount !== inv.paidAmount ||
      nextAmount !== inv.amount
    ) {
      await db
        .update(schema.invoices)
        .set({
          status: finalReconciled.status,
          paidAmount: finalReconciled.paidAmount,
          items,
          amount: nextAmount,
          updatedAt: new Date(),
        })
        .where(eq(schema.invoices.id, inv.id));
      updatedOverdueCount += 1;
    }
  }

  const existingTenantIds = new Set(existingPeriodInvoices.map((i) => i.tenantId));
  const mStr = String(month).padStart(2, '0');
  const dayOfMonth = Number(asOfDate.split('-')[2] || 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let createdCount = 0;

  for (const tenant of activeTenants) {
    if (tenant.status === 'LEFT' || existingTenantIds.has(tenant.id)) continue;

    const prop = propMap.get(tenant.propertyId);
    if (!prop) continue;

    const jDay = Number(tenant.joinDate.split('-')[2] || 1);
    const billingTriggerDay =
      prop.billingMode === 'JOIN_DATE'
        ? Math.min(daysInMonth, jDay)
        : Math.min(daysInMonth, prop.billingDay || org.billingDayDefault || 1);

    if (respectBillingDay && dayOfMonth < billingTriggerDay) {
      continue;
    }

    const calc = calculateProRataRent({
      monthlyRent: tenant.monthlyRent,
      year,
      month,
      joinDate: tenant.joinDate,
      leaveDate: tenant.leaveDate,
    });

    if (calc.amount <= 0) continue;

    const billingDate = `${year}-${mStr}-${String(billingTriggerDay).padStart(2, '0')}`;
    const dueDate = addDaysYmd(billingDate, org.dueDaysAfterInvoice ?? 5);
    const invNum = await allocateNextFyInvoiceNumber(org.id, year, month);

    const gst = calculateGstBreakdown(calc.amount, org.gstRatePct ?? 0);
    const items: schema.InvoiceLineItem[] = [
      {
        label: calc.isProRata
          ? `Pro-rata Bed Rent (${calc.billableDays}/${calc.totalDaysInMonth} days)`
          : 'Monthly Bed Rent',
        type: 'RENT',
        amount: gst.taxableValue,
      },
    ];
    if (gst.gstRatePct > 0) {
      items.push(
        { label: `CGST (${gst.cgstRatePct}%)`, type: 'OTHER', amount: gst.cgstAmount },
        { label: `SGST (${gst.sgstRatePct}%)`, type: 'OTHER', amount: gst.sgstAmount }
      );
    }

    await db.insert(schema.invoices).values({
      organizationId: org.id,
      propertyId: tenant.propertyId,
      tenantId: tenant.id,
      invoiceNumber: invNum,
      periodMonth: month,
      periodYear: year,
      periodStart: calc.periodStart,
      periodEnd: calc.periodEnd,
      items,
      amount: gst.totalWithGst,
      paidAmount: 0,
      dueDate,
      status: asOfDate > dueDate ? 'OVERDUE' : 'UNPAID',
      isProRata: calc.isProRata,
    });
    createdCount += 1;
  }

  return { createdCount, updatedOverdueCount };
}
