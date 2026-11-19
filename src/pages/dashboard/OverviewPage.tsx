import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  CheckCircle2,
  Inbox,
  IndianRupee,
  MessageCircle,
  MessageSquareWarning,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, apiFetch } from '../../lib/api';
import {
  buildBedStatusBreakdown,
  formatComplaintCategory,
  formatInvoiceStatus,
  formatPriorityLabel,
  getTimeOfDayGreeting,
  summarizeAttentionCounts,
  validatePaymentAmount,
} from '../../lib/dashboardHelpers';
import { buildWhatsAppReminderUrl, formatDateIN, formatIndianPhone, formatINR } from '../../lib/format';

interface OverdueTenantItem {
  invoiceId: number;
  invoiceNumber: string;
  tenantId: number;
  tenantName: string;
  tenantPhone: string | null;
  propertyName: string;
  roomNumber?: string;
  bedLabel?: string;
  dueDate: string;
  balanceDue: number;
  status: string;
  periodLabel: string;
}

interface UnresolvedComplaintItem {
  id: number;
  title: string;
  category: string;
  priority: string;
  status: string;
  tenantName: string;
  tenantPhone: string | null;
  propertyName: string;
  roomNumber?: string;
  bedLabel?: string;
  createdAt: string;
}

interface NewEnquiryItem {
  id: number;
  name: string;
  phone: string | null;
  email?: string | null;
  propertyName: string;
  sharingPreference?: string;
  expectedMoveIn?: string | null;
  createdAt: string;
}

interface MaintenanceBedItem {
  bedId: number;
  bedLabel: string;
  roomNumber: string;
  propertyId: number;
  propertyName: string;
  notes: string;
}

interface DashboardResponse {
  periodLabel: string;
  kpis: {
    occupancyPct: number;
    totalBeds: number;
    occupiedBeds: number;
    vacantBeds: number;
    reservedBeds?: number;
    maintenanceBeds?: number;
    totalStudents?: number;
    collectedThisMonth: number;
    pendingThisMonth: number;
    openComplaints: number;
    newLeads: number;
    pendingUpiApprovals: number;
  };
  financialSummary?: {
    periodLabel: string;
    monthlyIncome: number;
    monthlyExpenses: number;
    netProfit: number;
  };
  revenueSeries: Array<{
    label: string;
    billed: number;
    collected: number;
    pending: number;
    expense: number;
  }>;
  overdueTenants: OverdueTenantItem[];
  unpaidInvoices?: OverdueTenantItem[];
  overdueTotalCount?: number;
  upcomingMoveOuts: Array<{
    id: number;
    name: string;
    phone: string | null;
    propertyName: string;
    roomNumber?: string;
    bedLabel?: string;
    leaveDate: string | null;
    noticeRequestedAt: string | null;
    securityDeposit: number;
  }>;
  needsAttention?: {
    overdueInvoices: OverdueTenantItem[];
    partialInvoices: OverdueTenantItem[];
    unresolvedComplaints: UnresolvedComplaintItem[];
    newEnquiries: NewEnquiryItem[];
    maintenanceBeds: MaintenanceBedItem[];
  };
  properties: Array<{ id: number; name: string }>;
}

export function OverviewPage() {
  const { user, organization, refreshSession, logout } = useAuth();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<OverdueTenantItem | null>(null);
  const [payForm, setPayForm] = useState({
    amount: 0,
    method: 'UPI' as 'UPI' | 'CASH' | 'BANK' | 'ONLINE',
    reference: '',
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const [payIdempotencyKey, setPayIdempotencyKey] = useState('');
  const [savingPay, setSavingPay] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const qs = selectedPropertyId ? `?propertyId=${selectedPropertyId}` : '';
    try {
      const res = await apiFetch<DashboardResponse>(`/api/dashboard${qs}`);
      setData(res);
    } catch (err: any) {
      const msg = err?.message || 'Could not load owner dashboard';
      setLoadError(msg);
      showToast(msg, 'error');
      if (err instanceof ApiError && err.status === 401) {
        await refreshSession();
      }
    } finally {
      setLoading(false);
    }
  }, [refreshSession, selectedPropertyId, showToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const unpaidList = data?.unpaidInvoices ?? data?.overdueTenants ?? [];

  const openRecordPay = (item?: OverdueTenantItem) => {
    const chosen = item || unpaidList[0] || null;
    setPayTarget(chosen);
    setPayForm({
      amount: chosen ? chosen.balanceDue : 0,
      method: 'UPI',
      reference: '',
      paidAt: new Date().toISOString().slice(0, 10),
    });
    setPayIdempotencyKey(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ov-${chosen?.invoiceId || 0}-${Date.now()}`
    );
    setPayModalOpen(true);
  };

  const handleSelectInvoiceForPay = (invoiceId: number) => {
    const found = unpaidList.find((inv) => inv.invoiceId === invoiceId) || null;
    setPayTarget(found);
    setPayForm((f) => ({
      ...f,
      amount: found ? found.balanceDue : 0,
    }));
    setPayIdempotencyKey(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `ov-${found?.invoiceId || 0}-${Date.now()}`
    );
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || savingPay) return;
    const check = validatePaymentAmount(payForm.amount, payTarget.balanceDue);
    if (!check.valid) {
      showToast(check.error || 'Enter a valid payment amount', 'error');
      return;
    }
    setSavingPay(true);
    try {
      await apiFetch('/api/billing/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: payTarget.invoiceId,
          amount: payForm.amount,
          method: payForm.method,
          reference: payForm.reference,
          paidAt: payForm.paidAt,
          idempotencyKey: payIdempotencyKey || undefined,
        }),
      });
      showToast(`Recorded ${formatINR(payForm.amount)} from ${payTarget.tenantName}`);
      setPayModalOpen(false);
      setPayTarget(null);
      setPayIdempotencyKey('');
      await loadDashboard();
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSavingPay(false);
    }
  };

  const bedSummary = data
    ? buildBedStatusBreakdown({
        totalBeds: data.kpis.totalBeds,
        occupiedBeds: data.kpis.occupiedBeds,
        vacantBeds: data.kpis.vacantBeds,
        reservedBeds: data.kpis.reservedBeds ?? 0,
        maintenanceBeds: data.kpis.maintenanceBeds ?? 0,
      })
    : null;

  const greeting = getTimeOfDayGreeting(new Date().getHours());
  const overdueInvoices = data?.needsAttention?.overdueInvoices ?? [];
  const partialInvoices = data?.needsAttention?.partialInvoices ?? [];
  const unresolvedComplaints = data?.needsAttention?.unresolvedComplaints ?? [];
  const newEnquiries = data?.needsAttention?.newEnquiries ?? [];
  const maintenanceBeds = data?.needsAttention?.maintenanceBeds ?? [];

  const totalAttentionItems = summarizeAttentionCounts({
    overdueRent: overdueInvoices.length,
    partialRent: partialInvoices.length,
    unresolvedComplaints: unresolvedComplaints.length,
    newEnquiries: newEnquiries.length,
    maintenanceBeds: maintenanceBeds.length,
  });

  const monthlyIncome = data?.financialSummary?.monthlyIncome ?? data?.kpis.collectedThisMonth ?? 0;
  const monthlyExpenses = data?.financialSummary?.monthlyExpenses ?? 0;
  const netProfit = data?.financialSummary?.netProfit ?? monthlyIncome - monthlyExpenses;

  return (
    <DashboardLayout
      title={tHeading('heading.pageOverview')}
      breadcrumb={`Home / ${data?.periodLabel || 'This Month'}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter dashboard by hostel"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="min-h-[44px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">All Hostels</option>
            {data?.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
            ))}
          </div>
        </div>
      ) : loadError || !data ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center dark:border-red-900/50 dark:bg-slate-900">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            Unable to Load Owner Dashboard
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {loadError || 'Your session could not be verified. Please sign in again.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Sign In Again
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Greeting Header */}
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="font-display text-lg font-bold text-slate-900 sm:text-xl dark:text-white">
              {greeting}, {user?.name || 'Owner'}
            </p>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Here&apos;s what needs your attention today.
            </p>
          </div>

          {/* Section 1: Four Primary Actions */}
          <section aria-label="Daily Actions">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Quick Daily Actions
            </h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => openRecordPay()}
                className="flex min-h-[72px] flex-col items-start justify-center gap-1.5 rounded-xl bg-teal-700 p-4 text-left text-white transition-colors hover:bg-teal-800"
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <IndianRupee className="h-4 w-4 shrink-0" />
                  <span>Record Rent</span>
                </span>
                <span className="text-xs text-teal-100">
                  {unpaidList.length > 0 ? `${unpaidList.length} pending bills` : 'Mark Cash or UPI paid'}
                </span>
              </button>

              <Link
                to="/dashboard/tenants?new=1"
                className="flex min-h-[72px] flex-col items-start justify-center gap-1.5 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <UserPlus className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                  <span>Add Student</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Assign room &amp; bed</span>
              </Link>

              <Link
                to="/dashboard/complaints?status=OPEN"
                className="flex min-h-[72px] flex-col items-start justify-center gap-1.5 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <MessageSquareWarning className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                  <span>Check Complaints</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {unresolvedComplaints.length > 0
                    ? `${unresolvedComplaints.length} unresolved`
                    : 'View student issues'}
                </span>
              </Link>

              <Link
                to="/dashboard/properties?tab=rooms"
                className="flex min-h-[72px] flex-col items-start justify-center gap-1.5 rounded-xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500"
              >
                <span className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <BedDouble className="h-4 w-4 shrink-0 text-teal-700 dark:text-teal-400" />
                  <span>Manage Rooms</span>
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">Empty vs occupied beds</span>
              </Link>
            </div>
          </section>

          {/* Section 2: Important Hostel Status (4 Compact Summary Cards) */}
          <section aria-label="Hostel Status Summary">
            <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Hostel Status
            </h2>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Link
                to="/dashboard/tenants"
                className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500"
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Students currently staying</p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-teal-700" />
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl dark:text-white">
                  {data.kpis.totalStudents ?? data.kpis.occupiedBeds}
                </p>
                <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {data.kpis.occupiedBeds} / {data.kpis.totalBeds} beds ({data.kpis.occupancyPct}%)
                </p>
              </Link>

              <Link
                to="/dashboard/properties?tab=rooms"
                className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500"
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Empty Beds</p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-teal-700" />
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-700 sm:text-3xl dark:text-emerald-400">
                  {data.kpis.vacantBeds}
                </p>
                <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {bedSummary?.summaryText}
                </p>
              </Link>

              <Link
                to="/dashboard/billing"
                className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500"
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Rent Pending</p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-teal-700" />
                </div>
                <p
                  className={`mt-2 font-mono text-2xl font-bold tabular-nums sm:text-3xl ${
                    data.kpis.pendingThisMonth > 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {formatINR(data.kpis.pendingThisMonth)}
                </p>
                <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                  {unpaidList.length} unpaid {unpaidList.length === 1 ? 'bill' : 'bills'}
                </p>
              </Link>

              <Link
                to="/dashboard/complaints?status=OPEN"
                className="group rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-teal-500"
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Open Complaints</p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-teal-700" />
                </div>
                <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl dark:text-white">
                  {data.kpis.openComplaints}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {data.kpis.openComplaints === 0 ? 'All issues resolved' : 'Tap to resolve issues'}
                </p>
              </Link>
            </div>
          </section>

          {/* Section 3: Needs Attention */}
          <section
            aria-label="Needs Attention"
            className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {tHeading('heading.sectionNeedsAttention')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {totalAttentionItems > 0
                    ? `${totalAttentionItems} items need follow-up across rent, complaints, enquiries, and rooms`
                    : 'All daily hostel tasks are currently clear'}
                </p>
              </div>
              {data.kpis.pendingUpiApprovals > 0 && (
                <Link
                  to="/dashboard/billing"
                  className="inline-flex min-h-[38px] items-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  {data.kpis.pendingUpiApprovals} UPI receipts to verify →
                </Link>
              )}
            </div>

            {totalAttentionItems === 0 && data.upcomingMoveOuts.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-8 text-sm text-slate-600 dark:text-slate-400">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>Everything is up to date — no overdue rent, open complaints, new enquiries, or maintenance rooms.</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {/* 1. Overdue Rent */}
                {overdueInvoices.map((item) => (
                  <div
                    key={`overdue-${item.invoiceId}`}
                    className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>Overdue rent · Due {formatDateIN(item.dueDate)}</span>
                      </p>
                      <Link
                        to={`/dashboard/tenants/${item.tenantId}`}
                        className="mt-0.5 block font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {item.tenantName}
                      </Link>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.propertyName}
                        {item.roomNumber ? ` · Room ${item.roomNumber}` : ''}
                        {item.bedLabel ? ` (${item.bedLabel})` : ''} · {item.periodLabel}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                      <span className="font-mono text-sm font-bold tabular-nums text-red-600 dark:text-red-400">
                        {formatINR(item.balanceDue)}
                      </span>
                      <button
                        type="button"
                        onClick={() => openRecordPay(item)}
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                        <span>Record Rent</span>
                      </button>
                      {item.tenantPhone && (
                        <a
                          href={buildWhatsAppReminderUrl({
                            phone: item.tenantPhone,
                            tenantName: item.tenantName,
                            propertyName: item.propertyName,
                            invoiceNumber: item.invoiceNumber,
                            periodLabel: item.periodLabel,
                            balanceDue: item.balanceDue,
                            dueDate: item.dueDate,
                            upiId: organization?.upiId,
                          })}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Send WhatsApp reminder to ${item.tenantName}`}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                          <span>Remind</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}

                {/* 2. Partially Paid Rent */}
                {partialInvoices.map((item) => (
                  <div
                    key={`partial-${item.invoiceId}`}
                    className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Partially paid rent · {formatInvoiceStatus(item.status)}
                      </p>
                      <Link
                        to={`/dashboard/tenants/${item.tenantId}`}
                        className="mt-0.5 block font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {item.tenantName}
                      </Link>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.propertyName}
                        {item.roomNumber ? ` · Room ${item.roomNumber}` : ''}
                        {item.bedLabel ? ` (${item.bedLabel})` : ''} · {item.periodLabel}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                      <span className="font-mono text-sm font-bold tabular-nums text-amber-700 dark:text-amber-400">
                        {formatINR(item.balanceDue)} left
                      </span>
                      <button
                        type="button"
                        onClick={() => openRecordPay(item)}
                        className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                      >
                        <IndianRupee className="h-3.5 w-3.5" />
                        <span>Collect Balance</span>
                      </button>
                    </div>
                  </div>
                ))}

                {/* 3. Unresolved Complaints */}
                {unresolvedComplaints.map((c) => (
                  <div
                    key={`complaint-${c.id}`}
                    className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <MessageSquareWarning className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>
                          Unresolved complaint · {formatComplaintCategory(c.category)} · {formatPriorityLabel(c.priority)}
                        </span>
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{c.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {c.tenantName}
                        {c.roomNumber ? ` · Room ${c.roomNumber}` : ''} · {c.propertyName}
                      </p>
                    </div>
                    <Link
                      to={`/dashboard/complaints?status=${c.status}&id=${c.id}`}
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
                    >
                      Resolve Complaint →
                    </Link>
                  </div>
                ))}

                {/* 4. New Room Enquiries */}
                {newEnquiries.map((eq) => (
                  <div
                    key={`enquiry-${eq.id}`}
                    className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-400">
                        <Inbox className="h-3.5 w-3.5 shrink-0" />
                        <span>New room enquiry</span>
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{eq.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {eq.phone ? formatIndianPhone(eq.phone) : eq.email || 'Contact on file'} · {eq.propertyName}
                        {eq.sharingPreference ? ` · ${eq.sharingPreference}` : ''}
                      </p>
                    </div>
                    <Link
                      to="/dashboard/leads"
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
                    >
                      Open Enquiries →
                    </Link>
                  </div>
                ))}

                {/* 5. Rooms Needing Maintenance */}
                {maintenanceBeds.map((b) => (
                  <div
                    key={`maint-${b.bedId}`}
                    className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <Wrench className="h-3.5 w-3.5 shrink-0" />
                        <span>Room / bed under maintenance</span>
                      </p>
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                        Room {b.roomNumber || '—'} · Bed {b.bedLabel}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {b.propertyName}
                        {b.notes ? ` · ${b.notes}` : ''}
                      </p>
                    </div>
                    <Link
                      to="/dashboard/properties?tab=rooms"
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
                    >
                      Manage Room →
                    </Link>
                  </div>
                ))}

                {/* 6. Upcoming Move-Outs (On Notice) */}
                {data.upcomingMoveOuts.map((m) => (
                  <div
                    key={`moveout-${m.id}`}
                    className="flex flex-col justify-between gap-3 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        Upcoming move-out · Leaving {formatDateIN(m.leaveDate)}
                      </p>
                      <Link
                        to={`/dashboard/tenants/${m.id}`}
                        className="mt-0.5 block font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                      >
                        {m.name}
                      </Link>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {m.propertyName}
                        {m.roomNumber ? ` · Room ${m.roomNumber}` : ''} · Deposit {formatINR(m.securityDeposit)}
                      </p>
                    </div>
                    <Link
                      to={`/dashboard/tenants/${m.id}`}
                      className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
                    >
                      Settle Exit →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 4: Financial Analysis (Below Operational Sections) */}
          <section
            aria-label="Financial Analysis"
            className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
              <div>
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {tHeading('heading.sectionFinancialSummary')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {data.financialSummary?.periodLabel || data.periodLabel} income, expenses, and 6-month trend
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <Link to="/dashboard/expenses" className="text-teal-700 hover:underline dark:text-teal-400">
                  Detailed Expenses
                </Link>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <Link to="/dashboard/expenses#monthly-pnl" className="text-teal-700 hover:underline dark:text-teal-400">
                  Monthly Reports
                </Link>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Monthly Income</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                  {formatINR(monthlyIncome)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Monthly Expenses</p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatINR(monthlyExpenses)}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Net Operating Profit</p>
                <p
                  className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
                    netProfit >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {formatINR(netProfit)}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-3 font-display text-sm font-semibold text-slate-800 dark:text-slate-200">
                {tHeading('heading.sectionIncomeExpenses')}
              </h3>
              <div className="h-64 w-full min-w-0 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenueSeries} margin={{ top: 8, right: 12, left: 4, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickMargin={8} />
                    <YAxis
                      width={56}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [formatINR(Number(val)), String(name)]}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12px',
                      }}
                    />
                    <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                    <Bar
                      dataKey="collected"
                      name="Collected Rent"
                      fill="#0F766E"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                    <Bar
                      dataKey="expense"
                      name="Expenses"
                      fill="#64748B"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Record Rent Modal */}
      {payModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          {unpaidList.length === 0 ? (
            <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between pb-3">
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">Record Rent</h3>
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  aria-label="Close payment modal"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                All rent bills are currently paid. You can still review past receipts or generate new monthly bills from
                Rent Overview.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  Close
                </button>
                <Link
                  to="/dashboard/billing"
                  onClick={() => setPayModalOpen(false)}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  Open Rent Overview
                </Link>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleRecordPayment}
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex items-center justify-between pb-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">Record Rent</h3>
                  {payTarget && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {payTarget.invoiceNumber} · Due {formatINR(payTarget.balanceDue)}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  aria-label="Close payment modal"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="home-record-rent-student" className="block text-xs font-medium">
                    Student &amp; Pending Bill
                  </label>
                  <select
                    id="home-record-rent-student"
                    value={payTarget?.invoiceId ?? ''}
                    onChange={(e) => handleSelectInvoiceForPay(Number(e.target.value))}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {unpaidList.map((inv) => (
                      <option key={inv.invoiceId} value={inv.invoiceId}>
                        {inv.tenantName}
                        {inv.roomNumber ? ` (Room ${inv.roomNumber})` : ''} — {formatINR(inv.balanceDue)} (
                        {inv.periodLabel})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="home-record-rent-amount" className="block text-xs font-medium">
                    Amount Received (₹)
                  </label>
                  <input
                    id="home-record-rent-amount"
                    type="number"
                    required
                    min={1}
                    max={payTarget?.balanceDue || 999999}
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="home-record-rent-mode" className="block text-xs font-medium">
                      Payment Mode
                    </label>
                    <select
                      id="home-record-rent-mode"
                      value={payForm.method}
                      onChange={(e) => setPayForm({ ...payForm, method: e.target.value as any })}
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="UPI">UPI</option>
                      <option value="CASH">Cash</option>
                      <option value="BANK">Bank Transfer</option>
                      <option value="ONLINE">Online</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="home-record-rent-date" className="block text-xs font-medium">
                      Payment Date
                    </label>
                    <input
                      id="home-record-rent-date"
                      type="date"
                      required
                      value={payForm.paidAt}
                      onChange={(e) => setPayForm({ ...payForm, paidAt: e.target.value })}
                      className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="home-record-rent-ref" className="block text-xs font-medium">
                    UTR / Reference / Receipt No.
                  </label>
                  <input
                    id="home-record-rent-ref"
                    value={payForm.reference}
                    onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                    placeholder="e.g., UTR63129088412"
                    className="mt-1 min-h-[44px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPay || !payTarget}
                  className="min-h-[44px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  {savingPay ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
