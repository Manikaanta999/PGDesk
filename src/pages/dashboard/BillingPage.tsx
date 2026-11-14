import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { Check, Download, MessageCircle, Plus, Receipt, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable } from '../../components/ui/DataTable';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { buildWhatsAppReminderUrl, formatDateIN, formatINR } from '../../lib/format';

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  tenantId: number;
  tenantName: string;
  tenantPhone: string;
  propertyId: number;
  propertyName: string;
  periodMonth: number;
  periodYear: number;
  periodLabel: string;
  amount: number;
  paidAmount: number;
  balanceDue: number;
  dueDate: string;
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'PARTIAL';
  isProRata: boolean;
  upiId: string;
}

interface PendingApproval {
  id: number;
  invoiceId: number;
  invoiceNumber: string;
  tenantName: string;
  propertyName: string;
  amount: number;
  reference: string;
  paidAt: string;
  notes: string | null;
}

export function BillingPage() {
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [search, setSearch] = useState('');

  // Generate Modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genMonth, setGenMonth] = useState(11);
  const [genYear, setGenYear] = useState(2026);
  const [genLateFees, setGenLateFees] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Payment Modal
  const [payTarget, setPayTarget] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'UPI' | 'CASH' | 'BANK' | 'ONLINE'>('UPI');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [recording, setRecording] = useState(false);

  const loadBilling = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (propertyFilter) params.set('propertyId', propertyFilter);
    if (search.trim()) params.set('search', search.trim());

    try {
      const [bRes, pRes] = await Promise.all([
        apiFetch<{ invoices: InvoiceRow[]; pendingApprovals: PendingApproval[] }>(
          `/api/billing/invoices?${params.toString()}`
        ),
        apiFetch<{ properties: Array<{ id: number; name: string }> }>('/api/properties'),
      ]);
      setInvoices(bRes.invoices);
      setPendingApprovals(bRes.pendingApprovals);
      setProperties(pRes.properties);
    } catch (err: any) {
      showToast(err.message || 'Failed to load billing records', 'error');
    }
  }, [statusFilter, propertyFilter, search, showToast]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await apiFetch<{ createdCount: number; updatedOverdueCount: number }>('/api/billing/generate', {
        method: 'POST',
        body: JSON.stringify({
          month: genMonth,
          year: genYear,
          propertyId: propertyFilter ? Number(propertyFilter) : undefined,
          applyLateFees: genLateFees,
        }),
      });
      showToast(`Generated ${res.createdCount} invoices · updated ${res.updatedOverdueCount} overdue`);
      setShowGenerate(false);
      await loadBilling();
    } catch (err: any) {
      showToast(err.message || 'Invoice generation failed', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    setRecording(true);
    try {
      await apiFetch('/api/billing/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: payTarget.id,
          amount: payAmount,
          method: payMethod,
          reference: payRef,
          paidAt: payDate,
        }),
      });
      showToast(`Payment of ${formatINR(payAmount)} recorded`);
      setPayTarget(null);
      await loadBilling();
    } catch (err: any) {
      showToast(err.message || 'Payment entry failed', 'error');
    } finally {
      setRecording(false);
    }
  };

  const handleReviewUpi = async (paymentId: number, decision: 'APPROVE' | 'REJECT') => {
    try {
      await apiFetch(`/api/billing/payments/${paymentId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      showToast(decision === 'APPROVE' ? 'UPI payment approved & ledger updated' : 'UPI submission rejected');
      await loadBilling();
    } catch (err: any) {
      showToast(err.message || 'Review action failed', 'error');
    }
  };

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: 'Invoice',
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
              {row.original.invoiceNumber}
            </p>
            <p className="text-[11px] text-slate-500">
              {row.original.periodLabel} {row.original.isProRata ? '· Pro-rata' : ''}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'tenantName',
        header: 'Resident',
        cell: ({ row }) => (
          <div className="min-w-[140px]">
            <p className="font-medium text-slate-900 dark:text-slate-100">{row.original.tenantName}</p>
            <p className="text-xs text-slate-500">{row.original.propertyName}</p>
          </div>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Billed / Paid',
        cell: ({ row }) => (
          <div className="font-mono text-xs tabular-nums">
            <p className="font-semibold text-slate-900 dark:text-white">{formatINR(row.original.amount)}</p>
            <p className="text-slate-500">Paid {formatINR(row.original.paidAmount)}</p>
          </div>
        ),
      },
      {
        accessorKey: 'balanceDue',
        header: 'Balance',
        cell: ({ row }) => (
          <span
            className={`font-mono text-sm font-semibold tabular-nums ${
              row.original.balanceDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {row.original.balanceDue > 0 ? formatINR(row.original.balanceDue) : '₹0'}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.original.status;
          const color =
            s === 'PAID'
              ? 'text-emerald-700 dark:text-emerald-400'
              : s === 'OVERDUE'
                ? 'text-red-600 dark:text-red-400'
                : s === 'PARTIAL'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-slate-600 dark:text-slate-300';
          return <span className={`text-xs font-semibold ${color}`}>{s}</span>;
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: { stickyRight: true },
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <div className="flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
              {inv.balanceDue > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPayTarget(inv);
                      setPayAmount(inv.balanceDue);
                      setPayRef('');
                    }}
                    className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                  >
                    Record Pay
                  </button>
                  <a
                    href={buildWhatsAppReminderUrl({
                      phone: inv.tenantPhone,
                      tenantName: inv.tenantName,
                      propertyName: inv.propertyName,
                      invoiceNumber: inv.invoiceNumber,
                      periodLabel: inv.periodLabel,
                      balanceDue: inv.balanceDue,
                      dueDate: inv.dueDate,
                      upiId: inv.upiId,
                    })}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Send WhatsApp reminder for ${inv.invoiceNumber}`}
                    className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <MessageCircle className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                  </a>
                </>
              )}
              <button
                type="button"
                onClick={() =>
                  downloadAuthorizedFile(
                    `/api/billing/invoices/${inv.id}/receipt.pdf`,
                    `${inv.invoiceNumber}.pdf`
                  ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                }
                aria-label={`Download PDF receipt for ${inv.invoiceNumber}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>PDF</span>
              </button>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <DashboardLayout
      title="Rent & Billing"
      breadcrumb="Dashboard / Billing & Receipts"
      actions={
        <button
          type="button"
          onClick={() => setShowGenerate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Run Monthly Billing</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* Pending UPI Approval Queue */}
        {pendingApprovals.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Tenant UPI Payment Approvals ({pendingApprovals.length})
              </h2>
            </div>
            <div className="mt-3 divide-y divide-amber-200/70 dark:divide-amber-900/50">
              {pendingApprovals.map((pa) => (
                <div
                  key={pa.id}
                  className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"
                >
                  <div className="text-xs">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {pa.tenantName} · {formatINR(pa.amount)} ({pa.invoiceNumber})
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">
                      {pa.propertyName} · UTR: <span className="font-mono font-medium">{pa.reference}</span> ·{' '}
                      {formatDateIN(pa.paidAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleReviewUpi(pa.id, 'APPROVE')}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewUpi(pa.id, 'REJECT')}
                      className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <DataTable
          data={invoices}
          columns={columns}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by resident, invoice #, or mobile..."
          toolbarExtra={
            <>
              <select
                aria-label="Filter invoices by property"
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">All Properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter invoices by status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="ALL">All Statuses</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PENDING">Pending</option>
                <option value="PARTIAL">Partial</option>
                <option value="PAID">Paid</option>
              </select>
            </>
          }
        />
      </div>

      {/* Run Monthly Billing Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleGenerate}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Generate Monthly Rent Invoices</h3>
              <button type="button" onClick={() => setShowGenerate(false)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium">Month (1-12)</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={genMonth}
                  onChange={(e) => setGenMonth(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Year</label>
                <input
                  type="number"
                  min={2024}
                  max={2035}
                  value={genYear}
                  onChange={(e) => setGenYear(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={genLateFees}
                onChange={(e) => setGenLateFees(e.target.checked)}
              />
              <span>Auto-flag overdue invoices &amp; apply configured late fee after grace days</span>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowGenerate(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={generating} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                {generating ? 'Generating...' : 'Generate Invoices'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Payment Modal */}
      {payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleRecordPayment}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="font-display text-lg font-semibold">Record Payment</h3>
                <p className="text-xs text-slate-500">
                  {payTarget.tenantName} · {payTarget.invoiceNumber}
                </p>
              </div>
              <button type="button" onClick={() => setPayTarget(null)} aria-label="Close modal">
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
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium">Method</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="UPI">UPI</option>
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank / IMPS</option>
                    <option value="ONLINE">Online</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">UTR / Receipt Reference</label>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g., UTR63119884210"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPayTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={recording} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                {recording ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
