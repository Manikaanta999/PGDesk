import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { signSessionToken, verifySessionToken } from '../lib/security.ts';

export interface AuthUser {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  photoUrl?: string | null;
  role: 'ADMIN' | 'OWNER' | 'MANAGER' | 'TENANT';
  assignedPropertyIds: number[];
  tokenVersion?: number;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
  authMethod?: 'SESSION' | 'GOOGLE';
}

export const SESSION_COOKIE_NAME = 'pgdesk_session';

export function isCrossOriginIframeRequest(req: Request): boolean {
  const secFetchDest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
  if (secFetchDest === 'iframe') return true;
  const reqHost = req.get('host') || '';
  const originHeader = req.headers.origin;
  if (originHeader && reqHost) {
    try {
      const originHost = new URL(originHeader).host;
      if (originHost && originHost !== reqHost) return true;
    } catch {
      // Ignore malformed Origin header
    }
  }
  return false;
}

export function getCookieOptions(req: Request) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  const isIframe = isCrossOriginIframeRequest(req);
  const sameSite: 'none' | 'lax' =
    process.env.NODE_ENV === 'production' && !isIframe
      ? 'lax'
      : isHttps && isIframe
        ? 'none'
        : isHttps
          ? 'none'
          : 'lax';

  return {
    httpOnly: true,
    sameSite,
    secure: Boolean(isHttps),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function shouldUseCookieOnlyAuth(req: Request): boolean {
  return process.env.NODE_ENV === 'production' && !isCrossOriginIframeRequest(req);
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions(req));
}

export async function issueUserSession(
  req: Request,
  res: Response,
  user: { id: number; organizationId: number; role: 'ADMIN' | 'OWNER' | 'MANAGER' | 'TENANT'; tokenVersion?: number },
  existingSessionId?: string
): Promise<{ token: string; cookieOnly: boolean; sessionId: string }> {
  const sessionId = existingSessionId || crypto.randomUUID();
  const ua = String(req.headers['user-agent'] || 'Web Browser').slice(0, 220);
  const ip = String(req.ip || '').slice(0, 80);

  if (!existingSessionId) {
    await db.insert(schema.userSessions).values({
      userId: user.id,
      sessionId,
      userAgent: ua,
      ipAddress: ip,
    });
  } else {
    await db
      .update(schema.userSessions)
      .set({ lastSeenAt: new Date(), revokedAt: null })
      .where(and(eq(schema.userSessions.userId, user.id), eq(schema.userSessions.sessionId, sessionId)));
  }

  const token = signSessionToken({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    tv: user.tokenVersion ?? 1,
    sid: sessionId,
  });
  setSessionCookie(req, res, token);
  const cookieOnly = shouldUseCookieOnlyAuth(req);
  return { token, cookieOnly, sessionId };
}

async function loadUserById(userId: number, expectedTokenVersion?: number): Promise<AuthUser | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const u = rows[0];
  if (!u || !u.isActive) return null;
  if (u.role !== 'ADMIN' && u.emailVerified === false) return null;
  if (expectedTokenVersion !== undefined && expectedTokenVersion !== (u.tokenVersion ?? 1)) {
    return null;
  }
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    photoUrl: u.photoUrl,
    role: u.role,
    assignedPropertyIds: Array.isArray(u.assignedPropertyIds) ? u.assignedPropertyIds : [],
    tokenVersion: u.tokenVersion ?? 1,
  };
}

async function isSessionRecordActive(userId: number, sessionId?: string): Promise<boolean> {
  if (!sessionId) return true;
  const rows = await db
    .select({ id: schema.userSessions.id, revokedAt: schema.userSessions.revokedAt, lastSeenAt: schema.userSessions.lastSeenAt })
    .from(schema.userSessions)
    .where(and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.sessionId, sessionId)))
    .limit(1);

  if (!rows[0] || rows[0].revokedAt) return false;

  // Throttle lastSeenAt updates to every 5 minutes
  if (Date.now() - rows[0].lastSeenAt.getTime() > 5 * 60 * 1000) {
    db.update(schema.userSessions)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(schema.userSessions.id, rows[0].id), isNull(schema.userSessions.revokedAt)))
      .catch(() => {});
  }
  return true;
}

export async function resolveAuthUser(
  req: Request
): Promise<{ user: AuthUser; sessionId?: string; authMethod: 'SESSION' | 'GOOGLE' } | null> {
  // 1. Check Authorization: Bearer <token> (works across iframes & blocked 3P cookies)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) {
      const hmacSession = verifySessionToken(bearerToken);
      if (hmacSession) {
        const user = await loadUserById(hmacSession.userId, hmacSession.tv);
        if (user && (await isSessionRecordActive(user.id, hmacSession.sid))) {
          return { user, sessionId: hmacSession.sid, authMethod: 'SESSION' };
        }
      }
    }
  }

  // 2. Check signed HttpOnly session cookie (Email/Phone + Password or Demo login)
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const session = verifySessionToken(cookieToken);
  if (session) {
    const user = await loadUserById(session.userId, session.tv);
    if (user && (await isSessionRecordActive(user.id, session.sid))) {
      return { user, sessionId: session.sid, authMethod: 'SESSION' };
    }
  }

  // 3. Check Firebase ID Token via Bearer Authorization header (Google Sign-In)
  if (authHeader && authHeader.startsWith('Bearer ') && adminAuth) {
    const idToken = authHeader.slice(7).trim();
    if (!idToken) return null;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      const email = decoded.email || `${decoded.uid}@users.pgdesk.app`;
      const existing = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.uid, decoded.uid))
        .limit(1);

      if (existing[0]) {
        const u = existing[0];
        if (!u.isActive) return null;
        return {
          authMethod: 'GOOGLE',
          user: {
            id: u.id,
            organizationId: u.organizationId,
            name: u.name,
            email: u.email,
            phone: u.phone,
            photoUrl: u.photoUrl,
            role: u.role,
            assignedPropertyIds: Array.isArray(u.assignedPropertyIds) ? u.assignedPropertyIds : [],
            tokenVersion: u.tokenVersion ?? 1,
          },
        };
      }

      const byEmail =
        decoded.email_verified === true
          ? await db
              .select()
              .from(schema.users)
              .where(eq(schema.users.email, email))
              .limit(1)
          : [];

      if (byEmail[0]) {
        if (!byEmail[0].isActive) return null;
        const [updated] = await db
          .update(schema.users)
          .set({ uid: decoded.uid, emailVerified: true, updatedAt: new Date() })
          .where(eq(schema.users.id, byEmail[0].id))
          .returning();
        return {
          authMethod: 'GOOGLE',
          user: {
            id: updated.id,
            organizationId: updated.organizationId,
            name: updated.name,
            email: updated.email,
            phone: updated.phone,
            photoUrl: updated.photoUrl,
            role: updated.role,
            assignedPropertyIds: Array.isArray(updated.assignedPropertyIds)
              ? updated.assignedPropertyIds
              : [],
            tokenVersion: updated.tokenVersion ?? 1,
          },
        };
      }

      // Unknown Google users cannot bypass the owner registration token or create unverified workspaces
      return null;
    } catch (err) {
      console.error('Firebase ID token verification failed:', err);
      return null;
    }
  }

  return null;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveAuthUser(req);
    if (!resolved) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = resolved.user;
    req.sessionId = resolved.sessionId;
    req.authMethod = resolved.authMethod;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

export function requireRole(...allowedRoles: Array<'ADMIN' | 'OWNER' | 'MANAGER' | 'TENANT'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

export function canAccessProperty(user: AuthUser, propertyId: number): boolean {
  if (user.role === 'ADMIN') return false;
  if (user.role === 'OWNER') return true;
  if (user.assignedPropertyIds.length === 0) return true;
  return user.assignedPropertyIds.includes(propertyId);
}

export function getAllowedPropertyIds(user: AuthUser, allPropertyIds: number[]): number[] {
  if (user.role === 'ADMIN') return [];
  if (user.role === 'OWNER' || user.assignedPropertyIds.length === 0) {
    return allPropertyIds;
  }
  return allPropertyIds.filter((id) => user.assignedPropertyIds.includes(id));
}
