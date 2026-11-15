import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { apiFetch, setStoredToken } from '../lib/api';
import { auth, googleAuthProvider } from '../lib/firebase';

export interface SessionUser {
  id: number;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  photoUrl?: string | null;
  role: 'ADMIN' | 'OWNER' | 'MANAGER' | 'TENANT';
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
  ownerRegistrationToken?: string;
  name: string;
  organizationName?: string;
  email: string;
  phone?: string;
  password: string;
}

export interface RegisterResult {
  user?: SessionUser;
  requiresEmailVerification?: boolean;
  email?: string;
  message?: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  organization: SessionOrg | null;
  demoModeEnabled: boolean;
  googleAuthEnabled: boolean;
  loading: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  refreshSession: () => Promise<SessionUser | null>;
  applySessionToken: (token?: string, cookieOnly?: boolean) => void;
  loginWithCredentials: (identifier: string, password: string) => Promise<SessionUser>;
  registerAccount: (input: RegisterInput) => Promise<RegisterResult>;
  verifyEmail: (email: string, code: string) => Promise<SessionUser>;
  resendVerification: (email: string) => Promise<{ ok: boolean; message: string }>;
  forgotPassword: (email: string) => Promise<{ ok: boolean; message: string }>;
  resetPassword: (payload: { email: string; code: string; newPassword: string }) => Promise<{ ok: boolean; message: string }>;
  loginDemo: (role: 'OWNER' | 'MANAGER' | 'TENANT') => Promise<SessionUser>;
  loginWithGoogle: () => Promise<SessionUser | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  organization: null,
  demoModeEnabled: false,
  googleAuthEnabled: false,
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
  verifyEmail: async () => {
    throw new Error('AuthProvider not mounted');
  },
  resendVerification: async () => {
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
  const [loading, setLoading] = useState(true);
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

  const refreshSession = useCallback(async (): Promise<SessionUser | null> => {
    try {
      const data = await apiFetch<{
        user: SessionUser | null;
        organization?: SessionOrg | null;
        demoModeEnabled?: boolean;
      }>('/api/auth/me');
      setUser(data.user);
      setOrganization(data.organization ?? null);
      setDemoModeEnabled(Boolean(data.demoModeEnabled));
      return data.user;
    } catch {
      setUser(null);
      setOrganization(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        refreshSession();
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
      if (auth?.currentUser) {
        await firebaseSignOut(auth).catch(() => {});
      }
      const res = await apiFetch<{
        user: SessionUser;
        organization?: SessionOrg | null;
        token?: string;
        cookieOnly?: boolean;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      return applyAuthResult(res);
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
        requiresEmailVerification?: boolean;
        email?: string;
        message?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      if (res.requiresEmailVerification) {
        return {
          requiresEmailVerification: true,
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

  const verifyEmail = useCallback(
    async (email: string, code: string): Promise<SessionUser> => {
      const res = await apiFetch<{
        user: SessionUser;
        organization?: SessionOrg | null;
        token?: string;
        cookieOnly?: boolean;
      }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, code }),
      });
      return applyAuthResult(res);
    },
    [applyAuthResult]
  );

  const resendVerification = useCallback(async (email: string) => {
    return apiFetch<{ ok: boolean; message: string }>('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    return apiFetch<{ ok: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }, []);

  const resetPassword = useCallback(
    async (payload: { email: string; code: string; newPassword: string }) => {
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
    setStoredToken(null);
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    await signInWithPopup(auth, googleAuthProvider);
    return refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    setStoredToken(null);
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    if (auth?.currentUser) {
      await firebaseSignOut(auth).catch(() => {});
    }
    setUser(null);
    setOrganization(null);
  }, []);

  const googleAuthEnabled = Boolean(auth && googleAuthProvider);

  return (
    <AuthContext.Provider
      value={{
        user,
        organization,
        demoModeEnabled,
        googleAuthEnabled,
        loading,
        darkMode,
        toggleDarkMode,
        refreshSession,
        applySessionToken,
        loginWithCredentials,
        registerAccount,
        verifyEmail,
        resendVerification,
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
