import { Router } from 'express';
import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import {
  checkRateLimit,
  generateSixDigitOtp,
  hashPassword,
  hashToken,
  verifyPassword,
  verifyTokenHash,
} from '../../lib/security.ts';
import { sanitizeNotificationPrefs } from '../../lib/studentPortalHelpers.ts';
import {
  changePasswordSchema,
  confirmCodeSchema,
  requestEmailChangeSchema,
  setOrResetPasswordSchema,
  updateAccountProfileSchema,
  updateDirectPhoneSchema,
  updateNotificationPrefsSchema,
} from '../../lib/validation.ts';
import { AuthRequest, issueUserSession, requireAuth } from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';

export const accountRouter = Router();

const SECURITY_LOG_ACTIONS = [
  'PASSWORD_SET',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'EMAIL_CHANGED',
  'EMAIL_VERIFIED',
  'PHONE_UPDATED',
  'OTHER_SESSIONS_REVOKED',
  'ACCOUNT_PROFILE_UPDATED',
  'OWNER_REGISTERED',
  'NOTIFICATION_PREFS_UPDATED',
  'STUDENT_MOVE_OUT_REQUESTED',
  'ADMIN_LOGIN',
];

function normalizePhone10(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.slice(-10);
}

accountRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    const [dbUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, authUser.id))
      .limit(1);

    if (!dbUser) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const [sessions, securityLogs] = await Promise.all([
      db
        .select()
        .from(schema.userSessions)
        .where(and(eq(schema.userSessions.userId, dbUser.id), isNull(schema.userSessions.revokedAt)))
        .orderBy(desc(schema.userSessions.lastSeenAt))
        .limit(15),
      db
        .select()
        .from(schema.auditLogs)
        .where(
          and(
            eq(schema.auditLogs.organizationId, dbUser.organizationId),
            inArray(schema.auditLogs.action, SECURITY_LOG_ACTIONS),
            or(
              eq(schema.auditLogs.actorUserId, dbUser.id),
              and(eq(schema.auditLogs.entityType, 'USER'), eq(schema.auditLogs.entityId, String(dbUser.id)))
            )
          )
        )
        .orderBy(desc(schema.auditLogs.createdAt))
        .limit(15),
    ]);

    return res.json({
      profile: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone || '',
        photoUrl: dbUser.photoUrl || null,
        role: dbUser.role,
        emailVerified: dbUser.emailVerified,
        phoneVerified: dbUser.phoneVerified,
        lastLoginAt: dbUser.lastLoginAt,
        notificationPrefs: sanitizeNotificationPrefs(dbUser.notificationPrefs),
        pendingEmail: dbUser.pendingEmail || null,
        hasPassword: Boolean(dbUser.passwordHash),
        hasGoogleAuth: Boolean(dbUser.uid),
        signedInWithGoogle: req.authMethod === 'GOOGLE',
        canResetWithoutCurrentPassword: !dbUser.passwordHash || req.authMethod === 'GOOGLE',
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        sessionId: s.sessionId,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        isCurrent: Boolean(req.sessionId && s.sessionId === req.sessionId),
      })),
      securityLogs: securityLogs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entityType,
        createdAt: l.createdAt,
      })),
    });
  } catch (err) {
    console.error('GET /api/account error:', err);
    return res.status(500).json({ error: 'Failed to load account settings' });
  }
});

accountRouter.patch('/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    const parsed = updateAccountProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile data' });
    }

    const [updated] = await db
      .update(schema.users)
      .set({
        name: parsed.data.name,
        ...(parsed.data.photoUrl !== undefined ? { photoUrl: parsed.data.photoUrl || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, authUser.id))
      .returning();

    if (authUser.role === 'TENANT') {
      await db
        .update(schema.tenants)
        .set({
          name: parsed.data.name,
          ...(parsed.data.photoUrl !== undefined ? { photoUrl: parsed.data.photoUrl || null } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(schema.tenants.userId, authUser.id), isNull(schema.tenants.deletedAt)));
    }

    await logAudit({
      user: authUser,
      action: 'ACCOUNT_PROFILE_UPDATED',
      entityType: 'USER',
      entityId: authUser.id,
    });

    return res.json({
      profile: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone || '',
        photoUrl: updated.photoUrl || null,
        role: updated.role,
      },
    });
  } catch (err) {
    console.error('PATCH /api/account/profile error:', err);
    return res.status(500).json({ error: 'Failed to update personal profile' });
  }
});

accountRouter.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    if (!checkRateLimit(`chg-pwd:${authUser.id}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many password change attempts. Please wait a few minutes.' });
    }

    const [dbUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, authUser.id))
      .limit(1);

    if (!dbUser) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const allowDirectReset = !dbUser.passwordHash || req.authMethod === 'GOOGLE';
    const parsed = allowDirectReset
      ? setOrResetPasswordSchema.safeParse(req.body)
      : changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input' });
    }

    if (!allowDirectReset) {
      if (!dbUser.passwordHash || !verifyPassword(parsed.data.currentPassword || '', dbUser.passwordHash)) {
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }

    const hadPassword = Boolean(dbUser.passwordHash);
    const nextVersion = (dbUser.tokenVersion ?? 1) + 1;
    const [updatedUser] = await db
      .update(schema.users)
      .set({
        passwordHash: hashPassword(parsed.data.newPassword),
        emailVerified: true,
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        tokenVersion: nextVersion,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, dbUser.id))
      .returning();

    // Revoke all other active sessions while keeping the current session signed in
    if (req.sessionId) {
      await db
        .update(schema.userSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.userSessions.userId, dbUser.id),
            ne(schema.userSessions.sessionId, req.sessionId),
            isNull(schema.userSessions.revokedAt)
          )
        );
    } else {
      await db
        .update(schema.userSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.userSessions.userId, dbUser.id), isNull(schema.userSessions.revokedAt)));
    }

    const sessionResult = await issueUserSession(req, res, updatedUser, req.sessionId);

    await logAudit({
      user: authUser,
      action: !hadPassword ? 'PASSWORD_SET' : req.authMethod === 'GOOGLE' ? 'PASSWORD_RESET' : 'PASSWORD_CHANGED',
      entityType: 'USER',
      entityId: dbUser.id,
    });

    return res.json({
      ok: true,
      message: !hadPassword
        ? 'Account password created. You can now sign in with Google or your password.'
        : 'Password updated and other devices have been logged out.',
      token: sessionResult.cookieOnly ? undefined : sessionResult.token,
      cookieOnly: sessionResult.cookieOnly,
    });
  } catch (err) {
    console.error('POST /api/account/change-password error:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

accountRouter.post('/email-change/request', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    if (!checkRateLimit(`chg-email:${authUser.id}`, 8, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many email change requests. Try again shortly.' });
    }

    const parsed = requestEmailChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid email request' });
    }

    const nextEmail = parsed.data.newEmail.trim().toLowerCase();
    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, authUser.id)).limit(1);
    if (!dbUser) return res.status(404).json({ error: 'Account not found' });

    if (dbUser.passwordHash && !verifyPassword(parsed.data.currentPassword || '', dbUser.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (nextEmail === dbUser.email.toLowerCase()) {
      return res.status(400).json({ error: 'New email is the same as your current email' });
    }

    const [conflict] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(eq(schema.users.email, nextEmail), ne(schema.users.id, dbUser.id)))
      .limit(1);
    if (conflict) {
      return res.status(409).json({ error: 'That email address is already registered to another account' });
    }

    const code = generateSixDigitOtp();
    await db
      .update(schema.users)
      .set({
        pendingEmail: nextEmail,
        pendingEmailCodeHash: hashToken(code),
        pendingEmailExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, dbUser.id));

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[PGDesk Auth] Email change verification code for user #${dbUser.id}: ${code}`);
    }

    return res.json({
      ok: true,
      pendingEmail: nextEmail,
      message: `A 6-digit verification code has been sent to ${nextEmail}. Enter it below to confirm your new email.`,
    });
  } catch (err) {
    console.error('POST /api/account/email-change/request error:', err);
    return res.status(500).json({ error: 'Failed to start email change verification' });
  }
});

accountRouter.post('/email-change/confirm', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    const parsed = confirmCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter the 6-digit code' });
    }

    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, authUser.id)).limit(1);
    if (
      !dbUser ||
      !dbUser.pendingEmail ||
      !dbUser.pendingEmailCodeHash ||
      !dbUser.pendingEmailExpiresAt ||
      dbUser.pendingEmailExpiresAt.getTime() < Date.now() ||
      !verifyTokenHash(parsed.data.code, dbUser.pendingEmailCodeHash)
    ) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    const newEmail = dbUser.pendingEmail;
    await db
      .update(schema.users)
      .set({
        email: newEmail,
        emailVerified: true,
        pendingEmail: null,
        pendingEmailCodeHash: null,
        pendingEmailExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, dbUser.id));

    if (dbUser.role === 'TENANT') {
      await db
        .update(schema.tenants)
        .set({ email: newEmail, updatedAt: new Date() })
        .where(and(eq(schema.tenants.userId, dbUser.id), isNull(schema.tenants.deletedAt)));
    }

    await logAudit({
      user: authUser,
      action: 'EMAIL_CHANGED',
      entityType: 'USER',
      entityId: dbUser.id,
      metadata: { newEmail },
    });

    return res.json({ ok: true, email: newEmail, message: 'Email address verified and updated.' });
  } catch (err) {
    console.error('POST /api/account/email-change/confirm error:', err);
    return res.status(500).json({ error: 'Failed to verify new email address' });
  }
});

accountRouter.patch('/phone', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    const parsed = updateDirectPhoneSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid mobile number' });
    }

    const nextPhone = normalizePhone10(parsed.data.phone);
    await db
      .update(schema.users)
      .set({
        phone: nextPhone,
        phoneVerified: false,
        pendingPhone: null,
        pendingPhoneCodeHash: null,
        pendingPhoneExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, authUser.id));

    if (authUser.role === 'TENANT') {
      await db
        .update(schema.tenants)
        .set({ phone: nextPhone, updatedAt: new Date() })
        .where(and(eq(schema.tenants.userId, authUser.id), isNull(schema.tenants.deletedAt)));
    }

    await logAudit({
      user: authUser,
      action: 'PHONE_UPDATED',
      entityType: 'USER',
      entityId: authUser.id,
      metadata: { phoneVerified: false },
    });

    return res.json({
      ok: true,
      phone: nextPhone,
      phoneVerified: false,
      message: 'Mobile number updated (stored as unverified contact number).',
    });
  } catch (err) {
    console.error('PATCH /api/account/phone error:', err);
    return res.status(500).json({ error: 'Failed to update mobile number' });
  }
});

accountRouter.patch('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    const parsed = updateNotificationPrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid notification preferences' });
    }

    const sanitized = sanitizeNotificationPrefs(parsed.data);
    await db
      .update(schema.users)
      .set({ notificationPrefs: sanitized, updatedAt: new Date() })
      .where(eq(schema.users.id, authUser.id));

    return res.json({ notificationPrefs: sanitized });
  } catch (err) {
    console.error('PATCH /api/account/notifications error:', err);
    return res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

accountRouter.post('/sessions/revoke-others', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, authUser.id)).limit(1);
    if (!dbUser) return res.status(404).json({ error: 'Account not found' });

    const nextVersion = (dbUser.tokenVersion ?? 1) + 1;
    const [updatedUser] = await db
      .update(schema.users)
      .set({ tokenVersion: nextVersion, updatedAt: new Date() })
      .where(eq(schema.users.id, dbUser.id))
      .returning();

    if (req.sessionId) {
      await db
        .update(schema.userSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.userSessions.userId, dbUser.id),
            ne(schema.userSessions.sessionId, req.sessionId),
            isNull(schema.userSessions.revokedAt)
          )
        );
    } else {
      await db
        .update(schema.userSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.userSessions.userId, dbUser.id), isNull(schema.userSessions.revokedAt)));
    }

    const sessionResult = await issueUserSession(req, res, updatedUser, req.sessionId);

    await logAudit({
      user: authUser,
      action: 'OTHER_SESSIONS_REVOKED',
      entityType: 'USER',
      entityId: dbUser.id,
    });

    return res.json({
      ok: true,
      message: 'All other active sessions have been logged out.',
      token: sessionResult.cookieOnly ? undefined : sessionResult.token,
      cookieOnly: sessionResult.cookieOnly,
    });
  } catch (err) {
    console.error('POST /api/account/sessions/revoke-others error:', err);
    return res.status(500).json({ error: 'Failed to revoke other sessions' });
  }
});
