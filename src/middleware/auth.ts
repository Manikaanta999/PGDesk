import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.ts';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/security.ts';

export interface AuthUser {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  role: 'OWNER' | 'MANAGER' | 'TENANT';
  assignedPropertyIds: number[];
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const SESSION_COOKIE_NAME = 'pgdesk_session';

async function loadUserById(userId: number): Promise<AuthUser | null> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const u = rows[0];
  if (!u || !u.isActive) return null;
  if (u.role === 'TENANT' && u.emailVerified === false) return null;
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    assignedPropertyIds: Array.isArray(u.assignedPropertyIds) ? u.assignedPropertyIds : [],
  };
}

export async function resolveAuthUser(req: Request): Promise<AuthUser | null> {
  // 1. Check Authorization: Bearer <token> (works across iframes & blocked 3P cookies)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) {
      const hmacSession = verifySessionToken(bearerToken);
      if (hmacSession) {
        const user = await loadUserById(hmacSession.userId);
        if (user) return user;
      }
    }
  }

  // 2. Check signed HttpOnly session cookie (Email/Phone + Password or Demo login)
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const session = verifySessionToken(cookieToken);
  if (session) {
    const user = await loadUserById(session.userId);
    if (user) return user;
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
        return {
          id: u.id,
          organizationId: u.organizationId,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          assignedPropertyIds: Array.isArray(u.assignedPropertyIds) ? u.assignedPropertyIds : [],
        };
      }

      // Check by email or link to seeded organization as OWNER for Google Sign-In workspace onboarding
      const byEmail = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);

      if (byEmail[0]) {
        const [updated] = await db
          .update(schema.users)
          .set({ uid: decoded.uid, updatedAt: new Date() })
          .where(eq(schema.users.id, byEmail[0].id))
          .returning();
        return {
          id: updated.id,
          organizationId: updated.organizationId,
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          role: updated.role,
          assignedPropertyIds: Array.isArray(updated.assignedPropertyIds)
            ? updated.assignedPropertyIds
            : [],
        };
      }

      // Create a fresh Starter workspace for new Google Sign-In owners
      const displayName = decoded.name || email.split('@')[0];
      const orgName = `${displayName}'s Residences`;
      const baseSlug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'pg-workspace';
      const [createdOrg] = await db
        .insert(schema.organizations)
        .values({
          name: orgName,
          slug: `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`,
          upiId: `${baseSlug.replace(/-/g, '').slice(0, 16) || 'pgdesk'}@okicici`,
          upiPayeeName: orgName,
          planTier: 'STARTER',
          phone: '+91 00000 00000',
          email,
          address: 'India',
        })
        .returning();

      const [upserted] = await db
        .insert(schema.users)
        .values({
          uid: decoded.uid,
          organizationId: createdOrg.id,
          name: displayName,
          email,
          role: 'OWNER',
          assignedPropertyIds: [],
          isActive: true,
        })
        .onConflictDoUpdate({
          target: schema.users.email,
          set: { uid: decoded.uid, updatedAt: new Date() },
        })
        .returning();

      return {
        id: upserted.id,
        organizationId: upserted.organizationId,
        name: upserted.name,
        email: upserted.email,
        phone: upserted.phone,
        role: upserted.role,
        assignedPropertyIds: Array.isArray(upserted.assignedPropertyIds)
          ? upserted.assignedPropertyIds
          : [],
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
    const user = await resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication check failed' });
  }
}

export function requireRole(...allowedRoles: Array<'OWNER' | 'MANAGER' | 'TENANT'>) {
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
  if (user.role === 'OWNER') return true;
  if (user.assignedPropertyIds.length === 0) return true;
  return user.assignedPropertyIds.includes(propertyId);
}

export function getAllowedPropertyIds(user: AuthUser, allPropertyIds: number[]): number[] {
  if (user.role === 'OWNER' || user.assignedPropertyIds.length === 0) {
    return allPropertyIds;
  }
  return allPropertyIds.filter((id) => user.assignedPropertyIds.includes(id));
}
