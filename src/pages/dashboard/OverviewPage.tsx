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
import { ArrowRight, IndianRupee, MessageCircle, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { buildWhatsAppReminderUrl, formatDateIN, formatINR } from '../../lib/format';

interface OverdueTenantItem {
  invoiceId: number;
  invoiceNumber: string;
  tenantId: number;
  tenantName: string;
  tenantPhone: string;
  propertyName: string;
  dueDate: string;
  balanceDue: number;
  status: string;
  periodLabel: string;
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
    collectedThisMonth: number;
    pendingThisMonth: number;
    openComplaints: number;
    newLeads: number;
    pendingUpiApprovals: number;
  };
  revenueSeries: Array<{
    label: string;
    billed: number;
    collected: number;
    pending: number;
    expense: number;
  }>;
  overdueTenants: OverdueTenantItem[];
  upcomingMoveOuts: Array<{
    id: number;
    name: string;
    phone: string;
    propertyName: string;
    leaveDate: string | null;
    noticeRequestedAt: string | null;
    securityDeposit: number;
  }>;
  properties: Array<{ id: number; name: string }>;
}

export function OverviewPage() {
  const { organization } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [payModal, setPayModal] = useState<OverdueTenantItem | null>(null);
  const [payForm, setPayForm] = useState({
    amount: 0,
    method: 'UPI' as 'UPI' | 'CASH' | 'BANK' | 'ONLINE',
    reference: '',
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const [savingPay, setSavingPay] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const qs = selectedPropertyId ? `?propertyId=${selectedPropertyId}` : '';
    try {
      const res = await apiFetch<DashboardResponse>(`/api/dashboard${qs}`);
      setData(res);
    } catch {
      // handled gracefully in empty state
    } finally {
      setLoading(false);
    }
  }, [selectedPropertyId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const openRecordPay = (item: OverdueTenantItem) => {
    setPayModal(item);
    setPayForm({
      amount: item.balanceDue,
      method: 'UPI',
      reference: '',
      paidAt: new Date().toISOString().slice(0, 10),
    });
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModal) return;
    setSavingPay(true);
    try {
      await apiFetch('/api/billing/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: payModal.invoiceId,
          amount: payForm.amount,
          method: payForm.method,
          reference: payForm.reference,
          paidAt: payForm.paidAt,
        }),
      });
      showToast(`Recorded ${formatINR(payForm.amount)} from ${payModal.tenantName}`);
      setPayModal(null);
      await loadDashboard();
    } catch (err: any) {
      showToast(err.message || 'Failed to record payment', 'error');
    } finally {
      setSavingPay(false);
    }
  };

  const otherBeds = (data?.kpis.reservedBeds ?? 0) + (data?.kpis.maintenanceBeds ?? 0);

  return (
    <DashboardLayout
      title="Operations Overview"
      breadcrumb={`Dashboard / ${data?.periodLabel || 'Current Cycle'}`}
      actions={
        <div className="flex items-center gap-2">
          <select
            aria-label="Filter dashboard by property"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="">All Properties</option>
            {data?.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Link
            to="/dashboard/tenants?new=1"
            className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
          >
            Add Tenant
          </Link>
        </div>
      }
    >
      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Primary KPI Strip */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Bed Occupancy</p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.kpis.occupancyPct}%
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {data.kpis.occupiedBeds} occupied · {data.kpis.vacantBeds} vacant
                {otherBeds > 0 ? ` · ${otherBeds} reserved/maint.` : ''} of {data.kpis.totalBeds}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Rent Collected ({data.periodLabel || 'Current Cycle'})
              </p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
                {formatINR(data.kpis.collectedThisMonth)}
              </p>
              <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                {formatINR(data.kpis.pendingThisMonth)} pending this cycle
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Complaints</p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.kpis.openComplaints}
              </p>
              <Link
                to="/dashboard/complaints"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                <span>Open ticket queue</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Leads &amp; UPI Queue</p>
              <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                {data.kpis.newLeads}
                <span className="ml-2 text-base font-normal text-slate-400">
                  / {data.kpis.pendingUpiApprovals} UPI
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                <Link to="/dashboard/leads" className="text-teal-700 hover:underline dark:text-teal-400">
                  {data.kpis.newLeads} new enquiries
                </Link>
                {' · '}
                <Link to="/dashboard/billing" className="text-teal-700 hover:underline dark:text-teal-400">
                  {data.kpis.pendingUpiApprovals} UPI checks
                </Link>
              </p>
            </div>
          </div>

          {/* 6-Month Revenue & Expense Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  6-Month Rent Collection vs. Expenses
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Collected rent, pending dues, and property operating costs (INR)
                </p>
              </div>
              <Link
                to="/dashboard/expenses"
                className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
              >
                View Monthly P&amp;L Report
              </Link>
            </div>

            <div className="h-80 w-full overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.revenueSeries} margin={{ top: 12, right: 16, left: 8, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} tickMargin={8} />
                  <YAxis
                    width={58}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(val: any) => formatINR(Number(val))}
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                    }}
                  />
                  <Legend verticalAlign="bottom" height={32} wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                  <Bar dataKey="collected" name="Collected Rent" fill="#0F766E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending Dues" fill="#D97706" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="#64748B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Overdue Tenants + Upcoming Move-outs */}
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-200 bg-white lg:col-span-7 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Overdue &amp; Partial Rent Dues
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Send one-click WhatsApp reminders or record payment
                  </p>
                </div>
                <Link
                  to="/dashboard/billing"
                  className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                >
                  All Invoices
                </Link>
              </div>

              {data.overdueTenants.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No overdue dues at the moment.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.overdueTenants.map((item) => (
                    <div
                      key={item.invoiceId}
                      className="flex flex-col justify-between gap-3 px-5 py-3.5 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/dashboard/tenants/${item.tenantId}`}
                          className="font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                        >
                          {item.tenantName}
                        </Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.propertyName} · {item.invoiceNumber} · Due {formatDateIN(item.dueDate)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="mr-1 text-right">
                          <p className="font-mono text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                            {formatINR(item.balanceDue)}
                          </p>
                          <p className="text-[11px] font-medium text-slate-500">{item.status}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openRecordPay(item)}
                          aria-label={`Record payment for ${item.tenantName}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                        >
                          <IndianRupee className="h-3.5 w-3.5" />
                          <span>Record Pay</span>
                        </button>
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
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <MessageCircle className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                          <span>Remind</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white lg:col-span-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Upcoming Move-Outs (On Notice)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Prepare deposit settlement &amp; list vacant beds
                  </p>
                </div>
                <Link
                  to="/dashboard/tenants?status=NOTICE"
                  className="text-xs font-semibold text-teal-700 hover:underline dark:text-teal-400"
                >
                  View All
                </Link>
              </div>

              {data.upcomingMoveOuts.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No residents currently on notice period.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.upcomingMoveOuts.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <Link
                          to={`/dashboard/tenants/${m.id}`}
                          className="font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100 dark:hover:text-teal-400"
                        >
                          {m.name}
                        </Link>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {m.propertyName} · Leaving {formatDateIN(m.leaveDate)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          Deposit {formatINR(m.securityDeposit)}
                        </p>
                        <Link
                          to={`/dashboard/tenants/${m.id}`}
                          className="text-[11px] font-semibold text-teal-700 hover:underline dark:text-teal-400"
                        >
                          Settle Exit
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* One-Click Record Payment Modal */}
      {payModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white">Record Payment</h3>
                <p className="text-xs text-slate-500">
                  {payModal.tenantName} · {payModal.invoiceNumber}
                </p>
              </div>
              <button type="button" onClick={() => setPayModal(null)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium">Amount Received (₹)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={payModal.balanceDue}
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium">Mode</label>
                  <select
                    value={payForm.method}
                    onChange={(e) => setPayForm({ ...payForm, method: e.target.value as any })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank Transfer</option>
                    <option value="ONLINE">Online</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={payForm.paidAt}
                    onChange={(e) => setPayForm({ ...payForm, paidAt: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">UTR / Reference / Receipt No.</label>
                <input
                  value={payForm.reference}
                  onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })}
                  placeholder="e.g., UTR63129088412"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayModal(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPay}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {savingPay ? 'Recording...' : 'Confirm Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
