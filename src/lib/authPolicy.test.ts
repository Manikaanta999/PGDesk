import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAdminResetUserPassword,
  FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
  getAuthTestingPolicy,
  isEmailVerificationEnabled,
  isPasswordResetEmailEnabled,
  isSmsOtpEnabled,
  shouldRequireCurrentPasswordOnUpdate,
} from './authPolicy.ts';

test('temporary auth policy disables email verification, SMS OTP, and email password reset by default', () => {
  const emptyEnv = {} as NodeJS.ProcessEnv;
  assert.equal(isEmailVerificationEnabled(emptyEnv), false);
  assert.equal(isSmsOtpEnabled(emptyEnv), false);
  assert.equal(isPasswordResetEmailEnabled(emptyEnv), false);

  const policy = getAuthTestingPolicy(emptyEnv);
  assert.deepEqual(policy, {
    emailVerificationEnabled: false,
    smsOtpEnabled: false,
    passwordResetEmailEnabled: false,
    forgotPasswordMessage: 'Password reset is unavailable during testing. Please contact the administrator.',
  });
  assert.equal(
    FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
    'Password reset is unavailable during testing. Please contact the administrator.'
  );
});

test('auth policy flags re-enable cleanly when configured after email provider setup', () => {
  const prodEnv = {
    AUTH_EMAIL_VERIFICATION_ENABLED: 'true',
    AUTH_SMS_OTP_ENABLED: 'true',
    AUTH_EMAIL_PASSWORD_RESET_ENABLED: 'true',
  } as unknown as NodeJS.ProcessEnv;

  assert.equal(isEmailVerificationEnabled(prodEnv), true);
  assert.equal(isSmsOtpEnabled(prodEnv), true);
  assert.equal(isPasswordResetEmailEnabled(prodEnv), true);
});

test('shouldRequireCurrentPasswordOnUpdate skips old password when user has never set one', () => {
  assert.equal(shouldRequireCurrentPasswordOnUpdate({ hasPassword: false, authMethod: 'SESSION' }), false);
  assert.equal(shouldRequireCurrentPasswordOnUpdate({ hasPassword: false, authMethod: 'GOOGLE' }), false);
  assert.equal(shouldRequireCurrentPasswordOnUpdate({ hasPassword: true, authMethod: 'GOOGLE' }), false);
  assert.equal(shouldRequireCurrentPasswordOnUpdate({ hasPassword: true, authMethod: 'SESSION' }), true);
});

test('canAdminResetUserPassword enforces OWNER role and organization isolation', () => {
  // OWNER resetting MANAGER or TENANT in same org -> allowed
  assert.equal(
    canAdminResetUserPassword({
      actorRole: 'OWNER',
      actorOrgId: 10,
      actorUserId: 1,
      targetRole: 'MANAGER',
      targetOrgId: 10,
      targetUserId: 2,
    }),
    true
  );
  assert.equal(
    canAdminResetUserPassword({
      actorRole: 'OWNER',
      actorOrgId: 10,
      actorUserId: 1,
      targetRole: 'TENANT',
      targetOrgId: 10,
      targetUserId: 3,
    }),
    true
  );

  // Cross-organization reset -> strictly denied
  assert.equal(
    canAdminResetUserPassword({
      actorRole: 'OWNER',
      actorOrgId: 10,
      actorUserId: 1,
      targetRole: 'TENANT',
      targetOrgId: 11,
      targetUserId: 3,
    }),
    false
  );

  // MANAGER or TENANT trying to reset anyone -> strictly denied
  assert.equal(
    canAdminResetUserPassword({
      actorRole: 'MANAGER',
      actorOrgId: 10,
      actorUserId: 2,
      targetRole: 'TENANT',
      targetOrgId: 10,
      targetUserId: 3,
    }),
    false
  );
  assert.equal(
    canAdminResetUserPassword({
      actorRole: 'TENANT',
      actorOrgId: 10,
      actorUserId: 3,
      targetRole: 'TENANT',
      targetOrgId: 10,
      targetUserId: 4,
    }),
    false
  );

  // OWNER cannot reset another OWNER or self via org-admin reset
  assert.equal(
    canAdminResetUserPassword({
      actorRole: 'OWNER',
      actorOrgId: 10,
      actorUserId: 1,
      targetRole: 'OWNER',
      targetOrgId: 10,
      targetUserId: 5,
    }),
    false
  );
  assert.equal(
    canAdminResetUserPassword({
      actorRole: 'OWNER',
      actorOrgId: 10,
      actorUserId: 1,
      targetRole: 'OWNER',
      targetOrgId: 10,
      targetUserId: 1,
    }),
    false
  );
});
