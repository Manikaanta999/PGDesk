import React, { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatDateIN } from '../../lib/format';

export function SettingsPage() {
  const { user, refreshSession } = useAuth();
  const { showToast } = useToast();
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
      showToast('Organization & billing rules updated');
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

  return (
    <DashboardLayout title="Organization & Billing Settings" breadcrumb="Dashboard / Settings">
      <div className="space-y-6">
        <form
          onSubmit={handleSaveOrg}
          className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
            <div>
              <h2 className="font-display text-base font-semibold">Organization Profile &amp; Rent Rules</h2>
              <p className="text-xs text-slate-500">
                {isOwner
                  ? 'Changes apply to PDF receipts, UPI instructions, and monthly invoice generation.'
                  : 'Read-only for Managers. Contact Owner to modify organization billing settings.'}
              </p>
            </div>
            {isOwner && (
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="block text-xs font-medium">Business / Group Name</label>
              <input
                disabled={!isOwner}
                value={orgForm.name}
                onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Owner UPI ID (for Tenant Portal)</label>
              <input
                disabled={!isOwner}
                value={orgForm.upiId}
                onChange={(e) => setOrgForm({ ...orgForm, upiId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">UPI Payee Name</label>
              <input
                disabled={!isOwner}
                value={orgForm.upiPayeeName}
                onChange={(e) => setOrgForm({ ...orgForm, upiPayeeName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Support Phone</label>
              <input
                disabled={!isOwner}
                value={orgForm.phone}
                onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Support Email</label>
              <input
                disabled={!isOwner}
                value={orgForm.email}
                onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Brand Accent Hex</label>
              <input
                disabled={!isOwner}
                value={orgForm.brandColor}
                onChange={(e) => setOrgForm({ ...orgForm, brandColor: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Default Due Days After Invoice</label>
              <input
                type="number"
                disabled={!isOwner}
                value={orgForm.dueDaysAfterInvoice}
                onChange={(e) => setOrgForm({ ...orgForm, dueDaysAfterInvoice: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Late Fee / Day (₹)</label>
              <input
                type="number"
                disabled={!isOwner}
                value={orgForm.lateFeePerDay}
                onChange={(e) => setOrgForm({ ...orgForm, lateFeePerDay: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Grace Days / Notice Period (Days)</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  aria-label="Grace days"
                  disabled={!isOwner}
                  value={orgForm.graceDays}
                  onChange={(e) => setOrgForm({ ...orgForm, graceDays: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
                />
                <input
                  type="number"
                  aria-label="Notice period days"
                  disabled={!isOwner}
                  value={orgForm.noticePeriodDays}
                  onChange={(e) => setOrgForm({ ...orgForm, noticePeriodDays: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium">GSTIN (Optional for Tax Invoices)</label>
              <input
                disabled={!isOwner}
                value={orgForm.gstin}
                onChange={(e) => setOrgForm({ ...orgForm, gstin: e.target.value.toUpperCase() })}
                placeholder="29ABCDE1234F1Z5"
                maxLength={15}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono uppercase disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block text-xs font-medium">GST Rate on Rent / Services (%)</label>
              <select
                disabled={!isOwner}
                value={orgForm.gstRatePct}
                onChange={(e) => setOrgForm({ ...orgForm, gstRatePct: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value={0}>0% (Exempt / Unregistered)</option>
                <option value={5}>5% (2.5% CGST + 2.5% SGST)</option>
                <option value={12}>12% (6% CGST + 6% SGST)</option>
                <option value={18}>18% (9% CGST + 9% SGST)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">SaaS Subscription Plan</label>
              <select
                disabled={!isOwner}
                value={orgForm.planTier}
                onChange={(e) => setOrgForm({ ...orgForm, planTier: e.target.value as any })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="STARTER">Starter PG (1 prop / 35 beds)</option>
                <option value="GROWTH">Growth Operator (5 props / 200 beds)</option>
                <option value="ENTERPRISE">Enterprise Co-Living (Unlimited)</option>
              </select>
            </div>
          </div>

          {quota && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-slate-800 dark:bg-slate-950">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Active Plan Quota: <strong>{quota.limits.label}</strong>
              </span>
              <span className="font-mono text-slate-600 tabular-nums dark:text-slate-400">
                Properties: {quota.propertiesCount} / {quota.limits.maxProperties ?? 'Unlimited'} · Beds: {quota.bedsCount} /{' '}
                {quota.limits.maxBeds ?? 'Unlimited'}
              </span>
            </div>
          )}
        </form>

        {isOwner && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-4">
                <h2 className="font-display text-base font-semibold">Team &amp; Property Managers</h2>
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
              <h2 className="font-display text-base font-semibold pb-4">Sensitive Action Audit Log</h2>
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
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Email</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Mobile Number</label>
                <input
                  required
                  value={inviteForm.phone}
                  onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Role</label>
                <select
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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
