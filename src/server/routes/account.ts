import { Router } from 'express';
import { and, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import {
  getAuthTestingPolicy,
  isEmailVerificationEnabled,
  isSmsOtpEnabled,
  shouldRequireCurrentPasswordOnUpdate,
} from '../../lib/authPolicy.ts';
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
  requestPhoneChangeSchema,
  setOrResetPasswordSchema,
  updateAccountProfileSchema,
  updateNotificationPrefsSchema,
} from '../../lib/validation.ts';
import { AuthRequest, issueUserSession, requireAuth } from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';

export const accountRouter = Router();

const SECURITY_LOG_ACTIONS = [
  'PASSWORD_SET',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'ADMIN_PASSWORD_RESET',
  'EMAIL_CHANGED',
  'PHONE_CHANGED',
  'OTHER_SESSIONS_REVOKED',
  'ACCOUNT_PROFILE_UPDATED',
  'OWNER_REGISTERED',
  'TENANT_OTP_VERIFIED',
  'NOTIFICATION_PREFS_UPDATED',
  'STUDENT_MOVE_OUT_REQUESTED',
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
        lastLoginAt: dbUser.lastLoginAt,
        notificationPrefs: sanitizeNotificationPrefs(dbUser.notificationPrefs),
        pendingEmail: dbUser.pendingEmail || null,
        pendingPhone: dbUser.pendingPhone || null,
        hasPassword: Boolean(dbUser.passwordHash),
        hasGoogleAuth: Boolean(dbUser.uid),
        signedInWithGoogle: req.authMethod === 'GOOGLE',
        canResetWithoutCurrentPassword: !shouldRequireCurrentPasswordOnUpdate({
          hasPassword: Boolean(dbUser.passwordHash),
          authMethod: req.authMethod,
        }),
      },
      authPolicy: getAuthTestingPolicy(),
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

    const requireCurrentPassword = shouldRequireCurrentPasswordOnUpdate({
      hasPassword: Boolean(dbUser.passwordHash),
      authMethod: req.authMethod,
    });
    const parsed = requireCurrentPassword
      ? changePasswordSchema.safeParse(req.body)
      : setOrResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password input' });
    }

    if (requireCurrentPassword) {
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

    const sessionResult = await issueUserSession(
      req,
      res,
      {
        id: updatedUser.id,
        organizationId: updatedUser.organizationId,
        role: authUser.role,
        tokenVersion: updatedUser.tokenVersion ?? 1,
      },
      req.sessionId
    );

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

    if (!isEmailVerificationEnabled()) {
      await db
        .update(schema.users)
        .set({
          email: nextEmail,
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
          .set({ email: nextEmail, updatedAt: new Date() })
          .where(and(eq(schema.tenants.userId, dbUser.id), isNull(schema.tenants.deletedAt)));
      }

      await logAudit({
        user: authUser,
        action: 'EMAIL_CHANGED',
        entityType: 'USER',
        entityId: dbUser.id,
        metadata: { newEmail: nextEmail },
      });

      return res.json({
        ok: true,
        directUpdate: true,
        email: nextEmail,
        message: 'Email address updated.',
      });
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

    return res.json({
      ok: true,
      pendingEmail: nextEmail,
      message: `A 6-digit verification code has been sent to ${nextEmail}. Enter it below to confirm your new email.`,
    });
  } catch (err) {
    console.error('POST /api/account/email-change/request error:', err);
    return res.status(500).json({ error: 'Failed to update email address' });
  }
});

accountRouter.post('/email-change/confirm', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!isEmailVerificationEnabled()) {
      return res.status(410).json({ error: 'Email verification is disabled during testing.' });
    }
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

accountRouter.post('/phone-change/request', requireAuth, async (req: AuthRequest, res) => {
  try {
    const authUser = req.user!;
    if (!checkRateLimit(`chg-phone:${authUser.id}`, 8, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many mobile change requests. Try again shortly.' });
    }

    const parsed = requestPhoneChangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid mobile number' });
    }

    const nextPhone = normalizePhone10(parsed.data.newPhone);
    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, authUser.id)).limit(1);
    if (!dbUser) return res.status(404).json({ error: 'Account not found' });

    if (dbUser.passwordHash && !verifyPassword(parsed.data.currentPassword || '', dbUser.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    if (nextPhone === normalizePhone10(dbUser.phone || '')) {
      return res.status(400).json({ error: 'New mobile number is the same as your current number' });
    }

    if (!isSmsOtpEnabled()) {
      await db
        .update(schema.users)
        .set({
          phone: nextPhone,
          pendingPhone: null,
          pendingPhoneCodeHash: null,
          pendingPhoneExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, dbUser.id));

      if (dbUser.role === 'TENANT') {
        await db
          .update(schema.tenants)
          .set({ phone: nextPhone, updatedAt: new Date() })
          .where(and(eq(schema.tenants.userId, dbUser.id), isNull(schema.tenants.deletedAt)));
      }

      await logAudit({
        user: authUser,
        action: 'PHONE_CHANGED',
        entityType: 'USER',
        entityId: dbUser.id,
        metadata: { newPhone: nextPhone },
      });

      return res.json({
        ok: true,
        directUpdate: true,
        phone: nextPhone,
        message: 'Mobile number updated.',
      });
    }

    const code = generateSixDigitOtp();
    await db
      .update(schema.users)
      .set({
        pendingPhone: nextPhone,
        pendingPhoneCodeHash: hashToken(code),
        pendingPhoneExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, dbUser.id));

    return res.json({
      ok: true,
      pendingPhone: nextPhone,
      message: `A 6-digit verification code has been sent to +91 ${nextPhone}. Enter it below to confirm your new number.`,
    });
  } catch (err) {
    console.error('POST /api/account/phone-change/request error:', err);
    return res.status(500).json({ error: 'Failed to update mobile number' });
  }
});

accountRouter.post('/phone-change/confirm', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!isSmsOtpEnabled()) {
      return res.status(410).json({ error: 'SMS OTP verification is disabled during testing.' });
    }
    const authUser = req.user!;
    const parsed = confirmCodeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter the 6-digit code' });
    }

    const [dbUser] = await db.select().from(schema.users).where(eq(schema.users.id, authUser.id)).limit(1);
    if (
      !dbUser ||
      !dbUser.pendingPhone ||
      !dbUser.pendingPhoneCodeHash ||
      !dbUser.pendingPhoneExpiresAt ||
      dbUser.pendingPhoneExpiresAt.getTime() < Date.now() ||
      !verifyTokenHash(parsed.data.code, dbUser.pendingPhoneCodeHash)
    ) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    const newPhone = dbUser.pendingPhone;
    await db
      .update(schema.users)
      .set({
        phone: newPhone,
        pendingPhone: null,
        pendingPhoneCodeHash: null,
        pendingPhoneExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, dbUser.id));

    if (dbUser.role === 'TENANT') {
      await db
        .update(schema.tenants)
        .set({ phone: newPhone, updatedAt: new Date() })
        .where(and(eq(schema.tenants.userId, dbUser.id), isNull(schema.tenants.deletedAt)));
    }

    await logAudit({
      user: authUser,
      action: 'PHONE_CHANGED',
      entityType: 'USER',
      entityId: dbUser.id,
      metadata: { newPhone },
    });

    return res.json({ ok: true, phone: newPhone, message: 'Mobile number verified and updated.' });
  } catch (err) {
    console.error('POST /api/account/phone-change/confirm error:', err);
    return res.status(500).json({ error: 'Failed to verify new mobile number' });
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

    const sessionResult = await issueUserSession(
      req,
      res,
      {
        id: updatedUser.id,
        organizationId: updatedUser.organizationId,
        role: authUser.role,
        tokenVersion: updatedUser.tokenVersion ?? 1,
      },
      req.sessionId
    );

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
