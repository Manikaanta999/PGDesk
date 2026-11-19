import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  getSessionSecret,
  isValidSessionId,
  signSessionToken,
  validateSessionSecret,
  verifySessionToken,
} from './security.ts';

const VALID_SID = '123e4567-e89b-42d3-a456-426614174000';
const STRONG_SECRET = 'pgdesk-test-secret-' + 'x'.repeat(32);

function withSessionSecret<T>(value: string | undefined, nodeEnv: string | undefined, run: () => T): T {
  const previousSecret = process.env.SESSION_SECRET;
  const previousEnv = process.env.NODE_ENV;
  if (value === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = value;
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  try {
    return run();
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
    if (previousEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnv;
  }
}

test('valid session signing and verification round-trips a valid sid', () => {
  withSessionSecret(STRONG_SECRET, 'test', () => {
    const token = signSessionToken({
      userId: 12,
      organizationId: 4,
      role: 'OWNER',
      sid: VALID_SID,
      tv: 3,
    });
    const parsed = verifySessionToken(token);
    assert.equal(parsed?.userId, 12);
    assert.equal(parsed?.organizationId, 4);
    assert.equal(parsed?.role, 'OWNER');
    assert.equal(parsed?.sid, VALID_SID);
  });
});

test('production secret validation rejects missing, weak and placeholder secrets', () => {
  assert.throws(
    () => validateSessionSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    /required/i
  );
  assert.throws(
    () => validateSessionSecret({
      NODE_ENV: 'production',
      SESSION_SECRET: 'too-short',
    } as NodeJS.ProcessEnv),
    /32 bytes/i
  );
  assert.throws(
    () => validateSessionSecret({
      NODE_ENV: 'production',
      SESSION_SECRET: 'pgdesk-dev-session-secret-change-in-production-2026',
    } as NodeJS.ProcessEnv),
    /known placeholder/i
  );
  assert.throws(
    () => validateSessionSecret({
      NODE_ENV: 'production',
      SESSION_SECRET: 'replace-with-32-char-random-secret',
    } as NodeJS.ProcessEnv),
    /known placeholder/i
  );
});

test('production accepts a generated 32-byte canonical base64url secret', () => {
  const secret = crypto.randomBytes(32).toString('base64url');
  const env = {
    NODE_ENV: 'production',
    SESSION_SECRET: secret,
  } as NodeJS.ProcessEnv;

  assert.equal(validateSessionSecret(env), undefined);
  assert.equal(getSessionSecret(env), secret);
});

test('production rejects malformed and non-canonical base64url secrets', () => {
  const secret = crypto.randomBytes(32).toString('base64url');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const lastCharacterIndex = alphabet.indexOf(secret.charAt(secret.length - 1));
  const nonCanonicalLastCharacter = alphabet[(lastCharacterIndex & ~3) | 1];
  const nonCanonical = `${secret.slice(0, -1)}${nonCanonicalLastCharacter}`;

  for (const invalidSecret of [`${secret}=`, `${secret}!`, ` ${secret}`, nonCanonical]) {
    assert.throws(
      () => validateSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: invalidSecret,
      } as NodeJS.ProcessEnv),
      /canonical base64url/i
    );
  }
});

test('production rejects canonical base64url secrets that decode to the wrong length', () => {
  for (const secret of [
    crypto.randomBytes(31).toString('base64url'),
    crypto.randomBytes(33).toString('base64url'),
  ]) {
    assert.throws(
      () => validateSessionSecret({
        NODE_ENV: 'production',
        SESSION_SECRET: secret,
      } as NodeJS.ProcessEnv),
      /exactly 32 bytes/i
    );
  }
});

test('development and test modes generate a cached 32-byte random secret', () => {
  for (const nodeEnv of ['development', 'test']) {
    const first = getSessionSecret({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);
    const second = getSessionSecret({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv);
    assert.equal(first, second);
    assert.ok(Buffer.byteLength(first, 'utf8') >= 32);
  }
});

test('wrong secret rejects a signed token', () => {
  const token = withSessionSecret(STRONG_SECRET, 'test', () =>
    signSessionToken({
      userId: 1,
      organizationId: 1,
      role: 'MANAGER',
      sid: VALID_SID,
    })
  );
  withSessionSecret(STRONG_SECRET + '-different', 'test', () => {
    assert.equal(verifySessionToken(token), null);
  });
});

test('expired and malformed tokens are rejected', () => {
  withSessionSecret(STRONG_SECRET, 'test', () => {
    const expired = signSessionToken(
      {
        userId: 1,
        organizationId: 1,
        role: 'TENANT',
        sid: VALID_SID,
      },
      -1
    );
    assert.equal(verifySessionToken(expired), null);
    assert.equal(verifySessionToken('not-a-token'), null);
    assert.equal(verifySessionToken('bad.signature'), null);
  });
});

test('signature tampering is rejected', () => {
  withSessionSecret(STRONG_SECRET, 'test', () => {
    const token = signSessionToken({
      userId: 1,
      organizationId: 1,
      role: 'TENANT',
      sid: VALID_SID,
    });
    const [body, signature] = token.split('.');
    const replacement = signature[0] === 'A' ? 'B' : 'A';
    assert.equal(verifySessionToken(`${body}.${replacement}${signature.slice(1)}`), null);
  });
});

test('missing and empty sid values are rejected', () => {
  withSessionSecret(STRONG_SECRET, 'test', () => {
    const signRaw = (payload: Record<string, unknown>): string => {
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signature = crypto
        .createHmac('sha256', STRONG_SECRET)
        .update(body)
        .digest('base64url');
      return `${body}.${signature}`;
    };
    const exp = Math.floor(Date.now() / 1000) + 60;
    assert.equal(
      verifySessionToken(signRaw({
        userId: 1,
        organizationId: 1,
        role: 'TENANT',
        exp,
      })),
      null
    );
    assert.equal(
      verifySessionToken(signRaw({
        userId: 1,
        organizationId: 1,
        role: 'TENANT',
        sid: '',
        exp,
      })),
      null
    );
  });
});

test('valid sid format is accepted and invalid sid format is rejected', () => {
  assert.equal(isValidSessionId(VALID_SID), true);
  assert.equal(isValidSessionId(''), false);
  assert.equal(isValidSessionId('session-from-old-token'), false);
  assert.equal(isValidSessionId(undefined), false);
});
