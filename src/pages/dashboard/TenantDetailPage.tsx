import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileText, LogOut, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { calculateDepositSettlement } from '../../lib/billing';
import { formatDateIN, formatIndianPhone, formatINR, formatMonthYear } from '../../lib/format';

interface TenantDetailResponse {
  tenant: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    idType: string;
    idNumberMasked: string;
    idDocumentUrl: string | null;
    occupation: string;
    companyOrCollege: string;
    permanentAddress: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    joinDate: string;
    leaveDate: string | null;
    status: 'ACTIVE' | 'NOTICE' | 'LEFT';
    monthlyRent: number;
    securityDeposit: number;
    depositStatus: string;
    depositDeductions: number;
    depositSettlementNote: string | null;
  };
  property: { id: number; name: string } | null;
  bed: { id: number; bedLabel: string } | null;
  room: { id: number; roomNumber: string; roomType: string; isAc: boolean } | null;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    periodMonth: number;
    periodYear: number;
    amount: number;
    paidAmount: number;
    dueDate: string;
    status: string;
  }>;
  payments: Array<{
    id: number;
    amount: number;
    method: string;
    reference: string;
    paidAt: string;
    approvalStatus: string;
  }>;
  complaints: Array<{
    id: number;
    title: string;
    category: string;
    status: string;
    priority: string;
  }>;
  unpaidBalance: number;
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [data, setData] = useState<TenantDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [moveOutOpen, setMoveOutOpen] = useState(false);
  const [leaveDate, setLeaveDate] = useState(new Date().toISOString().slice(0, 10));
  const [deductions, setDeductions] = useState(0);
  const [note, setNote] = useState('Room inspection completed; keys & biometric tag returned.');
  const [processingMoveOut, setProcessingMoveOut] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch<TenantDetailResponse>(`/api/tenants/${id}`);
      setData(res);
    } catch (err: any) {
      showToast(err.message || 'Failed to load tenant profile', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  if (loading || !data) {
    return (
      <DashboardLayout title="Resident Profile" breadcrumb="Dashboard / Tenants">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </DashboardLayout>
    );
  }

  const { tenant, property, bed, room, invoices, payments, complaints, unpaidBalance } = data;
  const settlement = calculateDepositSettlement({
    securityDeposit: tenant.securityDeposit,
    unpaidInvoicesBalance: unpaidBalance,
    damageOrNoticeDeductions: deductions,
  });

  const handleMoveOutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessingMoveOut(true);
    try {
      await apiFetch(`/api/tenants/${tenant.id}/move-out`, {
        method: 'POST',
        body: JSON.stringify({
          leaveDate,
          depositDeductions: deductions,
          depositStatus: settlement.suggestedStatus,
          depositSettlementNote: note,
        }),
      });
      showToast(`${tenant.name} moved out and bed released.`);
      setMoveOutOpen(false);
      await loadDetail();
    } catch (err: any) {
      showToast(err.message || 'Move-out failed', 'error');
    } finally {
      setProcessingMoveOut(false);
    }
  };

  return (
    <DashboardLayout
      title={tenant.name}
      breadcrumb={`Dashboard / Tenants / ${tenant.name}`}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/dashboard/tenants"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </Link>
          {tenant.status !== 'LEFT' && (
            <button
              type="button"
              onClick={() => setMoveOutOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-700"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Move-Out &amp; Settle Deposit</span>
            </button>
          )}
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Profile Card */}
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">{tenant.name}</h2>
                <p className="text-xs text-slate-500">
                  {tenant.occupation} {tenant.companyOrCollege ? `· ${tenant.companyOrCollege}` : ''}
                </p>
              </div>
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">{tenant.status}</span>
            </div>

            <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
              <div className="flex justify-between">
                <dt className="text-slate-500">Property</dt>
                <dd className="font-medium text-right">{property?.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Room / Bed</dt>
                <dd className="font-mono font-semibold">
                  {room ? `Room ${room.roomNumber} (${room.isAc ? 'AC' : 'Non-AC'}) · ` : ''}
                  {bed ? `Bed ${bed.bedLabel}` : 'Unassigned'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Mobile</dt>
                <dd className="font-mono">{formatIndianPhone(tenant.phone)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Join Date</dt>
                <dd>{formatDateIN(tenant.joinDate)}</dd>
              </div>
              {tenant.leaveDate && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Leave Date</dt>
                  <dd>{formatDateIN(tenant.leaveDate)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Monthly Rent</dt>
                <dd className="font-mono font-semibold tabular-nums">{formatINR(tenant.monthlyRent)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Security Deposit</dt>
                <dd className="font-mono font-semibold tabular-nums">
                  {formatINR(tenant.securityDeposit)} ({tenant.depositStatus})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Pending Dues</dt>
                <dd className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {formatINR(unpaidBalance)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-semibold">KYC &amp; Emergency Contact</h3>
            <dl className="mt-3 space-y-2.5 text-xs">
              <div>
                <dt className="text-slate-500">ID Document</dt>
                <dd className="mt-0.5 font-medium">
                  {tenant.idType} · {tenant.idNumberMasked}
                </dd>
                {tenant.idDocumentUrl && (
                  <a
                    href={tenant.idDocumentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-teal-700 hover:underline dark:text-teal-400"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Open Private KYC Document</span>
                  </a>
                )}
              </div>
              <div>
                <dt className="text-slate-500">Permanent Address</dt>
                <dd className="mt-0.5">{tenant.permanentAddress}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Emergency Contact</dt>
                <dd className="mt-0.5">
                  {tenant.emergencyContactName} · {formatIndianPhone(tenant.emergencyContactPhone)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Invoices, Payments & Complaints */}
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold">Invoice &amp; Payment History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                  <tr>
                    <th className="px-4 py-3">Invoice</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-xs">{formatMonthYear(inv.periodMonth, inv.periodYear)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatINR(inv.amount)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{formatINR(inv.paidAmount)}</td>
                      <td className="px-4 py-3 text-xs font-semibold">{inv.status}</td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/api/billing/invoices/${inv.id}/receipt.pdf`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-sm font-semibold">Recorded Payments</h3>
              <div className="mt-3 space-y-2.5 text-xs">
                {payments.length === 0 ? (
                  <p className="text-slate-500">No payments recorded yet.</p>
                ) : (
                  payments.map((p) => (
                    <div key={p.id} className="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                      <div>
                        <p className="font-medium">
                          {p.method} · {p.reference || 'N/A'}
                        </p>
                        <p className="text-slate-500">
                          {formatDateIN(p.paidAt)} · {p.approvalStatus}
                        </p>
                      </div>
                      <span className="font-mono font-semibold tabular-nums">{formatINR(p.amount)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-sm font-semibold">Complaints Raised</h3>
              <div className="mt-3 space-y-2.5 text-xs">
                {complaints.length === 0 ? (
                  <p className="text-slate-500">No complaints logged.</p>
                ) : (
                  complaints.map((c) => (
                    <div key={c.id} className="border-b border-slate-100 pb-2 dark:border-slate-800">
                      <p className="font-medium">{c.title}</p>
                      <p className="text-slate-500">
                        {c.category} · {c.priority} · {c.status}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Move-Out & Deposit Settlement Modal */}
      {moveOutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleMoveOutSubmit}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Move-Out &amp; Deposit Settlement</h3>
              <button type="button" onClick={() => setMoveOutOpen(false)} aria-label="Close modal">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-1.5 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex justify-between">
                  <span>Held Security Deposit</span>
                  <span className="font-mono font-semibold">{formatINR(settlement.grossDeposit)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Unpaid Rent Invoices</span>
                  <span className="font-mono text-red-600">- {formatINR(unpaidBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Damage / Painting / Notice Deductions</span>
                  <span className="font-mono text-red-600">- {formatINR(deductions)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-bold dark:border-slate-800">
                  <span>{settlement.netRefundable > 0 ? 'Net Refundable to Tenant' : 'Net Payable by Tenant'}</span>
                  <span className="font-mono text-teal-700 dark:text-teal-400">
                    {formatINR(settlement.netRefundable || settlement.netPayableByTenant)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium">Vacating Date</label>
                <input
                  type="date"
                  required
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Other Deductions (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={deductions}
                  onChange={(e) => setDeductions(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Settlement Remarks</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMoveOutOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={processingMoveOut}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {processingMoveOut ? 'Finalizing...' : 'Confirm Move-Out & Vacate Bed'}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
