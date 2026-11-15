import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BedDouble,
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Download,
  HelpCircle,
  History,
  Home,
  KeyRound,
  Link2,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  MessageSquareWarning,
  Moon,
  Phone,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sun,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { AccountSettingsPanel } from '../../components/account/AccountSettingsPanel';
import { AuthorizedImage } from '../../components/ui/AuthorizedImage';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { formatDateIN, formatIndianPhone, formatINR } from '../../lib/format';
import {
  deriveStudentRentSummary,
  formatDepositStatus,
  formatPaymentApprovalLabel,
  formatRoomSharingLabel,
  formatStudentComplaintCategory,
  getMoveOutRequestLabel,
  getStudentOccupancyLabel,
} from '../../lib/studentPortalHelpers';
import { RaiseComplaintModal, TenantComplaintsTab } from './TenantComplaintsTab';
import { TenantPastHostelsTab } from './TenantPastHostelsTab';
import { TenantPaymentsTab } from './TenantPaymentsTab';
import { TenantProfileTab } from './TenantProfileTab';
import { TenantOverviewResponse } from './types';

type PortalTab =
  | 'dashboard'
  | 'payments'
  | 'complaints'
  | 'account'
  | 'profile'
  | 'kyc'
  | 'room'
  | 'past-hostels'
  | 'notices'
  | 'settings'
  | 'security'
  | 'help';

const VALID_TABS: PortalTab[] = [
  'dashboard',
  'payments',
  'complaints',
  'account',
  'profile',
  'kyc',
  'room',
  'past-hostels',
  'notices',
  'settings',
  'security',
  'help',
];

const ACCOUNT_SUB_TABS: PortalTab[] = [
  'account',
  'profile',
  'kyc',
  'room',
  'past-hostels',
  'settings',
  'security',
  'help',
];

export function TenantPortalPage() {
  const { user, darkMode, toggleDarkMode, logout } = useAuth();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const rawTab = searchParams.get('tab') as PortalTab | null;
  const activeTab: PortalTab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'dashboard';

  const setActiveTab = (tab: PortalTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const [data, setData] = useState<TenantOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [notifOpen, setNotifOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const [showComplaintModal, setShowComplaintModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showMoveOutModal, setShowMoveOutModal] = useState(false);
  const [plannedLeaveDate, setPlannedLeaveDate] = useState('');
  const [moveOutReason, setMoveOutReason] = useState('Course / Job relocation');
  const [moveOutNotes, setMoveOutNotes] = useState('');
  const [submittingMoveOut, setSubmittingMoveOut] = useState(false);

  const [contactForm, setContactForm] = useState({ name: '', phone: '' });
  const [savingContact, setSavingContact] = useState(false);

  // Explicit student account linking states
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [linkReqPropertyId, setLinkReqPropertyId] = useState<string>('');
  const [linkReqPhone, setLinkReqPhone] = useState('');
  const [linkReqEmail, setLinkReqEmail] = useState('');
  const [submittingLinkReq, setSubmittingLinkReq] = useState(false);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<TenantOverviewResponse>('/api/tenant/overview');
      setData(res);
      if (res.userProfile) {
        setContactForm({
          name: res.userProfile.name || '',
          phone: res.userProfile.phone || '',
        });
        setLinkReqPhone((prev) => prev || res.userProfile?.phone || '');
        setLinkReqEmail((prev) => prev || res.userProfile?.email || '');
      }
      if (res.availableHostels && res.availableHostels.length > 0) {
        setLinkReqPropertyId((prev) => prev || String(res.availableHostels![0].id));
      }
    } catch (err: any) {
      showToast(err.message || 'Could not load student portal', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleSaveUnassignedContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContact(true);
    try {
      await apiFetch('/api/tenant/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: contactForm.name, phone: contactForm.phone }),
      });
      showToast('Contact details updated');
      await loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Could not update contact details', 'error');
    } finally {
      setSavingContact(false);
    }
  };

  const handleRedeemLinkCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkCodeInput.trim()) return;
    setRedeemingCode(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/tenant/link-code', {
        method: 'POST',
        body: JSON.stringify({ code: linkCodeInput.trim() }),
      });
      showToast(res.message || 'Hostel record linked to your account');
      setLinkCodeInput('');
      await loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Invalid or expired student link code', 'error');
    } finally {
      setRedeemingCode(false);
    }
  };

  const handleRequestAccountLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkReqPropertyId) {
      showToast('Select your hostel first', 'error');
      return;
    }
    setSubmittingLinkReq(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/tenant/link-request', {
        method: 'POST',
        body: JSON.stringify({
          propertyId: Number(linkReqPropertyId),
          phone: linkReqPhone.trim(),
          email: linkReqEmail.trim(),
        }),
      });
      showToast(res.message || 'Link request submitted for owner approval', 'info');
      await loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Could not submit link request', 'error');
    } finally {
      setSubmittingLinkReq(false);
    }
  };

  const handleRequestMoveOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingMoveOut(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/tenant/move-out-request', {
        method: 'POST',
        body: JSON.stringify({
          requestedLeaveDate: plannedLeaveDate,
          reason: moveOutReason,
          notes: moveOutNotes,
        }),
      });
      showToast(res.message || 'Move-out request submitted for owner review');
      setShowMoveOutModal(false);
      setPlannedLeaveDate('');
      setMoveOutNotes('');
      await loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Could not submit move-out request', 'error');
    } finally {
      setSubmittingMoveOut(false);
    }
  };

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
    await logout();
    navigate('/login');
  };

  const activeTenant = data?.tenant ?? null;
  const hasActiveStay = Boolean(activeTenant);
  const pastStays = data?.pastStays ?? [];

  const displayName = activeTenant?.name || data?.userProfile?.name || user?.name || 'Resident';
  const displayEmail = activeTenant?.email || data?.userProfile?.email || user?.email || '';
  const avatarUrl = activeTenant?.photoUrl || data?.userProfile?.photoUrl || user?.photoUrl || null;
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const rentSummary = activeTenant
    ? deriveStudentRentSummary(data?.invoices || [], activeTenant.monthlyRent)
    : null;
  const activeMoveOutReq = data?.moveOutRequests?.find(
    (r) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW'
  );
  const needsProfileCompletion =
    Boolean(activeTenant) && (!activeTenant?.emergencyContactPhone || !activeTenant?.idNumberMasked);

  const notificationItems = [
    ...(rentSummary && rentSummary.pendingAmount > 0
      ? [
          {
            id: 'rent-due',
            title: `Rent Pending: ${formatINR(rentSummary.pendingAmount)}`,
            body: rentSummary.nextDueDate
              ? `Due by ${formatDateIN(rentSummary.nextDueDate)}`
              : 'View your pending monthly bill',
            onClick: () => {
              setNotifOpen(false);
              setActiveTab('payments');
            },
          },
        ]
      : []),
    ...(data?.notices || []).slice(0, 3).map((n) => ({
      id: `notice-${n.id}`,
      title: n.title,
      body: n.body,
      onClick: () => {
        setNotifOpen(false);
        setActiveTab('notices');
      },
    })),
  ];

  const desktopTabs: Array<{ id: PortalTab; label: string; icon: React.ElementType }> = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'payments', label: 'My Rent', icon: CreditCard },
    { id: 'complaints', label: 'Complaints', icon: MessageSquareWarning },
    { id: 'room', label: 'Current Hostel', icon: BedDouble },
    { id: 'past-hostels', label: `Past Hostels${pastStays.length > 0 ? ` (${pastStays.length})` : ''}`, icon: History },
    { id: 'account', label: 'Account', icon: User },
  ];

  const inputClass =
    'mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  const renderNoActiveStayCard = (contextLabel: string) => (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
          Student Portal · {contextLabel}
        </p>
        <h1 className="mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white">
          No Active Hostel Stay
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          You currently have no active hostel stay. Your previous hostel details are available under Past Hostels.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('past-hostels')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <History className="h-4 w-4" />
            <span>View Past Hostels ({pastStays.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <User className="h-4 w-4" />
            <span>Open Account</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderUnassignedWelcome = () => (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center sm:p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">Resident Portal · Account Active</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Welcome, {displayName}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
          Your student login (<span className="font-mono">{displayEmail}</span>) is active, and no hostel record is
          linked yet. Link your record below using a one-time code from your hostel owner or send a link request.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh Bed Status</span>
          </button>
          <Link
            to="/"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Browse Hostels
          </Link>
        </div>
      </div>

      {/* Pending Link Requests Status */}
      {data?.pendingLinkRequests && data.pendingLinkRequests.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Pending Account Link Requests
          </p>
          <div className="mt-2.5 space-y-2">
            {data.pendingLinkRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3.5 py-2.5 text-xs dark:border-amber-900/50 dark:bg-slate-900"
              >
                <span className="font-semibold text-slate-900 dark:text-white">{req.propertyName}</span>
                <span className="text-amber-700 dark:text-amber-400">
                  Awaiting owner approval{req.requestedAt ? ` · ${formatDateIN(req.requestedAt)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link Your Hostel Record */}
      <div className="grid gap-6 md:grid-cols-2">
        <form
          onSubmit={handleRedeemLinkCode}
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <div className="flex items-center gap-2 pb-2">
              <KeyRound className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-semibold">Enter Owner Link Code</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              If your hostel owner generated a one-time link code for your room record, enter it here to connect
              immediately.
            </p>
            <div className="mt-4">
              <label htmlFor="student-link-code" className="block text-xs font-medium">
                One-Time Student Link Code
              </label>
              <input
                id="student-link-code"
                required
                value={linkCodeInput}
                onChange={(e) => setLinkCodeInput(e.target.value)}
                placeholder="PGDESKSTU-XXXX-XXXX"
                className={`${inputClass} font-mono uppercase`}
              />
            </div>
          </div>
          <div className="mt-5">
            <button
              type="submit"
              disabled={redeemingCode || !linkCodeInput.trim()}
              className="min-h-[44px] w-full rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {redeemingCode ? 'Linking...' : 'Link with Code'}
            </button>
          </div>
        </form>

        <form
          onSubmit={handleRequestAccountLink}
          className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div>
            <div className="flex items-center gap-2 pb-2">
              <Link2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-semibold">Request Hostel Link</h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Already staying at a PGDesk hostel? Send an approval request to your hostel owner.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="link-req-hostel" className="block text-xs font-medium">
                  Select Hostel
                </label>
                <select
                  id="link-req-hostel"
                  required
                  value={linkReqPropertyId}
                  onChange={(e) => setLinkReqPropertyId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose hostel...</option>
                  {(data?.availableHostels || []).map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.locality}, {h.city})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="link-req-phone" className="block text-xs font-medium">
                  Registered Mobile (optional)
                </label>
                <input
                  id="link-req-phone"
                  value={linkReqPhone}
                  onChange={(e) => setLinkReqPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="link-req-email" className="block text-xs font-medium">
                  Registered Email (optional)
                </label>
                <input
                  id="link-req-email"
                  type="email"
                  value={linkReqEmail}
                  onChange={(e) => setLinkReqEmail(e.target.value)}
                  placeholder="student@example.com"
                  className={inputClass}
                />
              </div>
            </div>
          </div>
          <div className="mt-5">
            <button
              type="submit"
              disabled={submittingLinkReq || !linkReqPropertyId}
              className="min-h-[44px] w-full rounded-lg border border-teal-700 bg-white px-4 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60 dark:border-teal-500 dark:bg-slate-950 dark:text-teal-400 dark:hover:bg-teal-950/30"
            >
              {submittingLinkReq ? 'Sending Request...' : 'Send Link Request'}
            </button>
          </div>
        </form>
      </div>

      <form
        onSubmit={handleSaveUnassignedContact}
        className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center gap-2 pb-4">
          <UserCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
          <h2 className="font-display text-base font-semibold">Your Contact Profile</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Keep your name and optional mobile number up to date for your student account.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium">Full Name *</label>
            <input
              required
              value={contactForm.name}
              onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Mobile Number (Optional)</label>
            <input
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              placeholder="+91 98765 43210"
              className={inputClass}
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={savingContact}
            className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {savingContact ? 'Saving...' : 'Save Contact Details'}
          </button>
        </div>
      </form>
    </div>
  );

  const isAccountNavActive = ACCOUNT_SUB_TABS.includes(activeTab);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Compact Header (non-sticky on mobile so bottom bar stays within sticky height budget) */}
      <header className="border-b border-slate-200 bg-white/95 lg:sticky lg:top-0 lg:z-20 lg:backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
          <Link to="/" className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
            <span className="font-display text-lg font-bold tracking-tight">PGDesk</span>
            <span className="hidden text-xs font-medium text-slate-500 sm:inline dark:text-slate-400">
              Student Portal
            </span>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <LanguageSwitcher compact />

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notifications"
                aria-expanded={notifOpen}
                className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" />
                {notificationItems.length > 0 && (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-teal-600" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">Notifications</p>
                    <span className="text-[11px] text-slate-400">{notificationItems.length} updates</span>
                  </div>
                  <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                    {notificationItems.length === 0 ? (
                      <p className="py-4 text-center text-xs text-slate-500">All caught up! No new alerts.</p>
                    ) : (
                      notificationItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onClick}
                          className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-left hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-800"
                        >
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">{item.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                            {item.body}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Toggle theme"
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Account Dropdown Menu */}
            <div className="relative hidden sm:block" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((o) => !o)}
                aria-label="Open account menu"
                aria-expanded={accountMenuOpen}
                aria-haspopup="menu"
                className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-[11px] font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  <AuthorizedImage
                    src={avatarUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                    fallback={<span>{initials}</span>}
                  />
                </span>
                <span className="max-w-[110px] truncate">{displayName}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {accountMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">{displayName}</p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{displayEmail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setActiveTab('profile');
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <User className="h-3.5 w-3.5" />
                    <span>My Profile &amp; KYC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setActiveTab('past-hostels');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <History className="h-3.5 w-3.5" />
                    <span>Past Hostels</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setActiveTab('settings');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Account Settings</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-slate-100 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-slate-800 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Top Navigation Strip (hidden on mobile/tablet where bottom nav is primary) */}
        <div className="hidden border-t border-slate-100 bg-white lg:block dark:border-slate-800 dark:bg-slate-900">
          <nav aria-label="Student Portal Navigation" className="mx-auto flex max-w-6xl items-center gap-1 px-6 py-2">
            {desktopTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                activeTab === tab.id ||
                (tab.id === 'account' &&
                  ['profile', 'kyc', 'settings', 'security', 'help'].includes(activeTab));
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-24 sm:px-6 sm:py-8 sm:pb-24 lg:pb-8">
        {loading || !data ? (
          <div className="space-y-4">
            <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
              ))}
            </div>
          </div>
        ) : activeTab === 'account' ? (
          /* ACCOUNT HUB */
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-sm font-bold text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                <AuthorizedImage
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  fallback={<span>{initials}</span>}
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-display truncate text-xl font-bold text-slate-900 dark:text-white">
                  {displayName}
                </h1>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {displayEmail}
                  {data.userProfile?.phone ? ` · ${formatIndianPhone(data.userProfile.phone)}` : ''}
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-3">
                  <User className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">My Profile</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Personal details, college/work &amp; emergency contact
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('kyc')}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-3">
                  <UserCheck className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">KYC</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      ID document &amp; verification status
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('room')}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-3">
                  <BedDouble className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">Current Hostel</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      {hasActiveStay
                        ? `${data.property?.name || 'Active Stay'} · Room ${data.room?.roomNumber || '—'}`
                        : 'No active hostel stay'}
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('past-hostels')}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-3">
                  <History className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                      Past Hostels {pastStays.length > 0 ? `(${pastStays.length})` : ''}
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Completed stays, deposit settlement &amp; past receipts
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-3">
                  <Settings className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">Account Settings</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      Password, security, devices &amp; notifications
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('help')}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="flex items-center gap-3">
                  <HelpCircle className="h-5 w-5 text-teal-700 dark:text-teal-400" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">Help</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">
                      How to pay rent, download receipts &amp; contact owner
                    </span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <LogOut className="h-4 w-4" />
              <span>Log Out</span>
            </button>
          </div>
        ) : activeTab === 'settings' || activeTab === 'security' ? (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Account</span>
            </button>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {tHeading('heading.pageAccountSettings')}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Manage your login email, mobile number, password, active devices, and notification preferences.
              </p>
            </div>
            <AccountSettingsPanel initialSection={activeTab === 'security' ? 'security' : 'profile'} />
          </div>
        ) : activeTab === 'past-hostels' ? (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Account</span>
            </button>
            <TenantPastHostelsTab pastStays={pastStays} />
          </div>
        ) : activeTab === 'help' ? (
          <div className="mx-auto max-w-2xl space-y-5">
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Account</span>
            </button>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Student Help &amp; Support
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Quick guide to using PGDesk Student Portal
              </p>
            </div>
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Paying Monthly Rent &amp; Receipts
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Open <strong>My Rent</strong> from the bottom menu to check pending bills, copy your hostel&apos;s
                  UPI ID, upload payment proof, and download verified PDF receipts. Receipts from completed stays are
                  always available under <strong>Account → Past Hostels</strong>.
                </p>
              </div>
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Raising Room or Hostel Complaints
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Open <strong>Complaints</strong> to report water, electricity, Wi-Fi, cleaning, or food issues and see
                  replies from hostel staff.
                </p>
              </div>
              {hasActiveStay && (data.property?.contactPhone || data.organization?.phone) && (
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Hostel Warden / Owner Contact
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {data.property?.contactName || data.organization?.name}:{' '}
                    <a
                      href={`tel:${data.property?.contactPhone || data.organization?.phone || ''}`}
                      className="font-mono font-semibold text-teal-700 hover:underline dark:text-teal-400"
                    >
                      {formatIndianPhone(data.property?.contactPhone || data.organization?.phone || '')}
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'profile' || activeTab === 'kyc' ? (
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Account</span>
            </button>
            {activeTab === 'kyc' && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-xs text-teal-900 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-200">
                Review or upload your ID verification document below under <strong>KYC &amp; ID Verification</strong>.
              </div>
            )}
            {activeTenant ? (
              <TenantProfileTab
                data={data}
                onRefresh={loadOverview}
                onGoToAccountSecurity={() => setActiveTab('settings')}
              />
            ) : (
              renderUnassignedWelcome()
            )}
          </div>
        ) : activeTab === 'room' ? (
          /* CURRENT HOSTEL TAB — strictly active stays only */
          <div className="space-y-5">
            <button
              type="button"
              onClick={() => setActiveTab('account')}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Account</span>
            </button>

            {!activeTenant ? (
              pastStays.length > 0 ? (
                renderNoActiveStayCard('Current Hostel')
              ) : (
                renderUnassignedWelcome()
              )
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {tHeading('heading.pageTenantRoom')}
                    </h1>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Your active hostel room, bed, rent terms, and hostel contact details.
                    </p>
                  </div>
                  {!activeMoveOutReq && (
                    <button
                      type="button"
                      onClick={() => setShowMoveOutModal(true)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Submit Move-out Request</span>
                    </button>
                  )}
                </div>

                <div className="grid gap-6 lg:grid-cols-12">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="border-b border-slate-200 pb-3 font-display text-base font-semibold dark:border-slate-800">
                      Current Stay Details
                    </h2>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Hostel Name</dt>
                        <dd className="text-right font-semibold">{data.property?.name || data.organization?.name}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Address</dt>
                        <dd className="text-right">
                          {data.property
                            ? `${data.property.address}, ${data.property.locality}, ${data.property.city}`
                            : data.organization?.address || 'On file'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Room &amp; Bed</dt>
                        <dd className="text-right font-mono font-semibold">
                          {data.room ? `Room ${data.room.roomNumber}` : 'Room'}{' '}
                          {data.bed ? `· Bed ${data.bed.bedLabel}` : ''}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Sharing &amp; Amenities</dt>
                        <dd className="text-right">
                          {data.room ? formatRoomSharingLabel(data.room.roomType) : 'Standard'} ·{' '}
                          {data.room?.isAc ? 'AC' : 'Non-AC'}
                          {data.room?.attachedBath ? ' · Attached Bath' : ''}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Current Stay Status</dt>
                        <dd className="font-semibold text-teal-700 dark:text-teal-400">
                          {getStudentOccupancyLabel(activeTenant.status)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Move-in Date</dt>
                        <dd>{formatDateIN(activeTenant.joinDate)}</dd>
                      </div>
                      {activeTenant.leaveDate && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-slate-500 dark:text-slate-400">Planned Move-Out Date</dt>
                          <dd>{formatDateIN(activeTenant.leaveDate)}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Monthly Rent</dt>
                        <dd className="font-mono font-bold tabular-nums">{formatINR(activeTenant.monthlyRent)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-slate-400">Security Deposit</dt>
                        <dd className="text-right font-mono font-semibold tabular-nums">
                          {formatINR(activeTenant.securityDeposit)}{' '}
                          {activeTenant.depositStatus ? `(${formatDepositStatus(activeTenant.depositStatus)})` : ''}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="space-y-6 lg:col-span-5">
                    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                      <h2 className="border-b border-slate-200 pb-3 font-display text-base font-semibold dark:border-slate-800">
                        Hostel Owner / Warden Contact
                      </h2>
                      <div className="mt-4 space-y-3 text-xs">
                        <div className="flex items-center gap-2.5">
                          <Building2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {data.property?.contactName || data.organization?.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <Phone className="h-4 w-4 text-slate-400" />
                          <a
                            href={`tel:${data.property?.contactPhone || data.organization?.phone || ''}`}
                            className="font-mono font-medium text-teal-700 hover:underline dark:text-teal-400"
                          >
                            {formatIndianPhone(data.property?.contactPhone || data.organization?.phone || '')}
                          </a>
                        </div>
                        {data.organization?.email && (
                          <div className="flex items-center gap-2.5">
                            <Mail className="h-4 w-4 text-slate-400" />
                            <a
                              href={`mailto:${data.organization.email}`}
                              className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                            >
                              {data.organization.email}
                            </a>
                          </div>
                        )}
                        <div className="flex items-start gap-2.5">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                          <span className="text-slate-600 dark:text-slate-400">
                            {data.property?.address || data.organization?.address}
                          </span>
                        </div>
                      </div>
                    </div>

                    {data.moveOutRequests && data.moveOutRequests.length > 0 && (
                      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="border-b border-slate-200 pb-3 font-display text-base font-semibold dark:border-slate-800">
                          Move-Out Requests
                        </h2>
                        <div className="mt-3 space-y-3">
                          {data.moveOutRequests.map((req) => (
                            <div
                              key={req.id}
                              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-slate-900 dark:text-white">
                                  Leave Date: {formatDateIN(req.requestedLeaveDate)}
                                </span>
                                <span className="font-semibold text-amber-700 dark:text-amber-400">
                                  {getMoveOutRequestLabel(req.status)}
                                </span>
                              </div>
                              <p className="mt-1 text-slate-600 dark:text-slate-400">Reason: {req.reason}</p>
                              {req.ownerNote && (
                                <p className="mt-1 text-slate-500 dark:text-slate-400">Owner Note: {req.ownerNote}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : !activeTenant ? (
          /* NO ACTIVE STAY FALLBACK FOR HOME / PAYMENTS / COMPLAINTS / NOTICES */
          pastStays.length > 0 ? (
            <div className="space-y-6">
              {renderNoActiveStayCard(
                activeTab === 'payments'
                  ? 'My Rent'
                  : activeTab === 'complaints'
                    ? 'Complaints'
                    : 'Home'
              )}
            </div>
          ) : (
            renderUnassignedWelcome()
          )
        ) : activeTab === 'payments' ? (
          <TenantPaymentsTab data={data} onRefresh={loadOverview} />
        ) : activeTab === 'complaints' ? (
          <TenantComplaintsTab
            data={data}
            onRefresh={loadOverview}
            onOpenNewComplaint={() => setShowComplaintModal(true)}
          />
        ) : activeTab === 'notices' ? (
          <div className="space-y-6">
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Home</span>
            </button>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                {tHeading('heading.pageTenantNotices')}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Announcements and hostel rules posted by your hostel management.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              {data.notices.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    No hostel notices posted yet.
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Important updates from your hostel owner or warden will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {data.notices.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-teal-700 dark:text-teal-400">
                          {formatDateIN(n.createdAt)}
                          {n.pinned ? ' · Important Notice' : ''}
                        </span>
                        {n.createdByName && (
                          <span className="text-slate-500 dark:text-slate-400">Posted by {n.createdByName}</span>
                        )}
                      </div>
                      <h2 className="mt-1.5 font-display text-base font-semibold text-slate-900 dark:text-white">
                        {n.title}
                      </h2>
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {n.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* STUDENT HOME SCREEN (ACTIVE STAY) */
          <div className="space-y-6">
            {/* Current Hostel, Room & Bed Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                    {tHeading('heading.pageTenantDashboard')} · {getStudentOccupancyLabel(activeTenant.status)}
                  </p>
                  <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Hello, {activeTenant.name}
                  </h1>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    {data.property?.name || data.organization?.name} ·{' '}
                    {data.room ? `Room ${data.room.roomNumber}` : 'Assigned Room'}
                    {data.bed ? ` · Bed ${data.bed.bedLabel}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('payments')}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                  >
                    <CreditCard className="h-4 w-4" />
                    <span>My Rent</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowComplaintModal(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Raise Complaint</span>
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 lg:grid-cols-4 dark:border-slate-800">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Current Hostel</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {data.property?.name || data.organization?.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Room &amp; Bed</p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                    {data.room ? `Room ${data.room.roomNumber}` : 'Room'}
                    {data.bed ? ` · Bed ${data.bed.bedLabel}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Room Type</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {data.room ? formatRoomSharingLabel(data.room.roomType) : 'Standard'} ·{' '}
                    {data.room?.isAc ? 'AC' : 'Non-AC'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Move-in Date</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatDateIN(activeTenant.joinDate)}
                  </p>
                </div>
              </div>
            </div>

            {activeMoveOutReq && (
              <div className="flex flex-col justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs sm:flex-row sm:items-center dark:border-amber-900/60 dark:bg-amber-950/30">
                <p className="text-amber-900 dark:text-amber-200">
                  <strong>Move-out request ({getMoveOutRequestLabel(activeMoveOutReq.status)}):</strong> Expected
                  leaving date {formatDateIN(activeMoveOutReq.requestedLeaveDate)}. Your bed stays assigned until
                  deposit settlement.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('room')}
                  className="shrink-0 font-semibold text-amber-800 underline dark:text-amber-300"
                >
                  View Request
                </button>
              </div>
            )}

            {needsProfileCompletion && (
              <div className="flex flex-col justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center dark:border-amber-900/60 dark:bg-amber-950/30">
                <div>
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                    Complete your emergency contact &amp; KYC verification
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800/90 dark:text-amber-300/80">
                    Add your emergency contact and ID verification anytime from Account → My Profile or KYC.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="min-h-[44px] shrink-0 rounded-lg bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-800"
                >
                  Update Profile &amp; KYC
                </button>
              </div>
            )}

            {/* Rent & Outstanding Balance Summary */}
            {rentSummary && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Monthly Rent</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatINR(rentSummary.monthlyRent)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Deposit: {formatINR(activeTenant.securityDeposit)}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Outstanding Balance</p>
                  <p
                    className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                      rentSummary.pendingAmount > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatINR(rentSummary.pendingAmount)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Status: {rentSummary.overallStatus}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {rentSummary.overallStatus === 'Overdue' ? 'Overdue Payment' : 'Upcoming Due Date'}
                  </p>
                  <p className="mt-2 font-display text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
                    {rentSummary.nextDueDate ? formatDateIN(rentSummary.nextDueDate) : 'All Paid'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('payments')}
                    className="mt-1 text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    Open My Rent →
                  </button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Amount Paid (Latest)</p>
                  <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatINR(rentSummary.amountPaid)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Verified in hostel register</p>
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">Quick Actions</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <button
                  type="button"
                  onClick={() => setActiveTab('payments')}
                  className="flex min-h-[60px] flex-col items-start justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:border-teal-600 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-500"
                >
                  <CreditCard className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>My Rent &amp; Pay</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('complaints')}
                  className="flex min-h-[60px] flex-col items-start justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:border-teal-600 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-500"
                >
                  <MessageSquareWarning className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>Complaints</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('notices')}
                  className="flex min-h-[60px] flex-col items-start justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:border-teal-600 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-500"
                >
                  <Megaphone className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>Hostel Updates</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('room')}
                  className="flex min-h-[60px] flex-col items-start justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:border-teal-600 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-500"
                >
                  <BedDouble className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>Current Hostel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowContactModal(true)}
                  className="flex min-h-[60px] flex-col items-start justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:border-teal-600 hover:bg-teal-50/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-500"
                >
                  <Phone className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>Contact Owner</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeMoveOutReq)}
                  onClick={() => setShowMoveOutModal(true)}
                  className="flex min-h-[60px] flex-col items-start justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-800 hover:border-teal-600 hover:bg-teal-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-teal-500"
                >
                  <Calendar className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                  <span>{activeMoveOutReq ? 'Move-Out Pending' : 'Move-out Request'}</span>
                </button>
              </div>
            </div>

            {/* Recent Notices, Recent Payments, Complaints Summary */}
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold">{tHeading('heading.sectionTenantNotices')}</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('notices')}
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    View All
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {data.notices.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No active notices from management.</p>
                  ) : (
                    data.notices.slice(0, 3).map((n) => (
                      <div
                        key={n.id}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <p className="text-[11px] font-medium text-teal-700 dark:text-teal-400">
                          {formatDateIN(n.createdAt)} {n.pinned ? '· Pinned' : ''}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white">{n.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{n.body}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold">Recent Payments</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('payments')}
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    View All
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {data.payments.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No payments recorded yet. Open My Rent to view your bill.
                    </p>
                  ) : (
                    data.payments.slice(0, 4).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2.5 text-xs last:border-b-0 dark:border-slate-800"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-white">
                            {p.method} · {p.reference || 'Receipt'}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {formatDateIN(p.paidAt)} · {formatPaymentApprovalLabel(p.approvalStatus)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-mono font-bold tabular-nums">{formatINR(p.amount)}</span>
                          <button
                            type="button"
                            onClick={() =>
                              downloadAuthorizedFile(
                                `/api/tenant/invoices/${p.invoiceId}/receipt.pdf`,
                                `Receipt-${p.invoiceId}.pdf`
                              ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                            }
                            aria-label="Download receipt PDF"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-3 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
                  <h2 className="font-display text-base font-semibold">Complaints</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('complaints')}
                    className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    View All
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                    <p className="font-mono text-base font-bold tabular-nums">
                      {data.complaints.filter((c) => c.status === 'OPEN').length}
                    </p>
                    <p className="text-[11px] text-slate-500">Pending</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                    <p className="font-mono text-base font-bold tabular-nums">
                      {data.complaints.filter((c) => c.status === 'IN_PROGRESS').length}
                    </p>
                    <p className="text-[11px] text-slate-500">Active</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
                    <p className="font-mono text-base font-bold tabular-nums">
                      {data.complaints.filter((c) => c.status === 'RESOLVED').length}
                    </p>
                    <p className="text-[11px] text-slate-500">Resolved</p>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {data.complaints.slice(0, 2).map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-100 p-2.5 text-xs dark:border-slate-800">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">{c.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {formatStudentComplaintCategory(c.category)} ·{' '}
                        {c.status === 'RESOLVED' ? 'Resolved' : c.status === 'IN_PROGRESS' ? 'In Progress' : 'Pending'}
                      </p>
                    </div>
                  ))}
                  {data.complaints.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No complaints logged yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar (4 Tabs: Home, My Rent, Complaints, Account) */}
      <nav
        aria-label="Student bottom navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="grid grid-cols-4">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              activeTab === 'dashboard' || activeTab === 'notices'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                activeTab === 'dashboard' || activeTab === 'notices' ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <Home className="mt-0.5 h-5 w-5" />
            <span>Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              activeTab === 'payments'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                activeTab === 'payments' ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <CreditCard className="mt-0.5 h-5 w-5" />
            <span>My Rent</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('complaints')}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              activeTab === 'complaints'
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                activeTab === 'complaints' ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <MessageSquareWarning className="mt-0.5 h-5 w-5" />
            <span>Complaints</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] font-semibold transition-colors ${
              isAccountNavActive
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            <span
              className={`h-0.5 w-8 rounded-full ${
                isAccountNavActive ? 'bg-teal-700 dark:bg-teal-400' : 'bg-transparent'
              }`}
            />
            <User className="mt-0.5 h-5 w-5" />
            <span>Account</span>
          </button>
        </div>
      </nav>

      {/* Raise Complaint Modal */}
      <RaiseComplaintModal
        open={showComplaintModal}
        onClose={() => setShowComplaintModal(false)}
        onSubmitted={loadOverview}
      />

      {/* Contact Hostel Owner Modal */}
      {showContactModal && data && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Contact Hostel Owner</h3>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                aria-label="Close contact modal"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {data.property?.contactName || data.organization?.name || 'Hostel Management'}
                </p>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  <a
                    href={`tel:${data.property?.contactPhone || data.organization?.phone || ''}`}
                    className="font-mono font-semibold text-teal-700 hover:underline dark:text-teal-400"
                  >
                    {formatIndianPhone(data.property?.contactPhone || data.organization?.phone || '')}
                  </a>
                </div>
                {data.organization?.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <a
                      href={`mailto:${data.organization.email}`}
                      className="font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      {data.organization.email}
                    </a>
                  </div>
                )}
                <div className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{data.property?.address || data.organization?.address}</span>
                </div>
              </div>
              <p className="text-slate-500 dark:text-slate-400">
                For maintenance requests or urgent room issues, you can also submit a ticket under Complaints.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Move-Out Request Modal */}
      {showMoveOutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleRequestMoveOut}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-3">
              <h3 className="font-display text-lg font-semibold">Submit Move-Out Request</h3>
              <button
                type="button"
                onClick={() => setShowMoveOutModal(false)}
                aria-label="Close move-out modal"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Standard notice period is {data?.organization?.noticePeriodDays ?? 30} days. Your bed remains assigned
              until the hostel owner reviews and settles your security deposit.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium">Expected Leaving Date *</label>
                <input
                  type="date"
                  required
                  value={plannedLeaveDate}
                  onChange={(e) => setPlannedLeaveDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Reason for Leaving *</label>
                <input
                  required
                  value={moveOutReason}
                  onChange={(e) => setMoveOutReason(e.target.value)}
                  placeholder="e.g., Course completed, job transfer, shifting home"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Optional Notes for Owner</label>
                <textarea
                  rows={2}
                  value={moveOutNotes}
                  onChange={(e) => setMoveOutNotes(e.target.value)}
                  placeholder="Preferred inspection time or deposit refund bank/UPI preference..."
                  className={inputClass}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowMoveOutModal(false)}
                className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingMoveOut}
                className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {submittingMoveOut ? 'Submitting...' : 'Submit Move-Out Request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
