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
import { getActiveEntitlement, isFeatureAvailable, SUBSCRIPTIONS_ENABLED } from './entitlements.ts';
import { hashToken, isDemoModeEnabled, verifyCronSecret, verifyTokenHash } from './security.ts';
import { createTenantSchema, updateTenantProfileSchema } from './validation.ts';
import { parseDemoVideoSource } from './videoConfig.ts';

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

test('free-access model unlocks basic property and bed operations when subscriptions are disabled', () => {
  assert.equal(SUBSCRIPTIONS_ENABLED, false);
  assert.equal(checkPlanPropertyLimit({ planTier: 'STARTER', currentProperties: 5 }).allowed, true);
  assert.equal(checkPlanBedLimit({ planTier: 'STARTER', currentBeds: 200, bedsToAdd: 20 }).allowed, true);
  assert.equal(isFeatureAvailable('hostels', 'STARTER'), true);
  assert.equal(getActiveEntitlement('STARTER').label, 'Free Access');

  // Future tier limits remain cleanly testable when subscriptions are enabled
  assert.equal(
    checkPlanPropertyLimit({ planTier: 'STARTER', currentProperties: 1, enforceSubscriptionLimits: true }).allowed,
    false
  );
  assert.equal(
    checkPlanPropertyLimit({ planTier: 'GROWTH', currentProperties: 1, enforceSubscriptionLimits: true }).allowed,
    true
  );
  assert.equal(
    checkPlanBedLimit({ planTier: 'STARTER', currentBeds: 34, bedsToAdd: 2, enforceSubscriptionLimits: true }).allowed,
    false
  );
  assert.equal(
    checkPlanBedLimit({ planTier: 'STARTER', currentBeds: 32, bedsToAdd: 3, enforceSubscriptionLimits: true }).allowed,
    true
  );
  assert.equal(
    checkPlanBedLimit({ planTier: 'ENTERPRISE', currentBeds: 500, bedsToAdd: 10, enforceSubscriptionLimits: true }).allowed,
    true
  );
});

test('parseDemoVideoSource parses placeholder, MP4, YouTube, and Vimeo URLs', () => {
  assert.deepEqual(parseDemoVideoSource(''), { type: 'placeholder' });
  assert.deepEqual(parseDemoVideoSource('https://cdn.example.com/demo.mp4'), {
    type: 'mp4',
    src: 'https://cdn.example.com/demo.mp4',
  });
  assert.deepEqual(parseDemoVideoSource('/videos/pgdesk.mp4'), {
    type: 'mp4',
    src: '/videos/pgdesk.mp4',
  });
  assert.deepEqual(parseDemoVideoSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), {
    type: 'embed',
    src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
  });
  assert.deepEqual(parseDemoVideoSource('https://youtu.be/abc123XYZ'), {
    type: 'embed',
    src: 'https://www.youtube-nocookie.com/embed/abc123XYZ?rel=0',
  });
  assert.deepEqual(parseDemoVideoSource('https://vimeo.com/123456789'), {
    type: 'embed',
    src: 'https://player.vimeo.com/video/123456789',
  });
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

test('createTenantSchema allows optional emergency contact & KYC and defaults generateJoiningInvoice to false', () => {
  const minimal = createTenantSchema.safeParse({
    name: 'Kiran Rao',
    phone: '9876501234',
    propertyId: 1,
    bedId: 2,
    joinDate: '2026-11-14',
    monthlyRent: 6000,
    securityDeposit: 12000,
  });
  assert.equal(minimal.success, true);
  if (minimal.success) {
    assert.equal(minimal.data.generateJoiningInvoice, false);
    assert.equal(minimal.data.emergencyContactName, '');
    assert.equal(minimal.data.emergencyContactPhone, '');
    assert.equal(minimal.data.idNumberMasked, '');
  }

  const badAadhaar = createTenantSchema.safeParse({
    name: 'Kiran Rao',
    phone: '9876501234',
    propertyId: 1,
    bedId: 2,
    idType: 'Aadhaar',
    idNumberMasked: '123456789012',
    joinDate: '2026-11-14',
    monthlyRent: 6000,
    securityDeposit: 12000,
  });
  assert.equal(badAadhaar.success, false);
});

test('updateTenantProfileSchema validates profile updates and masked Aadhaar when provided', () => {
  const okProfile = updateTenantProfileSchema.safeParse({
    name: 'Kiran Rao',
    phone: '9876501234',
    occupation: 'Software Engineer',
    companyOrCollege: 'Razorpay',
    permanentAddress: '12 MG Road, Mysuru',
    emergencyContactName: 'Suresh Rao',
    emergencyContactPhone: '9845001122',
    idType: 'Aadhaar',
    idNumberMasked: 'XXXX-XXXX-4512',
  });
  assert.equal(okProfile.success, true);

  const badPhone = updateTenantProfileSchema.safeParse({
    name: 'Kiran Rao',
    emergencyContactPhone: '123',
  });
  assert.equal(badPhone.success, false);
});

