export type StudentOverallRentStatus = 'Paid' | 'Pending' | 'Partially Paid' | 'Overdue';

export interface StudentInvoiceLike {
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
}

export interface StudentRentSummary {
  monthlyRent: number;
  amountPaid: number;
  pendingAmount: number;
  nextDueDate: string | null;
  overallStatus: StudentOverallRentStatus;
}

export function deriveStudentRentSummary(
  invoices: StudentInvoiceLike[],
  monthlyRent: number
): StudentRentSummary {
  if (!invoices || invoices.length === 0) {
    return {
      monthlyRent,
      amountPaid: 0,
      pendingAmount: 0,
      nextDueDate: null,
      overallStatus: 'Paid',
    };
  }

  let pendingAmount = 0;
  let hasOverdue = false;
  let hasPartial = false;
  let hasPending = false;
  let earliestDueDate: string | null = null;

  for (const inv of invoices) {
    const balance = Math.max(0, inv.amount - inv.paidAmount);
    pendingAmount += balance;
    if (balance > 0) {
      if (!earliestDueDate || inv.dueDate < earliestDueDate) {
        earliestDueDate = inv.dueDate;
      }
      if (inv.status === 'OVERDUE') {
        hasOverdue = true;
      } else if (inv.status === 'PARTIAL' || inv.paidAmount > 0) {
        hasPartial = true;
      } else {
        hasPending = true;
      }
    }
  }

  // Latest invoice paid amount gives clear context for the current cycle; fallback to total paid
  const latestInvoice = invoices[0];
  const amountPaid = latestInvoice ? Math.max(0, latestInvoice.paidAmount) : 0;

  let overallStatus: StudentOverallRentStatus = 'Paid';
  if (hasOverdue) {
    overallStatus = 'Overdue';
  } else if (hasPartial) {
    overallStatus = 'Partially Paid';
  } else if (hasPending || pendingAmount > 0) {
    overallStatus = 'Pending';
  }

  return {
    monthlyRent,
    amountPaid,
    pendingAmount,
    nextDueDate: earliestDueDate,
    overallStatus,
  };
}

export function isPreviousStay(status: string | null | undefined): boolean {
  return String(status || '').toUpperCase() === 'LEFT';
}

export function getStudentOccupancyLabel(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'Active Resident';
    case 'NOTICE':
      return 'On Move-Out Notice';
    case 'LEFT':
      return 'Moved Out (Previous Stay)';
    default:
      return 'Resident';
  }
}

export function getMoveOutRequestLabel(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'SUBMITTED':
      return 'Submitted';
    case 'UNDER_REVIEW':
      return 'Under Review';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'Submitted';
  }
}

export function getKycStatusLabel(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'VERIFIED':
      return 'Verified';
    case 'REJECTED':
      return 'Needs Re-upload';
    default:
      return 'Pending Verification';
  }
}

export function formatRoomSharingLabel(roomType: string | null | undefined): string {
  switch (String(roomType || '').toUpperCase()) {
    case 'SINGLE':
      return '1-Sharing (Single)';
    case 'DOUBLE':
      return '2-Sharing (Twin)';
    case 'TRIPLE':
      return '3-Sharing (Triple)';
    case 'DORM':
      return 'Dormitory';
    default:
      return String(roomType || 'Standard');
  }
}

export const STUDENT_COMPLAINT_CATEGORIES = [
  { label: 'Water', value: 'PLUMBING' },
  { label: 'Electricity', value: 'ELECTRICAL' },
  { label: 'Room Maintenance', value: 'OTHER' },
  { label: 'Cleaning', value: 'HOUSEKEEPING' },
  { label: 'Food', value: 'FOOD' },
  { label: 'Internet', value: 'WIFI' },
  { label: 'Other', value: 'OTHER' },
] as const;

export function formatStudentComplaintCategory(category: string | null | undefined): string {
  switch (String(category || '').toUpperCase()) {
    case 'PLUMBING':
      return 'Water';
    case 'ELECTRICAL':
      return 'Electricity';
    case 'WIFI':
      return 'Internet';
    case 'HOUSEKEEPING':
      return 'Cleaning';
    case 'FOOD':
      return 'Food';
    case 'SECURITY':
      return 'Security';
    default:
      return 'Room Maintenance / Other';
  }
}

export function formatStudentInvoiceStatus(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'PAID':
      return 'Paid';
    case 'PARTIAL':
      return 'Partially Paid';
    case 'OVERDUE':
      return 'Overdue';
    case 'PENDING':
      return 'Pending';
    default:
      return String(status || 'Pending');
  }
}

export function formatPaymentApprovalLabel(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'APPROVED':
      return 'Verified';
    case 'PENDING_APPROVAL':
      return 'Pending Verification';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'Pending';
  }
}

export function validatePasswordChangeInput(input: {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
  requireCurrentPassword?: boolean;
}): { valid: boolean; message?: string } {
  if (input.requireCurrentPassword !== false && input.currentPassword.length === 0) {
    return { valid: false, message: 'Enter your current password.' };
  }
  if (input.newPassword.length < 6) {
    return { valid: false, message: 'New password must be at least 6 characters.' };
  }
  if (input.newPassword.length > 100) {
    return { valid: false, message: 'New password must be 100 characters or fewer.' };
  }
  if (input.newPassword !== input.confirmNewPassword) {
    return { valid: false, message: 'New password and confirmation do not match.' };
  }
  if (input.requireCurrentPassword !== false && input.newPassword === input.currentPassword) {
    return { valid: false, message: 'New password must be different from your current password.' };
  }
  return { valid: true };
}

export interface NotificationPrefsShape {
  hostelNotices: boolean;
  rentReminders: boolean;
  complaintUpdates: boolean;
  securityAlerts: boolean;
}

export function sanitizeNotificationPrefs(
  input: Partial<NotificationPrefsShape> | null | undefined
): NotificationPrefsShape {
  return {
    hostelNotices: input?.hostelNotices !== false,
    rentReminders: input?.rentReminders !== false,
    complaintUpdates: input?.complaintUpdates !== false,
    // Essential account security alerts cannot be turned off
    securityAlerts: true,
  };
}

export function splitActiveAndPastStays<T extends { status: string }>(
  stays: T[]
): { activeStay: T | null; pastStays: T[] } {
  const activeStay =
    stays.find((s) => {
      const upper = String(s.status || '').toUpperCase();
      return upper === 'ACTIVE' || upper === 'NOTICE';
    }) ?? null;
  const pastStays = stays.filter((s) => String(s.status || '').toUpperCase() === 'LEFT');
  return { activeStay, pastStays };
}

export function shouldExposeOwnerFinancialsToRole(role: string | null | undefined): boolean {
  const upper = String(role || '').toUpperCase();
  return upper === 'OWNER' || upper === 'MANAGER';
}

export function formatDepositStatus(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'HELD':
      return 'Held';
    case 'PARTIAL_REFUND':
      return 'Partial Refund';
    case 'REFUNDED':
      return 'Refunded';
    case 'FORFEITED':
      return 'Forfeited';
    default:
      return 'Recorded';
  }
}

