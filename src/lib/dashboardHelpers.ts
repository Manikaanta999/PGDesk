export type InvoiceStatusCode = 'PAID' | 'PENDING' | 'UNPAID' | 'OVERDUE' | 'PARTIAL';
export type TenantStatusCode = 'ACTIVE' | 'NOTICE' | 'LEFT';
export type BedStatusCode = 'VACANT' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE';
export type ComplaintStatusCode = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
export type EnquiryStageCode =
  | 'NEW_ENQUIRY'
  | 'CONTACTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONVERTED_TO_STUDENT';

export function formatInvoiceStatus(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'PAID':
      return 'Paid';
    case 'PARTIAL':
      return 'Partially Paid';
    case 'OVERDUE':
      return 'Overdue';
    case 'UNPAID':
    case 'PENDING':
      return 'Unpaid';
    default:
      return status;
  }
}

export function formatTenantStatus(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'Active';
    case 'NOTICE':
      return 'On Notice';
    case 'LEFT':
      return 'Moved Out';
    default:
      return status;
  }
}

export function formatBedStatus(status: string): string {
  switch (status) {
    case 'VACANT':
      return 'Vacant';
    case 'OCCUPIED':
      return 'Occupied';
    case 'RESERVED':
      return 'Reserved';
    case 'MAINTENANCE':
      return 'Maintenance';
    default:
      return status;
  }
}

export function formatComplaintStatus(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'Open';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'RESOLVED':
      return 'Resolved';
    default:
      return status;
  }
}

export function formatComplaintCategory(category: string): string {
  switch (category) {
    case 'PLUMBING':
      return 'Plumbing';
    case 'ELECTRICAL':
      return 'Electrical';
    case 'WIFI':
      return 'Wi-Fi';
    case 'HOUSEKEEPING':
      return 'Housekeeping';
    case 'FOOD':
      return 'Food';
    case 'SECURITY':
      return 'Security';
    case 'OTHER':
      return 'Other';
    default:
      return category;
  }
}

export function formatPriorityLabel(priority: string): string {
  switch (priority) {
    case 'LOW':
      return 'Low';
    case 'MEDIUM':
      return 'Medium';
    case 'HIGH':
      return 'High';
    case 'URGENT':
      return 'Urgent';
    default:
      return priority;
  }
}

export function formatEnquiryStage(stage: string): string {
  switch (stage) {
    case 'NEW_ENQUIRY':
    case 'NEW':
      return 'New Enquiry';
    case 'CONTACTED':
      return 'Contacted';
    case 'APPROVED':
    case 'VISIT_SCHEDULED':
      return 'Approved';
    case 'CONVERTED_TO_STUDENT':
    case 'CONVERTED':
      return 'Converted to Student';
    case 'REJECTED':
    case 'LOST':
      return 'Rejected';
    default:
      return stage;
  }
}

export function formatAccountLinkStatus(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'NO_ACCOUNT':
      return 'No account';
    case 'ACCOUNT_CREATED':
      return 'Account created';
    case 'LINK_PENDING':
      return 'Link pending';
    case 'LINKED':
      return 'Linked account';
    case 'LINK_REJECTED':
      return 'Link rejected';
    default:
      return 'No account';
  }
}

export function formatExpenseCategory(category: string): string {
  switch (category) {
    case 'ELECTRICITY':
      return 'Electricity';
    case 'WATER':
      return 'Water';
    case 'MAINTENANCE':
      return 'Maintenance';
    case 'STAFF_SALARY':
      return 'Staff Salary';
    case 'FOOD_KITCHEN':
      return 'Food & Kitchen';
    case 'INTERNET':
      return 'Internet';
    case 'HOUSEKEEPING':
      return 'Housekeeping';
    case 'OTHER':
      return 'Other';
    default:
      return category.replace(/_/g, ' ');
  }
}

export function formatGenderType(genderType: string): string {
  switch (genderType) {
    case 'BOYS':
      return 'Boys';
    case 'GIRLS':
      return 'Girls';
    case 'COED':
      return 'Co-Ed';
    default:
      return genderType;
  }
}

export function validatePaymentAmount(
  amount: number,
  balanceDue: number
): { valid: boolean; error?: string } {
  if (!Number.isFinite(balanceDue) || balanceDue <= 0) {
    return { valid: false, error: 'This invoice has already been paid in full.' };
  }
  if (!Number.isFinite(amount) || Math.round(amount) <= 0) {
    return { valid: false, error: 'Enter a valid payment amount greater than ₹0.' };
  }
  if (Math.round(amount) > Math.round(balanceDue)) {
    return {
      valid: false,
      error: `Payment amount cannot exceed remaining balance of ₹${Math.round(balanceDue).toLocaleString('en-IN')}.`,
    };
  }
  return { valid: true };
}

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Inspects a notice's title/body for explicit calendar dates (e.g. "5th Nov", "Nov 5", "05/11/2026")
 * and flags if a referenced date is earlier than the notice's creation date by more than 1 day.
 * Never mutates or deletes the notice—returns an informational warning string or null.
 */
export function detectPotentiallyOutdatedNoticeDate(
  title: string,
  body: string,
  createdAt: string | Date
): string | null {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;

  const createdDayUtc = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate());
  const text = `${title} ${body}`;
  const candidates: Array<{ utcMs: number; label: string }> = [];

  // Pattern 1: "5th Nov", "12 Nov 2026", "5 November"
  const dayMonthRe =
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?\b/gi;
  for (const match of text.matchAll(dayMonthRe)) {
    const day = Number(match[1]);
    const month = MONTH_NAME_MAP[match[2].toLowerCase()];
    const year = match[3] ? Number(match[3]) : created.getUTCFullYear();
    if (month !== undefined && day >= 1 && day <= 31) {
      candidates.push({
        utcMs: Date.UTC(year, month, day),
        label: `${String(day).padStart(2, '0')} ${SHORT_MONTHS[month]}${match[3] ? ` ${year}` : ''}`,
      });
    }
  }

  // Pattern 2: "Nov 5th", "November 12, 2026"
  const monthDayRe =
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/gi;
  for (const match of text.matchAll(monthDayRe)) {
    const month = MONTH_NAME_MAP[match[1].toLowerCase()];
    const day = Number(match[2]);
    const year = match[3] ? Number(match[3]) : created.getUTCFullYear();
    if (month !== undefined && day >= 1 && day <= 31) {
      candidates.push({
        utcMs: Date.UTC(year, month, day),
        label: `${String(day).padStart(2, '0')} ${SHORT_MONTHS[month]}${match[3] ? ` ${year}` : ''}`,
      });
    }
  }

  // Pattern 3: DD/MM/YYYY or DD-MM-YYYY
  const dmyRe = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g;
  for (const match of text.matchAll(dmyRe)) {
    const day = Number(match[1]);
    const month = Number(match[2]) - 1;
    const year = Number(match[3]);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      candidates.push({
        utcMs: Date.UTC(year, month, day),
        label: `${String(day).padStart(2, '0')} ${SHORT_MONTHS[month]} ${year}`,
      });
    }
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  for (const c of candidates) {
    // Only flag if in the same month/year window (avoid flagging annual dates in Dec for Jan)
    const diffDays = Math.round((createdDayUtc - c.utcMs) / ONE_DAY_MS);
    if (diffDays > 1 && diffDays < 180) {
      const postedLabel = `${String(created.getUTCDate()).padStart(2, '0')} ${SHORT_MONTHS[created.getUTCMonth()]} ${created.getUTCFullYear()}`;
      return `Date check: notice mentions ${c.label}, which is earlier than posted date (${postedLabel}). Edit notice if needed.`;
    }
  }

  return null;
}

export function buildBedStatusBreakdown(stats: {
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  reservedBeds: number;
  maintenanceBeds: number;
}): { sumMatchesTotal: boolean; summaryText: string } {
  const sum =
    stats.occupiedBeds + stats.vacantBeds + stats.reservedBeds + stats.maintenanceBeds;
  const parts = [`${stats.occupiedBeds} occupied`, `${stats.vacantBeds} empty`];
  if (stats.reservedBeds > 0) parts.push(`${stats.reservedBeds} reserved`);
  if (stats.maintenanceBeds > 0) parts.push(`${stats.maintenanceBeds} maintenance`);
  return {
    sumMatchesTotal: sum === stats.totalBeds,
    summaryText: `${parts.join(' · ')} of ${stats.totalBeds} beds`,
  };
}

export function getTimeOfDayGreeting(hour: number): string {
  const h = Number.isFinite(hour) ? ((Math.floor(hour) % 24) + 24) % 24 : 9;
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function summarizeAttentionCounts(counts: {
  overdueRent: number;
  partialRent: number;
  unresolvedComplaints: number;
  newEnquiries: number;
  maintenanceBeds: number;
}): number {
  return (
    Math.max(0, counts.overdueRent) +
    Math.max(0, counts.partialRent) +
    Math.max(0, counts.unresolvedComplaints) +
    Math.max(0, counts.newEnquiries) +
    Math.max(0, counts.maintenanceBeds)
  );
}

