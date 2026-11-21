import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  BedDouble,
  Building2,
  ChevronDown,
  CreditCard,
  HelpCircle,
  Home,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquareWarning,
  Moon,
  MoreHorizontal,
  Receipt,
  Settings,
  ShieldCheck,
  Sun,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AuthorizedImage } from '../ui/AuthorizedImage';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

interface DashboardLayoutProps {
  title: string;
  breadcrumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { id: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'hostels', to: '/dashboard/properties', label: 'My Hostels', icon: Building2 },
  { id: 'students', to: '/dashboard/tenants', label: 'Students', icon: Users },
  { id: 'rooms', to: '/dashboard/properties?tab=rooms', label: 'Rooms & Beds', icon: BedDouble },
  { id: 'billing', to: '/dashboard/billing', label: 'Rent & Payments', icon: CreditCard },
  { id: 'expenses', to: '/dashboard/expenses', label: 'Income & Expenses', icon: Receipt },
  { id: 'complaints', to: '/dashboard/complaints', label: 'Complaints', icon: MessageSquareWarning },
  { id: 'leads', to: '/dashboard/leads', label: 'Room Enquiries', icon: Inbox },
  { id: 'notices', to: '/dashboard/notices', label: 'Notices', icon: Megaphone },
  { id: 'settings', to: '/dashboard/settings', label: 'Settings', icon: Settings },
] as const;

const MORE_MENU_ITEMS = [
  { id: 'hostels', to: '/dashboard/properties', label: 'Hostels', sub: 'Manage hostel details', icon: Building2 },
  {
    id: 'rooms',
    to: '/dashboard/properties?tab=rooms',
    label: 'Rooms and Beds',
    sub: 'Check empty & occupied beds',
    icon: BedDouble,
  },
  { id: 'expenses', to: '/dashboard/expenses', label: 'Expenses', sub: 'Log bills, staff & upkeep', icon: Receipt },
  {
    id: 'complaints',
    to: '/dashboard/complaints',
    label: 'Complaints',
    sub: 'Track & resolve issues',
    icon: MessageSquareWarning,
  },
  { id: 'leads', to: '/dashboard/leads', label: 'Enquiries', sub: 'Follow up on room calls', icon: Inbox },
  { id: 'notices', to: '/dashboard/notices', label: 'Notices', sub: 'Post updates to students', icon: Megaphone },
  {
    id: 'reports',
    to: '/dashboard/expenses#monthly-pnl',
    label: 'Reports',
    sub: 'Monthly income & profit',
    icon: BarChart3,
  },
  { id: 'settings', to: '/dashboard/settings', label: 'Settings', sub: 'UPI, rent rules & account', icon: Settings },
  { id: 'help', to: '/dashboard/settings?tab=help', label: 'Help', sub: 'How to use PGDesk', icon: HelpCircle },
] as const;

export function DashboardLayout({ title, breadcrumb, actions, children }: DashboardLayoutProps) {
  const { user, organization, darkMode, toggleDarkMode, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const mobileAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopAccountMenuRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMobile = mobileAccountMenuRef.current?.contains(target);
      const inDesktop = desktopAccountMenuRef.current?.contains(target);
      if (!inMobile && !inDesktop) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAccountMenuOpen(false);
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setMoreOpen(false);
    await logout();
    navigate('/login');
  };

  const isNavItemActive = (id: (typeof NAV_ITEMS)[number]['id'] | 'reports' | 'help') => {
    const path = location.pathname;
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    switch (id) {
      case 'dashboard':
        return path === '/dashboard';
      case 'hostels':
        return path === '/dashboard/properties' && tab !== 'rooms';
      case 'rooms':
        return path === '/dashboard/properties' && tab === 'rooms';
      case 'students':
        return path.startsWith('/dashboard/tenants');
      case 'billing':
        return path.startsWith('/dashboard/billing');
      case 'expenses':
        return path.startsWith('/dashboard/expenses') && location.hash !== '#monthly-pnl';
      case 'reports':
        return path.startsWith('/dashboard/expenses') && location.hash === '#monthly-pnl';
      case 'complaints':
        return path.startsWith('/dashboard/complaints');
      case 'leads':
        return path.startsWith('/dashboard/leads');
      case 'notices':
        return path.startsWith('/dashboard/notices');
      case 'settings':
        return path.startsWith('/dashboard/settings') && tab !== 'help';
      case 'help':
        return path.startsWith('/dashboard/settings') && tab === 'help';
    }
  };

  const isBottomHome = isNavItemActive('dashboard');
  const isBottomStudents = isNavItemActive('students');
  const isBottomRent = isNavItemActive('billing');
  const isBottomMore = !isBottomHome && !isBottomStudents && !isBottomRent;

  const initials = (user?.name || 'O')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 lg:h-dvh lg:overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 lg:block lg:min-h-0 dark:border-slate-800">
        <div className="sticky top-0 h-dvh overflow-y-auto">
          <div className="flex h-full flex-col justify-between bg-white px-4 py-5 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between px-2 pb-5">
                <Link
                  to="/"
                  className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-white"
                >
                  PGDesk
                </Link>
              </div>

              <div className="mb-4 border-b border-slate-200 px-2 pb-4 dark:border-slate-800">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {organization?.name || 'Hostel Register'}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                  {user?.name} · {user?.role === 'OWNER' ? 'Owner' : 'Manager'}
                </p>
              </div>

              <nav aria-label="Dashboard Navigation" className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemActive(item.id);
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      className={`flex min-h-[42px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-teal-50 text-teal-800 font-semibold dark:bg-teal-950/60 dark:text-teal-300'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="leading-snug">{item.label}</span>
                    </Link>
                  );
                })}
                <Link
                  to="/dashboard/settings?tab=help"
                  className={`flex min-h-[42px] items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                    isNavItemActive('help')
                      ? 'bg-teal-50 text-teal-800 font-semibold dark:bg-teal-950/60 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <HelpCircle className="h-4 w-4 shrink-0" />
                  <span className="leading-snug">Help</span>
                </Link>
              </nav>
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <div className="px-1 pb-1">
                <LanguageSwitcher compact className="w-full justify-center" />
              </div>
              <button
                type="button"
                onClick={toggleDarkMode}
                className="flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                {darkMode ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                <span>{darkMode ? 'Light Appearance' : 'Dark Appearance'}</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-[40px] w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <header className="flex flex-col gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 sm:sticky sm:top-0 sm:z-20 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {breadcrumb && (
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{breadcrumb}</p>
              )}
              <h1 className="font-display truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                {title}
              </h1>
            </div>

            {/* Mobile compact account dropdown on top row */}
            <div className="relative shrink-0 sm:hidden" ref={mobileAccountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((o) => !o)}
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-[11px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  <AuthorizedImage
                    src={user?.photoUrl}
                    alt={user?.name || 'User'}
                    className="h-full w-full object-cover"
                    fallback={<span>{initials}</span>}
                  />
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{user?.email}</p>
                  </div>
                  <Link
                    to="/dashboard/settings?tab=account"
                    onClick={() => setAccountMenuOpen(false)}
                    className="mt-1 flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>My Profile</span>
                  </Link>
                  <Link
                    to="/dashboard/settings?tab=account"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Account Settings</span>
                  </Link>
                  <Link
                    to="/dashboard/settings?tab=security"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Security</span>
                  </Link>
                  <Link
                    to="/dashboard/settings?tab=hostel"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Hostel Settings</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 flex min-h-[40px] w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
            {actions}

            {/* Desktop compact Account Menu */}
            <div className="relative hidden sm:block" ref={desktopAccountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((o) => !o)}
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                className="flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-[11px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  <AuthorizedImage
                    src={user?.photoUrl}
                    alt={user?.name || 'User'}
                    className="h-full w-full object-cover"
                    fallback={<span>{initials}</span>}
                  />
                </span>
                <span className="max-w-[110px] truncate">{user?.name || 'Account'}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{user?.name}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{user?.email}</p>
                  </div>
                  <Link
                    to="/dashboard/settings?tab=account"
                    onClick={() => setAccountMenuOpen(false)}
                    className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>My Profile</span>
                  </Link>
                  <Link
                    to="/dashboard/settings?tab=account"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Account Settings</span>
                  </Link>
                  <Link
                    to="/dashboard/settings?tab=security"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Security</span>
                  </Link>
                  <Link
                    to="/dashboard/settings?tab=hostel"
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Hostel Settings</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:min-h-0 lg:overflow-y-auto lg:p-8 lg:pb-8">{children}</main>
      </div>

      {/* Mobile & Tablet More Sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More hostel options"
        >
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 w-full max-w-lg rounded-t-2xl border-t border-slate-200 bg-white pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <p className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {organization?.name || 'Hostel Register'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user?.name} · {user?.role === 'OWNER' ? 'Owner' : 'Manager'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close more options"
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto px-4 py-3">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {MORE_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemActive(item.id);
                  return (
                    <Link
                      key={item.id}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                        active
                          ? 'border-teal-600 bg-teal-50 text-teal-900 dark:border-teal-500 dark:bg-teal-950/50 dark:text-teal-200'
                          : 'border-slate-200 bg-slate-50/70 text-slate-800 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0 text-teal-700 dark:text-teal-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{item.label}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.sub}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 dark:border-slate-800">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Language</span>
                  <LanguageSwitcher compact />
                </div>
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className="flex min-h-[48px] w-full items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <span className="flex items-center gap-2.5">
                    {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    <span>{darkMode ? 'Light Appearance' : 'Dark Appearance'}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Owner bottom navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="grid grid-cols-4">
          <Link
            to="/dashboard"
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              isBottomHome && !moreOpen
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                isBottomHome && !moreOpen ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <Home className="mt-0.5 h-5 w-5" />
            <span>Home</span>
          </Link>

          <Link
            to="/dashboard/tenants"
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              isBottomStudents && !moreOpen
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                isBottomStudents && !moreOpen ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <Users className="mt-0.5 h-5 w-5" />
            <span>Students</span>
          </Link>

          <Link
            to="/dashboard/billing"
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              isBottomRent && !moreOpen
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                isBottomRent && !moreOpen ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <CreditCard className="mt-0.5 h-5 w-5" />
            <span>Rent</span>
          </Link>

          <button
            type="button"
            onClick={() => setMoreOpen((prev) => !prev)}
            aria-expanded={moreOpen}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              moreOpen || isBottomMore
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                moreOpen || isBottomMore ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <MoreHorizontal className="mt-0.5 h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
