import 'dotenv/config';
import crypto from 'node:crypto';

const SESSION_SECRET =
  process.env.SESSION_SECRET || 'pgdesk-dev-session-secret-change-in-production-2026';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export interface SessionPayload {
  userId: number;
  organizationId: number;
  role: 'ADMIN' | 'OWNER' | 'MANAGER' | 'TENANT';
  tv?: number;
  sid?: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlSeconds = 60 * 60 * 24 * 7): string {
  const full: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
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
