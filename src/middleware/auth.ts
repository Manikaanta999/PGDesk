import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import { isEmailVerificationEnabled } from '../lib/authPolicy.ts';
import { AppUserRole, computeSessionCookiePolicy, isEmbeddedAuthRequest } from '../lib/authRoles.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { signSessionToken, verifySessionToken } from '../lib/security.ts';
import { resolveFirebaseAccount } from './firebaseAuth.ts';

export { canAccessProperty, getAllowedPropertyIds } from './propertyAccess.ts';

export interface AuthUser {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  photoUrl?: string | null;
  role: AppUserRole;
  assignedPropertyIds: number[];
  organizationPropertyIds?: number[];
  tokenVersion?: number;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
  authMethod?: 'SESSION' | 'GOOGLE';
}

export const SESSION_COOKIE_NAME = 'pgdesk_session';
export const GOOGLE_DEMO_ACCESS_REQUIRED_CODE = 'GOOGLE_DEMO_ACCESS_REQUIRED';
export const GOOGLE_DEMO_ACCESS_REQUIRED_MESSAGE =
  'PGDesk is not yet publicly released. Please contact the administrator to request demo access.';

interface AuthResolutionError {
  authError: {
    code: typeof GOOGLE_DEMO_ACCESS_REQUIRED_CODE;
    message: typeof GOOGLE_DEMO_ACCESS_REQUIRED_MESSAGE;
  };
}

function googleDemoAccessRequired(): AuthResolutionError {
  return {
    authError: {
      code: GOOGLE_DEMO_ACCESS_REQUIRED_CODE,
      message: GOOGLE_DEMO_ACCESS_REQUIRED_MESSAGE,
    },
  };
}

export function isCrossOriginIframeRequest(req: Request): boolean {
  return isEmbeddedAuthRequest(
    req.headers as Record<string, string | string[] | undefined>,
    req.get('host') || ''
  );
}

export function getCookieOptions(req: Request) {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  const policy = computeSessionCookiePolicy({
    isProduction: process.env.NODE_ENV === 'production',
    isHttps: Boolean(isHttps),
    isEmbedded: isCrossOriginIframeRequest(req),
  });

  return {
    httpOnly: true,
    sameSite: policy.sameSite,
    secure: policy.secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export function shouldUseCookieOnlyAuth(req: Request): boolean {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';
  return computeSessionCookiePolicy({
    isProduction: process.env.NODE_ENV === 'production',
    isHttps: Boolean(isHttps),
    isEmbedded: isCrossOriginIframeRequest(req),
  }).cookieOnly;
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions(req));
}

export async function issueUserSession(
  req: Request,
  res: Response,
  user: { id: number; organizationId: number; role: AppUserRole; tokenVersion?: number },
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
  if (u.role !== 'OWNER' && u.role !== 'MANAGER' && u.role !== 'TENANT') return null;
  if (isEmailVerificationEnabled() && u.role === 'TENANT' && u.emailVerified === false) return null;
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

async function isSessionRecordActive(userId: number, sessionId: string): Promise<boolean> {
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
): Promise<
  { user: AuthUser; sessionId?: string; authMethod: 'SESSION' | 'GOOGLE' } | AuthResolutionError | null
> {
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
      const firebaseAccount = await resolveFirebaseAccount(
        {
          uid: decoded.uid,
          email: decoded.email,
          emailVerified: decoded.email_verified,
        },
        {
          async findByUid(uid) {
            const [user] = await db.select().from(schema.users).where(eq(schema.users.uid, uid)).limit(1);
            return user ?? null;
          },
          async findByEmail(email) {
            const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
            return user ?? null;
          },
          async linkUnlinkedAccount(userId, email, uid) {
            const [user] = await db
              .update(schema.users)
              .set({ uid, updatedAt: new Date() })
              .where(
                and(
                  eq(schema.users.id, userId),
                  eq(schema.users.email, email),
                  isNull(schema.users.uid),
                  eq(schema.users.isActive, true),
                  inArray(schema.users.role, ['OWNER', 'MANAGER', 'TENANT'])
                )
              )
              .returning();
            return user ?? null;
          },
        }
      );

      if (firebaseAccount.kind === 'REJECTED') return googleDemoAccessRequired();

      const u = firebaseAccount.account;
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
    if ('authError' in resolved) {
      return res.status(403).json({
        code: resolved.authError.code,
        error: resolved.authError.message,
      });
    }
    const organizationPropertyIds =
      resolved.user.role === 'OWNER' || resolved.user.role === 'MANAGER'
        ? await db
            .select({ id: schema.properties.id })
            .from(schema.properties)
            .where(
              and(
                eq(schema.properties.organizationId, resolved.user.organizationId),
                isNull(schema.properties.deletedAt)
              )
            )
            .then((properties) => properties.map((property) => property.id))
        : [];
    req.user = { ...resolved.user, organizationPropertyIds };
    req.sessionId = resolved.sessionId;
    req.authMethod = resolved.authMethod;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

export function requireRole(...allowedRoles: AppUserRole[]) {
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
