import type { AppUserRole } from '../lib/authRoles.ts';

interface PropertyAccessUser {
  role: AppUserRole;
  assignedPropertyIds: number[];
  organizationPropertyIds?: number[];
}

export function canAccessProperty(user: PropertyAccessUser, propertyId: number): boolean {
  if (user.role !== 'OWNER' && user.role !== 'MANAGER') return false;
  if (!user.organizationPropertyIds?.includes(propertyId)) return false;
  if (user.role === 'OWNER') return true;
  return user.assignedPropertyIds.includes(propertyId);
}

export function getAllowedPropertyIds(user: PropertyAccessUser, propertyIds: number[]): number[] {
  return propertyIds.filter((propertyId) => canAccessProperty(user, propertyId));
}
