import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ExternalLink, Lock, ShieldCheck, Upload, UserCheck } from 'lucide-react';
import { AuthorizedImage } from '../../components/ui/AuthorizedImage';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, downloadAuthorizedFile } from '../../lib/api';
import { validateMaskedIdNumber } from '../../lib/billing';
import { formatDateIN } from '../../lib/format';
import { getKycStatusLabel } from '../../lib/studentPortalHelpers';
import { IdDocType, TenantOverviewResponse } from './types';

const VALID_ID_TYPES: IdDocType[] = ['Aadhaar', 'PAN', 'Passport', 'Driving License', 'College ID'];

function normalizeIdType(raw: string | undefined | null): IdDocType {
  return VALID_ID_TYPES.includes(raw as IdDocType) ? (raw as IdDocType) : 'Aadhaar';
}

interface TenantProfileTabProps {
  data: TenantOverviewResponse;
  onRefresh: () => Promise<void>;
  onGoToAccountSecurity: () => void;
}

export function TenantProfileTab({ data, onRefresh, onGoToAccountSecurity }: TenantProfileTabProps) {
  const { user, refreshSession } = useAuth();
  const { tHeading } = useLanguage();
  const { showToast } = useToast();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    photoUrl: '',
    dateOfBirth: '',
    occupation: 'Resident',
    companyOrCollege: '',
    permanentAddress: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    idType: 'Aadhaar' as IdDocType,
    idNumberMasked: '',
    idDocumentUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  useEffect(() => {
    if (data.tenant) {
      setForm({
        name: data.tenant.name || '',
        phone: data.tenant.phone || '',
        photoUrl: data.tenant.photoUrl || data.userProfile?.photoUrl || '',
        dateOfBirth: data.tenant.dateOfBirth || '',
        occupation: data.tenant.occupation || 'Resident',
        companyOrCollege: data.tenant.companyOrCollege || '',
        permanentAddress: data.tenant.permanentAddress || '',
        emergencyContactName: data.tenant.emergencyContactName || '',
        emergencyContactRelation: data.tenant.emergencyContactRelation || '',
        emergencyContactPhone: data.tenant.emergencyContactPhone || '',
        idType: normalizeIdType(data.tenant.idType),
        idNumberMasked: data.tenant.idNumberMasked || '',
        idDocumentUrl: data.tenant.idDocumentUrl || '',
      });
    } else if (data.userProfile) {
      setForm((prev) => ({
        ...prev,
        name: data.userProfile?.name || '',
        phone: data.userProfile?.phone || '',
        photoUrl: data.userProfile?.photoUrl || '',
      }));
    }
  }, [data]);

  const kycStatus = data.tenant?.kycVerifiedStatus || 'PENDING';
  const kycLocked = kycStatus === 'VERIFIED';

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
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
          folder: 'avatars',
        }),
      });
      setForm((prev) => ({ ...prev, photoUrl: res.file.url }));
      showToast('Profile photo uploaded. Save your profile to apply.');
    } catch (err: any) {
      showToast(err.message || 'Could not upload profile photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleUploadIdDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || kycLocked) return;
    setUploadingDoc(true);
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
          folder: 'id-docs',
        }),
      });
      setForm((prev) => ({ ...prev, idDocumentUrl: res.file.url }));
      showToast('ID document uploaded securely');
    } catch (err: any) {
      showToast(err.message || 'Could not upload ID document', 'error');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycLocked && form.idNumberMasked.trim().length > 0) {
      const check = validateMaskedIdNumber(form.idType, form.idNumberMasked);
      if (!check.valid) {
        showToast(check.message || 'Invalid ID number format', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      await apiFetch('/api/tenant/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          photoUrl: form.photoUrl || null,
          dateOfBirth: form.dateOfBirth || null,
          occupation: form.occupation,
          companyOrCollege: form.companyOrCollege,
          permanentAddress: form.permanentAddress,
          emergencyContactName: form.emergencyContactName,
          emergencyContactRelation: form.emergencyContactRelation,
          emergencyContactPhone: form.emergencyContactPhone,
          ...(kycLocked
            ? {}
            : {
                idType: form.idType,
                idNumberMasked: form.idNumberMasked,
                idDocumentUrl: form.idDocumentUrl || null,
              }),
        }),
      });
      showToast('Profile & KYC details saved');
      await Promise.all([refreshSession(), onRefresh()]);
    } catch (err: any) {
      showToast(err.message || 'Could not save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const initials = (form.name || 'S')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none disabled:opacity-65 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  return (
    <form onSubmit={handleSaveProfile} className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {tHeading('heading.pageTenantProfile')}
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          Keep your personal info, emergency contact, and KYC documents up to date for your hostel register.
        </p>
      </div>

      {/* Section 1: Personal Information */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold">1. Personal Information</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Your basic resident profile shared with your hostel management.
            </p>
          </div>
          {data.tenant && (
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
              Joined {formatDateIN(data.tenant.joinDate)}
            </span>
          )}
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-teal-50 text-lg font-bold text-teal-800 dark:border-slate-700 dark:bg-teal-950/60 dark:text-teal-300">
            <AuthorizedImage
              src={form.photoUrl}
              alt={form.name}
              className="h-full w-full object-cover"
              fallback={<span>{initials}</span>}
            />
          </div>
          <div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              <Camera className="h-3.5 w-3.5" />
              <span>{uploadingPhoto ? 'Uploading...' : 'Upload Profile Photo'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoUpload} />
            </label>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Clear headshot for hostel register records.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium">Full Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Phone Number</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+91 98765 43210"
              className={inputClass}
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-medium">Registered Email</label>
              <button
                type="button"
                onClick={onGoToAccountSecurity}
                className="text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-400"
              >
                Change via Account Settings
              </button>
            </div>
            <input
              disabled
              value={data.tenant?.email || user?.email || ''}
              className={`${inputClass} cursor-not-allowed`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Date of Birth</label>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium">Occupation</label>
            <input
              value={form.occupation}
              onChange={(e) => setForm({ ...form, occupation: e.target.value })}
              placeholder="Student / Software Engineer"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium">College / Company</label>
            <input
              value={form.companyOrCollege}
              onChange={(e) => setForm({ ...form, companyOrCollege: e.target.value })}
              placeholder="College or workplace name"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium">Permanent Address</label>
            <input
              value={form.permanentAddress}
              onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })}
              placeholder="House no., street, town/city, state, PIN"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Section 2 & 3: Emergency Contact + KYC Documents */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <UserCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-base font-semibold">2. Emergency Contact</h2>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Parent, guardian, or family contact the hostel warden can reach in emergencies.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium">Contact Name</label>
              <input
                value={form.emergencyContactName}
                onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                placeholder="e.g., Suresh Kulkarni"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Relationship</label>
              <input
                value={form.emergencyContactRelation}
                onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value })}
                placeholder="Father / Mother / Guardian"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium">Contact Phone</label>
              <input
                value={form.emergencyContactPhone}
                onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                placeholder="+91 98450 11223"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-semibold">3. KYC Documents</h2>
            </div>
            <span
              className={`text-xs font-semibold ${
                kycStatus === 'VERIFIED'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : kycStatus === 'REJECTED'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {getKycStatusLabel(kycStatus)}
            </span>
          </div>

          {kycLocked ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Your KYC details have been verified by hostel management and are locked for security. Ask your hostel owner if you need to update them.
              </span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              For Aadhaar, enter only a masked number like <span className="font-mono">XXXX-XXXX-4821</span>. Documents stay private between you and your hostel owner.
            </p>
          )}

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-medium">ID Document Type</label>
              <select
                disabled={kycLocked}
                value={form.idType}
                onChange={(e) => setForm({ ...form, idType: normalizeIdType(e.target.value) })}
                className={inputClass}
              >
                <option value="Aadhaar">Aadhaar (Masked)</option>
                <option value="PAN">PAN Card</option>
                <option value="Passport">Passport</option>
                <option value="Driving License">Driving License</option>
                <option value="College ID">College ID</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium">Masked ID Number</label>
              <input
                disabled={kycLocked}
                value={form.idNumberMasked}
                onChange={(e) => setForm({ ...form, idNumberMasked: e.target.value })}
                placeholder={form.idType === 'Aadhaar' ? 'XXXX-XXXX-4821' : 'Enter masked or document ID'}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium">ID Document File (Image / PDF)</label>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                {!kycLocked && (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                    <Upload className="h-3.5 w-3.5" />
                    <span>
                      {uploadingDoc
                        ? 'Uploading...'
                        : form.idDocumentUrl
                          ? 'Replace ID Document'
                          : 'Upload Document'}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={handleUploadIdDoc}
                    />
                  </label>
                )}
                {form.idDocumentUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadAuthorizedFile(
                        form.idDocumentUrl,
                        `${data.tenant?.name || 'resident'}-kyc`
                      ).catch((err) => showToast(err.message || 'Could not open ID document', 'error'))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Open Private Document</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || uploadingDoc || uploadingPhoto}
          className="rounded-lg bg-teal-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {saving ? 'Saving Profile...' : 'Save Profile & KYC Details'}
        </button>
      </div>
    </form>
  );
}
