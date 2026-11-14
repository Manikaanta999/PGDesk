import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, LogOut, Moon, Plus, QrCode, Sun, Upload, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { formatDateIN, formatINR } from '../../lib/format';

interface TenantOverviewResponse {
  unassigned?: boolean;
  tenant: {
    id: number;
    name: string;
    phone: string;
    email: string | null;
    joinDate: string;
    leaveDate: string | null;
    status: string;
    monthlyRent: number;
    securityDeposit: number;
  };
  organization: {
    name: string;
    upiId: string;
    upiPayeeName: string;
    phone: string;
    noticePeriodDays: number;
  } | null;
  property: { id: number; name: string; address: string; locality: string; city: string } | null;
  bed: { id: number; bedLabel: string } | null;
  room: { id: number; roomNumber: string; roomType: string; isAc: boolean } | null;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    periodLabel: string;
    amount: number;
    paidAmount: number;
    balanceDue: number;
    dueDate: string;
    status: string;
  }>;
  payments: Array<{
    id: number;
    invoiceId: number;
    amount: number;
    method: string;
    reference: string;
    approvalStatus: string;
    paidAt: string;
  }>;
  complaints: Array<{
    id: number;
    title: string;
    category: string;
    priority: string;
    status: string;
    description: string;
    createdAt: string;
    comments: Array<{ id: number; authorName: string; authorRole: string; body: string }>;
  }>;
  notices: Array<{
    id: number;
    title: string;
    body: string;
    pinned: boolean;
    createdAt: string;
  }>;
}

export function TenantPortalPage() {
  const { user, darkMode, toggleDarkMode, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<TenantOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // UPI Modal
  const [upiInv, setUpiInv] = useState<TenantOverviewResponse['invoices'][number] | null>(null);
  const [utrRef, setUtrRef] = useState('');
  const [upiScreenshotUrl, setUpiScreenshotUrl] = useState('');
  const [submittingUpi, setSubmittingUpi] = useState(false);

  // Complaint Modal
  const [showComplaint, setShowComplaint] = useState(false);
  const [compForm, setCompForm] = useState({
    title: '',
    category: 'PLUMBING',
    priority: 'MEDIUM',
    description: '',
  });

  // Move-out notice modal
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [plannedLeaveDate, setPlannedLeaveDate] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<TenantOverviewResponse>('/api/tenant/overview');
      setData(res);
    } catch (err: any) {
      showToast(err.message || 'Could not load tenant portal', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleUpiScreenshot = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve) => {
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
  };

  const handleSubmitUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiInv) return;
    setSubmittingUpi(true);
    try {
      await apiFetch('/api/tenant/payments', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: upiInv.id,
          amount: upiInv.balanceDue,
          reference: utrRef,
          screenshotUrl: upiScreenshotUrl || null,
        }),
      });
      showToast('UTR reference submitted for owner approval');
      setUpiInv(null);
      setUtrRef('');
      setUpiScreenshotUrl('');
      await loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Submission failed', 'error');
    } finally {
      setSubmittingUpi(false);
    }
  };

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/tenant/complaints', {
        method: 'POST',
        body: JSON.stringify(compForm),
      });
      showToast('Complaint submitted to property manager');
      setShowComplaint(false);
      setCompForm({ title: '', category: 'PLUMBING', priority: 'MEDIUM', description: '' });
      await loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Could not raise complaint', 'error');
    }
  };

  const handleRequestMoveOut = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/tenant/move-out-request', {
        method: 'POST',
        body: JSON.stringify({ leaveDate: plannedLeaveDate }),
      });
      showToast('Move-out notice submitted to management');
      setShowNoticeModal(false);
      await loadOverview();
    } catch (err: any) {
      showToast(err.message || 'Request failed', 'error');
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link to="/" className="flex items-baseline gap-2 whitespace-nowrap">
            <span className="font-display text-lg font-bold tracking-tight">PGDesk</span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Resident Portal</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Toggle theme"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 dark:border-slate-700 dark:text-slate-300"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading || !data ? (
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        ) : data.unassigned || !data.tenant ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
              Resident Portal · Account Active
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold">Welcome, {user?.name || 'Resident'}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
              Your resident login (<span className="font-mono">{user?.email}</span>) is active, and no bed has
              been linked to this email or mobile number yet. Share your registered email with your PG
              warden to link your room and monthly invoices.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/"
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                Browse Public PG Listings
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Log Out
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Resident Summary Banner */}
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 md:flex-row md:items-center dark:border-slate-800 dark:bg-slate-900">
              <div>
                <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                  {data.property?.name} · {data.tenant.status}
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold">{data.tenant.name}</h1>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Room {data.room?.roomNumber} ({data.room?.roomType} · {data.room?.isAc ? 'AC' : 'Non-AC'}) · Bed{' '}
                  {data.bed?.bedLabel} · Monthly Rent {formatINR(data.tenant.monthlyRent)} · Deposit Held{' '}
                  {formatINR(data.tenant.securityDeposit)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowComplaint(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Raise Complaint</span>
                </button>
                {data.tenant.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => setShowNoticeModal(true)}
                    className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Request Move-Out
                  </button>
                )}
              </div>
            </div>

            {/* Invoices & UPI Payment */}
            <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                <h2 className="font-display text-base font-semibold">My Rent Invoices &amp; Receipts</h2>
              </div>
              {/* Mobile Card List (avoids horizontal clipping on 390px screens) */}
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
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Billed: </span>
                        <span className="font-mono font-medium tabular-nums">{formatINR(inv.amount)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400">Balance: </span>
                        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatINR(inv.balanceDue)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      {inv.balanceDue > 0 && (
                        <button
                          type="button"
                          onClick={() => setUpiInv(inv)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          <span>Pay via UPI</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          downloadAuthorizedFile(
                            `/api/tenant/invoices/${inv.id}/receipt.pdf`,
                            `${inv.invoiceNumber}.pdf`
                          ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                        }
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Receipt</span>
                      </button>
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
                      <th className="px-4 py-3">Billing Month</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{inv.invoiceNumber}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">{inv.periodLabel}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateIN(inv.dueDate)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono tabular-nums">{formatINR(inv.amount)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold tabular-nums">
                          {formatINR(inv.balanceDue)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold">{inv.status}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            {inv.balanceDue > 0 && (
                              <button
                                type="button"
                                onClick={() => setUpiInv(inv)}
                                className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                              >
                                <QrCode className="h-3.5 w-3.5" />
                                <span>Pay via UPI</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                downloadAuthorizedFile(
                                  `/api/tenant/invoices/${inv.id}/receipt.pdf`,
                                  `${inv.invoiceNumber}.pdf`
                                ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium dark:border-slate-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Receipt</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Notices + Complaints Grid */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-display text-base font-semibold pb-3">Property Notices</h2>
                <div className="space-y-3">
                  {data.notices.map((n) => (
                    <div
                      key={n.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <p className="text-[11px] font-medium text-teal-700 dark:text-teal-400">
                        {formatDateIN(n.createdAt)} {n.pinned ? '· Pinned' : ''}
                      </p>
                      <p className="mt-1 text-sm font-semibold">{n.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{n.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-display text-base font-semibold pb-3">My Complaints &amp; Updates</h2>
                <div className="space-y-3">
                  {data.complaints.length === 0 ? (
                    <p className="text-sm text-slate-500">No complaints raised yet.</p>
                  ) : (
                    data.complaints.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950"
                      >
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className="text-teal-700 dark:text-teal-400">
                            {c.category} · {c.priority}
                          </span>
                          <span>{c.status}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold">{c.title}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{c.description}</p>
                        {c.comments.length > 0 && (
                          <div className="mt-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-800">
                            {c.comments.map((cm) => (
                              <p key={cm.id} className="text-slate-600 dark:text-slate-300">
                                <span className="font-semibold">{cm.authorName}:</span> {cm.body}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* UPI Instructions & Submit UTR Modal */}
      {upiInv && data?.organization && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs space-y-1.5 dark:border-slate-800 dark:bg-slate-950">
              <p>
                Pay <span className="font-mono font-bold text-slate-900 dark:text-white">{formatINR(upiInv.balanceDue)}</span> to:
              </p>
              <p className="font-mono text-sm font-bold text-teal-700 dark:text-teal-400">
                {data.organization.upiId}
              </p>
              <p className="text-slate-500">Payee: {data.organization.upiPayeeName} (GPay / PhonePe / Paytm)</p>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium">12-Digit UPI / UTR Reference *</label>
                <input
                  required
                  minLength={6}
                  value={utrRef}
                  onChange={(e) => setUtrRef(e.target.value)}
                  placeholder="e.g., 631198442019"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Payment Screenshot (Optional)</label>
                <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium dark:border-slate-700">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{upiScreenshotUrl ? 'Screenshot attached' : 'Upload screenshot'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleUpiScreenshot} />
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setUpiInv(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" disabled={submittingUpi} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                {submittingUpi ? 'Submitting...' : 'I Have Paid — Submit UTR'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Raise Complaint Modal */}
      {showComplaint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleCreateComplaint}
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Raise Maintenance Complaint</h3>
              <button type="button" onClick={() => setShowComplaint(false)} aria-label="Close complaint modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium">Short Title</label>
                <input
                  required
                  value={compForm.title}
                  onChange={(e) => setCompForm({ ...compForm, title: e.target.value })}
                  placeholder="e.g., Washroom tap leaking"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium">Category</label>
                  <select
                    value={compForm.category}
                    onChange={(e) => setCompForm({ ...compForm, category: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="PLUMBING">Plumbing</option>
                    <option value="ELECTRICAL">Electrical</option>
                    <option value="WIFI">Wi-Fi</option>
                    <option value="HOUSEKEEPING">Housekeeping</option>
                    <option value="FOOD">Food</option>
                    <option value="SECURITY">Security</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Priority</label>
                  <select
                    value={compForm.priority}
                    onChange={(e) => setCompForm({ ...compForm, priority: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium">Details</label>
                <textarea
                  required
                  rows={3}
                  value={compForm.description}
                  onChange={(e) => setCompForm({ ...compForm, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowComplaint(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                Submit Ticket
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Move-Out Notice Request Modal */}
      {showNoticeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleRequestMoveOut}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="font-display text-lg font-semibold">Request Move-Out Notice</h3>
            <p className="mt-1 text-xs text-slate-500">
              Standard notice period is {data?.organization?.noticePeriodDays ?? 30} days prior to vacating.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium">Planned Vacating Date</label>
              <input
                type="date"
                required
                value={plannedLeaveDate}
                onChange={(e) => setPlannedLeaveDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNoticeModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700">
                Cancel
              </button>
              <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white">
                Submit Notice
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
