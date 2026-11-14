import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Building2,
  CreditCard,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquareWarning,
  Moon,
  Receipt,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface DashboardLayoutProps {
  title: string;
  breadcrumb?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/properties', label: 'Properties & Beds', icon: Building2, end: false },
  { to: '/dashboard/tenants', label: 'Tenants', icon: Users, end: false },
  { to: '/dashboard/billing', label: 'Rent & Billing', icon: CreditCard, end: false },
  { to: '/dashboard/complaints', label: 'Complaints', icon: MessageSquareWarning, end: false },
  { to: '/dashboard/notices', label: 'Notices', icon: Megaphone, end: false },
  { to: '/dashboard/leads', label: 'Enquiries & Leads', icon: Inbox, end: false },
  { to: '/dashboard/expenses', label: 'Expenses & P&L', icon: Receipt, end: false },
  { to: '/dashboard/settings', label: 'Settings', icon: Settings, end: false },
];

export function DashboardLayout({ title, breadcrumb, actions, children }: DashboardLayoutProps) {
  const { user, organization, darkMode, toggleDarkMode, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white px-4 py-5 dark:bg-slate-900">
      <div>
        <div className="flex items-center justify-between px-2 pb-5">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-white"
          >
            PGDesk
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 border-b border-slate-200 px-2 pb-4 dark:border-slate-800">
          <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
            {organization?.name || 'PG Operations'}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {user?.name} · {user?.role === 'OWNER' ? 'Owner' : 'Manager'}
          </p>
        </div>

        <nav aria-label="Dashboard Navigation" className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="space-y-1 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button
          type="button"
          onClick={toggleDarkMode}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          {darkMode ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
          <span>{darkMode ? 'Light Appearance' : 'Dark Appearance'}</span>
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Log Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 lg:block dark:border-slate-800">
        <div className="sticky top-0 h-screen overflow-y-auto">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-50 w-72 max-w-[85vw] border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xs sm:flex-nowrap sm:gap-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
          <div className="flex min-w-[200px] flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              {breadcrumb && (
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{breadcrumb}</p>
              )}
              <h1 className="truncate font-display text-lg font-semibold text-slate-900 sm:text-xl dark:text-white">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
