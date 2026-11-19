import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidStudentLinkCodeFormat,
  normalizeTokenCode,
  PLATFORM_ORG_SLUG,
} from './platformAuth.ts';
import { signSessionToken, verifySessionToken } from './security.ts';
import { isEmailDeliveryConfigured } from '../server/mailer.ts';

test('student link code normalization and validation follow strict format', () => {
  assert.equal(PLATFORM_ORG_SLUG, 'pgdesk-platform');
  assert.equal(normalizeTokenCode(' pgdeskstu-ab12-cd34 '), 'PGDESKSTU-AB12-CD34');
  assert.equal(isValidStudentLinkCodeFormat('pgdeskstu-ab12-cd34'), true);
  assert.equal(isValidStudentLinkCodeFormat('PGDESKSTU-AB12-CD34'), true);
  assert.equal(isValidStudentLinkCodeFormat('PGDESKOWNER-AB12-CD34-EF56'), false);
  assert.equal(isValidStudentLinkCodeFormat('INVALID-CODE'), false);
});

test('session token preserves authMethod claim across SESSION and GOOGLE', () => {
  const googleTok = signSessionToken({
    userId: 3,
    organizationId: 1,
    role: 'TENANT',
    sid: '123e4567-e89b-42d3-a456-426614174000',
    am: 'GOOGLE',
  });
  const parsedGoogle = verifySessionToken(googleTok);
  assert.equal(parsedGoogle?.role, 'TENANT');
  assert.equal(parsedGoogle?.am, 'GOOGLE');

  const credTok = signSessionToken({
    userId: 1,
    organizationId: 1,
    role: 'OWNER',
    sid: '123e4567-e89b-42d3-a456-426614174001',
    am: 'SESSION',
  });
  const parsedCred = verifySessionToken(credTok);
  assert.equal(parsedCred?.role, 'OWNER');
  assert.equal(parsedCred?.am, 'SESSION');
});

test('isEmailDeliveryConfigured enables email verification only when a provider is configured', () => {
  assert.equal(isEmailDeliveryConfigured({} as NodeJS.ProcessEnv), false);
  assert.equal(isEmailDeliveryConfigured({ RESEND_API_KEY: 're_test_123' } as NodeJS.ProcessEnv), true);
  assert.equal(
    isEmailDeliveryConfigured({ RESEND_API_KEY: 're_test_123', REQUIRE_EMAIL_VERIFICATION: 'false' } as NodeJS.ProcessEnv),
    false
  );
  assert.equal(isEmailDeliveryConfigured({ EMAIL_WEBHOOK_URL: 'https://mail.example.com/hook' } as NodeJS.ProcessEnv), true);
});
