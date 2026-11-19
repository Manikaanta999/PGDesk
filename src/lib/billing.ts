import {
  FUTURE_PLAN_ENTITLEMENTS,
  getActiveEntitlement,
  PlanTier as EntitlementPlanTier,
  SUBSCRIPTIONS_ENABLED,
} from './entitlements.ts';

export interface ProRataCalculationInput {
  monthlyRent: number;
  year: number;
  month: number; // 1-12
  joinDate?: string | null; // YYYY-MM-DD
  leaveDate?: string | null; // YYYY-MM-DD
}

export interface ProRataCalculationResult {
  amount: number;
  billableDays: number;
  totalDaysInMonth: number;
  isProRata: boolean;
  periodStart: string;
  periodEnd: string;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function parseYMD(ymd: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

/**
 * Computes monthly or pro-rata rent for a given billing month (1-12).
 * Mid-month joins start billing from joinDate through end of month;
 * mid-month leaves bill through leaveDate (inclusive).
 */
export function calculateProRataRent(input: ProRataCalculationInput): ProRataCalculationResult {
  const totalDaysInMonth = getDaysInMonth(input.year, input.month);
  let startDay = 1;
  let endDay = totalDaysInMonth;

  if (input.joinDate) {
    const j = parseYMD(input.joinDate);
    if (j) {
      if (j.year > input.year || (j.year === input.year && j.month > input.month)) {
        return {
          amount: 0,
          billableDays: 0,
          totalDaysInMonth,
          isProRata: true,
          periodStart: `${input.year}-${pad2(input.month)}-01`,
          periodEnd: `${input.year}-${pad2(input.month)}-${pad2(totalDaysInMonth)}`,
        };
      }
      if (j.year === input.year && j.month === input.month) {
        startDay = Math.max(1, Math.min(totalDaysInMonth, j.day));
      }
    }
  }

  if (input.leaveDate) {
    const l = parseYMD(input.leaveDate);
    if (l) {
      if (l.year < input.year || (l.year === input.year && l.month < input.month)) {
        return {
          amount: 0,
          billableDays: 0,
          totalDaysInMonth,
          isProRata: true,
          periodStart: `${input.year}-${pad2(input.month)}-01`,
          periodEnd: `${input.year}-${pad2(input.month)}-${pad2(totalDaysInMonth)}`,
        };
      }
      if (l.year === input.year && l.month === input.month) {
        endDay = Math.max(1, Math.min(totalDaysInMonth, l.day));
      }
    }
  }

  if (endDay < startDay) {
    return {
      amount: 0,
      billableDays: 0,
      totalDaysInMonth,
      isProRata: true,
      periodStart: `${input.year}-${pad2(input.month)}-${pad2(startDay)}`,
      periodEnd: `${input.year}-${pad2(input.month)}-${pad2(startDay)}`,
    };
  }

  const billableDays = endDay - startDay + 1;
  const isProRata = billableDays < totalDaysInMonth;
  const amount = isProRata
    ? Math.round((input.monthlyRent * billableDays) / totalDaysInMonth)
    : Math.round(input.monthlyRent);

  return {
    amount,
    billableDays,
    totalDaysInMonth,
    isProRata,
    periodStart: `${input.year}-${pad2(input.month)}-${pad2(startDay)}`,
    periodEnd: `${input.year}-${pad2(input.month)}-${pad2(endDay)}`,
  };
}

export function computeLateFee(params: {
  dueDate: string;
  asOfDate: string;
  graceDays: number;
  lateFeePerDay: number;
  balanceDue: number;
}): number {
  if (params.balanceDue <= 0 || params.lateFeePerDay <= 0) return 0;
  const due = new Date(`${params.dueDate}T00:00:00Z`).getTime();
  const asOf = new Date(`${params.asOfDate}T00:00:00Z`).getTime();
  if (Number.isNaN(due) || Number.isNaN(asOf)) return 0;
  const diffDays = Math.floor((asOf - due) / (1000 * 60 * 60 * 24));
  const chargeableDays = Math.max(0, diffDays - Math.max(0, params.graceDays));
  return chargeableDays * params.lateFeePerDay;
}

export function addDaysYmd(ymd: string, days: number): string {
  const parsed = parseYMD(ymd);
  if (!parsed) return ymd;
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day + Math.round(days));
  const d = new Date(utc);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function deriveInvoiceStatus(params: {
  amount: number;
  paidAmount: number;
  dueDate: string;
  asOfDate: string;
}): 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UNPAID' {
  const totalAmount = Math.max(0, Math.round(params.amount));
  const paidAmount = Math.max(0, Math.round(params.paidAmount));
  if (totalAmount <= 0 || paidAmount >= totalAmount) return 'PAID';
  if (params.asOfDate > params.dueDate) return 'OVERDUE';
  if (paidAmount > 0) return 'PARTIAL';
  return 'UNPAID';
}

export interface PaymentLike {
  amount: number;
  approvalStatus?: string | null;
}

export function computeApprovedPaidAmount(payments: PaymentLike[]): number {
  return payments.reduce((sum, p) => {
    if (String(p.approvalStatus || '').toUpperCase() === 'APPROVED') {
      return sum + Math.max(0, Math.round(Number(p.amount) || 0));
    }
    return sum;
  }, 0);
}

export function reconcileInvoiceWithPayments(
  invoice: { amount: number; dueDate: string },
  payments: PaymentLike[],
  asOfDate: string
): {
  paidAmount: number;
  balanceDue: number;
  status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'UNPAID';
  approvedCount: number;
} {
  const approved = payments.filter(
    (p) => String(p.approvalStatus || '').toUpperCase() === 'APPROVED' && Number(p.amount) > 0
  );
  const rawPaid = approved.reduce((s, p) => s + Math.round(Number(p.amount) || 0), 0);
  const totalAmount = Math.max(0, Math.round(invoice.amount));
  const paidAmount = Math.min(totalAmount, rawPaid);
  const balanceDue = Math.max(0, totalAmount - paidAmount);
  const status = deriveInvoiceStatus({
    amount: totalAmount,
    paidAmount,
    dueDate: invoice.dueDate,
    asOfDate,
  });
  return {
    paidAmount,
    balanceDue,
    status,
    approvedCount: approved.length,
  };
}

export function canDownloadInvoiceReceipt(params: {
  paidAmount: number;
  approvedCount?: number;
}): boolean {
  if (!Number.isFinite(params.paidAmount) || params.paidAmount <= 0) return false;
  if (params.approvedCount !== undefined && params.approvedCount <= 0) return false;
  return true;
}

export interface AdmissionInvoiceInput {
  monthlyRent: number;
  joinDate: string; // YYYY-MM-DD
  gstRatePct?: number;
  dueDaysAfterInvoice?: number;
  asOfDate?: string; // YYYY-MM-DD
}

export interface AdmissionInvoiceResult {
  amount: number;
  taxableValue: number;
  cgstAmount: number;
  sgstAmount: number;
  gstRatePct: number;
  isProRata: boolean;
  billableDays: number;
  totalDaysInMonth: number;
  periodYear: number;
  periodMonth: number;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  status: 'UNPAID' | 'OVERDUE';
  items: Array<{ label: string; type: 'RENT' | 'OTHER'; amount: number }>;
}

export function calculateAdmissionInvoice(input: AdmissionInvoiceInput): AdmissionInvoiceResult {
  const parsedJoin = parseYMD(input.joinDate);
  const fallbackNow = new Date();
  const jy = parsedJoin?.year ?? fallbackNow.getUTCFullYear();
  const jm = parsedJoin?.month ?? fallbackNow.getUTCMonth() + 1;
  const normalizedJoin = parsedJoin ? input.joinDate : `${jy}-${pad2(jm)}-01`;

  const calc = calculateProRataRent({
    monthlyRent: Math.max(0, Math.round(input.monthlyRent)),
    year: jy,
    month: jm,
    joinDate: normalizedJoin,
  });

  const dueDays = Math.max(0, Math.round(input.dueDaysAfterInvoice ?? 5));
  const dueDate = addDaysYmd(normalizedJoin, dueDays);
  const gst = calculateGstBreakdown(calc.amount, input.gstRatePct ?? 0);
  const items: Array<{ label: string; type: 'RENT' | 'OTHER'; amount: number }> = [
    {
      label: calc.isProRata
        ? `Pro-rata Rent (${calc.billableDays}/${calc.totalDaysInMonth} days)`
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

  const asOfDate = input.asOfDate || normalizedJoin;
  const derived = deriveInvoiceStatus({
    amount: gst.totalWithGst,
    paidAmount: 0,
    dueDate,
    asOfDate,
  });

  return {
    amount: gst.totalWithGst,
    taxableValue: gst.taxableValue,
    cgstAmount: gst.cgstAmount,
    sgstAmount: gst.sgstAmount,
    gstRatePct: gst.gstRatePct,
    isProRata: calc.isProRata,
    billableDays: calc.billableDays,
    totalDaysInMonth: calc.totalDaysInMonth,
    periodYear: jy,
    periodMonth: jm,
    periodStart: calc.periodStart,
    periodEnd: calc.periodEnd,
    dueDate,
    status: derived === 'OVERDUE' ? 'OVERDUE' : 'UNPAID',
    items,
  };
}

export function calculateDepositSettlement(params: {
  securityDeposit: number;
  unpaidInvoicesBalance: number;
  damageOrNoticeDeductions: number;
}): {
  grossDeposit: number;
  totalDeductions: number;
  netRefundable: number;
  netPayableByTenant: number;
  suggestedStatus: 'REFUNDED' | 'PARTIAL_REFUND' | 'FORFEITED';
} {
  const grossDeposit = Math.max(0, Math.round(params.securityDeposit));
  const totalDeductions = Math.max(
    0,
    Math.round(params.unpaidInvoicesBalance + params.damageOrNoticeDeductions)
  );
  const diff = grossDeposit - totalDeductions;
  const netRefundable = diff > 0 ? diff : 0;
  const netPayableByTenant = diff < 0 ? Math.abs(diff) : 0;

  let suggestedStatus: 'REFUNDED' | 'PARTIAL_REFUND' | 'FORFEITED' = 'REFUNDED';
  if (totalDeductions === 0) {
    suggestedStatus = 'REFUNDED';
  } else if (netRefundable > 0) {
    suggestedStatus = 'PARTIAL_REFUND';
  } else {
    suggestedStatus = 'FORFEITED';
  }

  return {
    grossDeposit,
    totalDeductions,
    netRefundable,
    netPayableByTenant,
    suggestedStatus,
  };
}

export function getIndianFinancialYearLabel(year: number, month: number): string {
  const fyStartYear = month >= 4 ? year : year - 1;
  const fyEndTwoDigits = String((fyStartYear + 1) % 100).padStart(2, '0');
  return `${fyStartYear}-${fyEndTwoDigits}`;
}

export function formatFyInvoiceNumber(
  prefix: string,
  year: number,
  month: number,
  sequenceNumber: number
): string {
  const cleanPrefix = (prefix || 'PGD').replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'PGD';
  const fy = getIndianFinancialYearLabel(year, month);
  const seq = String(Math.max(1, Math.floor(sequenceNumber))).padStart(4, '0');
  return `${cleanPrefix}/${fy}/${seq}`;
}

export interface GstBreakdown {
  taxableValue: number;
  gstRatePct: number;
  cgstRatePct: number;
  sgstRatePct: number;
  cgstAmount: number;
  sgstAmount: number;
  totalWithGst: number;
}

export function calculateGstBreakdown(baseAmount: number, gstRatePct: number): GstBreakdown {
  const taxableValue = Math.max(0, Math.round(baseAmount));
  const rate = Math.max(0, Number(gstRatePct) || 0);
  if (rate <= 0) {
    return {
      taxableValue,
      gstRatePct: 0,
      cgstRatePct: 0,
      sgstRatePct: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      totalWithGst: taxableValue,
    };
  }
  const halfRate = rate / 2;
  const totalGst = Math.round((taxableValue * rate) / 100);
  const cgstAmount = Math.floor(totalGst / 2);
  const sgstAmount = totalGst - cgstAmount;
  return {
    taxableValue,
    gstRatePct: rate,
    cgstRatePct: halfRate,
    sgstRatePct: halfRate,
    cgstAmount,
    sgstAmount,
    totalWithGst: taxableValue + cgstAmount + sgstAmount,
  };
}

export type PlanTier = Exclude<EntitlementPlanTier, 'FREE'>;

export const PLAN_LIMITS: Record<
  PlanTier,
  { label: string; maxProperties: number | null; maxBeds: number | null; priceInr: number }
> = {
  STARTER: FUTURE_PLAN_ENTITLEMENTS.STARTER,
  GROWTH: FUTURE_PLAN_ENTITLEMENTS.GROWTH,
  ENTERPRISE: FUTURE_PLAN_ENTITLEMENTS.ENTERPRISE,
};

export function checkPlanBedLimit(params: {
  planTier: string | null | undefined;
  currentBeds: number;
  bedsToAdd: number;
  enforceSubscriptionLimits?: boolean;
}): { allowed: boolean; maxBeds: number | null; planLabel: string; message?: string } {
  const enforce = params.enforceSubscriptionLimits ?? SUBSCRIPTIONS_ENABLED;
  const limits = getActiveEntitlement(params.planTier, enforce);
  if (limits.maxBeds === null) {
    return { allowed: true, maxBeds: null, planLabel: limits.label };
  }
  if (params.currentBeds + params.bedsToAdd > limits.maxBeds) {
    return {
      allowed: false,
      maxBeds: limits.maxBeds,
      planLabel: limits.label,
      message: `${limits.label} plan allows up to ${limits.maxBeds} beds (currently ${params.currentBeds}).`,
    };
  }
  return { allowed: true, maxBeds: limits.maxBeds, planLabel: limits.label };
}

export function checkPlanPropertyLimit(params: {
  planTier: string | null | undefined;
  currentProperties: number;
  enforceSubscriptionLimits?: boolean;
}): { allowed: boolean; maxProperties: number | null; planLabel: string; message?: string } {
  const enforce = params.enforceSubscriptionLimits ?? SUBSCRIPTIONS_ENABLED;
  const limits = getActiveEntitlement(params.planTier, enforce);
  if (limits.maxProperties === null) {
    return { allowed: true, maxProperties: null, planLabel: limits.label };
  }
  if (params.currentProperties + 1 > limits.maxProperties) {
    return {
      allowed: false,
      maxProperties: limits.maxProperties,
      planLabel: limits.label,
      message: `${limits.label} plan allows up to ${limits.maxProperties} property(ies).`,
    };
  }
  return { allowed: true, maxProperties: limits.maxProperties, planLabel: limits.label };
}

export function validateMaskedIdNumber(idType: string, idNumberMasked: string): { valid: boolean; message?: string } {
  const trimmed = idNumberMasked.trim();
  if (trimmed.length < 4) {
    return { valid: false, message: 'ID number must be at least 4 characters.' };
  }
  if (idType === 'Aadhaar') {
    const cleaned = trimmed.replace(/[\s-]/g, '');
    if (/^\d{12}$/.test(cleaned)) {
      return {
        valid: false,
        message:
          'For UIDAI compliance, mask the first 8 digits of Aadhaar (e.g., XXXX-XXXX-1234). Never store full 12-digit Aadhaar numbers.',
      };
    }
    if (!/^[xX*]{4}[- ]?[xX*]{4}[- ]?\d{4}$/.test(trimmed) && !/^[xX*]{8}\d{4}$/.test(cleaned)) {
      return {
        valid: false,
        message: 'Enter Aadhaar in masked format XXXX-XXXX-1234 (showing only the last 4 digits).',
      };
    }
  }
  return { valid: true };
}

