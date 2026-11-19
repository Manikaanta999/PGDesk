export type AppUserRole = 'OWNER' | 'MANAGER' | 'TENANT';

export function normalizeUserRole(role: unknown): AppUserRole | null {
  const value = String(role || '')
    .trim()
    .toUpperCase();
  if (value === 'OWNER' || value === 'MANAGER' || value === 'TENANT') {
    return value;
  }
  return null;
}

export function getDashboardRouteForRole(role: string | null | undefined): '/tenant' | '/dashboard' {
  const normalized = normalizeUserRole(role);
  if (normalized === 'TENANT') return '/tenant';
  return '/dashboard';
}

export function isRoleAllowedOnPath(role: AppUserRole, pathname: string): boolean {
  if (pathname.startsWith('/tenant')) return role === 'TENANT';
  if (pathname.startsWith('/dashboard')) return role === 'OWNER' || role === 'MANAGER';
  return true;
}

export function normalizeLoginIdentifier(raw: string): {
  identifier: string;
  normalizedPhone: string;
} {
  const identifier = raw.trim().toLowerCase();
  const digitsOnly = identifier.replace(/\D/g, '');
  const normalizedPhone =
    digitsOnly.length === 12 && digitsOnly.startsWith('91') ? digitsOnly.slice(2) : digitsOnly;
  return { identifier, normalizedPhone };
}

export function isEmbeddedAuthRequest(
  headers: Record<string, string | string[] | undefined>,
  hostHeader?: string
): boolean {
  const firstHeader = (key: string): string => {
    const raw = headers[key];
    if (Array.isArray(raw)) return String(raw[0] || '');
    return String(raw || '');
  };

  if (firstHeader('x-pgdesk-embedded').trim() === '1') {
    return true;
  }

  const secFetchDest = firstHeader('sec-fetch-dest').trim().toLowerCase();
  if (secFetchDest === 'iframe') {
    return true;
  }

  const secFetchSite = firstHeader('sec-fetch-site').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return true;
  }

  const originHeader = firstHeader('origin').trim();
  const host = String(hostHeader || firstHeader('host')).trim();
  if (originHeader && host) {
    try {
      const originHost = new URL(originHeader).host;
      if (originHost && originHost !== host) {
        return true;
      }
    } catch {
      // Ignore malformed Origin header
    }
  }

  return false;
}

export function computeSessionCookiePolicy(params: {
  isProduction: boolean;
  isHttps: boolean;
  isEmbedded: boolean;
}): {
  sameSite: 'none' | 'lax';
  secure: boolean;
  cookieOnly: boolean;
} {
  const secure = Boolean(params.isHttps || params.isProduction);
  if (params.isEmbedded) {
    return {
      sameSite: secure ? 'none' : 'lax',
      secure,
      cookieOnly: false,
    };
  }
  if (params.isProduction) {
    return {
      sameSite: 'lax',
      secure,
      cookieOnly: true,
    };
  }
  return {
    sameSite: params.isHttps ? 'none' : 'lax',
    secure: params.isHttps,
    cookieOnly: false,
  };
}

export interface ClassifiedAuthError {
  code: string;
  message: string;
  isNetwork: boolean;
  isProfileError: boolean;
  requiresVerification: boolean;
}

export function classifyAuthError(err: unknown, fallback = 'Sign in failed. Please try again.'): ClassifiedAuthError {
  const anyErr = err as { status?: number; message?: string; data?: { code?: string; requiresOtp?: boolean } } | null;
  const code = String(anyErr?.data?.code || '');
  const rawMessage = String(anyErr?.message || '').trim();
  const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;

  if (
    code === 'NETWORK_ERROR' ||
    status === 0 ||
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(rawMessage)
  ) {
    return {
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the PGDesk server. Check your internet connection and try again.',
      isNetwork: true,
      isProfileError: false,
      requiresVerification: false,
    };
  }

  if (code === 'PROFILE_LOAD_FAILED') {
    return {
      code: 'PROFILE_LOAD_FAILED',
      message:
        rawMessage || 'Login successful, but your account profile could not be loaded. Please contact support.',
      isNetwork: false,
      isProfileError: true,
      requiresVerification: false,
    };
  }

  if (code === 'EMAIL_NOT_VERIFIED' || anyErr?.data?.requiresOtp) {
    return {
      code: 'EMAIL_NOT_VERIFIED',
      message: rawMessage || 'Please confirm your email address before signing in.',
      isNetwork: false,
      isProfileError: false,
      requiresVerification: true,
    };
  }

  if (code === 'AUTH_UNAUTHORIZED_DOMAIN' || rawMessage.includes('auth/unauthorized-domain')) {
    return {
      code: 'AUTH_UNAUTHORIZED_DOMAIN',
      message:
        'Google Sign-In is not authorized for this preview domain yet. Sign in with email and password, or add this domain to Firebase Authorized Domains.',
      isNetwork: false,
      isProfileError: false,
      requiresVerification: false,
    };
  }

  if (code === 'AUTH_POPUP_BLOCKED' || rawMessage.includes('auth/popup-blocked') || rawMessage.includes('auth/popup-closed-by-user')) {
    return {
      code: 'AUTH_POPUP_BLOCKED',
      message:
        'Google Sign-In popup was blocked or closed in this preview frame. Please allow popups or sign in with your email and password.',
      isNetwork: false,
      isProfileError: false,
      requiresVerification: false,
    };
  }

  return {
    code: code || (status === 401 ? 'INVALID_CREDENTIALS' : 'AUTH_ERROR'),
    message: rawMessage || fallback,
    isNetwork: false,
    isProfileError: false,
    requiresVerification: false,
  };
}
