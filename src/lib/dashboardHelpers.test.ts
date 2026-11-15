import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBedStatusBreakdown,
  detectPotentiallyOutdatedNoticeDate,
  formatBedStatus,
  formatComplaintCategory,
  formatComplaintStatus,
  formatEnquiryStage,
  formatExpenseCategory,
  formatGenderType,
  formatInvoiceStatus,
  formatPriorityLabel,
  formatTenantStatus,
  getTimeOfDayGreeting,
  summarizeAttentionCounts,
  validatePaymentAmount,
} from './dashboardHelpers.ts';

test('status and category formatters return readable human labels', () => {
  assert.equal(formatInvoiceStatus('PAID'), 'Paid');
  assert.equal(formatInvoiceStatus('PARTIAL'), 'Partially Paid');
  assert.equal(formatInvoiceStatus('OVERDUE'), 'Overdue');
  assert.equal(formatInvoiceStatus('PENDING'), 'Pending');

  assert.equal(formatTenantStatus('ACTIVE'), 'Active');
  assert.equal(formatTenantStatus('NOTICE'), 'On Notice');
  assert.equal(formatTenantStatus('LEFT'), 'Moved Out');

  assert.equal(formatBedStatus('VACANT'), 'Vacant');
  assert.equal(formatBedStatus('MAINTENANCE'), 'Maintenance');

  assert.equal(formatComplaintStatus('IN_PROGRESS'), 'In Progress');
  assert.equal(formatComplaintCategory('WIFI'), 'Wi-Fi');
  assert.equal(formatPriorityLabel('URGENT'), 'Urgent');

  assert.equal(formatEnquiryStage('NEW_ENQUIRY'), 'New Enquiry');
  assert.equal(formatEnquiryStage('APPROVED'), 'Approved');
  assert.equal(formatEnquiryStage('CONVERTED_TO_STUDENT'), 'Converted to Student');
  assert.equal(formatEnquiryStage('REJECTED'), 'Rejected');

  assert.equal(formatExpenseCategory('FOOD_KITCHEN'), 'Food & Kitchen');
  assert.equal(formatExpenseCategory('STAFF_SALARY'), 'Staff Salary');
  assert.equal(formatGenderType('COED'), 'Co-Ed');
});

test('validatePaymentAmount enforces non-zero and prevents overpayment', () => {
  assert.equal(validatePaymentAmount(0, 5000).valid, false);
  assert.equal(validatePaymentAmount(-100, 5000).valid, false);
  assert.equal(validatePaymentAmount(5001, 5000).valid, false);
  assert.equal(validatePaymentAmount(500, 0).valid, false);
  assert.equal(validatePaymentAmount(5000, 5000).valid, true);
  assert.equal(validatePaymentAmount(2500, 5000).valid, true);
});

test('detectPotentiallyOutdatedNoticeDate flags dates earlier than posted date without throwing', () => {
  const flag = detectPotentiallyOutdatedNoticeDate(
    'November Rent Due by 5th Nov',
    'Please pay November rent before 5th Nov to avoid late fee.',
    '2026-11-15T10:00:00Z'
  );
  assert.ok(flag && flag.includes('05 Nov'));

  const okFuture = detectPotentiallyOutdatedNoticeDate(
    'December Maintenance on 20th Nov',
    'Water tank cleaning scheduled for 20th Nov.',
    '2026-11-15T10:00:00Z'
  );
  assert.equal(okFuture, null);

  const noDate = detectPotentiallyOutdatedNoticeDate(
    'Wi-Fi Password Updated',
    'Please connect to PGDesk-5G using the new password at the reception.',
    '2026-11-15T10:00:00Z'
  );
  assert.equal(noDate, null);
});

test('buildBedStatusBreakdown accurately verifies occupied + empty + reserved + maintenance math', () => {
  const exact = buildBedStatusBreakdown({
    totalBeds: 20,
    occupiedBeds: 14,
    vacantBeds: 4,
    reservedBeds: 1,
    maintenanceBeds: 1,
  });
  assert.equal(exact.sumMatchesTotal, true);
  assert.equal(exact.summaryText, '14 occupied · 4 empty · 1 reserved · 1 maintenance of 20 beds');
});

test('getTimeOfDayGreeting and summarizeAttentionCounts return expected values', () => {
  assert.equal(getTimeOfDayGreeting(8), 'Good morning');
  assert.equal(getTimeOfDayGreeting(14), 'Good afternoon');
  assert.equal(getTimeOfDayGreeting(20), 'Good evening');
  assert.equal(
    summarizeAttentionCounts({
      overdueRent: 2,
      partialRent: 1,
      unresolvedComplaints: 3,
      newEnquiries: 1,
      maintenanceBeds: 1,
    }),
    8
  );
});

