import React, { useState } from 'react';
import { Building2, ChevronDown, ChevronUp, Download, History } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { downloadAuthorizedFile } from '../../lib/api';
import { formatDateIN, formatINR } from '../../lib/format';
import {
  formatDepositStatus,
  formatPaymentApprovalLabel,
  formatRoomSharingLabel,
  formatStudentInvoiceStatus,
} from '../../lib/studentPortalHelpers';
import { PastStayRecord } from './types';

interface TenantPastHostelsTabProps {
  pastStays: PastStayRecord[];
}

export function TenantPastHostelsTab({ pastStays }: TenantPastHostelsTabProps) {
  const { tHeading } = useLanguage();
  const { showToast } = useToast();
  const [expandedStayId, setExpandedStayId] = useState<number | null>(pastStays[0]?.stayId ?? null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {tHeading('heading.pagePastHostels')}
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Completed hostel stays, deposit settlements, and historical rent receipts.
        </p>
      </div>

      {pastStays.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
          <History className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
            No past hostel stays recorded
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            When you move out of a hostel, your stay summary and rent receipts will stay saved here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pastStays.map((stay) => {
            const isOpen = expandedStayId === stay.stayId;
            return (
              <div
                key={stay.stayId}
                className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="p-5">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <Building2 className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                        <span>Completed Stay · Moved Out</span>
                      </div>
                      <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
                        {stay.propertyName}
                      </h2>
                      {stay.propertyAddress && (
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{stay.propertyAddress}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedStayId(isOpen ? null : stay.stayId)}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span>{isOpen ? 'Hide Invoices & Receipts' : 'View Invoices & Receipts'}</span>
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs sm:grid-cols-4 dark:border-slate-800">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Room &amp; Bed</dt>
                      <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">
                        {stay.roomNumber ? `Room ${stay.roomNumber}` : 'Room'}{' '}
                        {stay.bedLabel ? `· Bed ${stay.bedLabel}` : ''}
                      </dd>
                      {stay.roomType && (
                        <dd className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatRoomSharingLabel(stay.roomType)}
                        </dd>
                      )}
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Move-In Date</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                        {formatDateIN(stay.joinDate)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Move-Out Date</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">
                        {stay.leaveDate ? formatDateIN(stay.leaveDate) : 'Recorded'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Deposit Settlement</dt>
                      <dd className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatINR(stay.securityDeposit)} · {formatDepositStatus(stay.depositStatus)}
                      </dd>
                      {stay.depositDeductions > 0 && (
                        <dd className="text-[11px] text-slate-500 dark:text-slate-400">
                          Deductions: {formatINR(stay.depositDeductions)}
                        </dd>
                      )}
                    </div>
                  </dl>

                  {stay.depositSettlementNote && (
                    <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      Settlement Note: {stay.depositSettlementNote}
                    </p>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/60">
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      Historical Rent Invoices &amp; Payments ({stay.invoices.length})
                    </h3>
                    {stay.invoices.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        No rent invoices were recorded during this stay.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2.5">
                        {stay.invoices.map((inv) => {
                          const invPayments = stay.payments.filter((p) => p.invoiceId === inv.id);
                          return (
                            <div
                              key={inv.id}
                              className="rounded-xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-800 dark:bg-slate-900"
                            >
                              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                                <div>
                                  <p className="font-semibold text-slate-900 dark:text-white">
                                    {inv.periodLabel} · <span className="font-mono">{inv.invoiceNumber}</span>
                                  </p>
                                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                                    Billed {formatINR(inv.amount)} · Paid {formatINR(inv.paidAmount)} ·{' '}
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                                      {formatStudentInvoiceStatus(inv.status)}
                                    </span>
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadAuthorizedFile(
                                      `/api/tenant/invoices/${inv.id}/receipt.pdf`,
                                      `Receipt-${inv.invoiceNumber}.pdf`
                                    ).catch((e) => showToast(e.message || 'Could not download receipt', 'error'))
                                  }
                                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 font-semibold text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  <span>Download Receipt PDF</span>
                                </button>
                              </div>
                              {invPayments.length > 0 && (
                                <div className="mt-2.5 space-y-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                                  {invPayments.map((p) => (
                                    <div
                                      key={p.id}
                                      className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400"
                                    >
                                      <span>
                                        {formatDateIN(p.paidAt)} · {p.method}
                                        {p.reference ? ` · Ref: ${p.reference}` : ''} ·{' '}
                                        {formatPaymentApprovalLabel(p.approvalStatus)}
                                      </span>
                                      <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                                        {formatINR(p.amount)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
