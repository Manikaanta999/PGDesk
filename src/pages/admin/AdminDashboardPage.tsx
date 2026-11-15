import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Building2,
  Check,
  Copy,
  FileSearch,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatAccountLinkStatus, formatEnquiryStage, formatGenderType, formatTenantStatus } from '../../lib/dashboardHelpers';
import { formatDateIN, formatIndianPhone } from '../../lib/format';

type AdminTab = 'overview' | 'tokens' | 'owners' | 'hostels' | 'students' | 'enquiries' | 'settings';

interface AdminOverviewData {
  metrics: {
    totalOwners: number;
    totalHostels: number;
    activeHostels: number;
    totalStudentRecords: number;
    activeStays: number;
    studentsWithAccounts: number;
    studentsWithoutAccounts: number;
    pendingAccountLinks: number;
    pendingEnquiries: number;
    unusedOwnerTokens: number;
  };
  bootstrap: {
    adminEmail: string;
    adminExists: boolean;
    adminActive: boolean;
    lastLoginAt: string | null;
    bootstrapEnabled: boolean;
    bootstrapLocked: boolean;
    hasEnvPasswordConfigured: boolean;
  };
  recentAuditLogs: Array<{
    id: number;
    actorName: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
}

interface AdminTokenRow {
  id: number;
  tokenMask: string;
  tokenLast4: string;
  note: string;
  status: 'UNUSED' | 'USED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
  createdByName: string;
  usedAt: string | null;
  usedByName: string | null;
  usedByEmail: string | null;
  usedByOrganizationName: string | null;
  revokedAt: string | null;
}

interface GeneratedTokenItem {
  id: number;
  token: string;
  tokenLast4: string;
  note: string;
  status: 'UNUSED';
  expiresAt: string;
  createdAt: string;
}

interface AdminOwnerRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  organizationId: number;
  organizationName: string;
  hostelCount: number;
  studentCount: number;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminHostelRow {
  id: number;
  name: string;
  slug: string;
  city: string;
  locality: string;
  genderType: string;
  isPublic: boolean;
  organizationName: string;
  ownerName: string;
  ownerEmail: string;
  totalBeds: number;
  occupiedBeds: number;
  studentCount: number;
  activeStudentCount: number;
  createdAt: string;
}

interface AdminStudentRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  propertyId: number;
  propertyName: string;
  organizationId: number;
  organizationName: string;
  roomNumber: string | null;
  bedLabel: string | null;
  stayStatus: string;
  hasAccount: boolean;
  accountLinkStatus: string;
  joinDate: string;
  leaveDate: string | null;
}

interface AdminEnquiryRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  propertyName: string;
  city: string;
  organizationName: string;
  preferredRoomType: string;
  moveInDate: string | null;
  message: string;
  status: string;
  createdAt: string;
}

const STUDENT_FILTERS = [
  { id: 'ALL', label: 'All Records' },
  { id: 'HAS_ACCOUNT', label: 'Has Account' },
  { id: 'NO_ACCOUNT', label: 'No Account' },
  { id: 'LINKED', label: 'Linked' },
  { id: 'PENDING_LINK', label: 'Pending Link' },
  { id: 'ACTIVE', label: 'Active Stay' },
  { id: 'MOVED_OUT', label: 'Moved Out' },
] as const;

const TOKEN_FILTERS = ['ALL', 'UNUSED', 'USED', 'EXPIRED', 'REVOKED'] as const;

export function AdminDashboardPage() {
  const { user, darkMode, toggleDarkMode, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<AdminTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [tokens, setTokens] = useState<AdminTokenRow[]>([]);
  const [owners, setOwners] = useState<AdminOwnerRow[]>([]);
  const [hostels, setHostels] = useState<AdminHostelRow[]>([]);
  const [students, setStudents] = useState<AdminStudentRow[]>([]);
  const [enquiries, setEnquiries] = useState<AdminEnquiryRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminOverviewData['recentAuditLogs']>([]);

  // Token Generator state
  const [tokenCount, setTokenCount] = useState(1);
  const [tokenExpiryDays, setTokenExpiryDays] = useState(30);
  const [tokenNote, setTokenNote] = useState('');
  const [generatingTokens, setGeneratingTokens] = useState(false);
  const [newlyGenerated, setNewlyGenerated] = useState<GeneratedTokenItem[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [tokenFilter, setTokenFilter] = useState<(typeof TOKEN_FILTERS)[number]>('ALL');
  const [revokingId, setRevokingId] = useState<number | null>(null);

  // Student filters
  const [studentFilter, setStudentFilter] = useState<string>('ALL');
  const [studentSearch, setStudentSearch] = useState('');

  // Settings lock
  const [lockingBootstrap, setLockingBootstrap] = useState(false);

  const loadAllAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, tokRes, ownRes, hosRes, enqRes, logRes] = await Promise.all([
        apiFetch<AdminOverviewData>('/api/admin/overview'),
        apiFetch<{ tokens: AdminTokenRow[] }>('/api/admin/tokens'),
        apiFetch<{ owners: AdminOwnerRow[] }>('/api/admin/owners'),
        apiFetch<{ hostels: AdminHostelRow[] }>('/api/admin/hostels'),
        apiFetch<{ enquiries: AdminEnquiryRow[] }>('/api/admin/enquiries'),
        apiFetch<{ auditLogs: AdminOverviewData['recentAuditLogs'] }>('/api/admin/audit-logs'),
      ]);
      setOverview(ovRes);
      setTokens(tokRes.tokens);
      setOwners(ownRes.owners);
      setHostels(hosRes.hostels);
      setEnquiries(enqRes.enquiries);
      setAuditLogs(logRes.auditLogs);
    } catch (err: any) {
      showToast(err.message || 'Failed to load admin console', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const loadStudents = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ filter: studentFilter });
      if (studentSearch.trim()) qs.set('search', studentSearch.trim());
      const res = await apiFetch<{ students: AdminStudentRow[] }>(`/api/admin/students?${qs.toString()}`);
      setStudents(res.students);
    } catch (err: any) {
      showToast(err.message || 'Failed to load student overview', 'error');
    }
  }, [studentFilter, studentSearch, showToast]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleGenerateTokens = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingTokens(true);
    try {
      const res = await apiFetch<{ tokens: GeneratedTokenItem[]; message: string }>('/api/admin/tokens', {
        method: 'POST',
        body: JSON.stringify({
          count: tokenCount,
          expiresInDays: tokenExpiryDays,
          note: tokenNote.trim(),
        }),
      });
      setNewlyGenerated(res.tokens);
      setTokenNote('');
      showToast(res.message || 'Owner registration token generated');
      await loadAllAdminData();
    } catch (err: any) {
      showToast(err.message || 'Could not generate owner token', 'error');
    } finally {
      setGeneratingTokens(false);
    }
  };

  const handleRevokeToken = async (id: number) => {
    setRevokingId(id);
    try {
      await apiFetch(`/api/admin/tokens/${id}/revoke`, { method: 'POST' });
      showToast('Token revoked');
      await loadAllAdminData();
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke token', 'error');
    } finally {
      setRevokingId(null);
    }
  };

  const handleLockBootstrap = async () => {
    setLockingBootstrap(true);
    try {
      const res = await apiFetch<{ ok: boolean; bootstrapStatus: AdminOverviewData['bootstrap'] }>(
        '/api/admin/bootstrap-lock',
        { method: 'POST' }
      );
      setOverview((prev) => (prev ? { ...prev, bootstrap: res.bootstrapStatus } : prev));
      showToast('Initial admin bootstrap permanently locked');
      await loadAllAdminData();
    } catch (err: any) {
      showToast(err.message || 'Failed to lock bootstrap', 'error');
    } finally {
      setLockingBootstrap(false);
    }
  };

  const copyText = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      showToast('Copied to clipboard');
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      showToast('Copy failed — select and copy manually', 'error');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const filteredTokens = useMemo(
    () => tokens.filter((t) => tokenFilter === 'ALL' || t.status === tokenFilter),
    [tokens, tokenFilter]
  );

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'tokens', label: 'Owner Tokens', icon: KeyRound },
    { id: 'owners', label: 'Owners', icon: Shield },
    { id: 'hostels', label: 'Hostels', icon: Building2 },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'enquiries', label: 'Enquiries', icon: FileSearch },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  const selectTab = (next: AdminTab) => {
    setTab(next);
    setMobileMenuOpen(false);
  };

  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
          <p className="font-mono text-[11px] font-semibold tracking-wider text-teal-700 uppercase dark:text-teal-400">
            Platform Admin
          </p>
          <p className="mt-0.5 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            PGDesk Control
          </p>
        </div>
        <nav aria-label="Admin Navigation" className="mt-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`flex min-h-[42px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="px-2 text-xs">
          <p className="truncate font-semibold text-slate-900 dark:text-white">{user?.name || 'Administrator'}</p>
          <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-[40px] w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
          <div className="sticky top-0 h-screen">{renderSidebarContent()}</div>
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileMenuOpen(false)} />
            <div className="relative z-10 w-64 bg-white dark:bg-slate-900">
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
              {renderSidebarContent()}
            </div>
          </div>
        )}

        {/* Main Workspace */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xs sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Open navigation menu"
                  onClick={() => setMobileMenuOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 lg:hidden dark:border-slate-700 dark:text-slate-200"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div>
                  <h1 className="font-display text-lg font-bold tracking-tight text-slate-900 sm:text-xl dark:text-white">
                    {navItems.find((n) => n.id === tab)?.label || 'Overview'}
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Private PGDesk platform oversight &amp; owner onboarding tokens
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loadAllAdminData();
                    loadStudents();
                  }}
                  aria-label="Refresh platform data"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  aria-label="Toggle theme"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
            {loading && !overview ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                  />
                ))}
              </div>
            ) : tab === 'overview' && overview ? (
              <div className="space-y-6">
                {/* 10 Platform Metrics */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    { label: 'Total Owners', value: overview.metrics.totalOwners },
                    { label: 'Total Hostels', value: overview.metrics.totalHostels },
                    { label: 'Active Hostels', value: overview.metrics.activeHostels },
                    { label: 'Total Student Records', value: overview.metrics.totalStudentRecords },
                    { label: 'Active Stays', value: overview.metrics.activeStays },
                    { label: 'Students With Accounts', value: overview.metrics.studentsWithAccounts },
                    { label: 'Students Without Accounts', value: overview.metrics.studentsWithoutAccounts },
                    { label: 'Pending Account Links', value: overview.metrics.pendingAccountLinks },
                    { label: 'Pending Enquiries', value: overview.metrics.pendingEnquiries },
                    { label: 'Unused Owner Tokens', value: overview.metrics.unusedOwnerTokens },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                    >
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{m.label}</p>
                      <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {m.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Quick Token Action + Bootstrap Status */}
                <div className="grid gap-6 lg:grid-cols-12">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                      <h2 className="font-display text-sm font-semibold">Owner Registration Gate</h2>
                      <button
                        type="button"
                        onClick={() => setTab('tokens')}
                        className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                      >
                        Manage Tokens →
                      </button>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      New hostel owners can only register with an unused one-time token generated here. Currently{' '}
                      <strong className="font-mono text-slate-900 dark:text-white">
                        {overview.metrics.unusedOwnerTokens}
                      </strong>{' '}
                      unused {overview.metrics.unusedOwnerTokens === 1 ? 'token is' : 'tokens are'} active.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTab('tokens')}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Generate Owner Token</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('settings')}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        <span>
                          Bootstrap: {overview.bootstrap.bootstrapLocked ? 'Locked' : 'Unlocked'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                      <h2 className="font-display text-sm font-semibold">Recent Security &amp; Platform Activity</h2>
                      <button
                        type="button"
                        onClick={() => setTab('settings')}
                        className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                      >
                        View All Logs →
                      </button>
                    </div>
                    <div className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                      {overview.recentAuditLogs.length === 0 ? (
                        <p className="py-4 text-slate-500">No recent audit events logged.</p>
                      ) : (
                        overview.recentAuditLogs.slice(0, 6).map((log) => (
                          <div key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900 dark:text-white">
                                {log.action.replace(/_/g, ' ')}
                              </p>
                              <p className="truncate text-slate-500 dark:text-slate-400">
                                {log.actorName} ({log.actorRole}) · {log.entityType} #{log.entityId}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[11px] text-slate-400 tabular-nums">
                              {formatDateIN(log.createdAt)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : tab === 'tokens' ? (
              <div className="space-y-6">
                {/* Generate Tokens Form */}
                <form
                  onSubmit={handleGenerateTokens}
                  className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
                >
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Generate Single or Batch Owner Registration Tokens
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Each token is single-use and stored strictly as a SHA-256 hash. Copy and share plaintext tokens
                    immediately upon creation.
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-4">
                    <div>
                      <label htmlFor="tok-count" className="block text-xs font-medium">
                        Quantity (1–50)
                      </label>
                      <input
                        id="tok-count"
                        type="number"
                        min={1}
                        max={50}
                        value={tokenCount}
                        onChange={(e) => setTokenCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label htmlFor="tok-days" className="block text-xs font-medium">
                        Expires In (Days)
                      </label>
                      <input
                        id="tok-days"
                        type="number"
                        min={1}
                        max={365}
                        value={tokenExpiryDays}
                        onChange={(e) => setTokenExpiryDays(Math.min(365, Math.max(1, Number(e.target.value) || 30)))}
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="tok-note" className="block text-xs font-medium">
                        Admin Note / Owner Reference (Optional)
                      </label>
                      <input
                        id="tok-note"
                        type="text"
                        maxLength={160}
                        value={tokenNote}
                        onChange={(e) => setTokenNote(e.target.value)}
                        placeholder="e.g., Sri Sai Boys Hostel - Guntur"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={generatingTokens}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" />
                      <span>{generatingTokens ? 'Generating...' : 'Generate Token(s)'}</span>
                    </button>
                  </div>
                </form>

                {/* One-time Plaintext Reveal */}
                {newlyGenerated.length > 0 && (
                  <div className="rounded-xl border border-teal-300 bg-teal-50/70 p-5 dark:border-teal-800 dark:bg-teal-950/30">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-sm font-bold text-teal-950 dark:text-teal-200">
                          One-Time Plaintext Tokens — Copy Now
                        </h3>
                        <p className="text-xs text-teal-800 dark:text-teal-300">
                          For security, plaintext tokens cannot be retrieved again after leaving or refreshing this view.
                        </p>
                      </div>
                      {newlyGenerated.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              newlyGenerated.map((t) => t.token).join('\n'),
                              'batch-all'
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                        >
                          {copiedKey === 'batch-all' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>Copy All ({newlyGenerated.length})</span>
                        </button>
                      )}
                    </div>

                    <div className="mt-3 space-y-2">
                      {newlyGenerated.map((tok) => (
                        <div
                          key={tok.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-white px-3.5 py-2.5 dark:border-teal-900 dark:bg-slate-900"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{tok.token}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              Expires {formatDateIN(tok.expiresAt)}
                              {tok.note ? ` · ${tok.note}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyText(tok.token, `tok-${tok.id}`)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                          >
                            {copiedKey === `tok-${tok.id}` ? (
                              <Check className="h-3.5 w-3.5 text-teal-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>{copiedKey === `tok-${tok.id}` ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Existing Tokens Table */}
                <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                    <h2 className="font-display text-sm font-semibold">Issued Tokens ({filteredTokens.length})</h2>
                    <div className="flex flex-wrap gap-1.5">
                      {TOKEN_FILTERS.map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setTokenFilter(st)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                            tokenFilter === st
                              ? 'bg-teal-700 text-white'
                              : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredTokens.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">No tokens in this state.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                          <tr>
                            <th className="px-4 py-3">Masked Token</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Note</th>
                            <th className="px-4 py-3">Expires</th>
                            <th className="px-4 py-3">Redeemed By</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredTokens.map((t) => (
                            <tr key={t.id}>
                              <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                                {t.tokenMask}
                              </td>
                              <td className="px-4 py-3 font-semibold">
                                <span
                                  className={
                                    t.status === 'UNUSED'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : t.status === 'USED'
                                        ? 'text-slate-600 dark:text-slate-300'
                                        : 'text-red-600 dark:text-red-400'
                                  }
                                >
                                  {t.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{t.note || '—'}</td>
                              <td className="px-4 py-3 tabular-nums">{formatDateIN(t.expiresAt)}</td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {t.usedByEmail
                                  ? `${t.usedByOrganizationName || t.usedByName} (${t.usedByEmail})`
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {t.status === 'UNUSED' ? (
                                  <button
                                    type="button"
                                    disabled={revokingId === t.id}
                                    onClick={() => handleRevokeToken(t.id)}
                                    className="rounded-lg border border-red-200 px-2.5 py-1 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                                  >
                                    {revokingId === t.id ? 'Revoking...' : 'Revoke'}
                                  </button>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : tab === 'owners' ? (
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold">Registered Hostel Owners ({owners.length})</h2>
                </div>
                {owners.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">No registered owners yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                        <tr>
                          <th className="px-4 py-3">Owner</th>
                          <th className="px-4 py-3">Business / PG Org</th>
                          <th className="px-4 py-3">Contact &amp; Verification</th>
                          <th className="px-4 py-3 text-right">Hostels</th>
                          <th className="px-4 py-3 text-right">Students</th>
                          <th className="px-4 py-3">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {owners.map((o) => (
                          <tr key={o.id}>
                            <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{o.name}</td>
                            <td className="px-4 py-3">{o.organizationName}</td>
                            <td className="px-4 py-3">
                              <p className="font-mono text-slate-800 dark:text-slate-200">
                                {o.email} · {o.emailVerified ? 'Email verified' : 'Email pending'}
                              </p>
                              <p className="font-mono text-slate-500 dark:text-slate-400">
                                {o.phone ? formatIndianPhone(o.phone) : 'No phone'}
                                {o.phone ? (o.phoneVerified ? ' · Verified' : ' · Unverified') : ''}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                              {o.hostelCount}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                              {o.studentCount}
                            </td>
                            <td className="px-4 py-3 tabular-nums">{formatDateIN(o.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : tab === 'hostels' ? (
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold">Hostels Directory ({hostels.length})</h2>
                </div>
                {hostels.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">No hostels registered yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                        <tr>
                          <th className="px-4 py-3">Hostel</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3">Owner / Org</th>
                          <th className="px-4 py-3 text-right">Beds (Occ/Total)</th>
                          <th className="px-4 py-3 text-right">Active Students</th>
                          <th className="px-4 py-3">Listing</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {hostels.map((h) => (
                          <tr key={h.id}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900 dark:text-white">{h.name}</p>
                              <p className="text-slate-500 dark:text-slate-400">{formatGenderType(h.genderType)}</p>
                            </td>
                            <td className="px-4 py-3">
                              {h.locality}, {h.city}
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{h.organizationName}</p>
                              <p className="text-slate-500 dark:text-slate-400">{h.ownerEmail}</p>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                              {h.occupiedBeds} / {h.totalBeds}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                              {h.activeStudentCount} / {h.studentCount}
                            </td>
                            <td className="px-4 py-3">
                              {h.isPublic ? (
                                <Link
                                  to={`/pg/${h.slug}`}
                                  className="font-semibold text-teal-700 hover:underline dark:text-teal-400"
                                >
                                  Public Page
                                </Link>
                              ) : (
                                <span className="text-slate-400">Private</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : tab === 'students' ? (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap gap-1.5">
                    {STUDENT_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStudentFilter(f.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          studentFilter === f.id
                            ? 'bg-teal-700 text-white'
                            : 'border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="Search student, hostel, phone..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Student Stay &amp; Account Link Records ({students.length}) · KYC documents and rent ledgers remain
                      strictly private to each hostel.
                    </p>
                  </div>
                  {students.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No student records match the selected filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                          <tr>
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Hostel &amp; Bed</th>
                            <th className="px-4 py-3">Stay Status</th>
                            <th className="px-4 py-3">Account Link</th>
                            <th className="px-4 py-3">Join / Leave</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {students.map((s) => (
                            <tr key={s.id}>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-slate-900 dark:text-white">{s.name}</p>
                                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  {s.phone ? formatIndianPhone(s.phone) : ''}
                                  {s.phone && s.email ? ' · ' : ''}
                                  {s.email || (!s.phone ? 'No contact' : '')}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium">{s.propertyName}</p>
                                <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                  {s.organizationName}
                                  {s.roomNumber ? ` · Room ${s.roomNumber}` : ''}
                                  {s.bedLabel ? ` (${s.bedLabel})` : ''}
                                </p>
                              </td>
                              <td className="px-4 py-3 font-semibold">{formatTenantStatus(s.stayStatus)}</td>
                              <td className="px-4 py-3 font-semibold">
                                <span
                                  className={
                                    s.accountLinkStatus === 'LINKED'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : s.accountLinkStatus === 'LINK_PENDING'
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-slate-500 dark:text-slate-400'
                                  }
                                >
                                  {formatAccountLinkStatus(s.accountLinkStatus)}
                                </span>
                              </td>
                              <td className="px-4 py-3 tabular-nums">
                                <p>{formatDateIN(s.joinDate)}</p>
                                {s.leaveDate && (
                                  <p className="text-[11px] text-slate-500">Left {formatDateIN(s.leaveDate)}</p>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : tab === 'enquiries' ? (
              <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold">
                    Public Hostel Enquiries (Read-Only · {enquiries.length})
                  </h2>
                </div>
                {enquiries.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">No public enquiries logged yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                        <tr>
                          <th className="px-4 py-3">Applicant</th>
                          <th className="px-4 py-3">Target Hostel</th>
                          <th className="px-4 py-3">Room / Move-In</th>
                          <th className="px-4 py-3">Stage</th>
                          <th className="px-4 py-3">Received</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {enquiries.map((e) => (
                          <tr key={e.id}>
                            <td className="px-4 py-3">
                              <p className="font-semibold text-slate-900 dark:text-white">{e.name}</p>
                              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                {e.phone ? formatIndianPhone(e.phone) : ''}
                                {e.phone && e.email ? ' · ' : ''}
                                {e.email || ''}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p className="font-medium">{e.propertyName}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {e.organizationName} · {e.city}
                              </p>
                            </td>
                            <td className="px-4 py-3">
                              <p>{e.preferredRoomType}</p>
                              <p className="text-[11px] text-slate-500">
                                {e.moveInDate ? `Move-in: ${formatDateIN(e.moveInDate)}` : 'Flexible date'}
                              </p>
                            </td>
                            <td className="px-4 py-3 font-semibold">{formatEnquiryStage(e.status)}</td>
                            <td className="px-4 py-3 tabular-nums">{formatDateIN(e.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              /* SETTINGS & AUDIT LOGS */
              <div className="space-y-6">
                {overview && (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                      <div>
                        <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                          Admin Bootstrap Security
                        </h2>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                          Primary Admin: <span className="font-mono font-semibold">{overview.bootstrap.adminEmail}</span> ·
                          Bootstrap status:{' '}
                          <strong className="font-mono">
                            {overview.bootstrap.bootstrapLocked ? 'LOCKED' : 'ACTIVE'}
                          </strong>
                        </p>
                      </div>
                      {!overview.bootstrap.bootstrapLocked && (
                        <button
                          type="button"
                          disabled={lockingBootstrap}
                          onClick={handleLockBootstrap}
                          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-800"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          <span>{lockingBootstrap ? 'Locking...' : 'Lock Initial Admin Bootstrap'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                    <Activity className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                    <h2 className="font-display text-base font-semibold">Platform Security &amp; Audit Logs</h2>
                  </div>
                  {auditLogs.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">No audit events recorded yet.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                          <tr>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Actor</th>
                            <th className="px-4 py-3">Entity</th>
                            <th className="px-4 py-3">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {auditLogs.map((l) => (
                            <tr key={l.id}>
                              <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                                {l.action}
                              </td>
                              <td className="px-4 py-3">
                                {l.actorName} ({l.actorRole})
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">
                                {l.entityType} #{l.entityId}
                              </td>
                              <td className="px-4 py-3 tabular-nums">{formatDateIN(l.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
