import crypto from 'node:crypto';

export const ADMIN_PRIMARY_EMAIL = 'manikantavinnu999@gmail.com';
export const PLATFORM_ORG_SLUG = 'pgdesk-platform';

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomTokenSegment(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += TOKEN_ALPHABET[crypto.randomInt(0, TOKEN_ALPHABET.length)];
  }
  return out;
}

export function generateOwnerRegistrationToken(): string {
  return `PGDESKOWNER-${randomTokenSegment(4)}-${randomTokenSegment(4)}-${randomTokenSegment(4)}`;
}

export function generateStudentLinkCode(): string {
  return `PGDESKSTU-${randomTokenSegment(4)}-${randomTokenSegment(4)}`;
}

export function normalizeTokenCode(raw: string | null | undefined): string {
  return String(raw || '').trim().toUpperCase();
}

export function isValidOwnerTokenFormat(token: string | null | undefined): boolean {
  return /^PGDESKOWNER-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeTokenCode(token));
}

export function isValidStudentLinkCodeFormat(code: string | null | undefined): boolean {
  return /^PGDESKSTU-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeTokenCode(code));
}

export type OwnerTokenEffectiveStatus = 'UNUSED' | 'USED' | 'EXPIRED' | 'REVOKED';

export function resolveOwnerTokenStatus(
  token: { status: string; expiresAt: Date | string },
  now: Date = new Date()
): OwnerTokenEffectiveStatus {
  const status = String(token.status || '').toUpperCase();
  if (status === 'REVOKED') return 'REVOKED';
  if (status === 'USED') return 'USED';
  const exp = token.expiresAt instanceof Date ? token.expiresAt : new Date(token.expiresAt);
  if (status === 'EXPIRED' || Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return 'UNUSED';
}

export function isValidIndianPhoneValue(phone: string | null | undefined): boolean {
  const raw = String(phone || '').trim();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 12 && digits.startsWith('91'));
}

export function isValidEmailValue(email: string | null | undefined): boolean {
  const raw = String(email || '').trim();
  if (!raw) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export function validatePhoneOrEmail(input: {
  phone?: string | null;
  email?: string | null;
}): { valid: boolean; hasPhone: boolean; hasEmail: boolean; message?: string } {
  const phone = String(input.phone || '').trim();
  const email = String(input.email || '').trim();
  const hasPhone = phone.length > 0;
  const hasEmail = email.length > 0;

  if (!hasPhone && !hasEmail) {
    return {
      valid: false,
      hasPhone: false,
      hasEmail: false,
      message: 'Provide at least a mobile number or an email address.',
    };
  }
  if (hasPhone && !isValidIndianPhoneValue(phone)) {
    return {
      valid: false,
      hasPhone: true,
      hasEmail,
      message: 'Enter a valid 10-digit Indian mobile number.',
    };
  }
  if (hasEmail && !isValidEmailValue(email)) {
    return {
      valid: false,
      hasPhone,
      hasEmail: true,
      message: 'Enter a valid email address.',
    };
  }
  return { valid: true, hasPhone, hasEmail };
}

export function canClaimStudentRecord(
  record: {
    userId: number | null;
    accountLinkStatus: string;
    deletedAt?: Date | string | null;
  },
  candidateUserId: number
): { allowed: boolean; reason?: string } {
  if (record.deletedAt) {
    return { allowed: false, reason: 'This student record is no longer active.' };
  }
  if (record.userId !== null && record.userId !== candidateUserId) {
    return { allowed: false, reason: 'This student record is already linked to another account.' };
  }
  if (record.userId === candidateUserId && record.accountLinkStatus === 'LINKED') {
    return { allowed: false, reason: 'This student record is already linked to your account.' };
  }
  return { allowed: true };
}

export function formatAccountLinkStatus(status: string | null | undefined): string {
  switch (String(status || '').toUpperCase()) {
    case 'NO_ACCOUNT':
      return 'No account';
    case 'ACCOUNT_CREATED':
      return 'Account created';
    case 'LINK_PENDING':
      return 'Link pending';
    case 'LINKED':
      return 'Linked account';
    case 'LINK_REJECTED':
      return 'Link rejected';
    default:
      return 'No account';
  }
}

export interface AdminStudentSourceRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  propertyId: number;
  propertyName: string;
  organizationId: number;
  organizationName: string;
  roomNumber?: string | null;
  bedLabel?: string | null;
  status: string;
  userId: number | null;
  accountLinkStatus: string;
  joinDate: string;
  leaveDate: string | null;
  // Sensitive fields that MUST NEVER pass through sanitization
  idDocumentUrl?: unknown;
  idNumberMasked?: unknown;
  passwordHash?: unknown;
  payments?: unknown;
}

export interface SafeAdminStudentRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  propertyId: number;
  propertyName: string;
  organizationId: number;
  organizationName: string;
  roomNumber: string | null;
  bedLabel: string | null;
  stayStatus: string;
  hasAccount: boolean;
  accountLinkStatus: string;
  joinDate: string;
  leaveDate: string | null;
}

export function sanitizeAdminStudentRow(row: AdminStudentSourceRow): SafeAdminStudentRow {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || null,
    email: row.email || null,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    roomNumber: row.roomNumber || null,
    bedLabel: row.bedLabel || null,
    stayStatus: row.status,
    hasAccount: row.userId !== null,
    accountLinkStatus: row.accountLinkStatus,
    joinDate: row.joinDate,
    leaveDate: row.leaveDate || null,
  };
}
