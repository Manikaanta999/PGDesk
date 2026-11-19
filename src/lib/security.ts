import crypto from 'node:crypto';

const KNOWN_INSECURE_SESSION_SECRETS = new Set([
  'pgdesk-dev-session-secret-change-in-production-2026',
  'replace-with-32-char-random-secret',
]);

let processLocalSessionSecret: string | null = null;

function validateProductionSessionSecret(secret: string): void {
  if (!secret.trim()) {
    throw new Error('SESSION_SECRET is required in production.');
  }
  if (KNOWN_INSECURE_SESSION_SECRETS.has(secret.trim())) {
    throw new Error('SESSION_SECRET is using a known placeholder value.');
  }

  if (!/^[A-Za-z0-9_-]+$/.test(secret)) {
    throw new Error(
      "SESSION_SECRET must be canonical base64url. Generate it with crypto.randomBytes(32).toString('base64url')."
    );
  }

  const decoded = Buffer.from(secret, 'base64url');
  if (decoded.length !== 32) {
    throw new Error(
      "SESSION_SECRET must decode to exactly 32 bytes. Generate it with crypto.randomBytes(32).toString('base64url')."
    );
  }
  if (decoded.toString('base64url') !== secret) {
    throw new Error(
      "SESSION_SECRET must be canonical base64url. Generate it with crypto.randomBytes(32).toString('base64url')."
    );
  }
}

export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SESSION_SECRET;
  if (configured?.trim()) {
    if (env.NODE_ENV === 'production') {
      validateProductionSessionSecret(configured);
    }
    return configured.trim();
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production.');
  }

  if (!processLocalSessionSecret) {
    processLocalSessionSecret = crypto.randomBytes(32).toString('base64');
  }
  return processLocalSessionSecret;
}

export function validateSessionSecret(env: NodeJS.ProcessEnv = process.env): void {
  getSessionSecret(env);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!password || !storedHash || !storedHash.includes(':')) return false;
  try {
    const [salt, keyHex] = storedHash.split(':');
    if (!salt || !keyHex || keyHex.length % 2 !== 0) return false;
    const derived = crypto.scryptSync(password, salt, 64);
    const keyBuf = Buffer.from(keyHex, 'hex');
    if (derived.length === 0 || derived.length !== keyBuf.length) return false;
    return crypto.timingSafeEqual(derived, keyBuf);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: number;
  organizationId: number;
  role: 'OWNER' | 'MANAGER' | 'TENANT';
  tv?: number;
  sid: string;
  am?: 'SESSION' | 'GOOGLE';
  exp: number;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidSessionId(sessionId: unknown): sessionId is string {
  return typeof sessionId === 'string' && UUID_V4_PATTERN.test(sessionId);
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string {
  if (!isValidSessionId(payload.sid)) {
    throw new Error('A valid UUID session ID is required.');
  }
  const full: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    if (!isValidSessionId(parsed.sid)) return null;
    if (parsed.role !== 'OWNER' && parsed.role !== 'MANAGER' && parsed.role !== 'TENANT') return null;
    if (!Number.isInteger(parsed.userId) || parsed.userId <= 0) return null;
    if (!Number.isInteger(parsed.organizationId) || parsed.organizationId <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Simple sliding-window in-memory rate limiter for auth and public enquiry endpoints
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function isDemoModeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_DEMO_MODE?.trim().toLowerCase() === 'true';
}

export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw.trim()).digest('hex');
}

export function verifyTokenHash(raw: string | null | undefined, storedHash: string | null | undefined): boolean {
  if (!raw || !storedHash) return false;
  const candidate = Buffer.from(hashToken(raw), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  if (candidate.length === 0 || candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

export function verifyCronSecret(authHeader: string | undefined, expectedSecret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!expectedSecret || expectedSecret.trim().length < 8) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const provided = authHeader.slice(7).trim();
  const a = Buffer.from(provided);
  const b = Buffer.from(expectedSecret.trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

