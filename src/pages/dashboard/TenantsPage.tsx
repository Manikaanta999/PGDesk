import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ColumnDef } from '@tanstack/react-table';
import { Check, Download, Plus, Upload, X } from 'lucide-react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { DataTable } from '../../components/ui/DataTable';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { validateMaskedIdNumber } from '../../lib/billing';
import { formatDateIN, formatIndianPhone, formatINR } from '../../lib/format';
import { buildTenantsCsv, getTenantsCsvFilename } from '../../lib/tenantCsv';

interface TenantRow {
  id: number;
  name: string;
  phone: string;
  email: string | null;
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

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
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
    joinDate: new Date().toISOString().slice(0, 10),
    monthlyRent: Number(searchParams.get('rent') || 12000),
    securityDeposit: Number(searchParams.get('rent') || 12000) * 2,
    generateJoiningInvoice: true,
  });

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

  const handleOnboardSubmit = async () => {
    setSubmitting(true);
    try {
      await apiFetch('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      showToast(`${form.name} onboarded and bed assigned!`);
      setWizardOpen(false);
      setStep(1);
      setSearchParams({});
      await loadTenants();
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
              {formatIndianPhone(row.original.phone)} · {row.original.companyOrCollege || row.original.occupation}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'bedLabel',
        header: 'Property / Bed',
        cell: ({ row }) => (
          <div>
            <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
              Bed {row.original.bedLabel}
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
        cell: ({ row }) => (
          <span
            className={`font-mono text-sm font-semibold tabular-nums ${
              row.original.balanceDue > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {row.original.balanceDue > 0 ? formatINR(row.original.balanceDue) : 'Cleared'}
          </span>
        ),
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
                  : 'text-slate-500'
            }`}
          >
            {row.original.status}
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
      title="Residents & Onboarding"
      breadcrumb="Dashboard / Tenants"
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
              setStep(1);
              setWizardOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Tenant</span>
          </button>
        </div>
      }
    >
      <DataTable
        data={tenants}
        columns={columns}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, mobile, bed, or company..."
        emptyTitle="No matching tenants"
        emptyDescription="Try clearing your search or filters, or onboard a new resident."
        toolbarExtra={
          <>
            <select
              aria-label="Filter by property"
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
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="NOTICE">On Notice</option>
              <option value="LEFT">Moved Out</option>
            </select>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
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
                <p className="text-xs text-slate-500">
                  Step {step} of 4 · {step === 1 ? 'Personal Details' : step === 2 ? 'KYC & ID Upload' : step === 3 ? 'Bed Assignment' : 'Rent & Deposit'}
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
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Mobile Number *</label>
                  <input
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Email (for Tenant Portal)</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="resident@company.com"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Occupation *</label>
                  <input
                    value={form.occupation}
                    onChange={(e) => setForm({ ...form, occupation: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Company / College</label>
                  <input
                    value={form.companyOrCollege}
                    onChange={(e) => setForm({ ...form, companyOrCollege: e.target.value })}
                    placeholder="e.g., Infosys / Christ Univ"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium">ID Document Type</label>
                  <select
                    value={form.idType}
                    onChange={(e) => setForm({ ...form, idType: e.target.value as any })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="Aadhaar">Aadhaar Card</option>
                    <option value="PAN">PAN Card</option>
                    <option value="Passport">Passport</option>
                    <option value="Driving License">Driving License</option>
                    <option value="College ID">College ID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium">Masked ID Number *</label>
                  <input
                    required
                    value={form.idNumberMasked}
                    onChange={(e) => setForm({ ...form, idNumberMasked: e.target.value })}
                    placeholder={form.idType === 'Aadhaar' ? 'XXXX-XXXX-4512' : 'Enter ID reference'}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                {form.idType === 'Aadhaar' && (
                  <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                    UIDAI Compliance: Upload a <strong>Masked Aadhaar</strong> (downloaded from myAadhaar) with the first 8 digits hidden, and enter only <span className="font-mono">XXXX-XXXX-1234</span>. Full 12-digit Aadhaar numbers are rejected.
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium">Upload ID Scan (Private Vault, max 5 MB)</label>
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
                  <label className="block text-xs font-medium">Permanent Address *</label>
                  <input
                    required
                    value={form.permanentAddress}
                    onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })}
                    placeholder="Home address with city & state"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Emergency Contact Name *</label>
                  <input
                    required
                    value={form.emergencyContactName}
                    onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Emergency Contact Phone *</label>
                  <input
                    required
                    value={form.emergencyContactPhone}
                    onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                    placeholder="9820011223"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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

            {step === 4 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium">Move-In Date</label>
                  <input
                    type="date"
                    value={form.joinDate}
                    onChange={(e) => setForm({ ...form, joinDate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Monthly Rent (₹)</label>
                  <input
                    type="number"
                    value={form.monthlyRent}
                    onChange={(e) => setForm({ ...form, monthlyRent: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium">Security Deposit (₹)</label>
                  <input
                    type="number"
                    value={form.securityDeposit}
                    onChange={(e) => setForm({ ...form, securityDeposit: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={form.generateJoiningInvoice}
                      onChange={(e) => setForm({ ...form, generateJoiningInvoice: e.target.checked })}
                    />
                    <span>Auto-generate pro-rata joining invoice</span>
                  </label>
                </div>
              </div>
            )}

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
                    if (step === 2) {
                      const check = validateMaskedIdNumber(form.idType, form.idNumberMasked);
                      if (!check.valid) {
                        showToast(check.message || 'Check ID number format', 'error');
                        return;
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
