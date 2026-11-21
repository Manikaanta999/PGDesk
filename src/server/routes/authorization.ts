import type { AppUserRole } from '../../lib/authRoles.ts';
import { canAccessProperty } from '../../middleware/propertyAccess.ts';

export interface ScopedPropertyUser {
  id: number;
  organizationId: number;
  role: AppUserRole;
  assignedPropertyIds: number[];
  organizationPropertyIds?: number[];
}

export type PropertyFilterResult =
  | { kind: 'all' }
  | { kind: 'selected'; propertyId: number }
  | { kind: 'invalid' }
  | { kind: 'forbidden' };

export function resolvePropertyFilter(value: unknown, allowedPropertyIds: number[]): PropertyFilterResult {
  if (value === undefined) return { kind: 'all' };
  if (typeof value !== 'string' && typeof value !== 'number') return { kind: 'invalid' };
  if (typeof value === 'string' && !/^\d+$/.test(value)) return { kind: 'invalid' };

  const propertyId = Number(value);
  if (!Number.isSafeInteger(propertyId) || propertyId < 1) return { kind: 'invalid' };
  if (!allowedPropertyIds.includes(propertyId)) return { kind: 'forbidden' };
  return { kind: 'selected', propertyId };
}

export function canAccessNoticeScope(user: ScopedPropertyUser, propertyId: number | null): boolean {
  return propertyId === null ? user.role === 'OWNER' : canAccessProperty(user, propertyId);
}

export function canLinkAdmissionUser(
  existingUser: { organizationId: number; role: string },
  organizationId: number
): boolean {
  return existingUser.organizationId === organizationId && existingUser.role === 'TENANT';
}

export function hasConsistentPaymentRelations(
  organizationId: number,
  payment: { organizationId: number; tenantId: number },
  invoice: { organizationId: number; tenantId: number; propertyId: number },
  tenant: { id: number; organizationId: number; propertyId: number }
): boolean {
  return (
    payment.organizationId === organizationId &&
    invoice.organizationId === organizationId &&
    tenant.organizationId === organizationId &&
    payment.tenantId === invoice.tenantId &&
    payment.tenantId === tenant.id &&
    invoice.tenantId === tenant.id &&
    invoice.propertyId === tenant.propertyId
  );
}

export function floorBelongsToProperty(
  floor: { organizationId: number; propertyId: number } | undefined,
  organizationId: number,
  propertyId: number
): boolean {
  return floor?.organizationId === organizationId && floor.propertyId === propertyId;
}

export function canAccessOrganizationSettings(role: AppUserRole): boolean {
  return role === 'OWNER';
}

export function isPublicEnquiryEligible(
  property: { isPublic: boolean; deletedAt: Date | null },
  organizationSlug: string,
  demoEnabled: boolean,
  platformOrganizationSlug: string
): boolean {
  return (
    property.isPublic &&
    property.deletedAt === null &&
    organizationSlug !== platformOrganizationSlug &&
    (demoEnabled || organizationSlug !== 'sharma-residency')
  );
}

export function canAccessUploadedFile(
  user: ScopedPropertyUser,
  file: { organizationId: number; ownerUserId: number | null; isPrivate: boolean },
  linkedTenants: Array<{ userId: number | null; propertyId: number }>
): boolean {
  if (file.organizationId !== user.organizationId) return false;
  if (user.role === 'OWNER') return true;

  if (user.role === 'TENANT') {
    return file.ownerUserId === user.id || linkedTenants.some((tenant) => tenant.userId === user.id);
  }

  const linkedToAccessibleProperty = linkedTenants.some((tenant) => canAccessProperty(user, tenant.propertyId));
  if (file.isPrivate) return linkedToAccessibleProperty;
  return file.ownerUserId === user.id || linkedToAccessibleProperty;
}

export function parseUploadedFileId(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = /^\/api\/files\/([1-9]\d*)$/.exec(url);
  if (!match) return null;

  const fileId = Number(match[1]);
  return Number.isSafeInteger(fileId) ? fileId : null;
}

export function canAssociateTenantDocument(
  user: { id: number; organizationId: number },
  tenant: { id: number; organizationId: number },
  file: {
    organizationId: number;
    ownerUserId: number | null;
    isPrivate: boolean;
    tenantId: number | null;
  }
): boolean {
  return (
    tenant.organizationId === user.organizationId &&
    file.organizationId === tenant.organizationId &&
    file.ownerUserId === user.id &&
    file.isPrivate &&
    (file.tenantId === null || file.tenantId === tenant.id)
  );
}
