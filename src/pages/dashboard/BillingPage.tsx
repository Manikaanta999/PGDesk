import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ColumnDef } from '@tanstack/react-table';
import { Check, Download, Eye, MessageCircle, Plus, Receipt, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable } from '../../components/ui/DataTable';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { formatInvoiceStatus, validatePaymentAmount } from '../../lib/dashboardHelpers';
import { buildWhatsAppReminderUrl, formatDateIN, formatINR } from '../../lib/format';

interface InvoiceLineItem {
  label: string;
  type: string;
  amount: number;
}

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  tenantId: number;
  tenantName: string;
  tenantPhone: string | null;
  propertyId: number;
  propertyName: string;
  roomNumber?: string;
  bedLabel?: string;
  periodMonth: number;
  periodYear: number;
  periodStart?: string;
  periodEnd?: string;
  periodLabel: string;
  amount: number;
  paidAmount: number;
  balanceDue: number;
  dueDate: string;
  status: 'PAID' | 'PENDING' | 'OVERDUE' | 'PARTIAL';
  isProRata: boolean;
  items?: InvoiceLineItem[];
  notes?: string | null;
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

interface BillingSummary {
  totalBilled: number;
  totalCollected: number;
  totalPending: number;
  overdueCount: number;
}

export function BillingPage() {
  const [searchParams] = useSearchParams();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [properties, setProperties] = useState<Array<{ id: number; name: string }>>([]);
  const [availableMonths, setAvailableMonths] = useState<Array<{ key: string; label: string }>>([]);
  const [summary, setSummary] = useState<BillingSummary>({
    totalBilled: 0,
    totalCollected: 0,
    totalPending: 0,
    overdueCount: 0,
  });

  const initialStatus = String(searchParams.get('status') || 'ALL').toUpperCase();
  const [statusFilter, setStatusFilter] = useState(
    ['ALL', 'OVERDUE', 'PENDING', 'PARTIAL', 'PAID'].includes(initialStatus) ? initialStatus : 'ALL'
  );
  const [propertyFilter, setPropertyFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [search, setSearch] = useState('');

  // Generate Modal
  const [showGenerate, setShowGenerate] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [genLateFees, setGenLateFees] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Payment Modal
  const [payTarget, setPayTarget] = useState<InvoiceRow | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'UPI' | 'CASH' | 'BANK' | 'ONLINE'>('UPI');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [recording, setRecording] = useState(false);

  // Invoice Detail Modal
  const [viewTarget, setViewTarget] = useState<InvoiceRow | null>(null);

  const loadBilling = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (propertyFilter) params.set('propertyId', propertyFilter);
    if (monthFilter) params.set('month', monthFilter);
    if (search.trim()) params.set('search', search.trim());

    try {
      const [bRes, pRes] = await Promise.all([
        apiFetch<{
          invoices: InvoiceRow[];
          pendingApprovals: PendingApproval[];
          availableMonths?: Array<{ key: string; label: string }>;
          summary?: BillingSummary;
        }>(`/api/billing/invoices?${params.toString()}`),
        apiFetch<{ properties: Array<{ id: number; name: string }> }>('/api/properties'),
      ]);
      setInvoices(bRes.invoices);
      setPendingApprovals(bRes.pendingApprovals);
      setAvailableMonths(bRes.availableMonths || []);
      if (bRes.summary) {
        setSummary(bRes.summary);
      }
      setProperties(pRes.properties);
    } catch (err: any) {
      showToast(err.message || 'Failed to load billing records', 'error');
    }
  }, [statusFilter, propertyFilter, monthFilter, search, showToast]);

  useEffect(() => {
    loadBilling();
  }, [loadBilling]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generating) return;
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

  const openPayModal = (inv: InvoiceRow) => {
    setPayTarget(inv);
    setPayAmount(inv.balanceDue);
    setPayMethod('UPI');
    setPayRef('');
    setPayDate(new Date().toISOString().slice(0, 10));
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || recording) return;
    const check = validatePaymentAmount(payAmount, payTarget.balanceDue);
    if (!check.valid) {
      showToast(check.error || 'Enter a valid payment amount', 'error');
      return;
    }
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

  const handleDownloadPdf = (inv: InvoiceRow) => {
    downloadAuthorizedFile(`/api/billing/invoices/${inv.id}/receipt.pdf`, `${inv.invoiceNumber}.pdf`).catch((e) =>
      showToast(e.message || 'Download failed', 'error')
    );
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
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {row.original.periodLabel} {row.original.isProRata ? '· Pro-rata' : ''}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'tenantName',
        header: 'Student & Bed',
        cell: ({ row }) => (
          <div className="min-w-[160px]">
            <p className="font-medium text-slate-900 dark:text-slate-100">{row.original.tenantName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {row.original.propertyName}
              {row.original.roomNumber ? ` · Room ${row.original.roomNumber}` : ''}
              {row.original.bedLabel ? ` (${row.original.bedLabel})` : ''}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'amount',
        header: 'Billed / Paid',
        cell: ({ row }) => (
          <div className="font-mono text-xs tabular-nums">
            <p className="font-semibold text-slate-900 dark:text-white">{formatINR(row.original.amount)}</p>
            <p className="text-slate-500 dark:text-slate-400">Paid {formatINR(row.original.paidAmount)}</p>
          </div>
        ),
      },
      {
        accessorKey: 'balanceDue',
        header: 'Balance Due',
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
          return <span className={`text-xs font-semibold whitespace-nowrap ${color}`}>{formatInvoiceStatus(s)}</span>;
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
              <button
                type="button"
                onClick={() => setViewTarget(inv)}
                aria-label={`View invoice details for ${inv.invoiceNumber}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>View</span>
              </button>
              {inv.balanceDue > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => openPayModal(inv)}
                    className="rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                  >
                    Record Pay
                  </button>
                  {inv.tenantPhone && (
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
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => handleDownloadPdf(inv)}
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
      title={tHeading('heading.pageRent')}
      breadcrumb="Home / Rent & Payments"
      actions={
        <button
          type="button"
          onClick={() => setShowGenerate(true)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Create Monthly Rent List</span>
        </button>
      }
    >
      <div className="space-y-6">
        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Rent Billed</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
              {formatINR(summary.totalBilled)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
              {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'} in view
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Rent Collected</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatINR(summary.totalCollected)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Approved &amp; received</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Pending Rent</p>
            <p
              className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
                summary.totalPending > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {formatINR(summary.totalPending)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Remaining to collect</p>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => (prev === 'OVERDUE' ? 'ALL' : 'OVERDUE'))}
            className={`rounded-xl border p-4 text-left transition-colors ${
              statusFilter === 'OVERDUE'
                ? 'border-red-500 bg-red-50/40 dark:border-red-700 dark:bg-red-950/20'
                : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900'
            }`}
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overdue Invoices</p>
            <p className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {summary.overdueCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {statusFilter === 'OVERDUE' ? 'Click to show all' : 'Tap to filter overdue'}
            </p>
          </button>
        </div>

        {/* Pending UPI Approval Queue */}
        {pendingApprovals.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Student UPI Payment Checks ({pendingApprovals.length})
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
                      className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <Check className="h-3.5 w-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewUpi(pa.id, 'REJECT')}
                      className="min-h-[36px] rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-slate-900 dark:text-red-400"
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
          searchPlaceholder="Search by student, invoice #, room, or mobile..."
          emptyTitle="No rent records match these filters"
          emptyDescription="Clear filters or create the monthly rent list for this period."
          renderMobileCard={(inv) => (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">{inv.tenantName}</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {inv.propertyName}
                    {inv.roomNumber ? ` · Room ${inv.roomNumber}` : ''}
                    {inv.bedLabel ? ` (${inv.bedLabel})` : ''}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {inv.invoiceNumber} · {inv.periodLabel}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    inv.status === 'PAID'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : inv.status === 'OVERDUE'
                        ? 'text-red-600 dark:text-red-400'
                        : inv.status === 'PARTIAL'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {formatInvoiceStatus(inv.status)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-950">
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Billed</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatINR(inv.amount)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Paid</p>
                  <p className="mt-0.5 font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatINR(inv.paidAmount)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-500 dark:text-slate-400">Balance</p>
                  <p
                    className={`mt-0.5 font-mono font-semibold tabular-nums ${
                      inv.balanceDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {inv.balanceDue > 0 ? formatINR(inv.balanceDue) : '₹0'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setViewTarget(inv)}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View</span>
                </button>
                {inv.balanceDue > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => openPayModal(inv)}
                      className="min-h-[38px] rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      Record Pay
                    </button>
                    {inv.tenantPhone && (
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
                        className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <MessageCircle className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                        <span>Remind</span>
                      </a>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(inv)}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>PDF</span>
                </button>
              </div>
            </div>
          )}
          toolbarExtra={
            <>
              <select
                aria-label="Filter invoices by month"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">All Months</option>
                {availableMonths.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter invoices by hostel"
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="">All Hostels</option>
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
                className="min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="ALL">All Statuses</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PENDING">Pending</option>
                <option value="PARTIAL">Partially Paid</option>
                <option value="PAID">Paid</option>
              </select>
            </>
          }
        />
      </div>

      {/* View Invoice Itemized Modal */}
      {viewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {viewTarget.invoiceNumber} · {formatInvoiceStatus(viewTarget.status)}
                </p>
                <h3 className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                  {viewTarget.tenantName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {viewTarget.propertyName}
                  {viewTarget.roomNumber ? ` · Room ${viewTarget.roomNumber}` : ''}
                  {viewTarget.bedLabel ? ` (${viewTarget.bedLabel})` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                aria-label="Close invoice details"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Billing Period</p>
                <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                  {viewTarget.periodLabel}
                  {viewTarget.periodStart && viewTarget.periodEnd
                    ? ` (${formatDateIN(viewTarget.periodStart)} – ${formatDateIN(viewTarget.periodEnd)})`
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 dark:text-slate-400">Due Date</p>
                <p className="mt-0.5 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                  {formatDateIN(viewTarget.dueDate)}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Charges Breakdown</p>
              <div className="mt-2.5 space-y-2 text-xs">
                {viewTarget.items && viewTarget.items.length > 0 ? (
                  viewTarget.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2">
                      <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                      <span className="font-mono font-medium tabular-nums text-slate-900 dark:text-white">
                        {formatINR(item.amount)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-700 dark:text-slate-300">Monthly Hostel Rent</span>
                    <span className="font-mono font-medium tabular-nums text-slate-900 dark:text-white">
                      {formatINR(viewTarget.amount)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-xs dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total Billed</span>
                  <span className="font-mono font-semibold tabular-nums">{formatINR(viewTarget.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Paid So Far</span>
                  <span className="font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatINR(viewTarget.paidAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold">
                  <span>Balance Due</span>
                  <span
                    className={`font-mono tabular-nums ${
                      viewTarget.balanceDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {formatINR(viewTarget.balanceDue)}
                  </span>
                </div>
              </div>
            </div>

            {viewTarget.notes && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Note: {viewTarget.notes}</p>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDownloadPdf(viewTarget)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Receipt PDF</span>
              </button>
              {viewTarget.balanceDue > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const target = viewTarget;
                    setViewTarget(null);
                    openPayModal(target);
                  }}
                  className="min-h-[40px] rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
              <button type="submit" disabled={generating} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
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
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {payTarget.tenantName} · {payTarget.invoiceNumber} · Due {formatINR(payTarget.balanceDue)}
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
                  max={payTarget.balanceDue}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium">Payment Mode</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">UTR / Receipt Reference</label>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g., UTR63119884210"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setPayTarget(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={recording} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                {recording ? 'Saving...' : 'Save Payment'}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}

