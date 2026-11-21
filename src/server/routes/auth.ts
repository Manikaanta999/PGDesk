import { Request, Response, Router } from 'express';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { ensureSeeded } from '../../db/seed.ts';
import {
  FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
  getAuthTestingPolicy,
  isEmailVerificationEnabled,
  isPasswordResetEmailEnabled,
  isSmsOtpEnabled,
} from '../../lib/authPolicy.ts';
import { AppUserRole, normalizeLoginIdentifier, normalizeUserRole } from '../../lib/authRoles.ts';
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
  resetPasswordSchema,
  verifyOtpSchema,
} from '../../lib/validation.ts';
import {
  getCookieOptions,
  issueUserSession,
  resolveAuthUser,
  SESSION_COOKIE_NAME,
} from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const authRouter = Router();

function normalizePhone10(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits.slice(-10);
}

async function ensureAppReady(): Promise<void> {
  await ensureSeeded();
}

function serializeSessionUser(u: {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  photoUrl?: string | null;
  role: AppUserRole;
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
  return res.json({
    demoModeEnabled: isDemoModeEnabled(),
    authPolicy: getAuthTestingPolicy(),
  });
});

authRouter.get('/me', async (req, res) => {
  try {
    await ensureAppReady();
    const demoModeEnabled = isDemoModeEnabled();
    const authPolicy = getAuthTestingPolicy();
    const resolved = await resolveAuthUser(req);
    if (resolved && 'authError' in resolved) {
      return res.status(403).json({
        code: resolved.authError.code,
        error: resolved.authError.message,
        demoModeEnabled,
        authPolicy,
      });
    }
    const user = resolved?.user ?? null;
    if (!user) {
      return res.json({ user: null, demoModeEnabled, authPolicy });
    }
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);
    if (!org) {
      console.error(`GET /api/auth/me: missing organization ${user.organizationId} for user ${user.id}`);
      return res.status(500).json({
        code: 'PROFILE_LOAD_FAILED',
        error: 'Login successful, but your account profile could not be loaded. Please contact support.',
        demoModeEnabled,
        authPolicy,
      });
    }
    return res.json({ user: serializeSessionUser(user), organization: org, demoModeEnabled, authPolicy });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ code: 'PROFILE_LOAD_FAILED', error: 'Failed to resolve session' });
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    await ensureAppReady();
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`register:${ip}`, 15, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many signup attempts. Please try again shortly.' });
    }

    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
    }

    const emailLower = parsed.data.email.trim().toLowerCase();
    const phone10 = normalizePhone10(parsed.data.phone);
    const passwordHash = hashPassword(parsed.data.password);

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

    let orgRecord: typeof schema.organizations.$inferSelect | null = null;
    const role: 'OWNER' | 'TENANT' = parsed.data.accountType;
    let matchedTenants: Array<typeof schema.tenants.$inferSelect> = [];

    if (role === 'OWNER') {
      const orgName = parsed.data.organizationName.trim();
      const baseSlug = toSlug(orgName) || 'pg-group';
      const uniqueSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      const upiHandle = `${baseSlug.replace(/-/g, '').slice(0, 16) || 'pgdesk'}@okicici`;

      const [createdOrg] = await db
        .insert(schema.organizations)
        .values({
          name: orgName,
          slug: uniqueSlug,
          upiId: upiHandle,
          upiPayeeName: orgName,
          planTier: 'STARTER',
          phone: `+91 ${phone10.slice(0, 5)} ${phone10.slice(5)}`,
          email: emailLower,
          address: 'India',
        })
        .returning();
      orgRecord = createdOrg;
    } else {
      matchedTenants = await db
        .select()
        .from(schema.tenants)
        .where(
          and(
            isNull(schema.tenants.deletedAt),
            or(eq(schema.tenants.email, emailLower), eq(schema.tenants.phone, phone10))
          )
        )
        .limit(1);

      if (matchedTenants[0]) {
        const [matchedOrg] = await db
          .select()
          .from(schema.organizations)
          .where(eq(schema.organizations.id, matchedTenants[0].organizationId))
          .limit(1);
        orgRecord = matchedOrg || null;
      }

      if (!orgRecord) {
        const [defaultOrg] = await db.select().from(schema.organizations).limit(1);
        orgRecord = defaultOrg || null;
      }
    }

    if (!orgRecord) {
      return res.status(400).json({ error: 'No active PG organization found to join. Ask your PG owner to onboard you first.' });
    }

    // During development/testing without email/SMS providers, email confirmation and SMS OTP are disabled
    const requiresOtp =
      (isSmsOtpEnabled() || isEmailVerificationEnabled()) && role === 'TENANT' && matchedTenants.length > 0;
    const otp = requiresOtp ? generateSixDigitOtp() : null;

    const [createdUser] = await db
      .insert(schema.users)
      .values({
        organizationId: orgRecord.id,
        name: parsed.data.name.trim(),
        email: emailLower,
        phone: phone10,
        passwordHash,
        role,
        assignedPropertyIds: matchedTenants[0] ? [matchedTenants[0].propertyId] : [],
        isActive: true,
        emailVerified: !requiresOtp,
        lastLoginAt: requiresOtp ? null : new Date(),
        otpCodeHash: otp ? hashToken(otp) : null,
        otpExpiresAt: otp ? new Date(Date.now() + 10 * 60 * 1000) : null,
      })
      .returning();

    if (requiresOtp && otp) {
      return res.status(202).json({
        requiresOtp: true,
        email: emailLower,
        message: 'Verification code required to confirm your resident profile.',
      });
    }

    if (role === 'TENANT' && matchedTenants[0] && !matchedTenants[0].userId) {
      await db
        .update(schema.tenants)
        .set({ userId: createdUser.id, updatedAt: new Date() })
        .where(
          and(
            eq(schema.tenants.id, matchedTenants[0].id),
            eq(schema.tenants.organizationId, orgRecord.id),
            isNull(schema.tenants.userId)
          )
        );
    }

    if (role === 'OWNER') {
      await logAudit({
        user: serializeSessionUser({ ...createdUser, role }),
        action: 'OWNER_REGISTERED',
        entityType: 'ORGANIZATION',
        entityId: orgRecord.id,
        metadata: { organizationName: orgRecord.name },
      });
    }

    const { token, cookieOnly } = await issueUserSession(req, res, {
      id: createdUser.id,
      organizationId: createdUser.organizationId,
      role,
      tokenVersion: createdUser.tokenVersion ?? 1,
    });

    return res.status(201).json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: serializeSessionUser({
        ...createdUser,
        role,
      }),
      organization: orgRecord,
    });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    return res.status(500).json({ error: 'Account registration failed' });
  }
});

authRouter.post('/verify-otp', async (req, res) => {
  try {
    if (!isSmsOtpEnabled() && !isEmailVerificationEnabled()) {
      return res.status(410).json({ error: 'OTP verification is disabled during testing.' });
    }
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`verify-otp:${ip}`, 15, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many OTP attempts. Please wait a few minutes.' });
    }

    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid OTP request' });
    }

    const emailLower = parsed.data.email.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    if (!user || !user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }
    if (user.otpExpiresAt.getTime() < Date.now() || !verifyTokenHash(parsed.data.otp, user.otpCodeHash)) {
      return res.status(400).json({ error: 'Invalid or expired 6-digit verification code' });
    }

    const [verifiedUser] = await db
      .update(schema.users)
      .set({
        emailVerified: true,
        otpCodeHash: null,
        otpExpiresAt: null,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id))
      .returning();

    const phone10 = normalizePhone10(verifiedUser.phone || '');
    await db
      .update(schema.tenants)
      .set({ userId: verifiedUser.id, updatedAt: new Date() })
      .where(
        and(
          eq(schema.tenants.organizationId, verifiedUser.organizationId),
          isNull(schema.tenants.deletedAt),
          phone10.length === 10
            ? or(eq(schema.tenants.email, verifiedUser.email), eq(schema.tenants.phone, phone10))
            : eq(schema.tenants.email, verifiedUser.email)
        )
      );

    const verifiedRole: AppUserRole = normalizeUserRole(verifiedUser.role) ?? 'TENANT';

    await logAudit({
      user: serializeSessionUser({ ...verifiedUser, role: verifiedRole }),
      action: 'TENANT_OTP_VERIFIED',
      entityType: 'USER',
      entityId: verifiedUser.id,
      metadata: { email: verifiedUser.email },
    });

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, verifiedUser.organizationId))
      .limit(1);

    const { token, cookieOnly } = await issueUserSession(req, res, {
      id: verifiedUser.id,
      organizationId: verifiedUser.organizationId,
      role: verifiedRole,
      tokenVersion: verifiedUser.tokenVersion ?? 1,
    });

    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: serializeSessionUser({ ...verifiedUser, role: verifiedRole }),
      organization: org || null,
    });
  } catch (err) {
    console.error('POST /api/auth/verify-otp error:', err);
    return res.status(500).json({ error: 'OTP verification failed' });
  }
});

authRouter.post('/forgot-password', async (req, res) => {
  try {
    await ensureAppReady();
    if (!isPasswordResetEmailEnabled()) {
      return res.status(503).json({
        ok: false,
        unavailable: true,
        error: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
      });
    }
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`forgot-pwd:${ip}`, 10, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many reset requests. Please try again later.' });
    }

    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid identifier' });
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
    }

    return res.json({
      ok: true,
      message: 'If an account matches that email or mobile number, a 6-digit reset code has been sent.',
    });
  } catch (err) {
    console.error('POST /api/auth/forgot-password error:', err);
    return res.status(500).json({ error: 'Failed to initiate password reset' });
  }
});

authRouter.post('/reset-password', async (req, res) => {
  try {
    if (!isPasswordResetEmailEnabled()) {
      return res.status(503).json({ error: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE });
    }
    const ip = req.ip || 'unknown';
    if (!checkRateLimit(`reset-pwd:${ip}`, 15, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many reset attempts. Please try again shortly.' });
    }

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid reset request' });
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
    if (
      !user ||
      !user.isActive ||
      !user.resetTokenHash ||
      !user.resetTokenExpiresAt ||
      user.resetTokenExpiresAt.getTime() < Date.now() ||
      !verifyTokenHash(parsed.data.code, user.resetTokenHash)
    ) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
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

    const resetRole = normalizeUserRole(user.role);
    if (resetRole) {
      await logAudit({
        user: serializeSessionUser({ ...user, role: resetRole }),
        action: 'PASSWORD_RESET',
        entityType: 'USER',
        entityId: user.id,
        metadata: { email: user.email },
      });
    }

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
    await ensureAppReady();
    const ip = req.ip || 'unknown';

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        code: 'INVALID_INPUT',
        error: parsed.error.issues[0]?.message || 'Invalid credentials format',
      });
    }

    const { identifier, normalizedPhone } = normalizeLoginIdentifier(parsed.data.identifier);
    if (!checkRateLimit(`login:${ip}:${identifier}`, 25, 10 * 60 * 1000) || !checkRateLimit(`login-ip:${ip}`, 150, 10 * 60 * 1000)) {
      return res.status(429).json({
        code: 'RATE_LIMITED',
        error: 'Too many login attempts. Please wait a few minutes.',
      });
    }

    const candidates = await db
      .select()
      .from(schema.users)
      .where(
        normalizedPhone.length === 10
          ? or(eq(schema.users.email, identifier), eq(schema.users.phone, normalizedPhone))
          : eq(schema.users.email, identifier)
      );

    if (candidates.length === 0) {
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid email/mobile number or password',
      });
    }

    // Prioritize exact email match before phone matches, and active accounts before inactive ones
    const sortedCandidates = [...candidates].sort((a, b) => {
      const aExactEmail = a.email.toLowerCase() === identifier ? 0 : 1;
      const bExactEmail = b.email.toLowerCase() === identifier ? 0 : 1;
      if (aExactEmail !== bExactEmail) return aExactEmail - bExactEmail;
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.id - b.id;
    });

    const passwordMatchedUser = sortedCandidates.find((u) => verifyPassword(parsed.data.password, u.passwordHash));

    if (!passwordMatchedUser) {
      const primaryCandidate = sortedCandidates[0];
      if (sortedCandidates.every((u) => !u.isActive)) {
        return res.status(403).json({
          code: 'ACCOUNT_DISABLED',
          error: 'This account has been deactivated. Please contact your administrator.',
        });
      }
      if (primaryCandidate && !primaryCandidate.passwordHash && sortedCandidates.every((u) => !u.passwordHash)) {
        return res.status(403).json({
          code: 'PASSWORD_NOT_SET',
          error:
            'No password is set on this account yet. Sign in with Google or ask your administrator to set a temporary password.',
        });
      }
      return res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        error: 'Invalid email/mobile number or password',
      });
    }

    if (
      passwordMatchedUser.role !== 'OWNER' &&
      passwordMatchedUser.role !== 'MANAGER' &&
      passwordMatchedUser.role !== 'TENANT'
    ) {
      return res.status(403).json({
        code: 'ADMIN_DISABLED',
        error: 'Platform admin access is temporarily unavailable. Please sign in with an owner or student account.',
      });
    }

    const matchedRole: AppUserRole = passwordMatchedUser.role;

    if (!passwordMatchedUser.isActive) {
      return res.status(403).json({
        code: 'ACCOUNT_DISABLED',
        error: 'This account has been deactivated. Please contact your administrator.',
      });
    }

    if (
      isEmailVerificationEnabled() &&
      matchedRole === 'TENANT' &&
      passwordMatchedUser.emailVerified === false
    ) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Please verify your email address before accessing your resident portal.',
        requiresOtp: true,
        email: passwordMatchedUser.email,
      });
    }

    // Authentication succeeded; load profile/workspace separately so profile failures
    // are never misreported as invalid credentials.
    let org: typeof schema.organizations.$inferSelect | undefined;
    try {
      await db
        .update(schema.users)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.users.id, passwordMatchedUser.id));

      const [foundOrg] = await db
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, passwordMatchedUser.organizationId))
        .limit(1);
      org = foundOrg;
    } catch (profileErr) {
      const anyErr = profileErr as { code?: string; message?: string } | null;
      console.error('Login profile loading failure:', {
        userId: passwordMatchedUser.id,
        code: anyErr?.code,
        message: anyErr?.message || 'Profile query failed',
      });
      return res.status(500).json({
        code: 'PROFILE_LOAD_FAILED',
        error: 'Login successful, but your account profile could not be loaded. Please contact support.',
      });
    }

    if (!org) {
      console.error('Login profile missing organization:', {
        userId: passwordMatchedUser.id,
        organizationId: passwordMatchedUser.organizationId,
      });
      return res.status(500).json({
        code: 'PROFILE_LOAD_FAILED',
        error: 'Login successful, but your account profile could not be loaded. Please contact support.',
      });
    }

    let sessionResult: { token: string; cookieOnly: boolean; sessionId: string };
    try {
      sessionResult = await issueUserSession(req, res, {
        id: passwordMatchedUser.id,
        organizationId: passwordMatchedUser.organizationId,
        role: matchedRole,
        tokenVersion: passwordMatchedUser.tokenVersion ?? 1,
      });
    } catch (sessionErr) {
      const anyErr = sessionErr as { code?: string; message?: string } | null;
      console.error('Login session creation failed:', {
        userId: passwordMatchedUser.id,
        code: anyErr?.code,
        message: anyErr?.message || 'Session insert failed',
      });
      return res.status(500).json({
        code: 'SESSION_CREATE_FAILED',
        error: 'Could not start your session due to a server database error. Please try again.',
      });
    }

    return res.json({
      token: sessionResult.cookieOnly ? undefined : sessionResult.token,
      cookieOnly: sessionResult.cookieOnly,
      user: serializeSessionUser({ ...passwordMatchedUser, role: matchedRole }),
      organization: org,
    });
  } catch (err) {
    const anyErr = err as { code?: string; message?: string } | null;
    console.error('POST /api/auth/login error:', {
      name: err instanceof Error ? err.name : 'UnknownError',
      code: anyErr?.code,
      message: anyErr?.message || 'Unexpected login failure',
    });
    return res.status(500).json({ code: 'AUTH_SERVER_ERROR', error: 'Login failed due to a server error' });
  }
});

authRouter.post('/demo', async (req, res) => {
  try {
    if (!isDemoModeEnabled()) {
      return res.status(403).json({ error: 'Demo mode is disabled in this environment.' });
    }
    await ensureAppReady();
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

    const demoRole: AppUserRole =
      user.role === 'MANAGER' || user.role === 'TENANT' ? user.role : 'OWNER';
    const { token, cookieOnly } = await issueUserSession(req, res, {
      id: user.id,
      organizationId: user.organizationId,
      role: demoRole,
      tokenVersion: user.tokenVersion ?? 1,
    });

    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: serializeSessionUser({ ...user, role: demoRole }),
      organization: org || null,
    });
  } catch (err) {
    console.error('POST /api/auth/demo error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to start demo session' });
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveAuthUser(req);
    if (resolved && !('authError' in resolved) && resolved.sessionId) {
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
