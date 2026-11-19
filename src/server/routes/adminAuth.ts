import { Router } from 'express';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { canAdminResetUserPassword } from '../../lib/authPolicy.ts';
import { checkRateLimit, hashPassword } from '../../lib/security.ts';
import { adminResetPasswordSchema } from '../../lib/validation.ts';
import { AuthRequest, requireAuth, requireRole } from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';

export const adminAuthRouter = Router();

/**
 * List resettable accounts (MANAGER and TENANT) inside the authenticated OWNER's organization.
 * Never exposes password hashes, reset tokens, or users from other organizations.
 */
adminAuthRouter.get('/users', requireAuth, requireRole('OWNER'), async (req: AuthRequest, res) => {
  try {
    const actor = req.user!;
    const rows = await db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        phone: schema.users.phone,
        role: schema.users.role,
        isActive: schema.users.isActive,
        passwordHash: schema.users.passwordHash,
        lastLoginAt: schema.users.lastLoginAt,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.organizationId, actor.organizationId),
          inArray(schema.users.role, ['MANAGER', 'TENANT'])
        )
      )
      .orderBy(asc(schema.users.role), asc(schema.users.name));

    return res.json({
      users: rows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isActive: u.isActive,
        hasPassword: Boolean(u.passwordHash),
        lastLoginAt: u.lastLoginAt,
      })),
    });
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    return res.status(500).json({ error: 'Failed to load organization accounts' });
  }
});

/**
 * Organization administrator-only password reset for MANAGER and TENANT accounts
 * within the authenticated OWNER's own organization.
 */
adminAuthRouter.post('/users/:userId/reset-password', requireAuth, requireRole('OWNER'), async (req: AuthRequest, res) => {
  try {
    const actor = req.user!;
    if (!checkRateLimit(`admin-reset:${actor.id}`, 20, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many admin reset requests. Please try again shortly.' });
    }

    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const parsed = adminResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password' });
    }

    const [target] = await db
      .select()
      .from(schema.users)
      .where(and(eq(schema.users.id, targetUserId), eq(schema.users.organizationId, actor.organizationId)))
      .limit(1);

    if (!target) {
      return res.status(404).json({ error: 'Account not found in your organization' });
    }

    if (target.role === 'ADMIN') {
      return res.status(403).json({
        error: 'Administrators can only reset passwords for Managers and Residents within their own organization.',
      });
    }

    const allowed = canAdminResetUserPassword({
      actorRole: actor.role,
      actorOrgId: actor.organizationId,
      actorUserId: actor.id,
      targetRole: target.role,
      targetOrgId: target.organizationId,
      targetUserId: target.id,
    });

    if (!allowed) {
      return res.status(403).json({
        error: 'Administrators can only reset passwords for Managers and Residents within their own organization.',
      });
    }

    const nextVersion = (target.tokenVersion ?? 1) + 1;
    await db
      .update(schema.users)
      .set({
        passwordHash: hashPassword(parsed.data.newPassword),
        emailVerified: true,
        otpCodeHash: null,
        otpExpiresAt: null,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        tokenVersion: nextVersion,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.users.id, target.id), eq(schema.users.organizationId, actor.organizationId)));

    await db
      .update(schema.userSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.userSessions.userId, target.id), isNull(schema.userSessions.revokedAt)));

    await logAudit({
      user: actor,
      action: 'ADMIN_PASSWORD_RESET',
      entityType: 'USER',
      entityId: target.id,
      metadata: {
        targetEmail: target.email,
        targetRole: target.role,
      },
    });

    return res.json({
      ok: true,
      message: `Temporary password set for ${target.name}. Active sessions for this account have been signed out.`,
    });
  } catch (err) {
    console.error('POST /api/admin/users/:userId/reset-password error:', err);
    return res.status(500).json({ error: 'Failed to reset user password' });
  }
});
