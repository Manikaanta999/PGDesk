import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowLeft, Eye, EyeOff, LogOut, UserPlus } from 'lucide-react';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { classifyAuthError, getDashboardRouteForRole } from '../lib/authRoles';
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
    authPolicy,
    loginWithCredentials,
    registerAccount,
    loginWithGoogle,
    logout,
  } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialModeParam = searchParams.get('mode');
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    initialModeParam === 'register'
      ? 'register'
      : initialModeParam === 'forgot' || initialModeParam === 'reset'
        ? 'forgot'
        : 'login'
  );
  const [googleBusy, setGoogleBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const loginInFlightRef = useRef(false);
  const signupInFlightRef = useRef(false);

  // Password visibility toggles
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showSignupPwd, setShowSignupPwd] = useState(false);

  useEffect(() => {
    const m = searchParams.get('mode');
    if (m === 'register' || m === 'login') {
      setMode(m);
    } else if (m === 'forgot' || m === 'reset') {
      setMode('forgot');
    }
    setAuthError(null);
  }, [searchParams]);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      accountType: searchParams.get('role') === 'tenant' ? 'TENANT' : 'OWNER',
      name: '',
      organizationName: '',
      email: '',
      phone: '',
      password: '',
    },
  });

  const accountType = signupForm.watch('accountType');

  const routeAfterLogin = (role: string) => {
    navigate(getDashboardRouteForRole(role), { replace: true });
  };

  const onLoginSubmit = async (values: LoginFormValues) => {
    if (loginInFlightRef.current) return;
    loginInFlightRef.current = true;
    setAuthError(null);
    try {
      const normalizedIdentifier = values.identifier.trim();
      const u = await loginWithCredentials(normalizedIdentifier, values.password);
      showToast(`Welcome back, ${u.name}`);
      routeAfterLogin(u.role);
    } catch (err: unknown) {
      const classified = classifyAuthError(err, 'Sign in failed');
      setAuthError(classified.message);
      showToast(classified.message, 'error');
    } finally {
      loginInFlightRef.current = false;
    }
  };

  const onSignupSubmit = async (values: SignupFormValues) => {
    if (signupInFlightRef.current) return;
    signupInFlightRef.current = true;
    setAuthError(null);
    try {
      const result = await registerAccount({
        ...values,
        name: values.name.trim(),
        organizationName: values.organizationName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
      });
      if (result.user) {
        showToast(`Account created! Welcome to PGDesk, ${result.user.name}`);
        routeAfterLogin(result.user.role);
      }
    } catch (err: unknown) {
      const classified = classifyAuthError(err, 'Could not create account');
      setAuthError(classified.message);
      showToast(classified.message, 'error');
    } finally {
      signupInFlightRef.current = false;
    }
  };

  const handleGoogle = async () => {
    if (googleBusy) return;
    setGoogleBusy(true);
    setAuthError(null);
    try {
      const u = await loginWithGoogle();
      if (u) {
        showToast(`Signed in with Google as ${u.name}`);
        routeAfterLogin(u.role);
      } else {
        const msg = 'Login successful, but your account profile could not be loaded. Please contact support.';
        setAuthError(msg);
        showToast(msg, 'error');
      }
    } catch (err: unknown) {
      const classified = classifyAuthError(err, 'Google Sign-In failed');
      setAuthError(classified.message);
      showToast(classified.message, 'error');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthError(null);
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
                onClick={() => {
                  setMode('login');
                  setAuthError(null);
                }}
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
                onClick={() => {
                  setMode('register');
                  setAuthError(null);
                }}
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

          {authError && (mode === 'login' || mode === 'register') && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span>{authError}</span>
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
                      onClick={() => setMode('forgot')}
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
                  <div>
                    <label htmlFor="reg-org" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      PG / Hostel Business Name
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
                      className={inputClass}
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

          {mode === 'forgot' && (
            <div className="space-y-4">
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Forgot Password
              </h1>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                {authPolicy.forgotPasswordMessage}
              </div>
              {googleAuthEnabled && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                  Signed up with Google? Go back, click <strong>Continue with Google</strong>, and create or update your
                  password anytime under <strong>Account &amp; Security</strong>.
                </p>
              )}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800"
              >
                Back to Sign In
              </button>
            </div>
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
