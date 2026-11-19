import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch } from '../../lib/api';
import { formatDateIN, formatIndianPhone } from '../../lib/format';
import {
  NotificationPrefsShape,
  sanitizeNotificationPrefs,
  validatePasswordChangeInput,
} from '../../lib/studentPortalHelpers';
import { AuthorizedImage } from '../ui/AuthorizedImage';

interface AccountDataResponse {
  profile: {
    id: number;
    name: string;
    email: string;
    phone: string;
    photoUrl: string | null;
    role: 'OWNER' | 'MANAGER' | 'TENANT';
    emailVerified: boolean;
    lastLoginAt: string | null;
    notificationPrefs: NotificationPrefsShape;
    pendingEmail: string | null;
    pendingPhone: string | null;
    hasPassword: boolean;
    hasGoogleAuth?: boolean;
    signedInWithGoogle?: boolean;
    canResetWithoutCurrentPassword?: boolean;
  };
  sessions: Array<{
    id: number;
    sessionId: string;
    userAgent: string;
    ipAddress: string;
    createdAt: string;
    lastSeenAt: string;
    isCurrent: boolean;
  }>;
  securityLogs: Array<{
    id: number;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
  authPolicy?: {
    emailVerificationEnabled: boolean;
    smsOtpEnabled: boolean;
    passwordResetEmailEnabled: boolean;
    forgotPasswordMessage: string;
  };
}

interface AccountSettingsPanelProps {
  initialSection?: 'profile' | 'security' | 'notifications';
}

function formatSecurityActionLabel(action: string): string {
  switch (action) {
    case 'PASSWORD_SET':
      return 'Account password set';
    case 'PASSWORD_CHANGED':
      return 'Password changed';
    case 'PASSWORD_RESET':
      return 'Password reset';
    case 'ADMIN_PASSWORD_RESET':
      return 'Temporary password set by administrator';
    case 'EMAIL_CHANGED':
      return 'Email address updated';
    case 'PHONE_CHANGED':
      return 'Mobile number updated';
    case 'OTHER_SESSIONS_REVOKED':
      return 'Logged out from other devices';
    case 'ACCOUNT_PROFILE_UPDATED':
      return 'Personal profile updated';
    case 'OWNER_REGISTERED':
      return 'Account created';
    case 'TENANT_OTP_VERIFIED':
      return 'Account verified';
    case 'STUDENT_MOVE_OUT_REQUESTED':
      return 'Move-out request submitted';
    default:
      return action.replace(/_/g, ' ').toLowerCase();
  }
}

export function AccountSettingsPanel({ initialSection = 'profile' }: AccountSettingsPanelProps) {
  const { authPolicy: contextPolicy, refreshSession, applySessionToken } = useAuth();
  const { showToast } = useToast();

  const [section, setSection] = useState<'profile' | 'security' | 'notifications'>(initialSection);
  const [data, setData] = useState<AccountDataResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  // Personal Profile state
  const [name, setName] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Two-step Email Change state
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  // Two-step Phone Change state
  const [phoneChangeOpen, setPhoneChangeOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [changingPwd, setChangingPwd] = useState(false);

  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefsShape>(sanitizeNotificationPrefs(null));
  const [savingNotifs, setSavingNotifs] = useState(false);

  // Sessions
  const [revokingOthers, setRevokingOthers] = useState(false);

  const loadAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<AccountDataResponse>('/api/account');
      setData(res);
      setName(res.profile.name || '');
      setPhotoUrl(res.profile.photoUrl || null);
      setNotifPrefs(sanitizeNotificationPrefs(res.profile.notificationPrefs));
    } catch (err: any) {
      showToast(err.message || 'Could not load account details', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

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
      setPhotoUrl(res.file.url);
      showToast('Profile photo uploaded. Save your profile to apply.');
    } catch (err: any) {
      showToast(err.message || 'Could not upload profile photo', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await apiFetch('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), photoUrl }),
      });
      showToast('Personal profile updated');
      await Promise.all([refreshSession(), loadAccount()]);
    } catch (err: any) {
      showToast(err.message || 'Could not update personal profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailBusy(true);
    try {
      const res = await apiFetch<{ message: string; directUpdate?: boolean }>('/api/account/email-change/request', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: emailPassword, newEmail: newEmail.trim() }),
      });
      showToast(res.message, res.directUpdate ? 'success' : 'info');
      setEmailCode('');
      if (res.directUpdate) {
        setEmailChangeOpen(false);
        setNewEmail('');
        setEmailPassword('');
        await Promise.all([refreshSession(), loadAccount()]);
      } else {
        await loadAccount();
      }
    } catch (err: any) {
      showToast(err.message || 'Could not update email address', 'error');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/account/email-change/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: emailCode.trim() }),
      });
      showToast(res.message);
      setEmailChangeOpen(false);
      setNewEmail('');
      setEmailPassword('');
      setEmailCode('');
      await Promise.all([refreshSession(), loadAccount()]);
    } catch (err: any) {
      showToast(err.message || 'Invalid verification code', 'error');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleRequestPhoneChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneBusy(true);
    try {
      const res = await apiFetch<{ message: string; directUpdate?: boolean }>('/api/account/phone-change/request', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: phonePassword, newPhone: newPhone.trim() }),
      });
      showToast(res.message, res.directUpdate ? 'success' : 'info');
      setPhoneCode('');
      if (res.directUpdate) {
        setPhoneChangeOpen(false);
        setNewPhone('');
        setPhonePassword('');
        await Promise.all([refreshSession(), loadAccount()]);
      } else {
        await loadAccount();
      }
    } catch (err: any) {
      showToast(err.message || 'Could not update mobile number', 'error');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleConfirmPhoneChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/account/phone-change/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: phoneCode.trim() }),
      });
      showToast(res.message);
      setPhoneChangeOpen(false);
      setNewPhone('');
      setPhonePassword('');
      setPhoneCode('');
      await Promise.all([refreshSession(), loadAccount()]);
    } catch (err: any) {
      showToast(err.message || 'Invalid verification code', 'error');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const directReset = Boolean(data?.profile.canResetWithoutCurrentPassword);
    const check = validatePasswordChangeInput({
      currentPassword,
      newPassword,
      confirmNewPassword,
      requireCurrentPassword: !directReset,
    });
    if (!check.valid) {
      showToast(check.message || 'Check password fields', 'error');
      return;
    }

    setChangingPwd(true);
    try {
      const res = await apiFetch<{ message: string; token?: string; cookieOnly?: boolean }>(
        '/api/account/change-password',
        {
          method: 'POST',
          body: JSON.stringify({
            ...(directReset ? {} : { currentPassword }),
            newPassword,
            confirmNewPassword,
          }),
        }
      );
      applySessionToken(res.token, res.cookieOnly);
      showToast(res.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      await loadAccount();
    } catch (err: any) {
      showToast(err.message || 'Could not update password', 'error');
    } finally {
      setChangingPwd(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setRevokingOthers(true);
    try {
      const res = await apiFetch<{ message: string; token?: string; cookieOnly?: boolean }>(
        '/api/account/sessions/revoke-others',
        { method: 'POST' }
      );
      applySessionToken(res.token, res.cookieOnly);
      showToast(res.message);
      await loadAccount();
    } catch (err: any) {
      showToast(err.message || 'Could not revoke sessions', 'error');
    } finally {
      setRevokingOthers(false);
    }
  };

  const handleSaveNotifs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNotifs(true);
    try {
      const res = await apiFetch<{ notificationPrefs: NotificationPrefsShape }>('/api/account/notifications', {
        method: 'PATCH',
        body: JSON.stringify({
          hostelNotices: notifPrefs.hostelNotices,
          rentReminders: notifPrefs.rentReminders,
          complaintUpdates: notifPrefs.complaintUpdates,
        }),
      });
      setNotifPrefs(sanitizeNotificationPrefs(res.notificationPrefs));
      showToast('Notification preferences saved');
    } catch (err: any) {
      showToast(err.message || 'Could not save preferences', 'error');
    } finally {
      setSavingNotifs(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

  if (loading || !data) {
    return (
      <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
    );
  }

  const { profile, sessions, securityLogs } = data;
  const emailVerificationEnabled = data.authPolicy?.emailVerificationEnabled ?? contextPolicy.emailVerificationEnabled;
  const smsOtpEnabled = data.authPolicy?.smsOtpEnabled ?? contextPolicy.smsOtpEnabled;
  const initials = (profile.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  return (
    <div className="space-y-6">
      {/* Sub-section Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSection('profile')}
          className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            section === 'profile'
              ? 'bg-teal-700 text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <User className="h-3.5 w-3.5" />
          <span>Personal Profile &amp; Contact</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('security')}
          className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            section === 'security'
              ? 'bg-teal-700 text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Password &amp; Security</span>
        </button>
        <button
          type="button"
          onClick={() => setSection('notifications')}
          className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            section === 'notifications'
              ? 'bg-teal-700 text-white'
              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          <Bell className="h-3.5 w-3.5" />
          <span>Notifications</span>
        </button>
      </div>

      {section === 'profile' && (
        <div className="space-y-6">
          {/* Personal Profile Card */}
          <form
            onSubmit={handleSaveProfile}
            className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center dark:border-slate-800">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  Personal Account Profile
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Your personal login name and photo. Changes here never alter hostel business or UPI settings.
                </p>
              </div>
              <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400">
                Role:{' '}
                {profile.role === 'OWNER'
                  ? 'Hostel Owner'
                  : profile.role === 'MANAGER'
                    ? 'Manager'
                    : 'Resident'}
              </span>
            </div>

            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-teal-50 text-lg font-bold text-teal-800 dark:border-slate-700 dark:bg-teal-950/60 dark:text-teal-300">
                  <AuthorizedImage
                    src={photoUrl}
                    alt={profile.name}
                    className="h-full w-full object-cover"
                    fallback={<span>{initials}</span>}
                  />
                </div>
                <div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Camera className="h-3.5 w-3.5" />
                    <span>{uploadingPhoto ? 'Uploading...' : 'Change Photo'}</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoUpload} />
                  </label>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    JPG, PNG, or WebP under 5 MB.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="acc-full-name" className="block text-xs font-medium">
                  Full Name *
                </label>
                <input
                  id="acc-full-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium">Last Sign-In</label>
                <input
                  disabled
                  value={profile.lastLoginAt ? formatDateIN(profile.lastLoginAt) : 'Current active session'}
                  className={`${inputClass} cursor-not-allowed opacity-70`}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {savingProfile ? 'Saving...' : 'Save Personal Profile'}
              </button>
            </div>
          </form>

          {/* Verified Email & Mobile Contact Verification */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Email Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                    <h3 className="font-display text-sm font-semibold">Login Email Address</h3>
                  </div>
                  <p className="mt-1.5 font-mono text-sm font-medium text-slate-900 dark:text-white">
                    {profile.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {emailVerificationEnabled
                      ? profile.emailVerified
                        ? 'Verified for sign-in and password reset'
                        : 'Verification pending'
                      : 'Email verification is disabled during testing'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEmailChangeOpen((v) => !v)}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {emailChangeOpen ? 'Cancel' : 'Change Email'}
                </button>
              </div>

              {(emailChangeOpen || (emailVerificationEnabled && profile.pendingEmail)) && (
                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <form onSubmit={handleRequestEmailChange} className="space-y-3">
                    <div>
                      <label htmlFor="acc-new-email" className="block text-xs font-medium">
                        New Email Address
                      </label>
                      <input
                        id="acc-new-email"
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="newemail@example.com"
                        className={inputClass}
                      />
                    </div>
                    {profile.hasPassword && (
                      <div>
                        <label htmlFor="acc-email-cur-pwd" className="block text-xs font-medium">
                          Current Password
                        </label>
                        <input
                          id="acc-email-cur-pwd"
                          type="password"
                          required
                          value={emailPassword}
                          onChange={(e) => setEmailPassword(e.target.value)}
                          placeholder="Confirm your current password"
                          className={inputClass}
                        />
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={emailBusy}
                      className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-800"
                    >
                      {emailBusy
                        ? 'Updating...'
                        : emailVerificationEnabled
                          ? 'Send Verification Code'
                          : 'Update Email'}
                    </button>
                  </form>

                  {emailVerificationEnabled && profile.pendingEmail && (
                    <form
                      onSubmit={handleConfirmEmailChange}
                      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Enter the 6-digit verification code for{' '}
                        <strong className="font-mono text-slate-900 dark:text-white">{profile.pendingEmail}</strong>:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          required
                          maxLength={6}
                          value={emailCode}
                          onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6-digit code"
                          className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tracking-widest focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="submit"
                          disabled={emailBusy || emailCode.length !== 6}
                          className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                        >
                          Confirm New Email
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Phone Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-teal-700 dark:text-teal-400" />
                    <h3 className="font-display text-sm font-semibold">Mobile Number</h3>
                  </div>
                  <p className="mt-1.5 font-mono text-sm font-medium text-slate-900 dark:text-white">
                    {profile.phone ? formatIndianPhone(profile.phone) : 'Not added yet'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Used for sign-in and hostel contact updates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPhoneChangeOpen((v) => !v)}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {phoneChangeOpen ? 'Cancel' : 'Change Mobile'}
                </button>
              </div>

              {(phoneChangeOpen || (smsOtpEnabled && profile.pendingPhone)) && (
                <div className="mt-4 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <form onSubmit={handleRequestPhoneChange} className="space-y-3">
                    <div>
                      <label htmlFor="acc-new-phone" className="block text-xs font-medium">
                        New 10-Digit Mobile Number
                      </label>
                      <input
                        id="acc-new-phone"
                        type="tel"
                        required
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className={inputClass}
                      />
                    </div>
                    {profile.hasPassword && (
                      <div>
                        <label htmlFor="acc-phone-cur-pwd" className="block text-xs font-medium">
                          Current Password
                        </label>
                        <input
                          id="acc-phone-cur-pwd"
                          type="password"
                          required
                          value={phonePassword}
                          onChange={(e) => setPhonePassword(e.target.value)}
                          placeholder="Confirm your current password"
                          className={inputClass}
                        />
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={phoneBusy}
                      className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-teal-700 dark:hover:bg-teal-800"
                    >
                      {phoneBusy
                        ? 'Updating...'
                        : smsOtpEnabled
                          ? 'Send Verification Code'
                          : 'Update Mobile'}
                    </button>
                  </form>

                  {smsOtpEnabled && profile.pendingPhone && (
                    <form
                      onSubmit={handleConfirmPhoneChange}
                      className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950"
                    >
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Enter the 6-digit verification code for{' '}
                        <strong className="font-mono text-slate-900 dark:text-white">+91 {profile.pendingPhone}</strong>:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <input
                          required
                          maxLength={6}
                          value={phoneCode}
                          onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6-digit code"
                          className="w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tracking-widest focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                        <button
                          type="submit"
                          disabled={phoneBusy || phoneCode.length !== 6}
                          className="rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                        >
                          Confirm Mobile Number
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {section === 'security' && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Set / Reset / Change Password Card */}
          <form
            onSubmit={handleChangePassword}
            className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-2 border-b border-slate-200 pb-4 dark:border-slate-800">
              <KeyRound className="h-4 w-4 text-teal-700 dark:text-teal-400" />
              <div>
                <h2 className="font-display text-base font-semibold">
                  {!profile.hasPassword
                    ? 'Set Account Password'
                    : profile.signedInWithGoogle
                      ? 'Reset Account Password'
                      : 'Change Password'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {!profile.hasPassword
                    ? 'Create a password so you can also sign in with email or mobile. Other devices will be logged out.'
                    : profile.signedInWithGoogle
                      ? 'Verified via your active Google Sign-In session. Set a new password directly without an OTP.'
                      : 'Other signed-in devices will be logged out automatically.'}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3.5">
              {!profile.canResetWithoutCurrentPassword && (
                <div>
                  <label htmlFor="sec-cur-pwd" className="block text-xs font-medium">
                    Current Password *
                  </label>
                  <div className="relative">
                    <input
                      id="sec-cur-pwd"
                      type={showCurrentPwd ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPwd((v) => !v)}
                      aria-label={showCurrentPwd ? 'Hide current password' : 'Show current password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="sec-new-pwd" className="block text-xs font-medium">
                  New Password (min 6 characters) *
                </label>
                <div className="relative">
                  <input
                    id="sec-new-pwd"
                    type={showNewPwd ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd((v) => !v)}
                    aria-label={showNewPwd ? 'Hide new password' : 'Show new password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="sec-cfm-pwd" className="block text-xs font-medium">
                  Confirm New Password *
                </label>
                <div className="relative">
                  <input
                    id="sec-cfm-pwd"
                    type={showConfirmPwd ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={`${inputClass} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd((v) => !v)}
                    aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {confirmNewPassword.length > 0 && newPassword !== confirmNewPassword && (
                  <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={changingPwd}
                className="mt-2 w-full rounded-lg bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {changingPwd
                  ? 'Updating Password...'
                  : !profile.hasPassword
                    ? 'Set Password'
                    : profile.signedInWithGoogle
                      ? 'Reset Password'
                      : 'Update Password'}
              </button>
            </div>
          </form>

          {/* Active Sessions & Recent Security Events */}
          <div className="space-y-6 lg:col-span-7">
            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                <div>
                  <h2 className="font-display text-base font-semibold">Active Devices &amp; Sessions</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Sign out all other browsers or phones if you logged in on a shared device.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRevokeOtherSessions}
                  disabled={revokingOthers}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>{revokingOthers ? 'Signing out...' : 'Log out from other devices'}</span>
                </button>
              </div>

              <div className="mt-3 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {sessions.length === 0 ? (
                  <p className="py-3 text-slate-500">Current browser session active.</p>
                ) : (
                  sessions.map((s) => (
                    <div key={s.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <p className="truncate font-medium text-slate-900 dark:text-white">
                            {s.userAgent || 'Web Browser'}
                          </p>
                        </div>
                        <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                          Last active: {formatDateIN(s.lastSeenAt)}
                          {s.ipAddress ? ` · ${s.ipAddress}` : ''}
                        </p>
                      </div>
                      {s.isCurrent ? (
                        <span className="shrink-0 font-semibold text-emerald-700 dark:text-emerald-400">
                          Current device
                        </span>
                      ) : (
                        <span className="shrink-0 text-slate-500 dark:text-slate-400">Active</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="border-b border-slate-200 pb-3 font-display text-base font-semibold dark:border-slate-800">
                Recent Account Security Activity
              </h2>
              <div className="mt-2 divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {securityLogs.length === 0 ? (
                  <p className="py-3 text-slate-500">No recent security changes recorded.</p>
                ) : (
                  securityLogs.map((log) => (
                    <div key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {formatSecurityActionLabel(log.action)}
                      </span>
                      <span className="shrink-0 text-slate-400 tabular-nums">{formatDateIN(log.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {section === 'notifications' && (
        <form
          onSubmit={handleSaveNotifs}
          className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 pb-4 dark:border-slate-800">
            <h2 className="font-display text-base font-semibold">Notification Preferences</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Choose which hostel updates you want to receive. Account security alerts stay enabled for safety.
            </p>
          </div>

          <div className="mt-4 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            <label className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Hostel Notices &amp; Announcements</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Important updates from hostel management.
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifPrefs.hostelNotices}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, hostelNotices: e.target.checked })}
                className="h-4 w-4 accent-teal-700"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Rent &amp; Payment Reminders</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Monthly invoice alerts and payment confirmation messages.
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifPrefs.rentReminders}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, rentReminders: e.target.checked })}
                className="h-4 w-4 accent-teal-700"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-4 py-3.5">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Complaint Status Updates</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Replies and resolution updates on maintenance tickets.
                </p>
              </div>
              <input
                type="checkbox"
                checked={notifPrefs.complaintUpdates}
                onChange={(e) => setNotifPrefs({ ...notifPrefs, complaintUpdates: e.target.checked })}
                className="h-4 w-4 accent-teal-700"
              />
            </label>

            <div className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Essential Security Alerts</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Password resets, email changes, and sign-in alerts (always on).
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>Always On</span>
              </span>
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="submit"
              disabled={savingNotifs}
              className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {savingNotifs ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
