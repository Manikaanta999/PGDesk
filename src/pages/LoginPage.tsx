import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Eye, EyeOff, LogOut, UserPlus } from 'lucide-react';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { loginSchema } from '../lib/validation';

type LoginFormValues = z.infer<typeof loginSchema>;

const signupFormSchema = z
  .object({
    accountType: z.enum(['OWNER', 'TENANT']),
    ownerRegistrationToken: z.string().trim(),
    name: z.string().trim().min(2, 'Full name is required').max(120),
    organizationName: z.string().trim().max(120),
    email: z.string().trim().email('Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .refine((val) => {
        if (!val) return true;
        const digits = val.replace(/\D/g, '');
        return digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
      }, 'Enter a valid 10-digit Indian mobile number'),
    password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  })
  .superRefine((val, ctx) => {
    if (val.accountType === 'OWNER') {
      if (val.organizationName.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'PG / Business name is required (min 2 characters)',
          path: ['organizationName'],
        });
      }
      if (!val.ownerRegistrationToken || val.ownerRegistrationToken.trim().length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Valid Owner Registration Token is required',
          path: ['ownerRegistrationToken'],
        });
      }
      if (!val.phone || val.phone.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid 10-digit Indian mobile number',
          path: ['phone'],
        });
      }
    }
  });

type SignupFormValues = z.infer<typeof signupFormSchema>;

export function LoginPage() {
  const {
    user,
    googleAuthEnabled,
    loginWithCredentials,
    registerAccount,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    loginWithGoogle,
    logout,
  } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialModeParam = searchParams.get('mode');
  const [mode, setMode] = useState<'login' | 'register' | 'verify-email' | 'forgot' | 'reset'>(
    initialModeParam === 'register'
      ? 'register'
      : initialModeParam === 'forgot'
        ? 'forgot'
        : initialModeParam === 'reset'
          ? 'reset'
          : initialModeParam === 'verify-email'
            ? 'verify-email'
            : 'login'
  );
  const [googleBusy, setGoogleBusy] = useState(false);

  // Password visibility toggles
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showSignupPwd, setShowSignupPwd] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [showConfirmResetPwd, setShowConfirmResetPwd] = useState(false);

  // Email verification state
  const [verifyEmailAddr, setVerifyEmailAddr] = useState(searchParams.get('email') || '');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);

  // Forgot / Reset password state (email-only)
  const [resetEmail, setResetEmail] = useState(searchParams.get('email') || searchParams.get('identifier') || '');
  const [resetCode, setResetCode] = useState(searchParams.get('code') || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'register' || m === 'forgot' || m === 'reset' || m === 'login' || m === 'verify-email') {
      setMode(m);
    }
  }, [searchParams]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      accountType: searchParams.get('role') === 'tenant' ? 'TENANT' : 'OWNER',
      ownerRegistrationToken: '',
      name: '',
      organizationName: '',
      email: '',
      phone: '',
      password: '',
    },
  });

  const accountType = signupForm.watch('accountType');

  const routeAfterLogin = (role: string) => {
    if (role === 'ADMIN') {
      navigate('/admin', { replace: true });
    } else if (role === 'TENANT') {
      navigate('/tenant', { replace: true });
    } else {
      navigate('/dashboard', { replace: true });
    }
  };

  const onLoginSubmit = async (values: LoginFormValues) => {
    try {
      const u = await loginWithCredentials(values.identifier, values.password);
      showToast(`Welcome back, ${u.name}`);
      routeAfterLogin(u.role);
    } catch (err: any) {
      if (err?.data?.requiresEmailVerification && err?.data?.email) {
        setVerifyEmailAddr(err.data.email);
        setVerifyCode('');
        setMode('verify-email');
        showToast(err.message || 'Please verify your email address to continue', 'info');
        return;
      }
      showToast(err.message || 'Sign in failed', 'error');
    }
  };

  const onSignupSubmit = async (values: SignupFormValues) => {
    try {
      const result = await registerAccount({
        ...values,
        ownerRegistrationToken:
          values.accountType === 'OWNER' ? values.ownerRegistrationToken?.trim() : undefined,
        phone: values.phone?.trim() || undefined,
      });
      if (result.requiresEmailVerification && result.email) {
        setVerifyEmailAddr(result.email);
        setVerifyCode('');
        setMode('verify-email');
        showToast(
          result.message || 'Verification code sent to your email. Enter it below to activate your account.',
          'info'
        );
        return;
      }
      if (result.user) {
        showToast(`Account created! Welcome to PGDesk, ${result.user.name}`);
        routeAfterLogin(result.user.role);
      }
    } catch (err: any) {
      showToast(err.message || 'Could not create account', 'error');
    }
  };

  const onVerifyEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyingEmail(true);
    try {
      const u = await verifyEmail(verifyEmailAddr.trim(), verifyCode.trim());
      showToast(`Email verified! Welcome to PGDesk, ${u.name}`);
      routeAfterLogin(u.role);
    } catch (err: any) {
      showToast(err.message || 'Invalid or expired verification code', 'error');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const onResendVerification = async () => {
    if (!verifyEmailAddr.trim() || resendBusy) return;
    setResendBusy(true);
    try {
      const res = await resendVerification(verifyEmailAddr.trim());
      showToast(res.message || 'Verification code sent to your email', 'info');
    } catch (err: any) {
      showToast(err.message || 'Could not resend verification code', 'error');
    } finally {
      setResendBusy(false);
    }
  };

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetBusy(true);
    try {
      const res = await forgotPassword(resetEmail.trim());
      showToast(res.message, 'info');
      setMode('reset');
    } catch (err: any) {
      showToast(err.message || 'Could not initiate reset', 'error');
    } finally {
      setResetBusy(false);
    }
  };

  const onResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast('New password must be at least 6 characters', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast('New password and confirmation do not match', 'error');
      return;
    }
    setResetBusy(true);
    try {
      const res = await resetPassword({
        email: resetEmail.trim(),
        code: resetCode.trim(),
        newPassword,
      });
      showToast(res.message);
      setResetCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setMode('login');
    } catch (err: any) {
      showToast(err.message || 'Could not reset password', 'error');
    } finally {
      setResetBusy(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      const u = await loginWithGoogle();
      if (u) {
        showToast(`Signed in with Google as ${u.name}`);
        routeAfterLogin(u.role);
      } else {
        showToast('Could not complete Google verification with server', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Google Sign-In failed', 'error');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    showToast('Logged out successfully');
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:bg-slate-950';

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-md">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to PGDesk Home</span>
          </Link>
          <LanguageSwitcher compact />
        </div>

        {user && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs dark:border-teal-900 dark:bg-teal-950/40">
            <div className="min-w-0">
              <p className="font-semibold text-teal-900 dark:text-teal-200">
                Signed in as {user.name}
              </p>
              <p className="truncate text-teal-700 dark:text-teal-400">
                {user.role} · {user.email}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => routeAfterLogin(user.role)}
                className="rounded-lg bg-teal-700 px-3 py-1.5 font-semibold text-white hover:bg-teal-800"
              >
                Open
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-7 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {(mode === 'login' || mode === 'register') && (
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('register')}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Create Account</span>
              </button>
            </div>
          )}

          {mode === 'login' && (
            <>
              <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Sign in to PGDesk
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Open your Hostel Owner, Manager, or Student account.
              </p>

              <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="login-identifier" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Email or Mobile Number
                  </label>
                  <input
                    id="login-identifier"
                    type="text"
                    placeholder="name@company.com or +91 98765 43210"
                    {...loginForm.register('identifier')}
                    className={inputClass}
                  />
                  {loginForm.formState.errors.identifier && (
                    <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.identifier.message}</p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const typed = loginForm.getValues('identifier') || '';
                        setResetEmail(typed.includes('@') ? typed : '');
                        setMode('forgot');
                      }}
                      className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showLoginPwd ? 'text' : 'password'}
                      placeholder="Enter password"
                      {...loginForm.register('password')}
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPwd((v) => !v)}
                      aria-label={showLoginPwd ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      {showLoginPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {loginForm.formState.errors.password && (
                    <p className="mt-1 text-xs text-red-600">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loginForm.formState.isSubmitting}
                  className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
                >
                  {loginForm.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </>
          )}

          {mode === 'register' && (
            <>
              <h1 className="mt-5 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Start Using PGDesk
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Create your free hostel register account or student login.
              </p>

              <form onSubmit={signupForm.handleSubmit(onSignupSubmit)} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Account Type
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => signupForm.setValue('accountType', 'OWNER')}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        accountType === 'OWNER'
                          ? 'border-teal-700 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-300'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Hostel / PG Owner
                    </button>
                    <button
                      type="button"
                      onClick={() => signupForm.setValue('accountType', 'TENANT')}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                        accountType === 'TENANT'
                          ? 'border-teal-700 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-300'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      Student / Tenant
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    placeholder="Enter your full name"
                    {...signupForm.register('name')}
                    className={inputClass}
                  />
                  {signupForm.formState.errors.name && (
                    <p className="mt-1 text-xs text-red-600">{signupForm.formState.errors.name.message}</p>
                  )}
                </div>

                {accountType === 'OWNER' && (
                  <>
                    <div>
                      <label htmlFor="reg-token" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Owner Registration Token *
                      </label>
                      <input
                        id="reg-token"
                        type="text"
                        placeholder="PGDESKOWNER-XXXX-XXXX-XXXX"
                        {...signupForm.register('ownerRegistrationToken')}
                        className={`${inputClass} font-mono uppercase`}
                      />
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Single-use onboarding token issued by PGDesk platform admin.
                      </p>
                      {signupForm.formState.errors.ownerRegistrationToken && (
                        <p className="mt-1 text-xs text-red-600">
                          {signupForm.formState.errors.ownerRegistrationToken.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="reg-org" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        PG / Hostel Business Name *
                      </label>
                      <input
                        id="reg-org"
                        type="text"
                        placeholder="e.g., GreenPark Residences"
                        {...signupForm.register('organizationName')}
                        className={inputClass}
                      />
                      {signupForm.formState.errors.organizationName && (
                        <p className="mt-1 text-xs text-red-600">
                          {signupForm.formState.errors.organizationName.message}
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Email Address *
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      placeholder="name@company.com"
                      {...signupForm.register('email')}
                      className={inputClass}
                    />
                    {signupForm.formState.errors.email && (
                      <p className="mt-1 text-xs text-red-600">{signupForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="reg-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Mobile Number {accountType === 'TENANT' ? '(Optional)' : '*'}
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      {...signupForm.register('phone')}
                      className={inputClass}
                    />
                    {signupForm.formState.errors.phone && (
                      <p className="mt-1 text-xs text-red-600">{signupForm.formState.errors.phone.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Password (min 6 characters)
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showSignupPwd ? 'text' : 'password'}
                      placeholder="Create a strong password"
                      {...signupForm.register('password')}
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPwd((v) => !v)}
                      aria-label={showSignupPwd ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      {showSignupPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {signupForm.formState.errors.password && (
                    <p className="mt-1 text-xs text-red-600">{signupForm.formState.errors.password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={signupForm.formState.isSubmitting}
                  className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
                >
                  {signupForm.formState.isSubmitting ? 'Creating account...' : 'Create Account & Continue'}
                </button>
              </form>
            </>
          )}

          {mode === 'verify-email' && (
            <form onSubmit={onVerifyEmailSubmit} className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Verify Your Email Address
              </h1>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Enter the 6-digit verification code sent to{' '}
                <strong className="text-slate-900 dark:text-slate-200">{verifyEmailAddr || 'your email'}</strong> to
                activate your PGDesk account.
              </p>
              {!verifyEmailAddr && (
                <div>
                  <label htmlFor="verify-email-addr" className="block text-xs font-medium">
                    Email Address
                  </label>
                  <input
                    id="verify-email-addr"
                    type="email"
                    required
                    value={verifyEmailAddr}
                    onChange={(e) => setVerifyEmailAddr(e.target.value)}
                    placeholder="name@company.com"
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label htmlFor="verify-email-code" className="block text-xs font-medium">
                  6-Digit Email Verification Code
                </label>
                <input
                  id="verify-email-code"
                  required
                  maxLength={6}
                  pattern="\d{6}"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-base tracking-widest focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={verifyingEmail || verifyCode.length !== 6}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {verifyingEmail ? 'Verifying...' : 'Verify Email & Continue'}
              </button>
              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                <button
                  type="button"
                  disabled={resendBusy || !verifyEmailAddr.trim()}
                  onClick={onResendVerification}
                  className="font-medium text-teal-700 hover:underline disabled:opacity-50 dark:text-teal-400"
                >
                  {resendBusy ? 'Sending...' : 'Resend verification code'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={onForgotSubmit} className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Reset Password
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Enter your registered email address to receive a 6-digit password reset code.
              </p>
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-medium">
                  Registered Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@company.com"
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={resetBusy}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {resetBusy ? 'Sending code...' : 'Send Email Reset Code'}
              </button>
              {googleAuthEnabled && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  Signed up with Google? Go back, click <strong>Continue with Google</strong>, and set or reset your
                  password anytime under <strong>Account &amp; Security</strong>.
                </p>
              )}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Back to Sign In
              </button>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={onResetPasswordSubmit} className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Set New Password
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Enter the 6-digit code sent to your email and choose a new password for your account.
              </p>
              <div>
                <label htmlFor="reset-email" className="block text-xs font-medium">
                  Registered Email Address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@company.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="reset-code" className="block text-xs font-medium">
                  6-Digit Reset Code
                </label>
                <input
                  id="reset-code"
                  required
                  maxLength={6}
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-base tracking-widest focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor="reset-new-pwd" className="block text-xs font-medium">
                  New Password (min 6 characters)
                </label>
                <div className="relative">
                  <input
                    id="reset-new-pwd"
                    type={showResetPwd ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPwd((v) => !v)}
                    aria-label={showResetPwd ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="reset-confirm-pwd" className="block text-xs font-medium">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="reset-confirm-pwd"
                    type={showConfirmResetPwd ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmResetPwd((v) => !v)}
                    aria-label={showConfirmResetPwd ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showConfirmResetPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                )}
              </div>
              <button
                type="submit"
                disabled={resetBusy || resetCode.length !== 6}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {resetBusy ? 'Updating...' : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Back to Sign In
              </button>
            </form>
          )}

          {(mode === 'login' || mode === 'register') && googleAuthEnabled && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span className="text-xs text-slate-400">or</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleBusy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span>{googleBusy ? 'Connecting Google...' : 'Continue with Google'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
