import { Request, Response, Router } from 'express';
import { and, eq, isNull, or } from 'drizzle-orm';
import { db, schema } from '../../db/index.ts';
import { ensureSeeded } from '../../db/seed.ts';
import {
  checkRateLimit,
  generateSixDigitOtp,
  hashPassword,
  hashToken,
  isDemoModeEnabled,
  signSessionToken,
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
import { resolveAuthUser, SESSION_COOKIE_NAME } from '../../middleware/auth.ts';
import { logAudit } from '../audit.ts';

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const authRouter = Router();

function isCrossOriginIframeRequest(req: Request): boolean {
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

function getCookieOptions(req: Request) {
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

function shouldUseCookieOnlyAuth(req: Request): boolean {
  return process.env.NODE_ENV === 'production' && !isCrossOriginIframeRequest(req);
}

function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions(req));
}

function normalizePhone10(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits.slice(-10);
}

authRouter.get('/config', (_req, res) => {
  return res.json({ demoModeEnabled: isDemoModeEnabled() });
});

authRouter.get('/me', async (req, res) => {
  try {
    await ensureSeeded();
    const demoModeEnabled = isDemoModeEnabled();
    const user = await resolveAuthUser(req);
    if (!user) {
      return res.json({ user: null, demoModeEnabled });
    }
    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);
    return res.json({ user, organization: org || null, demoModeEnabled });
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    return res.status(500).json({ error: 'Failed to resolve session' });
  }
});

authRouter.post('/register', async (req, res) => {
  try {
    await ensureSeeded();
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

    // Security check: if a TENANT registers matching an existing owner-created resident profile,
    // require 6-digit OTP verification before linking the resident record and issuing a session.
    const requiresOtp = role === 'TENANT' && matchedTenants.length > 0;
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
        otpCodeHash: otp ? hashToken(otp) : null,
        otpExpiresAt: otp ? new Date(Date.now() + 10 * 60 * 1000) : null,
      })
      .returning();

    if (requiresOtp && otp) {
      return res.status(202).json({
        requiresOtp: true,
        email: emailLower,
        message: 'A 6-digit OTP verification code has been sent to confirm ownership of your resident profile.',
      });
    }

    if (role === 'OWNER') {
      await logAudit({
        user: {
          id: createdUser.id,
          organizationId: createdUser.organizationId,
          name: createdUser.name,
          email: createdUser.email,
          phone: createdUser.phone,
          role: createdUser.role,
          assignedPropertyIds: [],
        },
        action: 'OWNER_REGISTERED',
        entityType: 'ORGANIZATION',
        entityId: orgRecord.id,
        metadata: { organizationName: orgRecord.name },
      });
    }

    const token = signSessionToken({
      userId: createdUser.id,
      organizationId: createdUser.organizationId,
      role: createdUser.role,
    });
    setSessionCookie(req, res, token);

    const cookieOnly = shouldUseCookieOnlyAuth(req);
    return res.status(201).json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: {
        id: createdUser.id,
        organizationId: createdUser.organizationId,
        name: createdUser.name,
        email: createdUser.email,
        phone: createdUser.phone,
        role: createdUser.role,
        assignedPropertyIds: createdUser.assignedPropertyIds,
      },
      organization: orgRecord,
    });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    return res.status(500).json({ error: 'Account registration failed' });
  }
});

authRouter.post('/verify-otp', async (req, res) => {
  try {
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

    await logAudit({
      user: {
        id: verifiedUser.id,
        organizationId: verifiedUser.organizationId,
        name: verifiedUser.name,
        email: verifiedUser.email,
        phone: verifiedUser.phone,
        role: verifiedUser.role,
        assignedPropertyIds: verifiedUser.assignedPropertyIds,
      },
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

    const token = signSessionToken({
      userId: verifiedUser.id,
      organizationId: verifiedUser.organizationId,
      role: verifiedUser.role,
    });
    setSessionCookie(req, res, token);

    const cookieOnly = shouldUseCookieOnlyAuth(req);
    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: {
        id: verifiedUser.id,
        organizationId: verifiedUser.organizationId,
        name: verifiedUser.name,
        email: verifiedUser.email,
        phone: verifiedUser.phone,
        role: verifiedUser.role,
        assignedPropertyIds: verifiedUser.assignedPropertyIds,
      },
      organization: org || null,
    });
  } catch (err) {
    console.error('POST /api/auth/verify-otp error:', err);
    return res.status(500).json({ error: 'OTP verification failed' });
  }
});

authRouter.post('/forgot-password', async (req, res) => {
  try {
    await ensureSeeded();
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

    await db
      .update(schema.users)
      .set({
        passwordHash: hashPassword(parsed.data.newPassword),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));

    await logAudit({
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        assignedPropertyIds: user.assignedPropertyIds,
      },
      action: 'PASSWORD_RESET',
      entityType: 'USER',
      entityId: user.id,
      metadata: { email: user.email },
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

    if (user.role === 'TENANT' && user.emailVerified === false) {
      return res.status(403).json({
        error: 'Please verify the 6-digit OTP code before accessing your resident portal.',
        requiresOtp: true,
        email: user.email,
      });
    }

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    const token = signSessionToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    setSessionCookie(req, res, token);

    const cookieOnly = shouldUseCookieOnlyAuth(req);
    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        assignedPropertyIds: user.assignedPropertyIds,
      },
      organization: org || null,
    });
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
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

    const [org] = await db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, user.organizationId))
      .limit(1);

    const token = signSessionToken({
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
    });
    setSessionCookie(req, res, token);

    const cookieOnly = shouldUseCookieOnlyAuth(req);
    return res.json({
      token: cookieOnly ? undefined : token,
      cookieOnly,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        assignedPropertyIds: user.assignedPropertyIds,
      },
      organization: org || null,
    });
  } catch (err) {
    console.error('POST /api/auth/demo error:', err);
    return res.status(500).json({ error: 'Failed to start demo session' });
  }
});

authRouter.post('/logout', (req, res) => {
  const opts = getCookieOptions(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: opts.httpOnly,
    sameSite: opts.sameSite,
    secure: opts.secure,
    path: '/',
  });
  return res.json({ ok: true });
});
