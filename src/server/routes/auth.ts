import { Request, Response, Router } from 'express';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { ensureSeeded } from '../../db/seed.ts';
import {
  isValidOwnerTokenFormat,
  normalizeTokenCode,
  resolveOwnerTokenStatus,
} from '../../lib/platformAuth.ts';
import {
  checkRateLimit,
  generateSixDigitOtp,
  hashPassword,
  hashToken,
  isDemoModeEnabled,
  verifyPassword,
  verifyTokenHash,
} from '../../lib/security.ts';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../../lib/validation.ts';
import {
  getCookieOptions,
  issueUserSession,
  resolveAuthUser,
  SESSION_COOKIE_NAME,
} from '../../middleware/auth.ts';
import { ensureAdminBootstrapped, ensurePlatformOrg } from '../adminBootstrap.ts';
import { logAudit } from '../audit.ts';

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const authRouter = Router();

function normalizePhone10(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits.slice(-10);
}

function serializeSessionUser(u: {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  photoUrl?: string | null;
  role: 'ADMIN' | 'OWNER' | 'MANAGER' | 'TENANT';
  assignedPropertyIds: number[];
}) {
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    photoUrl: u.photoUrl ?? null,
    role: u.role,
    assignedPropertyIds: Array.isArray(u.assignedPropertyIds) ? u.assignedPropertyIds : [],
  };
}

authRouter.get('/config', (_req, res) => {
  return res.json({ demoModeEnabled: isDemoModeEnabled() });
});

authRouter.get('/me', async (req, res) => {
  try {
    await ensureSeeded();
    await ensureAdminBootstrapped();
    const demoModeEnabled = isDemoModeEnabled();
    const resolved = await resolveAuthUser(req);
    const user = resolved?.user ?? null;
    if (!user) {
      return res.json({ user: null, demoModeEnabled });
    }
    if (user.role === 'ADMIN') {
      return res.json({ user: serializeSessionUser(user), organization: null, demoModeEnabled });
    }
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);
    return res.json({ user: serializeSessionUser(user), organization: org || null, demoModeEnabled });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ error: 'Failed to resolve session' });
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    await ensureSeeded();
    await ensureAdminBootstrapped();
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`register:${ip}`, 15, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many signup attempts. Please try again shortly.' });
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
    }

    const emailLower = parsed.data.email.trim().toLowerCase();
    const rawPhone10 = normalizePhone10(parsed.data.phone);
    const phone10 = rawPhone10.length === 10 ? rawPhone10 : null;
    const passwordHash = hashPassword(parsed.data.password);
    const role: 'OWNER' | 'TENANT' = parsed.data.accountType;

    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    if (existing[0]) {
      return res.status(409).json({
        error: 'An account with this email already exists. Please sign in instead.',
      });
    }

    const verificationCode = generateSixDigitOtp();
    const verificationExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    if (role === 'OWNER') {
      const normalizedToken = normalizeTokenCode(parsed.data.ownerRegistrationToken);
      if (!isValidOwnerTokenFormat(normalizedToken)) {
        return res.status(400).json({
          error: 'Invalid Owner Registration Token format. Expected PGDESKOWNER-XXXX-XXXX-XXXX.',
        });
      }

      const tokenHash = hashToken(normalizedToken);
      const txResult = await db.transaction(async (tx) => {
        // Atomic single-use redemption: only UNUSED and non-expired tokens can be redeemed once
        const [redeemedToken] = await tx
          .update(schema.ownerRegistrationTokens)
          .set({
            status: 'USED',
            usedAt: new Date(),
          })
          .where(
            and(
              eq(schema.ownerRegistrationTokens.tokenHash, tokenHash),
              eq(schema.ownerRegistrationTokens.status, 'UNUSED'),
              gt(schema.ownerRegistrationTokens.expiresAt, new Date())
            )
          )
          .returning();

        if (!redeemedToken) {
          const [matched] = await tx
            .select()
            .from(schema.ownerRegistrationTokens)
            .where(eq(schema.ownerRegistrationTokens.tokenHash, tokenHash))
            .limit(1);
          if (!matched) {
            return { errorStatus: 403, errorMessage: 'Invalid Owner Registration Token.' } as const;
          }
          const effectiveStatus = resolveOwnerTokenStatus(matched);
          if (effectiveStatus === 'USED') {
            return { errorStatus: 403, errorMessage: 'This Owner Registration Token has already been used.' } as const;
          }
          if (effectiveStatus === 'REVOKED') {
            return { errorStatus: 403, errorMessage: 'This Owner Registration Token has been revoked.' } as const;
          }
          return { errorStatus: 403, errorMessage: 'This Owner Registration Token has expired.' } as const;
        }

        const orgName = parsed.data.organizationName.trim();
        const baseSlug = toSlug(orgName) || 'pg-group';
        const uniqueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
        const upiHandle = `${baseSlug.replace(/-/g, '').slice(0, 16) || 'pgdesk'}@okicici`;

        const [createdOrg] = await tx
          .insert(schema.organizations)
          .values({
            name: orgName,
            slug: uniqueSlug,
            upiId: upiHandle,
            upiPayeeName: orgName,
            planTier: 'STARTER',
            phone: phone10 ? `+91 ${phone10.slice(0, 5)} ${phone10.slice(5)}` : '',
            email: emailLower,
            address: 'India',
          })
          .returning();

        const [createdUser] = await tx
          .insert(schema.users)
          .values({
            organizationId: createdOrg.id,
            name: parsed.data.name.trim(),
            email: emailLower,
            phone: phone10,
            passwordHash,
            role: 'OWNER',
            assignedPropertyIds: [],
            isActive: true,
            emailVerified: false,
            phoneVerified: false,
            emailVerificationTokenHash: hashToken(verificationCode),
            emailVerificationExpiresAt: verificationExpiresAt,
          })
          .returning();

        await tx
          .update(schema.ownerRegistrationTokens)
          .set({
            usedByUserId: createdUser.id,
            usedByOrganizationId: createdOrg.id,
          })
          .where(eq(schema.ownerRegistrationTokens.id, redeemedToken.id));

        await tx.insert(schema.auditLogs).values([
          {
            organizationId: createdOrg.id,
            actorUserId: createdUser.id,
            actorName: createdUser.name,
            actorRole: 'OWNER',
            action: 'OWNER_TOKEN_REDEEMED',
            entityType: 'OWNER_TOKEN',
            entityId: String(redeemedToken.id),
            metadata: { tokenLast4: redeemedToken.tokenLast4 },
          },
          {
            organizationId: createdOrg.id,
            actorUserId: createdUser.id,
            actorName: createdUser.name,
            actorRole: 'OWNER',
            action: 'OWNER_REGISTERED',
            entityType: 'ORGANIZATION',
            entityId: String(createdOrg.id),
            metadata: { organizationName: createdOrg.name },
          },
        ]);

        return { ok: true, createdUser, createdOrg } as const;
      });

      if ('errorStatus' in txResult && txResult.errorStatus) {
        return res.status(txResult.errorStatus).json({ error: txResult.errorMessage });
      }

      if (process.env.NODE_ENV !== 'production') {
        console.info(`[PGDesk Email Verification] Owner verification code for ${emailLower}: ${verificationCode}`);
      }

      return res.status(202).json({
        requiresEmailVerification: true,
        email: emailLower,
        message: 'Owner account created. Enter the 6-digit verification code sent to your email address.',
      });
    }

    // Student / Tenant self-registration: assign to platform org with zero auto-linked tenant records
    const platformOrg = await ensurePlatformOrg();
    const [createdStudent] = await db
      .insert(schema.users)
      .values({
        organizationId: platformOrg.id,
        name: parsed.data.name.trim(),
        email: emailLower,
        phone: phone10,
        passwordHash,
        role: 'TENANT',
        assignedPropertyIds: [],
        isActive: true,
        emailVerified: false,
        phoneVerified: false,
        emailVerificationTokenHash: hashToken(verificationCode),
        emailVerificationExpiresAt: verificationExpiresAt,
      })
      .returning();

    await logAudit({
      user: serializeSessionUser(createdStudent),
      action: 'STUDENT_ACCOUNT_REGISTERED',
      entityType: 'USER',
      entityId: createdStudent.id,
      metadata: { email: emailLower },
    });

    if (process.env.NODE_ENV !== 'production') {
      console.info(`[PGDesk Email Verification] Student verification code for ${emailLower}: ${verificationCode}`);
    }

    return res.status(202).json({
      requiresEmailVerification: true,
      email: emailLower,
      message: 'Account created. Enter the 6-digit verification code sent to your email address.',
    });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    return res.status(500).json({ error: 'Account registration failed' });
  }
});

authRouter.post('/verify-email', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`verify-email:${ip}`, 20, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many verification attempts. Please wait a few minutes.' });
    }

    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid verification code' });
    }

    const emailLower = parsed.data.email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    if (!user || !user.isActive || !user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired email verification code' });
    }
    if (
      user.emailVerificationExpiresAt.getTime() < Date.now() ||
      !verifyTokenHash(parsed.data.code, user.emailVerificationTokenHash)
    ) {
      return res.status(400).json({ error: 'Invalid or expired email verification code' });
    }

    const [verifiedUser] = await db
      .update(schema.users)
      .set({
        emailVerified: true,
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id))
      .returning();

    await logAudit({
      user: serializeSessionUser(verifiedUser),
      action: 'EMAIL_VERIFIED',
      entityType: 'USER',
      entityId: verifiedUser.id,
      metadata: { email: verifiedUser.email },
    });

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, verifiedUser.organizationId))
      .limit(1);

    const { token, cookieOnly } = await issueUserSession(req, res, verifiedUser);

    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: serializeSessionUser(verifiedUser),
      organization: verifiedUser.role === 'ADMIN' ? null : org || null,
    });
  } catch (err) {
    console.error('POST /api/auth/verify-email error:', err);
    return res.status(500).json({ error: 'Email verification failed' });
  }
});

authRouter.post('/resend-verification', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`resend-verify:${ip}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many verification requests. Please wait a few minutes.' });
    }

    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter a valid email address' });
    }

    const emailLower = parsed.data.email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    if (user && user.isActive && !user.emailVerified) {
      const code = generateSixDigitOtp();
      await db
        .update(schema.users)
        .set({
          emailVerificationTokenHash: hashToken(code),
          emailVerificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));

      if (process.env.NODE_ENV !== 'production') {
        console.info(`[PGDesk Email Verification] Resent code for ${emailLower}: ${code}`);
      }
    }

    return res.json({
      ok: true,
      message: 'If your account is awaiting verification, a new 6-digit code has been sent to your email.',
    });
  } catch (err) {
    console.error('POST /api/auth/resend-verification error:', err);
    return res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

authRouter.post('/forgot-password', async (req, res) => {
  try {
    await ensureSeeded();
    await ensureAdminBootstrapped();
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`forgot-pwd:${ip}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many reset requests. Please try again later.' });
    }

    // Strict email-only recovery (no mobile number or SMS OTP)
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Enter a valid email address' });
    }

    const emailLower = parsed.data.email.trim().toLowerCase();
    const found = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    const user = found[0];
    if (user && user.isActive) {
      const code = generateSixDigitOtp();
      await db
        .update(schema.users)
        .set({
          resetTokenHash: hashToken(code),
          resetTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));

      if (process.env.NODE_ENV !== 'production') {
        console.info(`[PGDesk Auth] Email password reset code issued for user #${user.id}: ${code}`);
      }
    }

    return res.json({
      ok: true,
      message: 'If an account matches that email address, a 6-digit password reset code has been sent via email.',
    });
  } catch (err) {
    console.error('POST /api/auth/forgot-password error:', err);
    return res.status(500).json({ error: 'Failed to initiate password reset' });
  }
});

authRouter.post('/reset-password', async (req, res) => {
  try {
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`reset-pwd:${ip}`, 15, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many reset attempts. Please try again shortly.' });
    }

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid reset request' });
    }

    const emailLower = parsed.data.email.trim().toLowerCase();
    const found = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    const user = found[0];
    if (
      !user ||
      !user.isActive ||
      !user.resetTokenHash ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt.getTime() < Date.now() ||
      !verifyTokenHash(parsed.data.code, user.resetTokenHash)
    ) {
      return res.status(400).json({ error: 'Invalid or expired email reset code' });
    }

    const nextVersion = (user.tokenVersion ?? 1) + 1;
    await db
      .update(schema.users)
      .set({
        passwordHash: hashPassword(parsed.data.newPassword),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        emailVerified: true,
        tokenVersion: nextVersion,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));

    await db
      .update(schema.userSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.userSessions.userId, user.id), isNull(schema.userSessions.revokedAt)));

    await logAudit({
      user: serializeSessionUser(user),
      action: 'PASSWORD_RESET',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email, channel: 'EMAIL' },
    });

    return res.json({
      ok: true,
      message: 'Password updated successfully. You can now sign in with your new password.',
    });
  } catch (err) {
    console.error('POST /api/auth/reset-password error:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    await ensureSeeded();
    await ensureAdminBootstrapped();
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`login:${ip}`, 25, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes.' });
    }

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials format' });
    }

    const identifier = parsed.data.identifier.trim().toLowerCase();
    const digitsOnly = identifier.replace(/\D/g, '');
    const normalizedPhone =
      digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;

    const found = await db
      .select()
      .from(schema.users)
      .where(
        normalizedPhone.length === 10
          ? or(eq(schema.users.email, identifier), eq(schema.users.phone, normalizedPhone))
          : eq(schema.users.email, identifier)
      )
      .limit(1);

    const user = found[0];
    if (!user || !user.isActive || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email/mobile number or password' });
    }

    if (user.role !== 'ADMIN' && user.emailVerified === false) {
      return res.status(403).json({
        error: 'Please verify your email address before signing in.',
        requiresEmailVerification: true,
        email: user.email,
      });
    }

    await db
      .update(schema.users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    if (user.role === 'ADMIN') {
      await logAudit({
        user: serializeSessionUser(user),
        action: 'ADMIN_LOGIN',
        entityType: 'USER',
        entityId: user.id,
        metadata: { email: user.email },
      });
    }

    const org =
      user.role === 'ADMIN'
        ? null
        : (
            await db
              .select()
              .from(schema.organizations)
              .where(eq(schema.organizations.id, user.organizationId))
              .limit(1)
          )[0] || null;

    const { token, cookieOnly } = await issueUserSession(req, res, user);

    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: serializeSessionUser(user),
      organization: org,
    });
  } catch (err) {
    const error = err as { message?: string; code?: string };
    console.error('POST /api/auth/login error:', {
      message: error.message,
      code: error.code,
      error: err,
    });
    return res.status(500).json({ error: 'Login failed' });
  }
});

authRouter.post('/demo', async (req, res) => {
  try {
    if (!isDemoModeEnabled()) {
      return res.status(403).json({ error: 'Demo mode is disabled in this environment.' });
    }
    await ensureSeeded();
    const requestedRole = String(req.body?.role || 'OWNER').toUpperCase();
    const targetEmail =
      requestedRole === 'TENANT'
        ? 'aarav.k@pgdesk.in'
        : requestedRole === 'MANAGER'
          ? 'manager@pgdesk.in'
          : 'owner@pgdesk.in';

    const found = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, targetEmail))
      .limit(1);

    const user = found[0];
    if (!user) {
      return res.status(404).json({ error: 'Demo account not found' });
    }

    await db
      .update(schema.users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    const { token, cookieOnly } = await issueUserSession(req, res, user);

    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: serializeSessionUser(user),
      organization: org || null,
    });
  } catch (err) {
    console.error('POST /api/auth/demo error:', err);
    return res.status(500).json({ error: 'Failed to start demo session' });
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveAuthUser(req);
    if (resolved?.sessionId) {
      await db
        .update(schema.userSessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(schema.userSessions.userId, resolved.user.id),
            eq(schema.userSessions.sessionId, resolved.sessionId)
          )
        );
    }
  } catch {
    // Best-effort session revocation on logout
  }

  const opts = getCookieOptions(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: '/',
  });
  return res.json({ ok: true });
});
