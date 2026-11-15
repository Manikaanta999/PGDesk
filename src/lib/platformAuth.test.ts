import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canClaimStudentRecord,
  formatAccountLinkStatus,
  generateOwnerRegistrationToken,
  generateStudentLinkCode,
  isValidOwnerTokenFormat,
  isValidStudentLinkCodeFormat,
  resolveOwnerTokenStatus,
  sanitizeAdminStudentRow,
  validatePhoneOrEmail,
} from './platformAuth.ts';

test('owner registration token and student link code generators follow strict formats', () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    const t = generateOwnerRegistrationToken();
    assert.equal(isValidOwnerTokenFormat(t), true);
    tokens.add(t);

    const c = generateStudentLinkCode();
    assert.equal(isValidStudentLinkCodeFormat(c), true);
  }
  assert.equal(tokens.size, 20);
  assert.equal(isValidOwnerTokenFormat('pgdeskowner-ab12-cd34-ef56'), true);
  assert.equal(isValidOwnerTokenFormat('INVALID-TOKEN'), false);
  assert.equal(isValidStudentLinkCodeFormat('PGDESKSTU-AB12-CD34'), true);
  assert.equal(isValidStudentLinkCodeFormat('PGDESKOWNER-AB12-CD34-EF56'), false);
});

test('resolveOwnerTokenStatus distinguishes UNUSED, USED, REVOKED, and EXPIRED', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const future = new Date('2026-11-22T12:00:00Z');
  const past = new Date('2026-11-14T12:00:00Z');

  assert.equal(resolveOwnerTokenStatus({ status: 'UNUSED', expiresAt: future }, now), 'UNUSED');
  assert.equal(resolveOwnerTokenStatus({ status: 'UNUSED', expiresAt: past }, now), 'EXPIRED');
  assert.equal(resolveOwnerTokenStatus({ status: 'USED', expiresAt: future }, now), 'USED');
  assert.equal(resolveOwnerTokenStatus({ status: 'REVOKED', expiresAt: future }, now), 'REVOKED');
});

test('validatePhoneOrEmail requires at least one valid contact channel', () => {
  assert.equal(validatePhoneOrEmail({ phone: '', email: '' }).valid, false);
  assert.equal(validatePhoneOrEmail({ phone: '9876543210', email: '' }).valid, true);
  assert.equal(validatePhoneOrEmail({ phone: '', email: 'student@example.com' }).valid, true);
  assert.equal(validatePhoneOrEmail({ phone: '12345', email: '' }).valid, false);
  assert.equal(validatePhoneOrEmail({ phone: '', email: 'not-an-email' }).valid, false);
  assert.equal(validatePhoneOrEmail({ phone: '9876543210', email: 'bad' }).valid, false);
});

test('canClaimStudentRecord prevents double-linking across accounts', () => {
  assert.equal(
    canClaimStudentRecord({ userId: null, accountLinkStatus: 'NO_ACCOUNT' }, 42).allowed,
    true
  );
  assert.equal(
    canClaimStudentRecord({ userId: null, accountLinkStatus: 'LINK_PENDING' }, 42).allowed,
    true
  );
  assert.equal(
    canClaimStudentRecord({ userId: 7, accountLinkStatus: 'LINKED' }, 42).allowed,
    false
  );
  assert.equal(
    canClaimStudentRecord({ userId: 42, accountLinkStatus: 'LINKED' }, 42).allowed,
    false
  );
  assert.equal(
    canClaimStudentRecord({ userId: null, accountLinkStatus: 'NO_ACCOUNT', deletedAt: '2026-11-01' }, 42).allowed,
    false
  );
});

test('sanitizeAdminStudentRow strips sensitive KYC, password, and payment fields', () => {
  const sanitized = sanitizeAdminStudentRow({
    id: 11,
    name: 'Kiran Reddy',
    phone: null,
    email: 'kiran@example.com',
    propertyId: 3,
    propertyName: 'Sri Sai Hostel',
    organizationId: 2,
    organizationName: 'Sri Sai PG',
    roomNumber: '101',
    bedLabel: 'A',
    status: 'ACTIVE',
    userId: null,
    accountLinkStatus: 'NO_ACCOUNT',
    joinDate: '2026-11-01',
    leaveDate: null,
    idDocumentUrl: '/api/files/secret',
    idNumberMasked: 'XXXX-XXXX-9999',
    passwordHash: 'salt:hash',
    payments: [{ amount: 8000 }],
  });

  assert.equal(sanitized.hasAccount, false);
  assert.equal(sanitized.phone, null);
  assert.equal('idDocumentUrl' in sanitized, false);
  assert.equal('idNumberMasked' in sanitized, false);
  assert.equal('passwordHash' in sanitized, false);
  assert.equal('payments' in sanitized, false);
  assert.equal(formatAccountLinkStatus('LINK_PENDING'), 'Link pending');
});
