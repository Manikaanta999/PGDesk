import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { ApiError, apiFetch, getStoredToken, setStoredToken } from '../lib/api';
import { AuthTestingPolicy, FORGOT_PASSWORD_UNAVAILABLE_MESSAGE } from '../lib/authPolicy';
import { AppUserRole } from '../lib/authRoles';
import { auth, googleAuthProvider } from '../lib/firebase';

export interface SessionUser {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  photoUrl?: string | null;
  role: AppUserRole;
  assignedPropertyIds: number[];
}

export interface SessionOrg {
  id: number;
  name: string;
  slug: string;
  brandColor: string;
  upiId: string;
  upiPayeeName: string;
  gstin?: string;
  gstRatePct?: number;
  planTier?: string;
  billingDayDefault: number;
  dueDaysAfterInvoice: number;
  lateFeePerDay: number;
  graceDays: number;
  noticePeriodDays: number;
  phone: string;
  email: string;
  address: string;
  bankDetails?: string;
  paymentInstructions?: string;
}

export interface RegisterInput {
  accountType: 'OWNER' | 'TENANT';
  name: string;
  organizationName?: string;
  email: string;
  phone: string;
  password: string;
}

export interface RegisterResult {
  user?: SessionUser;
  requiresOtp?: boolean;
  email?: string;
  message?: string;
}

const DEFAULT_AUTH_POLICY: AuthTestingPolicy = {
  emailVerificationEnabled: false,
  smsOtpEnabled: false,
  passwordResetEmailEnabled: false,
  forgotPasswordMessage: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
};

interface AuthContextValue {
  user: SessionUser | null;
  organization: SessionOrg | null;
  demoModeEnabled: boolean;
  googleAuthEnabled: boolean;
  authPolicy: AuthTestingPolicy;
  loading: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  refreshSession: () => Promise<SessionUser | null>;
  applySessionToken: (token?: string, cookieOnly?: boolean) => void;
  loginWithCredentials: (identifier: string, password: string) => Promise<SessionUser>;
  registerAccount: (input: RegisterInput) => Promise<RegisterResult>;
  verifyTenantOtp: (email: string, otp: string) => Promise<SessionUser>;
  forgotPassword: (identifier: string) => Promise<{ ok: boolean; message: string }>;
  resetPassword: (payload: { identifier: string; code: string; newPassword: string }) => Promise<{ ok: boolean; message: string }>;
  loginDemo: (role: 'OWNER' | 'MANAGER' | 'TENANT') => Promise<SessionUser>;
  loginWithGoogle: () => Promise<SessionUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  organization: null,
  demoModeEnabled: false,
  googleAuthEnabled: false,
  authPolicy: DEFAULT_AUTH_POLICY,
  loading: true,
  darkMode: false,
  toggleDarkMode: () => {},
  refreshSession: async () => null,
  applySessionToken: () => {},
  loginWithCredentials: async () => {
    throw new Error('AuthProvider not mounted');
  },
  registerAccount: async () => {
    throw new Error('AuthProvider not mounted');
  },
  verifyTenantOtp: async () => {
    throw new Error('AuthProvider not mounted');
  },
  forgotPassword: async () => {
    throw new Error('AuthProvider not mounted');
  },
  resetPassword: async () => {
    throw new Error('AuthProvider not mounted');
  },
  loginDemo: async () => {
    throw new Error('AuthProvider not mounted');
  },
  loginWithGoogle: async () => null,
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organization, setOrganization] = useState<SessionOrg | null>(null);
  const [demoModeEnabled, setDemoModeEnabled] = useState<boolean>(false);
  const [authPolicy, setAuthPolicy] = useState<AuthTestingPolicy>(DEFAULT_AUTH_POLICY);
  const [loading, setLoading] = useState(true);
  const manualAuthBusyRef = useRef(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pgdesk_theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('pgdesk_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('pgdesk_theme', 'light');
    }
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((d) => !d);
  }, []);

  const refreshSession = useCallback(async (throwOnProfileError = false): Promise<SessionUser | null> => {
    try {
      const data = await apiFetch<{
        user: SessionUser | null;
        organization?: SessionOrg | null;
        demoModeEnabled?: boolean;
        authPolicy?: AuthTestingPolicy;
      }>('/api/auth/me');
      setUser(data.user);
      setOrganization(data.organization ?? null);
      setDemoModeEnabled(Boolean(data.demoModeEnabled));
      if (data.authPolicy) {
        setAuthPolicy(data.authPolicy);
      }
      return data.user;
    } catch (err) {
      setUser(null);
      setOrganization(null);
      if (throwOnProfileError) {
        throw err;
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser && !manualAuthBusyRef.current && !getStoredToken()) {
        void refreshSession();
      }
    });
    return () => unsub();
  }, [refreshSession]);

  const applySessionToken = useCallback((token?: string, cookieOnly?: boolean) => {
    if (cookieOnly || !token) {
      setStoredToken(null);
    } else {
      setStoredToken(token);
    }
  }, []);

  const applyAuthResult = useCallback(
    (res: { user: SessionUser; organization?: SessionOrg | null; token?: string; cookieOnly?: boolean }) => {
      applySessionToken(res.token, res.cookieOnly);
      setUser(res.user);
      setOrganization(res.organization ?? null);
      setLoading(false);
      return res.user;
    },
    [applySessionToken]
  );

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string): Promise<SessionUser> => {
      manualAuthBusyRef.current = true;
      try {
        if (auth?.currentUser) {
          await firebaseSignOut(auth).catch(() => {});
        }
        const normalizedIdentifier = identifier.trim();
        const res = await apiFetch<{
          user: SessionUser;
          organization?: SessionOrg | null;
          token?: string;
          cookieOnly?: boolean;
        }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier: normalizedIdentifier, password }),
        });
        if (!res.user || !res.organization) {
          throw new ApiError(
            'Login successful, but your account profile could not be loaded. Please contact support.',
            500,
            { code: 'PROFILE_LOAD_FAILED' }
          );
        }
        return applyAuthResult(res);
      } finally {
        manualAuthBusyRef.current = false;
      }
    },
    [applyAuthResult]
  );

  const registerAccount = useCallback(
    async (input: RegisterInput): Promise<RegisterResult> => {
      if (auth?.currentUser) {
        await firebaseSignOut(auth).catch(() => {});
      }
      const res = await apiFetch<{
        user?: SessionUser;
        organization?: SessionOrg | null;
        token?: string;
        cookieOnly?: boolean;
        requiresOtp?: boolean;
        email?: string;
        message?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (res.requiresOtp) {
        return {
          requiresOtp: true,
          email: res.email,
          message: res.message,
        };
      }
      if (!res.user) {
        throw new Error('Registration did not return a user session');
      }
      const u = applyAuthResult({
        user: res.user,
        organization: res.organization,
        token: res.token,
        cookieOnly: res.cookieOnly,
      });
      return { user: u };
    },
    [applyAuthResult]
  );

  const verifyTenantOtp = useCallback(
    async (email: string, otp: string): Promise<SessionUser> => {
      const res = await apiFetch<{
        user: SessionUser;
        organization?: SessionOrg | null;
        token?: string;
        cookieOnly?: boolean;
      }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email, otp }),
      });
      return applyAuthResult(res);
    },
    [applyAuthResult]
  );

  const forgotPassword = useCallback(async (identifier: string) => {
    return apiFetch<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    });
  }, []);

  const resetPassword = useCallback(
    async (payload: { identifier: string; code: string; newPassword: string }) => {
      return apiFetch<{ ok: boolean; message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    []
  );

  const loginDemo = useCallback(
    async (role: 'OWNER' | 'MANAGER' | 'TENANT'): Promise<SessionUser> => {
      if (auth?.currentUser) {
        await firebaseSignOut(auth).catch(() => {});
      }
      const res = await apiFetch<{
        user: SessionUser;
        organization?: SessionOrg | null;
        token?: string;
        cookieOnly?: boolean;
      }>('/api/auth/demo', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      return applyAuthResult(res);
    },
    [applyAuthResult]
  );

  const loginWithGoogle = useCallback(async (): Promise<SessionUser | null> => {
    if (!auth || !googleAuthProvider) {
      throw new Error('Google Sign-In is not configured for this deployment.');
    }
    manualAuthBusyRef.current = true;
    try {
      setStoredToken(null);
      await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      try {
        await signInWithPopup(auth, googleAuthProvider);
      } catch (fbErr: any) {
        const fbCode = String(fbErr?.code || '');
        if (fbCode === 'auth/unauthorized-domain') {
          throw new ApiError(
            'Google Sign-In is not authorized for this preview domain yet. Sign in with email and password, or add this domain to Firebase Authorized Domains.',
            403,
            { code: 'AUTH_UNAUTHORIZED_DOMAIN' }
          );
        }
        if (fbCode === 'auth/popup-blocked' || fbCode === 'auth/popup-closed-by-user') {
          throw new ApiError(
            'Google Sign-In popup was blocked or closed in this preview frame. Please allow popups or sign in with your email and password.',
            400,
            { code: 'AUTH_POPUP_BLOCKED' }
          );
        }
        throw fbErr;
      }
      const resolvedUser = await refreshSession(true);
      if (!resolvedUser) {
        throw new ApiError(
          'Login successful, but your account profile could not be loaded. Please contact support.',
          500,
          { code: 'PROFILE_LOAD_FAILED' }
        );
      }
      return resolvedUser;
    } finally {
      manualAuthBusyRef.current = false;
    }
  }, [refreshSession]);

  const logout = useCallback(async () => {
    manualAuthBusyRef.current = true;
    try {
      setStoredToken(null);
      await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      if (auth?.currentUser) {
        await firebaseSignOut(auth).catch(() => {});
      }
      setUser(null);
      setOrganization(null);
    } finally {
      manualAuthBusyRef.current = false;
    }
  }, []);

  const googleAuthEnabled = Boolean(auth && googleAuthProvider);

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        demoModeEnabled,
        googleAuthEnabled,
        authPolicy,
        loading,
        darkMode,
        toggleDarkMode,
        refreshSession,
        applySessionToken,
        loginWithCredentials,
        registerAccount,
        verifyTenantOtp,
        forgotPassword,
        resetPassword,
        loginDemo,
        loginWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
