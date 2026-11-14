import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { indianPhoneSchema, loginSchema } from '../lib/validation';

type LoginFormValues = z.infer<typeof loginSchema>;

const signupFormSchema = z
  .object({
    accountType: z.enum(['OWNER', 'TENANT']),
    name: z.string().trim().min(2, 'Full name is required').max(120),
    organizationName: z.string().trim().max(120),
    email: z.string().trim().email('Enter a valid email address'),
    phone: indianPhoneSchema,
    password: z.string().min(6, 'Password must be at least 6 characters').max(100),
  })
  .refine(
    (val) => val.accountType !== 'OWNER' || val.organizationName.trim().length >= 2,
    {
      message: 'PG / Business name is required (min 2 characters)',
      path: ['organizationName'],
    }
  );

type SignupFormValues = z.infer<typeof signupFormSchema>;

export function LoginPage() {
  const {
    user,
    googleAuthEnabled,
    loginWithCredentials,
    registerAccount,
    verifyTenantOtp,
    forgotPassword,
    resetPassword,
    loginWithGoogle,
    logout,
  } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register' | 'otp' | 'forgot' | 'reset'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  );
  const [googleBusy, setGoogleBusy] = useState(false);

  // Tenant OTP verification state
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Forgot / Reset password state
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      accountType: 'OWNER',
      name: '',
      organizationName: '',
      email: '',
      phone: '',
      password: '',
    },
  });

  const accountType = signupForm.watch('accountType');

  const routeAfterLogin = (role: string) => {
    navigate(role === 'TENANT' ? '/tenant' : '/dashboard', { replace: true });
  };

  const onLoginSubmit = async (values: LoginFormValues) => {
    try {
      const u = await loginWithCredentials(values.identifier, values.password);
      showToast(`Welcome back, ${u.name}`);
      routeAfterLogin(u.role);
    } catch (err: any) {
      if (err?.data?.requiresOtp && err?.data?.email) {
        setOtpEmail(err.data.email);
        setMode('otp');
        showToast(err.message || 'Please complete OTP verification', 'info');
        return;
      }
      showToast(err.message || 'Sign in failed', 'error');
    }
  };

  const onSignupSubmit = async (values: SignupFormValues) => {
    try {
      const result = await registerAccount(values);
      if (result.requiresOtp && result.email) {
        setOtpEmail(result.email);
        setOtpCode('');
        setMode('otp');
        showToast('Enter the 6-digit OTP sent to verify your resident profile.', 'info');
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

  const onVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifyingOtp(true);
    try {
      const u = await verifyTenantOtp(otpEmail, otpCode.trim());
      showToast(`Verified! Welcome to your Resident Portal, ${u.name}`);
      routeAfterLogin(u.role);
    } catch (err: any) {
      showToast(err.message || 'Invalid or expired OTP', 'error');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const onForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetBusy(true);
    try {
      const res = await forgotPassword(resetIdentifier.trim());
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
    setResetBusy(true);
    try {
      const res = await resetPassword({
        identifier: resetIdentifier.trim(),
        code: resetCode.trim(),
        newPassword,
      });
      showToast(res.message);
      setResetCode('');
      setNewPassword('');
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

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to PGDesk Home
        </Link>

        {user && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs dark:border-teal-900 dark:bg-teal-950/40">
            <div className="min-w-0">
              <p className="font-semibold text-teal-900 dark:text-teal-200">
                Signed in as {user.name}
              </p>
              <p className="text-teal-700 dark:text-teal-400">
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
          {/* Sign In / Create Account Switcher */}
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
                Access Owner operations, Property Manager desk, or Resident Tenant Portal.
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
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
                        setResetIdentifier(loginForm.getValues('identifier') || '');
                        setMode('forgot');
                      }}
                      className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    placeholder="Enter password"
                    {...loginForm.register('password')}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
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
                Create your PGDesk account
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Launch a new PG business workspace or create your Resident portal login.
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
                      PG Owner / Operator
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
                      Resident / Tenant
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
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                  {signupForm.formState.errors.name && (
                    <p className="mt-1 text-xs text-red-600">{signupForm.formState.errors.name.message}</p>
                  )}
                </div>

                {accountType === 'OWNER' && (
                  <div>
                    <label htmlFor="reg-org" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      PG / Hostel Business Name
                    </label>
                    <input
                      id="reg-org"
                      type="text"
                      placeholder="e.g., GreenPark Residences"
                      {...signupForm.register('organizationName')}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    {signupForm.formState.errors.organizationName && (
                      <p className="mt-1 text-xs text-red-600">
                        {signupForm.formState.errors.organizationName.message}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Email Address
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      placeholder="name@company.com"
                      {...signupForm.register('email')}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    {signupForm.formState.errors.email && (
                      <p className="mt-1 text-xs text-red-600">{signupForm.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="reg-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Mobile Number
                    </label>
                    <input
                      id="reg-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      {...signupForm.register('phone')}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
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
                  <input
                    id="reg-password"
                    type="password"
                    placeholder="Create a strong password"
                    {...signupForm.register('password')}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
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

          {mode === 'otp' && (
            <form onSubmit={onVerifyOtpSubmit} className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Verify Resident Profile Ownership
              </h1>
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Your details matched an active resident profile. Enter the 6-digit OTP sent to{' '}
                <strong className="text-slate-900 dark:text-slate-200">{otpEmail}</strong> before linking your portal account.
              </p>
              <div>
                <label htmlFor="otp-input" className="block text-xs font-medium">
                  6-Digit OTP Code
                </label>
                <input
                  id="otp-input"
                  required
                  maxLength={6}
                  pattern="\d{6}"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-base tracking-widest focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={verifyingOtp || otpCode.length !== 6}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {verifyingOtp ? 'Verifying...' : 'Verify & Open Resident Portal'}
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

          {mode === 'forgot' && (
            <form onSubmit={onForgotSubmit} className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Reset Password
              </h1>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Enter your registered email or 10-digit mobile number to receive a 6-digit password reset code.
              </p>
              <div>
                <label htmlFor="forgot-id" className="block text-xs font-medium">
                  Email or Mobile Number
                </label>
                <input
                  id="forgot-id"
                  required
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="name@company.com or +91 98765 43210"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={resetBusy}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {resetBusy ? 'Sending code...' : 'Send Reset Code'}
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

          {mode === 'reset' && (
            <form onSubmit={onResetPasswordSubmit} className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Enter Reset Code &amp; New Password
              </h1>
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
                <input
                  id="reset-new-pwd"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
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
