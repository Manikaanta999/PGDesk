import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateDepositSettlement,
  calculateGstBreakdown,
  calculateProRataRent,
  checkPlanBedLimit,
  checkPlanPropertyLimit,
  computeLateFee,
  deriveInvoiceStatus,
  formatFyInvoiceNumber,
  getIndianFinancialYearLabel,
  validateMaskedIdNumber,
} from './billing.ts';
import { hashToken, isDemoModeEnabled, verifyCronSecret, verifyTokenHash } from './security.ts';

test('full month rent when joined in a previous month', () => {
  const res = calculateProRataRent({
    monthlyRent: 12000,
    year: 2026,
    month: 11,
    joinDate: '2026-08-05',
  });
  assert.equal(res.amount, 12000);
  assert.equal(res.isProRata, false);
  assert.equal(res.billableDays, 30);
  assert.equal(res.periodStart, '2026-11-01');
  assert.equal(res.periodEnd, '2026-11-30');
});

test('pro-rata rent for mid-month join in a 30-day month', () => {
  // Joined Nov 16 -> 15 days (16..30 inclusive) out of 30 => 50%
  const res = calculateProRataRent({
    monthlyRent: 14000,
    year: 2026,
    month: 11,
    joinDate: '2026-11-16',
  });
  assert.equal(res.isProRata, true);
  assert.equal(res.billableDays, 15);
  assert.equal(res.amount, 7000);
});

test('pro-rata rent for mid-month leave in a 31-day month', () => {
  const res = calculateProRataRent({
    monthlyRent: 15500,
    year: 2026,
    month: 10,
    joinDate: '2026-06-01',
    leaveDate: '2026-10-10',
  });
  assert.equal(res.isProRata, true);
  assert.equal(res.billableDays, 10);
  assert.equal(res.amount, 5000);
});

test('pro-rata handles joining and leaving in the same month', () => {
  const res = calculateProRataRent({
    monthlyRent: 12000,
    year: 2026,
    month: 11,
    joinDate: '2026-11-10',
    leaveDate: '2026-11-19',
  });
  assert.equal(res.isProRata, true);
  assert.equal(res.billableDays, 10);
  assert.equal(res.amount, 4000);
});

test('computeLateFee respects grace days and balance due', () => {
  assert.equal(
    computeLateFee({
      dueDate: '2026-11-05',
      asOfDate: '2026-11-08',
      graceDays: 3,
      lateFeePerDay: 100,
      balanceDue: 12000,
    }),
    0
  );
  assert.equal(
    computeLateFee({
      dueDate: '2026-11-05',
      asOfDate: '2026-11-11',
      graceDays: 3,
      lateFeePerDay: 100,
      balanceDue: 12000,
    }),
    300
  );
  assert.equal(
    computeLateFee({
      dueDate: '2026-11-05',
      asOfDate: '2026-11-11',
      graceDays: 3,
      lateFeePerDay: 100,
      balanceDue: 0,
    }),
    0
  );
});

test('deriveInvoiceStatus resolves PAID, PARTIAL, PENDING, and OVERDUE accurately', () => {
  assert.equal(
    deriveInvoiceStatus({ amount: 12000, paidAmount: 12000, dueDate: '2026-11-05', asOfDate: '2026-11-10' }),
    'PAID'
  );
  assert.equal(
    deriveInvoiceStatus({ amount: 12000, paidAmount: 6000, dueDate: '2026-11-15', asOfDate: '2026-11-10' }),
    'PARTIAL'
  );
  assert.equal(
    deriveInvoiceStatus({ amount: 12000, paidAmount: 6000, dueDate: '2026-11-05', asOfDate: '2026-11-10' }),
    'OVERDUE'
  );
  assert.equal(
    deriveInvoiceStatus({ amount: 12000, paidAmount: 0, dueDate: '2026-11-15', asOfDate: '2026-11-10' }),
    'PENDING'
  );
});

test('calculateDepositSettlement computes refundable and payable amounts', () => {
  const partial = calculateDepositSettlement({
    securityDeposit: 20000,
    unpaidInvoicesBalance: 5000,
    damageOrNoticeDeductions: 1500,
  });
  assert.equal(partial.netRefundable, 13500);
  assert.equal(partial.netPayableByTenant, 0);
  assert.equal(partial.suggestedStatus, 'PARTIAL_REFUND');

  const deficit = calculateDepositSettlement({
    securityDeposit: 10000,
    unpaidInvoicesBalance: 12000,
    damageOrNoticeDeductions: 1000,
  });
  assert.equal(deficit.netRefundable, 0);
  assert.equal(deficit.netPayableByTenant, 3000);
  assert.equal(deficit.suggestedStatus, 'FORFEITED');
});

test('Indian financial year label and sequential invoice formatting', () => {
  assert.equal(getIndianFinancialYearLabel(2026, 4), '2026-27');
  assert.equal(getIndianFinancialYearLabel(2027, 3), '2026-27');
  assert.equal(formatFyInvoiceNumber('pgd', 2026, 11, 42), 'PGD/2026-27/0042');
  assert.equal(formatFyInvoiceNumber('PGD', 2027, 2, 1), 'PGD/2026-27/0001');
});

test('calculateGstBreakdown splits CGST and SGST accurately', () => {
  const zero = calculateGstBreakdown(12000, 0);
  assert.equal(zero.totalWithGst, 12000);
  assert.equal(zero.cgstAmount, 0);
  assert.equal(zero.sgstAmount, 0);

  const gst12 = calculateGstBreakdown(10000, 12);
  assert.equal(gst12.cgstRatePct, 6);
  assert.equal(gst12.sgstRatePct, 6);
  assert.equal(gst12.cgstAmount, 600);
  assert.equal(gst12.sgstAmount, 600);
  assert.equal(gst12.totalWithGst, 11200);
});

test('SaaS plan tier enforces property and bed limits', () => {
  assert.equal(checkPlanPropertyLimit({ planTier: 'STARTER', currentProperties: 1 }).allowed, false);
  assert.equal(checkPlanPropertyLimit({ planTier: 'GROWTH', currentProperties: 1 }).allowed, true);
  assert.equal(checkPlanBedLimit({ planTier: 'STARTER', currentBeds: 34, bedsToAdd: 2 }).allowed, false);
  assert.equal(checkPlanBedLimit({ planTier: 'STARTER', currentBeds: 32, bedsToAdd: 3 }).allowed, true);
  assert.equal(checkPlanBedLimit({ planTier: 'ENTERPRISE', currentBeds: 500, bedsToAdd: 10 }).allowed, true);
});

test('validateMaskedIdNumber rejects full 12-digit Aadhaar and accepts masked format', () => {
  assert.equal(validateMaskedIdNumber('Aadhaar', '451289014512').valid, false);
  assert.equal(validateMaskedIdNumber('Aadhaar', '4512-8901-4512').valid, false);
  assert.equal(validateMaskedIdNumber('Aadhaar', 'XXXX-XXXX-4512').valid, true);
  assert.equal(validateMaskedIdNumber('Passport', 'Z4918201').valid, true);
});

test('security helpers: demo mode gating, OTP token hash, and cron secret check', () => {
  assert.equal(isDemoModeEnabled({ NODE_ENV: 'production' } as NodeJS.ProcessEnv), false);
  assert.equal(isDemoModeEnabled({ NODE_ENV: 'production', ENABLE_DEMO_MODE: 'true' } as NodeJS.ProcessEnv), true);
  assert.equal(isDemoModeEnabled({ NODE_ENV: 'development' } as NodeJS.ProcessEnv), false);
  assert.equal(isDemoModeEnabled({ NODE_ENV: 'development', ENABLE_DEMO_MODE: 'true' } as NodeJS.ProcessEnv), true);

  const otpHash = hashToken('482910');
  assert.equal(verifyTokenHash('482910', otpHash), true);
  assert.equal(verifyTokenHash('000000', otpHash), false);

  assert.equal(verifyCronSecret('Bearer super-secret-cron-key', 'super-secret-cron-key'), true);
  assert.equal(verifyCronSecret('Bearer wrong-key', 'super-secret-cron-key'), false);
  assert.equal(verifyCronSecret(undefined, 'super-secret-cron-key'), false);
});

