import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyAuthError,
  computeSessionCookiePolicy,
  getDashboardRouteForRole,
  isEmbeddedAuthRequest,
  isRoleAllowedOnPath,
  normalizeLoginIdentifier,
  normalizeUserRole,
  rethrowAfterGoogleDemoAccessDenied,
} from './authRoles.ts';

test('normalizeUserRole and getDashboardRouteForRole handle OWNER, MANAGER, TENANT consistently', () => {
  assert.equal(normalizeUserRole('admin'), null);
  assert.equal(normalizeUserRole(' OWNER '), 'OWNER');
  assert.equal(normalizeUserRole('MANAGER'), 'MANAGER');
  assert.equal(normalizeUserRole('tenant'), 'TENANT');
  assert.equal(normalizeUserRole('UNKNOWN'), null);

  assert.equal(getDashboardRouteForRole('OWNER'), '/dashboard');
  assert.equal(getDashboardRouteForRole('MANAGER'), '/dashboard');
  assert.equal(getDashboardRouteForRole('TENANT'), '/tenant');
});

test('isRoleAllowedOnPath enforces strict role isolation across owner and tenant portals', () => {
  assert.equal(isRoleAllowedOnPath('OWNER', '/dashboard/billing'), true);
  assert.equal(isRoleAllowedOnPath('OWNER', '/tenant'), false);

  assert.equal(isRoleAllowedOnPath('MANAGER', '/dashboard/tenants'), true);
  assert.equal(isRoleAllowedOnPath('MANAGER', '/tenant'), false);

  assert.equal(isRoleAllowedOnPath('TENANT', '/tenant'), true);
  assert.equal(isRoleAllowedOnPath('TENANT', '/dashboard'), false);
});

test('isEmbeddedAuthRequest detects Google AI Studio preview iframes even on same-origin fetch()', () => {
  // Fetch inside AI Studio iframe: sec-fetch-dest is 'empty', Origin matches Host, X-PGDesk-Embedded is '1'
  assert.equal(
    isEmbeddedAuthRequest(
      {
        'sec-fetch-dest': 'empty',
        'sec-fetch-site': 'same-origin',
        origin: 'https://ais-pre-example.asia-northeast1.run.app',
        'x-pgdesk-embedded': '1',
      },
      'ais-pre-example.asia-northeast1.run.app'
    ),
    true
  );

  // Browser cross-site signal without custom header
  assert.equal(
    isEmbeddedAuthRequest(
      {
        'sec-fetch-dest': 'empty',
        'sec-fetch-site': 'cross-site',
      },
      'ais-pre-example.asia-northeast1.run.app'
    ),
    true
  );

  // Direct top-level production visit
  assert.equal(
    isEmbeddedAuthRequest(
      {
        'sec-fetch-dest': 'empty',
        'sec-fetch-site': 'same-origin',
        origin: 'https://ais-pre-example.asia-northeast1.run.app',
      },
      'ais-pre-example.asia-northeast1.run.app'
    ),
    false
  );
});

test('computeSessionCookiePolicy enables bearer tokens and SameSite=None in embedded production previews', () => {
  const previewIframePolicy = computeSessionCookiePolicy({
    isProduction: true,
    isHttps: true,
    isEmbedded: true,
  });
  assert.deepEqual(previewIframePolicy, {
    sameSite: 'none',
    secure: true,
    cookieOnly: false,
  });

  const topLevelProdPolicy = computeSessionCookiePolicy({
    isProduction: true,
    isHttps: true,
    isEmbedded: false,
  });
  assert.deepEqual(topLevelProdPolicy, {
    sameSite: 'lax',
    secure: true,
    cookieOnly: true,
  });
});

test('normalizeLoginIdentifier trims email and normalizes Indian mobile numbers without altering passwords', () => {
  assert.deepEqual(normalizeLoginIdentifier('  ManikantaVinnu999@Gmail.com  '), {
    identifier: 'manikantavinnu999@gmail.com',
    normalizedPhone: '999',
  });
  assert.deepEqual(normalizeLoginIdentifier(' +91 98450 11223 '), {
    identifier: '+91 98450 11223',
    normalizedPhone: '9845011223',
  });
  assert.deepEqual(normalizeLoginIdentifier('9900123456'), {
    identifier: '9900123456',
    normalizedPhone: '9900123456',
  });
});

test('classifyAuthError separates network, profile-load, unconfirmed-email, and credential errors', () => {
  const netErr = classifyAuthError(new TypeError('Failed to fetch'));
  assert.equal(netErr.isNetwork, true);
  assert.equal(netErr.code, 'NETWORK_ERROR');

  const profileErr = classifyAuthError({
    status: 500,
    message: 'Login successful, but your account profile could not be loaded. Please contact support.',
    data: { code: 'PROFILE_LOAD_FAILED' },
  });
  assert.equal(profileErr.isProfileError, true);
  assert.match(profileErr.message, /account profile could not be loaded/i);

  const otpErr = classifyAuthError({
    status: 403,
    message: 'Please verify your email address before accessing your resident portal.',
    data: { code: 'EMAIL_NOT_VERIFIED', requiresOtp: true },
  });
  assert.equal(otpErr.requiresVerification, true);

  const domainErr = classifyAuthError({
    status: 403,
    message: 'Firebase: Error (auth/unauthorized-domain).',
    data: { code: 'AUTH_UNAUTHORIZED_DOMAIN' },
  });
  assert.equal(domainErr.code, 'AUTH_UNAUTHORIZED_DOMAIN');
});

test('Google demo access rejection signs out Firebase and preserves the backend error', async () => {
  const message = 'PGDesk is not yet publicly released. Please contact the administrator to request demo access.';
  const backendError = {
    status: 403,
    message,
    data: { code: 'GOOGLE_DEMO_ACCESS_REQUIRED' },
  };
  let signOutCalls = 0;

  await assert.rejects(
    rethrowAfterGoogleDemoAccessDenied(backendError, async () => {
      signOutCalls += 1;
    }),
    (error) => error === backendError
  );

  assert.equal(signOutCalls, 1);
  assert.equal(classifyAuthError(backendError).message, message);
});

test('Google sign-in does not sign out for network, server, or other authentication errors', async () => {
  const errors = [
    { status: 0, message: 'Network failed', data: { code: 'NETWORK_ERROR' } },
    { status: 500, message: 'Temporary server error', data: { code: 'AUTH_SERVER_ERROR' } },
    { status: 403, message: 'Email is not verified', data: { code: 'EMAIL_NOT_VERIFIED' } },
  ];

  for (const error of errors) {
    let signOutCalls = 0;
    await assert.rejects(
      rethrowAfterGoogleDemoAccessDenied(error, async () => {
        signOutCalls += 1;
      }),
      (caughtError) => caughtError === error
    );
    assert.equal(signOutCalls, 0);
  }
});
