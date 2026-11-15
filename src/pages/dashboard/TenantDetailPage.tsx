import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  FileText,
  KeyRound,
  Link2,
  LogOut,
  Pencil,
  ShieldCheck,
  Unlink,
  X,
} from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { calculateDepositSettlement, validateMaskedIdNumber } from '../../lib/billing';
import {
  formatAccountLinkStatus,
  formatComplaintCategory,
  formatComplaintStatus,
  formatInvoiceStatus,
  formatPriorityLabel,
  formatTenantStatus,
} from '../../lib/dashboardHelpers';
import { formatDateIN, formatIndianPhone, formatINR, formatMonthYear } from '../../lib/format';
import { getKycStatusLabel, getMoveOutRequestLabel } from '../../lib/studentPortalHelpers';

interface TenantDetailResponse {
  tenant: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    userId?: number | null;
    accountLinkStatus?: string;
    linkedAt?: string | null;
    linkRequestedAt?: string | null;
    linkCodeExpiresAt?: string | null;
    dateOfBirth: string | null;
    idType: string;
    idNumberMasked: string;
    idDocumentUrl: string | null;
    kycVerifiedStatus: string;
    occupation: string;
    companyOrCollege: string;
    permanentAddress: string;
    emergencyContactName: string;
    emergencyContactRelation: string;
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
  linkRequester?: { id: number; name: string; email: string } | null;
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
  moveOutRequests?: Array<{
    id: number;
    requestedLeaveDate: string;
    reason: string;
    notes: string;
    status: string;
    ownerNote: string;
    createdAt: string;
  }>;
  unpaidBalance: number;
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const [data, setData] = useState<TenantDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [moveOutOpen, setMoveOutOpen] = useState(false);
  const [leaveDate, setLeaveDate] = useState(new Date().toISOString().slice(0, 10));
  const [deductions, setDeductions] = useState(0);
  const [note, setNote] = useState('Room inspection completed; keys & biometric tag returned.');
  const [processingMoveOut, setProcessingMoveOut] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [kycUpdating, setKycUpdating] = useState(false);
  const [reviewingReqId, setReviewingReqId] = useState<number | null>(null);
  const [generatedLinkCode, setGeneratedLinkCode] = useState<string | null>(null);
  const [generatingLinkCode, setGeneratingLinkCode] = useState(false);
  const [decidingLink, setDecidingLink] = useState(false);
  const [copiedLinkCode, setCopiedLinkCode] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    dateOfBirth: '',
    occupation: '',
    companyOrCollege: '',
    permanentAddress: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    idType: 'Aadhaar' as 'Aadhaar' | 'PAN' | 'Passport' | 'Driving License' | 'College ID',
    idNumberMasked: '',
  });

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

  useEffect(() => {
    if (!data || searchParams.get('moveOut') !== '1') return;
    if (data.tenant.status !== 'LEFT') {
      setMoveOutOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('moveOut');
    setSearchParams(next, { replace: true });
  }, [data, searchParams, setSearchParams]);

  if (loading || !data) {
    return (
      <DashboardLayout title="Resident Profile" breadcrumb="Dashboard / Tenants">
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
      </DashboardLayout>
    );
  }

  const {
    tenant,
    linkRequester,
    property,
    bed,
    room,
    invoices,
    payments,
    complaints,
    moveOutRequests = [],
    unpaidBalance,
  } = data;
  const settlement = calculateDepositSettlement({
    securityDeposit: tenant.securityDeposit,
    unpaidInvoicesBalance: unpaidBalance,
    damageOrNoticeDeductions: deductions,
  });

  const openEditModal = () => {
    setEditForm({
      name: tenant.name,
      phone: tenant.phone || '',
      dateOfBirth: tenant.dateOfBirth || '',
      occupation: tenant.occupation || '',
      companyOrCollege: tenant.companyOrCollege || '',
      permanentAddress: tenant.permanentAddress || '',
      emergencyContactName: tenant.emergencyContactName || '',
      emergencyContactRelation: tenant.emergencyContactRelation || '',
      emergencyContactPhone: tenant.emergencyContactPhone || '',
      idType: (tenant.idType as any) || 'Aadhaar',
      idNumberMasked: tenant.idNumberMasked || '',
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editForm.idNumberMasked.trim().length > 0) {
      const check = validateMaskedIdNumber(editForm.idType, editForm.idNumberMasked);
      if (!check.valid) {
        showToast(check.message || 'Check ID number format', 'error');
        return;
      }
    }
    setSavingEdit(true);
    try {
      await apiFetch(`/api/tenants/${tenant.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      showToast('Resident profile & KYC updated');
      setEditOpen(false);
      await loadDetail();
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleKycStatusChange = async (status: 'VERIFIED' | 'PENDING' | 'REJECTED') => {
    setKycUpdating(true);
    try {
      await apiFetch(`/api/tenants/${tenant.id}/kyc-status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      showToast(`KYC status updated to ${getKycStatusLabel(status)}`);
      await loadDetail();
    } catch (err: any) {
      showToast(err.message || 'Could not update KYC status', 'error');
    } finally {
      setKycUpdating(false);
    }
  };

  const handleMoveOutReview = async (requestId: number, status: 'UNDER_REVIEW' | 'REJECTED') => {
    setReviewingReqId(requestId);
    try {
      await apiFetch(`/api/tenants/${tenant.id}/move-out-requests/${requestId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          ownerNote:
            status === 'UNDER_REVIEW'
              ? 'Move-out request acknowledged and scheduled for room inspection.'
              : 'Request declined; please discuss notice dates with hostel management.',
        }),
      });
      showToast(`Move-out request marked ${getMoveOutRequestLabel(status)}`);
      await loadDetail();
    } catch (err: any) {
      showToast(err.message || 'Could not update request', 'error');
    } finally {
      setReviewingReqId(null);
    }
  };

  const handleGenerateLinkCode = async () => {
    setGeneratingLinkCode(true);
    try {
      const res = await apiFetch<{ linkCode: string; message?: string }>(`/api/tenants/${tenant.id}/invite-link`, {
        method: 'POST',
      });
      setGeneratedLinkCode(res.linkCode);
      setCopiedLinkCode(false);
      showToast(res.message || 'One-time link code generated');
      await loadDetail();
    } catch (err: any) {
      showToast(err.message || 'Could not generate link code', 'error');
    } finally {
      setGeneratingLinkCode(false);
    }
  };

  const handleLinkDecision = async (decision: 'APPROVE' | 'REJECT' | 'UNLINK') => {
    setDecidingLink(true);
    try {
      await apiFetch(`/api/tenants/${tenant.id}/link-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      showToast(
        decision === 'APPROVE'
          ? 'Student account linked'
          : decision === 'REJECT'
            ? 'Link request rejected'
            : 'Student account unlinked'
      );
      setGeneratedLinkCode(null);
      await loadDetail();
    } catch (err: any) {
      showToast(err.message || 'Could not update link status', 'error');
    } finally {
      setDecidingLink(false);
    }
  };

  const handleCopyLinkCode = async () => {
    if (!generatedLinkCode) return;
    try {
      await navigator.clipboard.writeText(generatedLinkCode);
      setCopiedLinkCode(true);
      showToast('Student link code copied');
    } catch {
      showToast('Copy failed — select and copy code manually', 'error');
    }
  };

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
      breadcrumb={`Home / Students / ${tenant.name}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/dashboard/tenants"
            className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </Link>
          <button
            type="button"
            onClick={openEditModal}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>Edit Student</span>
          </button>
          {tenant.status !== 'LEFT' && (
            <button
              type="button"
              onClick={() => setMoveOutOpen(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-teal-700 dark:hover:bg-teal-800"
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
        <div className="min-w-0 space-y-6 lg:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">{tenant.name}</h2>
                <p className="text-xs text-slate-500">
                  {tenant.occupation} {tenant.companyOrCollege ? `· ${tenant.companyOrCollege}` : ''}
                </p>
              </div>
              <span
                className={`text-xs font-semibold ${
                  tenant.status === 'ACTIVE'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : tenant.status === 'NOTICE'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {formatTenantStatus(tenant.status)}
              </span>
            </div>

            <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800">
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Property</dt>
                <dd className="min-w-0 text-right font-medium">{property?.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Room / Bed</dt>
                <dd className="min-w-0 text-right font-mono font-semibold">
                  {room ? `Room ${room.roomNumber} (${room.isAc ? 'AC' : 'Non-AC'}) · ` : ''}
                  {bed ? `Bed ${bed.bedLabel}` : 'Unassigned'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Mobile</dt>
                <dd className="font-mono">{tenant.phone ? formatIndianPhone(tenant.phone) : 'Not provided'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Email</dt>
                <dd className="min-w-0 truncate text-right font-mono">{tenant.email || 'Not provided'}</dd>
              </div>
              {tenant.dateOfBirth && (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-slate-500">Date of Birth</dt>
                  <dd>{formatDateIN(tenant.dateOfBirth)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Join Date</dt>
                <dd>{formatDateIN(tenant.joinDate)}</dd>
              </div>
              {tenant.leaveDate && (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-slate-500">Leave Date</dt>
                  <dd>{formatDateIN(tenant.leaveDate)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Monthly Rent</dt>
                <dd className="font-mono font-semibold tabular-nums">{formatINR(tenant.monthlyRent)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Security Deposit</dt>
                <dd className="text-right font-mono font-semibold tabular-nums">
                  {formatINR(tenant.securityDeposit)} ({tenant.depositStatus})
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Pending Dues</dt>
                <dd className="font-mono font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {formatINR(unpaidBalance)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold">KYC &amp; Emergency Contact</h3>
              <button
                type="button"
                onClick={openEditModal}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Pencil className="h-3 w-3" />
                <span>Edit Details</span>
              </button>
            </div>
            <dl className="mt-3 space-y-2.5 text-xs">
              <div>
                <dt className="text-slate-500">ID Document</dt>
                <dd className="mt-0.5 font-medium">
                  {tenant.idNumberMasked ? `${tenant.idType} · ${tenant.idNumberMasked}` : 'Not provided yet'}
                </dd>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      tenant.kycVerifiedStatus === 'VERIFIED'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : tenant.kycVerifiedStatus === 'REJECTED'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{getKycStatusLabel(tenant.kycVerifiedStatus)}</span>
                  </span>
                </dd>
                {tenant.idDocumentUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadAuthorizedFile(tenant.idDocumentUrl!, `${tenant.name}-kyc`).catch((e) =>
                        showToast(e.message || 'Could not open KYC document', 'error')
                      )
                    }
                    className="mt-1 inline-flex items-center gap-1 text-teal-700 hover:underline dark:text-teal-400"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Open Private KYC Document</span>
                  </button>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tenant.kycVerifiedStatus !== 'VERIFIED' && (
                    <button
                      type="button"
                      disabled={kycUpdating}
                      onClick={() => handleKycStatusChange('VERIFIED')}
                      className="rounded-lg bg-teal-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                    >
                      Mark Verified
                    </button>
                  )}
                  {tenant.kycVerifiedStatus !== 'REJECTED' && (
                    <button
                      type="button"
                      disabled={kycUpdating}
                      onClick={() => handleKycStatusChange('REJECTED')}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Request Re-upload
                    </button>
                  )}
                  {tenant.kycVerifiedStatus === 'VERIFIED' && (
                    <button
                      type="button"
                      disabled={kycUpdating}
                      onClick={() => handleKycStatusChange('PENDING')}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Unlock KYC
                    </button>
                  )}
                </div>
              </div>
              <div>
                <dt className="text-slate-500">Permanent Address</dt>
                <dd className="mt-0.5">{tenant.permanentAddress || 'Not provided yet'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Emergency Contact</dt>
                <dd className="mt-0.5">
                  {tenant.emergencyContactName || tenant.emergencyContactPhone
                    ? `${tenant.emergencyContactName || 'Contact'}${
                        tenant.emergencyContactRelation ? ` (${tenant.emergencyContactRelation})` : ''
                      }${tenant.emergencyContactPhone ? ` · ${formatIndianPhone(tenant.emergencyContactPhone)}` : ''}`
                    : 'Not provided yet'}
                </dd>
              </div>
            </dl>
          </div>

          {/* Student Portal Account Link Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                <h3 className="font-display text-sm font-semibold">Student Portal Account Link</h3>
              </div>
              <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                {formatAccountLinkStatus(tenant.accountLinkStatus)}
              </span>
            </div>

            <div className="mt-3 space-y-3 text-xs">
              {tenant.userId ? (
                <>
                  <p className="text-slate-600 dark:text-slate-400">
                    Linked to a student portal account{tenant.linkedAt ? ` on ${formatDateIN(tenant.linkedAt)}` : ''}. The
                    student can view their room, rent bills, notices, and complaints (read-only for rent terms).
                  </p>
                  <button
                    type="button"
                    disabled={decidingLink}
                    onClick={() => handleLinkDecision('UNLINK')}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    <span>{decidingLink ? 'Unlinking...' : 'Unlink Student Account'}</span>
                  </button>
                </>
              ) : (
                <>
                  <p className="text-slate-600 dark:text-slate-400">
                    Student login accounts are optional. Share a one-time link code or approve a student&apos;s request
                    to connect their account to this stay.
                  </p>

                  {linkRequester && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        Pending Link Request
                      </p>
                      <p className="mt-1 text-slate-700 dark:text-slate-300">
                        {linkRequester.name} (<span className="font-mono">{linkRequester.email}</span>)
                      </p>
                      {tenant.linkRequestedAt && (
                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Requested {formatDateIN(tenant.linkRequestedAt)}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={decidingLink}
                          onClick={() => handleLinkDecision('APPROVE')}
                          className="rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                        >
                          Approve Link
                        </button>
                        <button
                          type="button"
                          disabled={decidingLink}
                          onClick={() => handleLinkDecision('REJECT')}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {generatedLinkCode && (
                    <div className="rounded-lg border border-teal-200 bg-teal-50/70 p-3 dark:border-teal-900/60 dark:bg-teal-950/30">
                      <p className="font-semibold text-teal-900 dark:text-teal-200">
                        One-Time Student Link Code
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2 rounded border border-teal-200 bg-white px-2.5 py-2 dark:border-teal-800 dark:bg-slate-950">
                        <code className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          {generatedLinkCode}
                        </code>
                        <button
                          type="button"
                          onClick={handleCopyLinkCode}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {copiedLinkCode ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          <span>{copiedLinkCode ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-teal-800 dark:text-teal-300">
                        Valid for 7 days. Student can redeem this in their Student Portal.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={generatingLinkCode}
                    onClick={handleGenerateLinkCode}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <KeyRound className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
                    <span>{generatingLinkCode ? 'Generating...' : 'Generate One-Time Link Code'}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Invoices, Move-Out Requests, Payments & Complaints */}
        <div className="min-w-0 space-y-6 lg:col-span-8">
          {moveOutRequests.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-sm font-semibold">Student Move-Out Requests</h3>
              <div className="mt-3 space-y-3">
                {moveOutRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-950"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          Expected Leave: {formatDateIN(req.requestedLeaveDate)}
                        </span>
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          · {getMoveOutRequestLabel(req.status)}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        Reason: {req.reason}
                        {req.notes ? ` — ${req.notes}` : ''}
                      </p>
                      {req.ownerNote && (
                        <p className="text-slate-500 dark:text-slate-400">Management Note: {req.ownerNote}</p>
                      )}
                    </div>
                    {(req.status === 'SUBMITTED' || req.status === 'UNDER_REVIEW') && tenant.status !== 'LEFT' && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {req.status === 'SUBMITTED' && (
                          <button
                            type="button"
                            disabled={reviewingReqId === req.id}
                            onClick={() => handleMoveOutReview(req.id, 'UNDER_REVIEW')}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            Mark Under Review
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={reviewingReqId === req.id}
                          onClick={() => handleMoveOutReview(req.id, 'REJECTED')}
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-red-600 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLeaveDate(req.requestedLeaveDate);
                            setMoveOutOpen(true);
                          }}
                          className="rounded-lg bg-teal-700 px-3 py-1.5 font-semibold text-white hover:bg-teal-800"
                        >
                          Approve &amp; Settle Move-Out
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold">Invoice &amp; Payment History</h3>
            </div>
            {invoices.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No rent invoices generated yet.
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-800">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="space-y-2 p-4 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-mono font-semibold text-slate-900 dark:text-white">
                            {inv.invoiceNumber}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {formatMonthYear(inv.periodMonth, inv.periodYear)}
                          </p>
                        </div>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          {formatInvoiceStatus(inv.status)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="flex gap-4 tabular-nums">
                          <span>
                            Amount: <strong className="font-mono">{formatINR(inv.amount)}</strong>
                          </span>
                          <span>
                            Paid: <strong className="font-mono">{formatINR(inv.paidAmount)}</strong>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            downloadAuthorizedFile(
                              `/api/billing/invoices/${inv.id}/receipt.pdf`,
                              `${inv.invoiceNumber}.pdf`
                            ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                          }
                          aria-label={`Download PDF receipt for ${inv.invoiceNumber}`}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-slate-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>PDF</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
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
                          <td className="px-4 py-3 text-xs font-semibold">{formatInvoiceStatus(inv.status)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                downloadAuthorizedFile(
                                  `/api/billing/invoices/${inv.id}/receipt.pdf`,
                                  `${inv.invoiceNumber}.pdf`
                                ).catch((e) => showToast(e.message || 'Download failed', 'error'))
                              }
                              aria-label={`Download PDF receipt for ${inv.invoiceNumber}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>PDF</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
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
                          {formatDateIN(p.paidAt)} ·{' '}
                          {p.approvalStatus === 'APPROVED'
                            ? 'Approved'
                            : p.approvalStatus === 'PENDING_APPROVAL'
                              ? 'Pending Check'
                              : 'Rejected'}
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
                        {formatComplaintCategory(c.category)} · {formatPriorityLabel(c.priority)} ·{' '}
                        {formatComplaintStatus(c.status)}
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
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950">
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
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Other Deductions (₹)</label>
                <input
                  type="number"
                  min={0}
                  value={deductions}
                  onChange={(e) => setDeductions(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Settlement Remarks</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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

      {/* Edit Profile & KYC Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleEditSubmit}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between pb-4">
              <h3 className="font-display text-lg font-semibold">Edit Resident Details &amp; KYC</h3>
              <button type="button" onClick={() => setEditOpen(false)} aria-label="Close edit modal">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium">Full Name *</label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Mobile Number</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+91 98765 43210"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Date of Birth</label>
                <input
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Occupation</label>
                <input
                  value={editForm.occupation}
                  onChange={(e) => setEditForm({ ...editForm, occupation: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">Company / College</label>
                <input
                  value={editForm.companyOrCollege}
                  onChange={(e) => setEditForm({ ...editForm, companyOrCollege: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">ID Document Type</label>
                <select
                  value={editForm.idType}
                  onChange={(e) => setEditForm({ ...editForm, idType: e.target.value as any })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                >
                  <option value="Aadhaar">Aadhaar Card</option>
                  <option value="PAN">PAN Card</option>
                  <option value="Passport">Passport</option>
                  <option value="Driving License">Driving License</option>
                  <option value="College ID">College ID</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium">Masked ID Number</label>
                <input
                  value={editForm.idNumberMasked}
                  onChange={(e) => setEditForm({ ...editForm, idNumberMasked: e.target.value })}
                  placeholder={editForm.idType === 'Aadhaar' ? 'XXXX-XXXX-4512' : 'Optional ID reference'}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">Permanent Address</label>
                <input
                  value={editForm.permanentAddress}
                  onChange={(e) => setEditForm({ ...editForm, permanentAddress: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Emergency Contact Name</label>
                <input
                  value={editForm.emergencyContactName}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Relationship</label>
                <input
                  value={editForm.emergencyContactRelation}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContactRelation: e.target.value })}
                  placeholder="Father / Mother / Guardian"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium">Emergency Contact Phone</label>
                <input
                  value={editForm.emergencyContactPhone}
                  onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  );
}
