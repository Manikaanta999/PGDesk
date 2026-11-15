import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveStudentRentSummary,
  formatDepositStatus,
  formatPaymentApprovalLabel,
  formatRoomSharingLabel,
  formatStudentComplaintCategory,
  formatStudentInvoiceStatus,
  getKycStatusLabel,
  getMoveOutRequestLabel,
  getStudentOccupancyLabel,
  isPreviousStay,
  sanitizeNotificationPrefs,
  shouldExposeOwnerFinancialsToRole,
  splitActiveAndPastStays,
  validatePasswordChangeInput,
} from './studentPortalHelpers.ts';

test('deriveStudentRentSummary summarizes overdue, partial, pending, and paid statuses accurately', () => {
  const overdue = deriveStudentRentSummary(
    [
      { amount: 6000, paidAmount: 0, dueDate: '2026-11-05', status: 'OVERDUE' },
      { amount: 6000, paidAmount: 6000, dueDate: '2026-10-05', status: 'PAID' },
    ],
    6000
  );
  assert.equal(overdue.overallStatus, 'Overdue');
  assert.equal(overdue.pendingAmount, 6000);
  assert.equal(overdue.nextDueDate, '2026-11-05');

  const partial = deriveStudentRentSummary(
    [{ amount: 6000, paidAmount: 2500, dueDate: '2026-11-18', status: 'PARTIAL' }],
    6000
  );
  assert.equal(partial.overallStatus, 'Partially Paid');
  assert.equal(partial.amountPaid, 2500);
  assert.equal(partial.pendingAmount, 3500);

  const paid = deriveStudentRentSummary(
    [{ amount: 6000, paidAmount: 6000, dueDate: '2026-11-05', status: 'PAID' }],
    6000
  );
  assert.equal(paid.overallStatus, 'Paid');
  assert.equal(paid.pendingAmount, 0);
  assert.equal(paid.nextDueDate, null);
});

test('isPreviousStay and status labels distinguish active vs moved-out residents cleanly', () => {
  assert.equal(isPreviousStay('LEFT'), true);
  assert.equal(isPreviousStay('ACTIVE'), false);
  assert.equal(getStudentOccupancyLabel('LEFT'), 'Moved Out (Previous Stay)');
  assert.equal(getStudentOccupancyLabel('NOTICE'), 'On Move-Out Notice');
  assert.equal(getMoveOutRequestLabel('UNDER_REVIEW'), 'Under Review');
  assert.equal(getKycStatusLabel('VERIFIED'), 'Verified');
  assert.equal(formatRoomSharingLabel('DOUBLE'), '2-Sharing (Twin)');
  assert.equal(formatStudentComplaintCategory('PLUMBING'), 'Water');
  assert.equal(formatStudentInvoiceStatus('PARTIAL'), 'Partially Paid');
  assert.equal(formatPaymentApprovalLabel('PENDING_APPROVAL'), 'Pending Verification');
  assert.equal(formatDepositStatus('HELD'), 'Held');
  assert.equal(formatDepositStatus('PARTIAL_REFUND'), 'Partial Refund');
  assert.equal(formatDepositStatus('REFUNDED'), 'Refunded');
  assert.equal(formatDepositStatus('FORFEITED'), 'Forfeited');
});

test('validatePasswordChangeInput checks current password, length, match, and reuse', () => {
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: '',
      newPassword: 'newpassword1',
      confirmNewPassword: 'newpassword1',
    }).valid,
    false
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'oldpassword1',
      newPassword: 'short',
      confirmNewPassword: 'short',
    }).valid,
    false
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'oldpassword1',
      newPassword: 'newpassword1',
      confirmNewPassword: 'mismatchpassword',
    }).valid,
    false
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'samepassword1',
      newPassword: 'samepassword1',
      confirmNewPassword: 'samepassword1',
    }).valid,
    false
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: 'oldpassword1',
      newPassword: 'newpassword1',
      confirmNewPassword: 'newpassword1',
    }).valid,
    true
  );
  assert.equal(
    validatePasswordChangeInput({
      currentPassword: '',
      newPassword: 'newpassword1',
      confirmNewPassword: 'newpassword1',
      requireCurrentPassword: false,
    }).valid,
    true
  );
});

test('sanitizeNotificationPrefs always enforces essential securityAlerts as true', () => {
  const sanitized = sanitizeNotificationPrefs({
    hostelNotices: false,
    rentReminders: true,
    complaintUpdates: false,
    securityAlerts: false,
  });
  assert.deepEqual(sanitized, {
    hostelNotices: false,
    rentReminders: true,
    complaintUpdates: false,
    securityAlerts: true,
  });
});

test('splitActiveAndPastStays never promotes LEFT stay to active and preserves past history', () => {
  const onlyLeft = splitActiveAndPastStays([
    { id: 10, status: 'LEFT', hostel: 'Old Hostel', rent: 5500 },
  ]);
  assert.equal(onlyLeft.activeStay, null);
  assert.equal(onlyLeft.pastStays.length, 1);
  assert.equal(onlyLeft.pastStays[0].id, 10);

  const rejoined = splitActiveAndPastStays([
    { id: 20, status: 'ACTIVE', hostel: 'New Hostel', rent: 7000 },
    { id: 10, status: 'LEFT', hostel: 'Old Hostel', rent: 5500 },
  ]);
  assert.equal(rejoined.activeStay?.id, 20);
  assert.equal(rejoined.pastStays.length, 1);
  assert.equal(rejoined.pastStays[0].id, 10);

  assert.equal(shouldExposeOwnerFinancialsToRole('TENANT'), false);
  assert.equal(shouldExposeOwnerFinancialsToRole('OWNER'), true);
  assert.equal(shouldExposeOwnerFinancialsToRole('MANAGER'), true);
});

