import React, { useState } from 'react';
import { Banknote, Copy, Download, Eye, Landmark, QrCode, Upload, X } from 'lucide-react';
import { AuthorizedImage } from '../../components/ui/AuthorizedImage';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { formatDateIN, formatINR } from '../../lib/format';
import {
  formatPaymentApprovalLabel,
  formatStudentInvoiceStatus,
} from '../../lib/studentPortalHelpers';
import { TenantInvoiceRow, TenantOverviewResponse, TenantPaymentRow } from './types';

interface TenantPaymentsTabProps {
  data: TenantOverviewResponse;
  onRefresh: () => Promise<void>;
}

export function TenantPaymentsTab({ data, onRefresh }: TenantPaymentsTabProps) {
  const { tHeading } = useLanguage();
  const { showToast } = useToast();

  const [selectedInvoice, setSelectedInvoice] = useState<TenantInvoiceRow | null>(null);
  const [upiInv, setUpiInv] = useState<TenantInvoiceRow | null>(null);
  const [upiAmount, setUpiAmount] = useState(0);
  const [utrRef, setUtrRef] = useState('');
  const [upiNotes, setUpiNotes] = useState('');
  const [upiScreenshotUrl, setUpiScreenshotUrl] = useState('');
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const [submittingUpi, setSubmittingUpi] = useState(false);
  const [upiIdempotencyKey, setUpiIdempotencyKey] = useState('');
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);

  const openPayModal = (inv: TenantInvoiceRow) => {
    setUpiInv(inv);
    setUpiAmount(inv.balanceDue);
    setUtrRef('');
    setUpiNotes('');
    setUpiScreenshotUrl('');
    setUpiIdempotencyKey(
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tu-${inv.id}-${Date.now()}`
    );
  };

  const handleCopyUpi = () => {
    if (!data.organization?.upiId) return;
    navigator.clipboard?.writeText(data.organization.upiId).then(
      () => showToast('UPI ID copied to clipboard'),
      () => showToast(`UPI ID: ${data.organization?.upiId}`, 'info')
    );
  };

  const handleUpiScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingScreenshot(true);
    try {
      const base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ file: { url: string } }>('/api/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          base64Data,
          folder: 'receipts',
        }),
      });
      setUpiScreenshotUrl(res.file.url);
      showToast('Payment screenshot uploaded');
    } catch (err: any) {
      showToast(err.message || 'Could not upload screenshot', 'error');
    } finally {
      setUploadingScreenshot(false);
    }
  };

  const handleSubmitUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiInv || submittingUpi) return;
    const numericAmount = Math.round(Number(upiAmount));
    if (!Number.isFinite(numericAmount) || numericAmount < 1 || numericAmount > upiInv.balanceDue) {
      showToast(`Enter an amount between ₹1 and ${formatINR(upiInv.balanceDue)}.`, 'error');
      return;
    }
    setSubmittingUpi(true);
    try {
      await apiFetch('/api/tenant/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: upiInv.id,
          amount: numericAmount,
          reference: utrRef.trim(),
          screenshotUrl: upiScreenshotUrl || null,
          notes: upiNotes.trim() || undefined,
          idempotencyKey: upiIdempotencyKey || undefined,
        }),
      });
      showToast('Payment proof submitted. It stays pending until your hostel owner verifies it.');
      setUpiInv(null);
      setUtrRef('');
      setUpiNotes('');
      setUpiScreenshotUrl('');
      setUpiIdempotencyKey('');
      await onRefresh();
    } catch (err: any) {
      showToast(err.message || 'Submission failed', 'error');
    } finally {
      setSubmittingUpi(false);
    }
  };

  const invoicePayments = (invoiceId: number): TenantPaymentRow[] =>
    data.payments.filter((p) => p.invoiceId === invoiceId);

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {tHeading('heading.pageTenantPayments')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Review monthly bills, itemized charges, payment instructions, and download verified PDF receipts.
          </p>
        </div>
      </div>

      {/* Payment Instructions Card */}
      {data.organization && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
                <QrCode className="h-4 w-4" />
                <span>UPI Payment</span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </button>
            </div>
            <p className="mt-2 font-mono text-sm font-bold text-slate-900 dark:text-white">
              {data.organization.upiId}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Payee: {data.organization.upiPayeeName} (GPay, PhonePe, Paytm)
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Landmark className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <span>Bank Transfer</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {data.organization.bankDetails?.trim()
                ? data.organization.bankDetails
                : 'Contact hostel owner for NEFT/IMPS bank account details if paying by bank transfer.'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Banknote className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <span>Cash &amp; Office Timing</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              {data.organization.paymentInstructions?.trim()
                ? data.organization.paymentInstructions
                : 'Always submit your 12-digit UTR number after UPI transfer, or collect a receipt when paying cash at the hostel office.'}
            </p>
          </div>
        </div>
      )}

      {/* Rent Invoices Table / Cards */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold">{tHeading('heading.sectionTenantInvoices')}</h2>
        </div>

        {data.invoices.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No rent bills generated yet. Your monthly bills will appear here automatically.
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
              {data.invoices.map((inv) => (
                <div key={inv.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white">
                        {inv.invoiceNumber}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {inv.periodLabel} · Due {formatDateIN(inv.dueDate)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        inv.status === 'PAID'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : inv.status === 'OVERDUE'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {formatStudentInvoiceStatus(inv.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Billed</p>
                      <p className="font-mono font-medium">{formatINR(inv.amount)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Paid</p>
                      <p className="font-mono font-medium text-emerald-700 dark:text-emerald-400">
                        {formatINR(inv.paidAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">Pending</p>
                      <p className="font-mono font-semibold text-slate-900 dark:text-white">
                        {formatINR(inv.balanceDue)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(inv)}
                      className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Details</span>
                    </button>
                    {inv.balanceDue > 0 && (
                      <button
                        type="button"
                        onClick={() => openPayModal(inv)}
                        className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        <span>Pay via UPI</span>
                      </button>
                    )}
                    {inv.paidAmount > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadAuthorizedFile(
                            `/api/tenant/invoices/${inv.id}/receipt.pdf`,
                            `${inv.invoiceNumber}.pdf`
                          ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                        }
                        className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Receipt</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Billing Period</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Billed</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-950/40">
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">
                        {inv.invoiceNumber}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        {inv.periodLabel}
                        {inv.isProRata && (
                          <span className="ml-1.5 text-[11px] text-slate-500 dark:text-slate-400">(Pro-rata)</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateIN(inv.dueDate)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums">
                        {formatINR(inv.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-emerald-700 tabular-nums dark:text-emerald-400">
                        {formatINR(inv.paidAmount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums">
                        {formatINR(inv.balanceDue)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">
                        <span
                          className={
                            inv.status === 'PAID'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : inv.status === 'OVERDUE'
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }
                        >
                          {formatStudentInvoiceStatus(inv.status)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Details</span>
                          </button>
                          {inv.balanceDue > 0 && (
                            <button
                              type="button"
                              onClick={() => openPayModal(inv)}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              <span>Pay via UPI</span>
                            </button>
                          )}
                          {inv.paidAmount > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                downloadAuthorizedFile(
                                  `/api/tenant/invoices/${inv.id}/receipt.pdf`,
                                  `${inv.invoiceNumber}.pdf`
                                ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Receipt</span>
                            </button>
                          ) : (
                            <span className="px-1.5 text-[11px] text-slate-400">No receipt</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Payment History & Verification Log */}
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-display text-base font-semibold">Payment Submissions &amp; Verification History</h2>
        </div>
        {data.payments.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No payments recorded yet. Submit your UPI reference after paying an invoice.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.payments.map((p) => (
              <div
                key={p.id}
                className="flex flex-col justify-between gap-2 px-5 py-3.5 text-xs sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {p.method} · {p.reference || 'Hostel Receipt'}
                  </p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                    Date: {formatDateIN(p.paidAt)}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {p.screenshotUrl && (
                    <button
                      type="button"
                      onClick={() => setPreviewScreenshotUrl(p.screenshotUrl!)}
                      className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                    >
                      View Screenshot
                    </button>
                  )}
                  <span
                    className={`font-semibold ${
                      p.approvalStatus === 'APPROVED'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : p.approvalStatus === 'REJECTED'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {formatPaymentApprovalLabel(p.approvalStatus)}
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatINR(p.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Itemized Invoice Details Modal */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {selectedInvoice.invoiceNumber}
                </p>
                <h3 className="mt-0.5 font-display text-lg font-bold">
                  {selectedInvoice.periodLabel} Rent Bill
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Billing cycle: {formatDateIN(selectedInvoice.periodStart)} to{' '}
                  {formatDateIN(selectedInvoice.periodEnd)} · Due {formatDateIN(selectedInvoice.dueDate)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                aria-label="Close invoice details"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Itemized Charges
                </h4>
                <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-slate-50 px-3.5 text-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
                  {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
                    selectedInvoice.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="font-medium text-slate-800 dark:text-slate-200">{item.label}</span>
                        <span className="font-mono font-semibold tabular-nums">{formatINR(item.amount)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <span className="font-medium text-slate-800 dark:text-slate-200">Monthly Bed Rent</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatINR(selectedInvoice.amount)}
                      </span>
                    </div>
                  )}
                </div>
                {selectedInvoice.isProRata && (
                  <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Pro-rata calculation applies when joining mid-month so you only pay for days stayed.
                  </p>
                )}
              </div>

              <div className="space-y-1.5 rounded-lg border border-slate-200 p-3.5 text-xs dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Total Billed</span>
                  <span className="font-mono font-semibold tabular-nums">{formatINR(selectedInvoice.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Approved Payments Received</span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                    {formatINR(selectedInvoice.paidAmount)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold dark:border-slate-800">
                  <span>Remaining Balance</span>
                  <span className="font-mono tabular-nums">{formatINR(selectedInvoice.balanceDue)}</span>
                </div>
              </div>

              {invoicePayments(selectedInvoice.id).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Linked Payments
                  </h4>
                  <div className="mt-2 space-y-2 text-xs">
                    {invoicePayments(selectedInvoice.id).map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                      >
                        <div>
                          <p className="font-medium">
                            {p.method} · {p.reference || 'Receipt'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {formatDateIN(p.paidAt)} · {formatPaymentApprovalLabel(p.approvalStatus)}
                          </p>
                        </div>
                        <span className="font-mono font-semibold tabular-nums">{formatINR(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              {selectedInvoice.paidAmount > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    downloadAuthorizedFile(
                      `/api/tenant/invoices/${selectedInvoice.id}/receipt.pdf`,
                      `${selectedInvoice.invoiceNumber}.pdf`
                    ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium dark:border-slate-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Receipt PDF</span>
                </button>
              ) : (
                <span className="self-center text-xs text-slate-500 dark:text-slate-400">
                  Receipt is generated only after an approved payment.
                </span>
              )}
              {selectedInvoice.balanceDue > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const inv = selectedInvoice;
                    setSelectedInvoice(null);
                    openPayModal(inv);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  <span>Pay via UPI</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPI Instructions & Submit UTR Modal */}
      {upiInv && data.organization && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSubmitUpi}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Pay via UPI</h3>
              <button type="button" onClick={() => setUpiInv(null)} aria-label="Close UPI modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950">
              <p>
                Pay balance <span className="font-mono font-bold text-slate-900 dark:text-white">{formatINR(upiInv.balanceDue)}</span> to:
              </p>
              <p className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                {data.organization.upiId}
              </p>
              <p className="text-slate-500">Payee: {data.organization.upiPayeeName} (GPay / PhonePe / Paytm)</p>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium">Amount Paid (₹) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={upiInv.balanceDue}
                  value={upiAmount}
                  onChange={(e) => setUpiAmount(Number(e.target.value))}
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">12-Digit UPI / UTR Reference *</label>
                <input
                  required
                  minLength={6}
                  value={utrRef}
                  onChange={(e) => setUtrRef(e.target.value)}
                  placeholder="e.g., 631198442019"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Notes (Optional)</label>
                <input
                  value={upiNotes}
                  onChange={(e) => setUpiNotes(e.target.value)}
                  placeholder="e.g., Paid from PhonePe"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Payment Screenshot (Optional)</label>
                <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700">
                  <Upload className="h-3.5 w-3.5" />
                  <span>
                    {uploadingScreenshot
                      ? 'Uploading...'
                      : upiScreenshotUrl
                        ? 'Screenshot attached'
                        : 'Upload screenshot'}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpiScreenshot} />
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUpiInv(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingUpi || uploadingScreenshot}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {submittingUpi ? 'Submitting...' : 'Submit UTR for Owner Check'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payment Screenshot Preview Modal */}
      {previewScreenshotUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between pb-3">
              <h3 className="font-display text-sm font-semibold">Uploaded Payment Proof</h3>
              <button type="button" onClick={() => setPreviewScreenshotUrl(null)} aria-label="Close preview">
                <X className="h-4 w-4" />
              </button>
            </div>
            <AuthorizedImage
              src={previewScreenshotUrl}
              alt="Payment proof"
              className="max-h-[70vh] w-full rounded-lg object-contain"
              fallback={<p className="py-8 text-center text-xs text-slate-500">Preview unavailable.</p>}
            />
          </div>
        </div>
      )}
    </div>
  );
}
