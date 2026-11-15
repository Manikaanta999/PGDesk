import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Building2, HelpCircle, Plus, ShieldCheck, X } from 'lucide-react';
import { AccountSettingsPanel } from '../../components/account/AccountSettingsPanel';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatDateIN } from '../../lib/format';

export function SettingsPage() {
  const { user, refreshSession } = useAuth();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: 'hostel' | 'account' | 'security' | 'help' =
    tabParam === 'account'
      ? 'account'
      : tabParam === 'security'
        ? 'security'
        : tabParam === 'help'
          ? 'help'
          : 'hostel';

  const setActiveTab = (tab: 'hostel' | 'account' | 'security' | 'help') => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  const [orgForm, setOrgForm] = useState({
    name: '',
    brandColor: '#0F766E',
    upiId: '',
    upiPayeeName: '',
    gstin: '',
    gstRatePct: 0,
    planTier: 'GROWTH' as 'STARTER' | 'GROWTH' | 'ENTERPRISE',
    billingDayDefault: 1,
    dueDaysAfterInvoice: 5,
    lateFeePerDay: 100,
    graceDays: 3,
    noticePeriodDays: 30,
    phone: '',
    email: '',
    address: '',
    bankDetails: '',
    paymentInstructions: '',
  });
  const [quota, setQuota] = useState<{
    propertiesCount: number;
    bedsCount: number;
    limits: { label: string; maxProperties: number | null; maxBeds: number | null };
  } | null>(null);
  const [staff, setStaff] = useState<Array<{ id: number; name: string; email: string; phone: string | null; role: string }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ id: number; actorName: string; actorRole: string; action: string; entityType: string; createdAt: string }>>([]);
  const [saving, setSaving] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'MANAGER' as 'OWNER' | 'MANAGER',
  });

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiFetch<any>('/api/settings');
      if (res.organization) {
        setOrgForm({
          name: res.organization.name || '',
          brandColor: res.organization.brandColor || '#0F766E',
          upiId: res.organization.upiId || '',
          upiPayeeName: res.organization.upiPayeeName || '',
          gstin: res.organization.gstin || '',
          gstRatePct: res.organization.gstRatePct ?? 0,
          planTier: (res.organization.planTier || 'GROWTH') as 'STARTER' | 'GROWTH' | 'ENTERPRISE',
          billingDayDefault: res.organization.billingDayDefault ?? 1,
          dueDaysAfterInvoice: res.organization.dueDaysAfterInvoice ?? 5,
          lateFeePerDay: res.organization.lateFeePerDay ?? 100,
          graceDays: res.organization.graceDays ?? 3,
          noticePeriodDays: res.organization.noticePeriodDays ?? 30,
          phone: res.organization.phone || '',
          email: res.organization.email || '',
          address: res.organization.address || '',
          bankDetails: res.organization.bankDetails || '',
          paymentInstructions: res.organization.paymentInstructions || '',
        });
      }
      if (res.quota) {
        setQuota(res.quota);
      }
      setStaff(res.staff || []);
      setAuditLogs(res.auditLogs || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load settings', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(orgForm),
      });
      showToast('Hostel & payment settings updated');
      await refreshSession();
      await loadSettings();
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/staff', {
        method: 'POST',
        body: JSON.stringify({ ...inviteForm, assignedPropertyIds: [] }),
      });
      showToast(`${inviteForm.name} added as ${inviteForm.role}`);
      setShowInvite(false);
      setInviteForm({ name: '', email: '', phone: '', password: '', role: 'MANAGER' });
      await loadSettings();
    } catch (err: any) {
      showToast(err.message || 'Staff invite failed', 'error');
    }
  };

  const isOwner = user?.role === 'OWNER';
  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  return (
    <DashboardLayout
      title={
        activeTab === 'help'
          ? 'Help & Owner Guide'
          : tHeading(activeTab === 'hostel' ? 'heading.pageSettings' : 'heading.pageAccountSettings')
      }
      breadcrumb={
        activeTab === 'hostel'
          ? 'Home / Settings'
          : activeTab === 'help'
            ? 'Home / Help'
            : 'Home / Settings / Account & Security'
      }
    >
      <div className="space-y-6">
        {/* Top Settings View Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('hostel')}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'hostel'
                ? 'bg-teal-700 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            <span>Hostel &amp; Rent Settings</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'account' || activeTab === 'security'
                ? 'bg-teal-700 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Account &amp; Security</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('help')}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === 'help'
                ? 'bg-teal-700 text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Help</span>
          </button>
        </div>

        {activeTab === 'help' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                1. Adding Rooms, Beds &amp; Students
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Open <strong>Manage Rooms</strong> to set up floors, room numbers, and beds. When a new student joins,
                tap <strong>Add Student</strong> to assign an empty bed and record monthly rent and security deposit.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/dashboard/properties?tab=rooms"
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400"
                >
                  Open Rooms &amp; Beds
                </Link>
                <Link
                  to="/dashboard/tenants?new=1"
                  className="inline-flex min-h-[40px] items-center rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  Add Student
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                2. Recording Cash &amp; UPI Rent
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Tap <strong>Record Rent</strong> on Home or open <strong>Rent</strong> to log full or partial Cash,
                UPI, or Bank payments. You can also send WhatsApp rent reminders with one tap.
              </p>
              <div className="mt-4">
                <Link
                  to="/dashboard/billing"
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400"
                >
                  Open Rent &amp; Payments
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                3. Move-Out &amp; Deposit Settlement
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                When a student leaves, open their profile under <strong>Students</strong> and complete move-out
                settlement. PGDesk automatically frees the bed while keeping all past rent invoices and receipts saved.
              </p>
              <div className="mt-4">
                <Link
                  to="/dashboard/tenants"
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400"
                >
                  Open Students
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                4. Complaints, Notices &amp; Reports
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Check student complaints, answer room enquiries, post notices, and download monthly income and expense
                CSV reports anytime from the menu.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/dashboard/complaints"
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400"
                >
                  Open Complaints
                </Link>
                <Link
                  to="/dashboard/expenses"
                  className="inline-flex min-h-[40px] items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400"
                >
                  Open Expenses &amp; Reports
                </Link>
              </div>
            </div>
          </div>
        ) : activeTab !== 'hostel' ? (
          <AccountSettingsPanel initialSection={activeTab === 'security' ? 'security' : 'profile'} />
        ) : (
          <>
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Language Preference
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">English / తెలుగు</p>
              </div>
              <LanguageSwitcher />
            </div>

            <form
              onSubmit={handleSaveOrg}
              className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold">{tHeading('heading.sectionHostelRules')}</h2>
                  <p className="text-xs text-slate-500">
                    {isOwner
                      ? 'Hostel contact details, rent rules, and payment instructions shown to your students.'
                      : 'Read-only for Managers. Ask the Hostel Owner to change these settings.'}
                  </p>
                </div>
                {isOwner && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                  >
                    {saving ? 'Saving...' : 'Save Hostel Settings'}
                  </button>
                )}
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium">Hostel / Business Name</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.name}
                    onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Owner UPI ID (for Student Payments)</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.upiId}
                    onChange={(e) => setOrgForm({ ...orgForm, upiId: e.target.value })}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">UPI Account Name</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.upiPayeeName}
                    onChange={(e) => setOrgForm({ ...orgForm, upiPayeeName: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Hostel Contact Phone</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.phone}
                    onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Hostel Contact Email</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.email}
                    onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Hostel Address</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.address}
                    onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Rent Due Days</label>
                  <input
                    type="number"
                    disabled={!isOwner}
                    value={orgForm.dueDaysAfterInvoice}
                    onChange={(e) => setOrgForm({ ...orgForm, dueDaysAfterInvoice: Number(e.target.value) })}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Late Fee / Day (₹)</label>
                  <input
                    type="number"
                    disabled={!isOwner}
                    value={orgForm.lateFeePerDay}
                    onChange={(e) => setOrgForm({ ...orgForm, lateFeePerDay: Number(e.target.value) })}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Grace Days / Notice Days</label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      aria-label="Grace days"
                      disabled={!isOwner}
                      value={orgForm.graceDays}
                      onChange={(e) => setOrgForm({ ...orgForm, graceDays: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <input
                      type="number"
                      aria-label="Notice period days"
                      disabled={!isOwner}
                      value={orgForm.noticePeriodDays}
                      onChange={(e) => setOrgForm({ ...orgForm, noticePeriodDays: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium">GSTIN (Optional for Receipts)</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.gstin}
                    onChange={(e) => setOrgForm({ ...orgForm, gstin: e.target.value.toUpperCase() })}
                    placeholder="29ABCDE1234F1Z5"
                    maxLength={15}
                    className={`${inputClass} font-mono uppercase`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">GST Rate on Rent (%)</label>
                  <select
                    disabled={!isOwner}
                    value={orgForm.gstRatePct}
                    onChange={(e) => setOrgForm({ ...orgForm, gstRatePct: Number(e.target.value) })}
                    className={inputClass}
                  >
                    <option value={0}>0% (No GST)</option>
                    <option value={5}>5% (2.5% CGST + 2.5% SGST)</option>
                    <option value={12}>12% (6% CGST + 6% SGST)</option>
                    <option value={18}>18% (9% CGST + 9% SGST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Accent Color Hex</label>
                  <input
                    disabled={!isOwner}
                    value={orgForm.brandColor}
                    onChange={(e) => setOrgForm({ ...orgForm, brandColor: e.target.value })}
                    className={`${inputClass} font-mono`}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="org-bank-details" className="block text-xs font-medium">
                      Bank Transfer Details (Shown to Students)
                    </label>
                    <textarea
                      id="org-bank-details"
                      rows={2}
                      disabled={!isOwner}
                      value={orgForm.bankDetails}
                      onChange={(e) => setOrgForm({ ...orgForm, bankDetails: e.target.value })}
                      placeholder="Account Name, Bank Name, Account Number, IFSC Code"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="org-payment-instructions" className="block text-xs font-medium">
                      Cash / Payment Instructions (Shown to Students)
                    </label>
                    <textarea
                      id="org-payment-instructions"
                      rows={2}
                      disabled={!isOwner}
                      value={orgForm.paymentInstructions}
                      onChange={(e) => setOrgForm({ ...orgForm, paymentInstructions: e.target.value })}
                      placeholder="e.g., Pay rent before the 5th via UPI or at the hostel office between 9 AM and 7 PM."
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              {quota && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    Account Access: <strong>Free to use currently</strong> (no subscription payment needed)
                  </span>
                  <span className="font-mono text-slate-600 tabular-nums dark:text-slate-400">
                    Hostels: {quota.propertiesCount} · Total Beds: {quota.bedsCount}
                  </span>
                </div>
              )}
            </form>

            {isOwner && (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between pb-4">
                    <h2 className="font-display text-base font-semibold">Staff &amp; Hostel Managers</h2>
                    <button
                      type="button"
                      onClick={() => setShowInvite(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-teal-700"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Staff</span>
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {staff.map((s) => (
                      <div key={s.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{s.name}</p>
                          <p className="text-slate-500">
                            {s.email} {s.phone ? `· ${s.phone}` : ''}
                          </p>
                        </div>
                        <span className="font-mono font-semibold text-teal-700 dark:text-teal-400">{s.role}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                  <h2 className="pb-4 font-display text-base font-semibold">Sensitive Action Audit Log</h2>
                  <div className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="font-mono font-medium text-slate-800 dark:text-slate-200">{log.action}</p>
                          <p className="text-slate-500">
                            {log.actorName} ({log.actorRole}) · {log.entityType}
                          </p>
                        </div>
                        <span className="text-slate-400">{formatDateIN(log.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleInviteStaff}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Add Manager / Staff</h3>
              <button type="button" onClick={() => setShowInvite(false)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium">Full Name</label>
                <input
                  required
                  value={inviteForm.name}
                  onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Email</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Mobile Number</label>
                <input
                  required
                  value={inviteForm.phone}
                  onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                  className={inputClass}
                >
                  <option value="MANAGER">Property Manager</option>
                  <option value="OWNER">Co-Owner</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowInvite(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                Create Account
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
