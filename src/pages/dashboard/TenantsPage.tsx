import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ColumnDef } from '@tanstack/react-table';
import { Check, Download, Plus, Upload, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable } from '../../components/ui/DataTable';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { calculateAdmissionInvoice, deriveInvoiceStatus, validateMaskedIdNumber } from '../../lib/billing';
import { formatAccountLinkStatus, formatInvoiceStatus, formatTenantStatus } from '../../lib/dashboardHelpers';
import { formatDateIN, formatIndianPhone, formatINR } from '../../lib/format';
import { buildTenantsCsv, getTenantsCsvFilename } from '../../lib/tenantCsv';

interface TenantRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  userId?: number | null;
  accountLinkStatus?: string;
  propertyId: number;
  propertyName: string;
  bedLabel: string;
  roomNumber: string;
  roomType?: string;
  status: 'ACTIVE' | 'NOTICE' | 'LEFT';
  monthlyRent: number;
  securityDeposit: number;
  joinDate: string;
  balanceDue: number;
  paidTotal?: number;
  invoiceCount?: number;
  rentStatus?: string;
  occupation: string;
  companyOrCollege: string;
}

interface PropertyBrief {
  id: number;
  name: string;
}

interface BedOption {
  id: number;
  bedLabel: string;
  roomNumber: string;
  roomType: string;
  effectiveRent: number;
  status: string;
}

export function TenantsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { organization } = useAuth();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [properties, setProperties] = useState<PropertyBrief[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'ALL');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [dueOnly, setDueOnly] = useState(false);

  // Onboarding Wizard Modal
  const [wizardOpen, setWizardOpen] = useState(searchParams.get('new') === '1');
  const [step, setStep] = useState(1);
  const [vacantBeds, setVacantBeds] = useState<BedOption[]>([]);
  const [uploadingId, setUploadingId] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [admissionIdempotencyKey, setAdmissionIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `adm-${Date.now()}`
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    enquiryId: searchParams.get('enquiryId') ? Number(searchParams.get('enquiryId')) : undefined as number | undefined,
    name: searchParams.get('name') || '',
    phone: searchParams.get('phone') || '',
    email: searchParams.get('email') || '',
    occupation: 'Software Engineer',
    companyOrCollege: '',
    permanentAddress: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    idType: 'Aadhaar' as 'Aadhaar' | 'PAN' | 'Passport' | 'Driving License' | 'College ID',
    idNumberMasked: '',
    idDocumentUrl: '',
    propertyId: Number(searchParams.get('propertyId') || 0),
    bedId: Number(searchParams.get('bedId') || 0),
    joinDate: todayStr,
    monthlyRent: Number(searchParams.get('rent') || 12000),
    securityDeposit: Number(searchParams.get('rent') || 12000) * 2,
    generateJoiningInvoice: true,
    paymentOption: 'NO_PAYMENT' as 'NO_PAYMENT' | 'PAYMENT_RECEIVED',
    initialPaymentAmount: '',
    initialPaymentMethod: 'UPI' as 'UPI' | 'CASH' | 'BANK' | 'ONLINE',
    initialPaymentDate: todayStr,
    initialPaymentReference: '',
  });

  useEffect(() => {
    const isNew = searchParams.get('new') === '1';
    const enquiryParam = searchParams.get('enquiryId') ? Number(searchParams.get('enquiryId')) : undefined;
    const nameParam = searchParams.get('name') || '';
    const phoneParam = searchParams.get('phone') || '';
    const emailParam = searchParams.get('email') || '';
    const propParam = Number(searchParams.get('propertyId') || 0);
    const bedParam = Number(searchParams.get('bedId') || 0);
    const rentParam = Number(searchParams.get('rent') || 0);
    if (isNew) {
      setWizardOpen(true);
      setStep(1);
    }
    if (propParam || bedParam || rentParam || enquiryParam || nameParam || phoneParam || emailParam) {
      setForm((prev) => ({
        ...prev,
        enquiryId: enquiryParam ?? prev.enquiryId,
        name: nameParam || prev.name,
        phone: phoneParam || prev.phone,
        email: emailParam || prev.email,
        propertyId: propParam || prev.propertyId,
        bedId: bedParam || prev.bedId,
        monthlyRent: rentParam || prev.monthlyRent,
        securityDeposit: rentParam ? rentParam * 2 : prev.securityDeposit,
      }));
    }
  }, [searchParams]);

  const loadTenants = useCallback(async () => {
    const params = new URLSearchParams({ pageSize: '100' });
    if (statusFilter !== 'ALL') params.set('status', statusFilter);
    if (propertyFilter) params.set('propertyId', propertyFilter);
    if (dueOnly) params.set('dueOnly', 'true');
    if (search.trim()) params.set('search', search.trim());

    try {
      const [tRes, pRes] = await Promise.all([
        apiFetch<{ tenants: TenantRow[] }>(`/api/tenants?${params.toString()}`),
        apiFetch<{ properties: PropertyBrief[] }>('/api/properties'),
      ]);
      setTenants(tRes.tenants);
      setProperties(pRes.properties);
      if (pRes.properties.length > 0) {
        setForm((prev) => ({ ...prev, propertyId: prev.propertyId || pRes.properties[0].id }));
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load tenants', 'error');
    }
  }, [statusFilter, propertyFilter, dueOnly, search, showToast]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    if (!wizardOpen || !form.propertyId) return;
    apiFetch<{ floors: Array<{ rooms: Array<{ roomNumber: string; roomType: string; beds: any[] }> }> }>(
      `/api/properties/${form.propertyId}/bed-map`
    )
      .then((res) => {
        const opts: BedOption[] = [];
        for (const f of res.floors) {
          for (const r of f.rooms) {
            for (const b of r.beds) {
              if (b.status === 'VACANT' || b.status === 'RESERVED') {
                opts.push({
                  id: b.id,
                  bedLabel: b.bedLabel,
                  roomNumber: r.roomNumber,
                  roomType: r.roomType,
                  effectiveRent: b.effectiveRent,
                  status: b.status,
                });
              }
            }
          }
        }
        setVacantBeds(opts);
        if (opts.length > 0 && !opts.some((o) => o.id === form.bedId)) {
          setForm((prev) => ({
            ...prev,
            bedId: opts[0].id,
            monthlyRent: opts[0].effectiveRent,
            securityDeposit: opts[0].effectiveRent * 2,
          }));
        }
      })
      .catch(() => {});
  }, [wizardOpen, form.propertyId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(true);
    try {
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await apiFetch<{ file: { url: string } }>('/api/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          base64Data,
          folder: 'id-docs',
        }),
      });
      setForm((prev) => ({ ...prev, idDocumentUrl: res.file.url }));
      showToast('ID document securely uploaded');
    } catch (err: any) {
      showToast(err.message || 'Document upload failed', 'error');
    } finally {
      setUploadingId(false);
    }
  };

  const admissionPreview = useMemo(
    () =>
      calculateAdmissionInvoice({
        monthlyRent: Math.max(0, Number(form.monthlyRent) || 0),
        joinDate: form.joinDate || todayStr,
        gstRatePct: organization?.gstRatePct ?? 0,
        dueDaysAfterInvoice: organization?.dueDaysAfterInvoice ?? 5,
        asOfDate: todayStr,
      }),
    [form.monthlyRent, form.joinDate, organization?.gstRatePct, organization?.dueDaysAfterInvoice, todayStr]
  );

  const handleOnboardSubmit = async () => {
    if (submitting) return;
    if (form.monthlyRent < 1000) {
      showToast('Monthly rent must be at least ₹1,000', 'error');
      return;
    }
    const isPaymentReceived = form.paymentOption === 'PAYMENT_RECEIVED';
    const parsedInitialAmount = Number(form.initialPaymentAmount);

    if (isPaymentReceived) {
      if (!Number.isFinite(parsedInitialAmount) || parsedInitialAmount <= 0) {
        showToast('Enter an amount received greater than ₹0.', 'error');
        return;
      }
      if (!Number.isInteger(parsedInitialAmount)) {
        showToast('Enter a whole rupee amount.', 'error');
        return;
      }
      if (parsedInitialAmount > admissionPreview.amount) {
        showToast(
          `Amount received (${formatINR(parsedInitialAmount)}) cannot exceed the billed rent (${formatINR(admissionPreview.amount)}).`,
          'error'
        );
        return;
      }
      if (!form.initialPaymentDate) {
        showToast('Select the date the payment was received.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const onboardedName = form.name;
      const { enquiryId, initialPaymentAmount: _rawAmt, ...rest } = form;
      await apiFetch('/api/tenants', {
        method: 'POST',
        body: JSON.stringify({
          ...rest,
          generateJoiningInvoice: true,
          paymentOption: form.paymentOption,
          ...(isPaymentReceived
            ? {
                initialPaymentAmount: parsedInitialAmount,
                initialPaymentMethod: form.initialPaymentMethod,
                initialPaymentDate: form.initialPaymentDate,
                initialPaymentReference: form.initialPaymentReference.trim(),
              }
            : {
                initialPaymentAmount: 0,
              }),
          idempotencyKey: admissionIdempotencyKey,
          ...(enquiryId ? { enquiryId } : {}),
        }),
      });
      showToast(
        isPaymentReceived
          ? `${onboardedName} admitted and ₹${parsedInitialAmount.toLocaleString('en-IN')} payment recorded!`
          : `${onboardedName} admitted! Rent invoice created as Unpaid.`
      );
      setWizardOpen(false);
      setStep(1);
      setSearch('');
      setStatusFilter('ALL');
      setPropertyFilter('');
      setDueOnly(false);
      setSearchParams({});
      const nextKey =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `adm-${Date.now()}`;
      setAdmissionIdempotencyKey(nextKey);
      const resetToday = new Date().toISOString().slice(0, 10);
      setForm({
        enquiryId: undefined,
        name: '',
        phone: '',
        email: '',
        occupation: 'Software Engineer',
        companyOrCollege: '',
        permanentAddress: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        idType: 'Aadhaar',
        idNumberMasked: '',
        idDocumentUrl: '',
        propertyId: properties[0]?.id || 0,
        bedId: 0,
        joinDate: resetToday,
        monthlyRent: 12000,
        securityDeposit: 24000,
        generateJoiningInvoice: true,
        paymentOption: 'NO_PAYMENT',
        initialPaymentAmount: '',
        initialPaymentMethod: 'UPI',
        initialPaymentDate: resetToday,
        initialPaymentReference: '',
      });
      const fresh = await apiFetch<{ tenants: TenantRow[] }>('/api/tenants?pageSize=100');
      setTenants(fresh.tenants);
    } catch (err: any) {
      showToast(err.message || 'Onboarding failed — check required fields', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadCsv = () => {
    if (tenants.length === 0) {
      showToast('No matching tenants to export', 'info');
      return;
    }
    const csv = buildTenantsCsv(tenants);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getTenantsCsvFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${tenants.length} tenant${tenants.length === 1 ? '' : 's'} to CSV`);
  };

  const columns = useMemo<ColumnDef<TenantRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Resident',
        cell: ({ row }) => (
          <div>
            <Link
              to={`/dashboard/tenants/${row.original.id}`}
              className="font-semibold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-400"
            >
              {row.original.name}
            </Link>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {row.original.phone ? formatIndianPhone(row.original.phone) : row.original.email || 'No contact'} ·{' '}
              {row.original.companyOrCollege || row.original.occupation} ·{' '}
              {formatAccountLinkStatus(row.original.accountLinkStatus)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'bedLabel',
        header: 'Hostel / Room & Bed',
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
              {row.original.roomNumber
                ? `Room ${row.original.roomNumber} · Bed ${row.original.bedLabel}`
                : `Bed ${row.original.bedLabel}`}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{row.original.propertyName}</p>
          </div>
        ),
      },
      {
        accessorKey: 'monthlyRent',
        header: 'Monthly Rent',
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium tabular-nums">
            {formatINR(row.original.monthlyRent)}
          </span>
        ),
      },
      {
        accessorKey: 'balanceDue',
        header: 'Due Balance',
        cell: ({ row }) => {
          const { balanceDue, invoiceCount, rentStatus } = row.original;
          const noInvoiceYet = invoiceCount === 0 || rentStatus === 'NO_INVOICE';
          if (balanceDue > 0) {
            return (
              <div>
                <span className="font-mono text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">
                  {formatINR(balanceDue)}
                </span>
                {rentStatus && (
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {formatInvoiceStatus(rentStatus)}
                  </p>
                )}
              </div>
            );
          }
          if (noInvoiceYet) {
            return <span className="font-mono text-xs font-semibold text-amber-700 dark:text-amber-400">Unpaid</span>;
          }
          return <span className="font-mono text-sm font-semibold text-emerald-700 dark:text-emerald-400">Paid</span>;
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={`text-xs font-semibold ${
              row.original.status === 'ACTIVE'
                ? 'text-emerald-700 dark:text-emerald-400'
                : row.original.status === 'NOTICE'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {formatTenantStatus(row.original.status)}
          </span>
        ),
      },
      {
        accessorKey: 'joinDate',
        header: 'Joined',
        cell: ({ row }) => <span className="text-xs tabular-nums">{formatDateIN(row.original.joinDate)}</span>,
      },
    ],
    []
  );

  return (
    <DashboardLayout
      title={tHeading('heading.pageStudents')}
      breadcrumb="Home / Students"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadCsv}
            disabled={tenants.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download CSV</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAdmissionIdempotencyKey(
                typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `adm-${Date.now()}`
              );
              setStep(1);
              setWizardOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Student</span>
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Manage all students staying in your hostels.
      </p>

      <DataTable
        data={tenants}
        columns={columns}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, mobile, room, or bed..."
        emptyTitle="No matching students"
        emptyDescription="Try clearing your search or filters, or add a new student."
        renderMobileCard={(t) => (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to={`/dashboard/tenants/${t.id}`}
                  className="font-semibold text-slate-900 hover:text-teal-700 dark:text-white dark:hover:text-teal-400"
                >
                  {t.name}
                </Link>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {t.phone ? formatIndianPhone(t.phone) : t.email || 'No contact'} ·{' '}
                  {t.companyOrCollege || t.occupation} · {formatAccountLinkStatus(t.accountLinkStatus)}
                </p>
              </div>
              <span
                className={`shrink-0 text-xs font-semibold ${
                  t.status === 'ACTIVE'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : t.status === 'NOTICE'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {formatTenantStatus(t.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-500 dark:text-slate-400">Hostel &amp; Bed</p>
                <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                  {t.propertyName} ·{' '}
                  <span className="font-mono">
                    {t.roomNumber ? `Room ${t.roomNumber} (${t.bedLabel})` : `Bed ${t.bedLabel}`}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-slate-500 dark:text-slate-400">Monthly Rent</p>
                <p className="mt-0.5 font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {formatINR(t.monthlyRent)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs dark:border-slate-800">
              <div className="tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">Due: </span>
                <span
                  className={`font-mono font-semibold ${
                    t.balanceDue > 0
                      ? 'text-red-600 dark:text-red-400'
                      : t.invoiceCount === 0 || t.rentStatus === 'NO_INVOICE'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {t.balanceDue > 0
                    ? `${formatINR(t.balanceDue)}${t.rentStatus ? ` (${formatInvoiceStatus(t.rentStatus)})` : ''}`
                    : t.invoiceCount === 0 || t.rentStatus === 'NO_INVOICE'
                      ? 'Unpaid'
                      : 'Paid'}
                </span>
                <span className="ml-2 text-slate-400">· Joined {formatDateIN(t.joinDate)}</span>
              </div>
              <Link
                to={`/dashboard/tenants/${t.id}`}
                className="font-semibold text-teal-700 hover:underline whitespace-nowrap dark:text-teal-400"
              >
                View Profile
              </Link>
            </div>
          </div>
        )}
        toolbarExtra={
          <>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-700 tabular-nums dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
              Total Students: <strong className="font-mono">{tenants.length}</strong>
            </span>
            <select
              aria-label="Filter by hostel"
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
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-[40px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="NOTICE">On Notice</option>
              <option value="LEFT">Moved Out</option>
            </select>
            <label className="inline-flex min-h-[40px] items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={dueOnly}
                onChange={(e) => setDueOnly(e.target.checked)}
              />
              <span>With Dues Only</span>
            </label>
          </>
        }
      />

      {/* Multi-step Add Tenant Onboarding Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <h3 className="font-display text-lg font-semibold">Onboard New Tenant</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Step {step} of 4 · {step === 1 ? 'Personal Details' : step === 2 ? 'KYC & Emergency Contact (Optional)' : step === 3 ? 'Bed Assignment' : 'Rent & Deposit'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWizardOpen(false);
                  setSearchParams({});
                }}
                aria-label="Close onboarding wizard"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {step === 1 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium">Full Name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Resident full name"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  Mobile number is required for resident records. Student login account linking is optional.
                </div>
                <div>
                  <label className="block text-xs font-medium">Mobile Number *</label>
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Email Address</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="resident@company.com"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Occupation</label>
                  <input
                    value={form.occupation}
                    onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Company / College</label>
                  <input
                    value={form.companyOrCollege}
                    onChange={(e) => setForm({ ...form, companyOrCollege: e.target.value })}
                    placeholder="e.g., Infosys / Christ Univ"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  All fields in this step are optional. The resident can also add or update ID verification, permanent address, and emergency contacts anytime from their Tenant Portal profile.
                </div>
                <div>
                  <label className="block text-xs font-medium">ID Document Type (Optional)</label>
                  <select
                    value={form.idType}
                    onChange={(e) => setForm({ ...form, idType: e.target.value as any })}
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
                  <label className="block text-xs font-medium">Masked ID Number (Optional)</label>
                  <input
                    value={form.idNumberMasked}
                    onChange={(e) => setForm({ ...form, idNumberMasked: e.target.value })}
                    placeholder={form.idType === 'Aadhaar' ? 'XXXX-XXXX-4512' : 'Optional ID reference'}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                {form.idType === 'Aadhaar' && (
                  <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    UIDAI Compliance: If entering Aadhaar, upload a <strong>Masked Aadhaar</strong> and enter only <span className="font-mono">XXXX-XXXX-1234</span>. Full 12-digit Aadhaar numbers are rejected.
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium">Upload ID Scan (Optional, max 5 MB)</label>
                  <div className="mt-1 flex items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{uploadingId ? 'Uploading...' : 'Choose Image / PDF'}</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                    {form.idDocumentUrl && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400">
                        <Check className="h-3.5 w-3.5" /> Document attached
                      </span>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium">Permanent Address (Optional)</label>
                  <input
                    value={form.permanentAddress}
                    onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })}
                    placeholder="Home address with city & state"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Emergency Contact Name (Optional)</label>
                  <input
                    value={form.emergencyContactName}
                    onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                    placeholder="Parent / Guardian name"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Emergency Contact Phone (Optional)</label>
                  <input
                    value={form.emergencyContactPhone}
                    onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium">Select Property</label>
                  <select
                    value={form.propertyId}
                    onChange={(e) => setForm({ ...form, propertyId: Number(e.target.value), bedId: 0 })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Assign Vacant / Reserved Bed</label>
                  {vacantBeds.length === 0 ? (
                    <p className="mt-2 text-xs text-red-600">
                      No vacant beds available in this property. Add beds or select another property.
                    </p>
                  ) : (
                    <select
                      value={form.bedId}
                      onChange={(e) => {
                        const bId = Number(e.target.value);
                        const chosen = vacantBeds.find((b) => b.id === bId);
                        setForm({
                          ...form,
                          bedId: bId,
                          monthlyRent: chosen?.effectiveRent || form.monthlyRent,
                          securityDeposit: (chosen?.effectiveRent || form.monthlyRent) * 2,
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {vacantBeds.map((b) => (
                        <option key={b.id} value={b.id}>
                          Bed {b.bedLabel} (Room {b.roomNumber} · {b.roomType}) — {formatINR(b.effectiveRent)}/mo [{b.status}]
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (() => {
              const isPaymentReceived = form.paymentOption === 'PAYMENT_RECEIVED';
              const parsedPaid = isPaymentReceived
                ? Math.max(0, Math.round(Number(form.initialPaymentAmount) || 0))
                : 0;
              const effectivePaid = Math.min(admissionPreview.amount, parsedPaid);
              const balanceAfter = Math.max(0, admissionPreview.amount - effectivePaid);
              const resultingStatus = deriveInvoiceStatus({
                amount: admissionPreview.amount,
                paidAmount: effectivePaid,
                dueDate: admissionPreview.dueDate,
                asOfDate: todayStr,
              });

              return (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium">Move-In Date *</label>
                      <input
                        type="date"
                        value={form.joinDate}
                        onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Monthly Rent (₹) *</label>
                      <input
                        type="number"
                        min={1000}
                        value={form.monthlyRent}
                        onChange={(e) => setForm({ ...form, monthlyRent: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium">Security Deposit (₹)</label>
                      <input
                        type="number"
                        min={0}
                        value={form.securityDeposit}
                        onChange={(e) => setForm({ ...form, securityDeposit: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </div>

                  {/* Admission Invoice Calculation Summary */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        Joining Rent Invoice ({admissionPreview.isProRata ? `Pro-rata ${admissionPreview.billableDays}/${admissionPreview.totalDaysInMonth} days` : 'Full month'})
                      </span>
                      <span className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatINR(admissionPreview.amount)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Due date: {formatDateIN(admissionPreview.dueDate)}
                      {admissionPreview.gstRatePct > 0 ? ` · Includes ${admissionPreview.gstRatePct}% GST` : ''}
                    </p>
                  </div>

                  {/* Explicit Payment Confirmation Section */}
                  <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Has the student paid any rent?
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      New admissions default to Unpaid unless you explicitly confirm money received.
                    </p>

                    <div className="mt-3 space-y-2">
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
                        <input
                          type="radio"
                          name="admissionPaymentOption"
                          value="NO_PAYMENT"
                          checked={form.paymentOption === 'NO_PAYMENT'}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              paymentOption: 'NO_PAYMENT',
                              initialPaymentAmount: '',
                              initialPaymentReference: '',
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <strong className="block text-slate-900 dark:text-white">
                            No payment received
                          </strong>
                          <span className="text-slate-500 dark:text-slate-400">
                            Record ₹0 paid. Outstanding balance is {formatINR(admissionPreview.amount)} (Unpaid). No receipt is generated.
                          </span>
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
                        <input
                          type="radio"
                          name="admissionPaymentOption"
                          value="PAYMENT_RECEIVED"
                          checked={form.paymentOption === 'PAYMENT_RECEIVED'}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              paymentOption: 'PAYMENT_RECEIVED',
                              initialPaymentDate: prev.initialPaymentDate || todayStr,
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <strong className="block text-slate-900 dark:text-white">
                            Yes, payment received
                          </strong>
                          <span className="text-slate-500 dark:text-slate-400">
                            Enter the exact amount collected today (full or partial) to save a verified payment transaction.
                          </span>
                        </span>
                      </label>
                    </div>

                    {isPaymentReceived && (
                      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-800">
                        <div className="sm:col-span-2">
                          <div className="flex items-center justify-between">
                            <label htmlFor="admission-amount-received" className="block text-xs font-medium">
                              Amount Received (₹) *
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  initialPaymentAmount: String(admissionPreview.amount),
                                }))
                              }
                              className="text-[11px] font-semibold text-teal-700 hover:underline dark:text-teal-400"
                            >
                              Fill full rent ({formatINR(admissionPreview.amount)})
                            </button>
                          </div>
                          <input
                            id="admission-amount-received"
                            type="number"
                            min={1}
                            max={admissionPreview.amount}
                            required
                            value={form.initialPaymentAmount}
                            onChange={(e) => setForm({ ...form, initialPaymentAmount: e.target.value })}
                            placeholder={`1 – ${admissionPreview.amount}`}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                        <div>
                          <label htmlFor="admission-payment-method" className="block text-xs font-medium">
                            Payment Method *
                          </label>
                          <select
                            id="admission-payment-method"
                            value={form.initialPaymentMethod}
                            onChange={(e) => setForm({ ...form, initialPaymentMethod: e.target.value as any })}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          >
                            <option value="UPI">UPI</option>
                            <option value="CASH">Cash</option>
                            <option value="BANK">Bank / IMPS</option>
                            <option value="ONLINE">Online</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="admission-payment-date" className="block text-xs font-medium">
                            Payment Date *
                          </label>
                          <input
                            id="admission-payment-date"
                            type="date"
                            required
                            value={form.initialPaymentDate}
                            onChange={(e) => setForm({ ...form, initialPaymentDate: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="admission-payment-ref" className="block text-xs font-medium">
                            UTR / Receipt Reference (Optional)
                          </label>
                          <input
                            id="admission-payment-ref"
                            value={form.initialPaymentReference}
                            onChange={(e) => setForm({ ...form, initialPaymentReference: e.target.value })}
                            placeholder="e.g., UTR63119884210 or Cash Receipt #12"
                            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Live Resulting Invoice State */}
                  <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs tabular-nums dark:border-slate-800 dark:bg-slate-950">
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Billed</p>
                      <p className="font-mono font-semibold text-slate-900 dark:text-white">
                        {formatINR(admissionPreview.amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Paid</p>
                      <p className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatINR(effectivePaid)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Balance</p>
                      <p className="font-mono font-semibold text-red-600 dark:text-red-400">
                        {formatINR(balanceAfter)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Status</p>
                      <p
                        className={`font-semibold ${
                          resultingStatus === 'PAID'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : resultingStatus === 'OVERDUE'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {formatInvoiceStatus(resultingStatus)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => (step > 1 ? setStep(step - 1) : setWizardOpen(false))}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium dark:border-slate-700"
              >
                {step > 1 ? 'Previous' : 'Cancel'}
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (step === 1) {
                      if (!form.name.trim()) {
                        showToast('Resident full name is required', 'error');
                        return;
                      }
                      const digits = form.phone.replace(/\D/g, '');
                      const okPhone = digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
                      if (!okPhone) {
                        showToast('Enter a valid 10-digit Indian mobile number', 'error');
                        return;
                      }
                    }
                    if (step === 2) {
                      if (form.idNumberMasked.trim().length > 0) {
                        const check = validateMaskedIdNumber(form.idType, form.idNumberMasked);
                        if (!check.valid) {
                          showToast(check.message || 'Check ID number format', 'error');
                          return;
                        }
                      }
                      if (form.emergencyContactPhone.trim().length > 0) {
                        const digits = form.emergencyContactPhone.replace(/\D/g, '');
                        const okPhone = digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
                        if (!okPhone) {
                          showToast('Enter a valid 10-digit emergency contact phone or leave blank', 'error');
                          return;
                        }
                      }
                    }
                    setStep(step + 1);
                  }}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white dark:bg-teal-700"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOnboardSubmit}
                  disabled={submitting || !form.bedId}
                  className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {submitting ? 'Onboarding...' : 'Confirm & Assign Bed'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
