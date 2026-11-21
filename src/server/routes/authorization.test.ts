import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAccessNoticeScope,
  canAccessOrganizationSettings,
  canAssociateTenantDocument,
  canAccessUploadedFile,
  canLinkAdmissionUser,
  floorBelongsToProperty,
  hasConsistentPaymentRelations,
  isPublicEnquiryEligible,
  parseUploadedFileId,
  resolvePropertyFilter,
  type ScopedPropertyUser,
} from './authorization.ts';

function createUser(
  role: ScopedPropertyUser['role'],
  organizationId = 1,
  organizationPropertyIds = [10],
  assignedPropertyIds: number[] = []
): ScopedPropertyUser {
  return { id: 7, organizationId, role, organizationPropertyIds, assignedPropertyIds };
}

test('uploaded files use uploader or trusted tenant ownership, and managers require assigned properties', () => {
  const manager = createUser('MANAGER', 1, [10, 11], [10]);
  const privateFile = { organizationId: 1, ownerUserId: 20, isPrivate: true };

  assert.equal(canAccessUploadedFile(manager, privateFile, [{ userId: 20, propertyId: 10 }]), true);
  assert.equal(canAccessUploadedFile(manager, privateFile, [{ userId: 20, propertyId: 11 }]), false);
  assert.equal(canAccessUploadedFile(manager, privateFile, [{ userId: 20, propertyId: 99 }]), false);
  assert.equal(canAccessUploadedFile(manager, { ...privateFile, organizationId: 2 }, []), false);

  const tenant = createUser('TENANT', 1);
  assert.equal(canAccessUploadedFile(tenant, privateFile, [{ userId: 20, propertyId: 10 }]), false);
  assert.equal(
    canAccessUploadedFile(tenant, { ...privateFile, isPrivate: false }, [{ userId: 20, propertyId: 10 }]),
    false
  );
  assert.equal(
    canAccessUploadedFile(tenant, privateFile, [{ userId: tenant.id, propertyId: 10 }]),
    true
  );
  assert.equal(canAccessUploadedFile(createUser('OWNER'), privateFile, []), true);
  assert.equal(canAccessUploadedFile(createUser('OWNER'), { ...privateFile, organizationId: 2 }, []), false);
});

test('tenant document associations require an owned private file in the same organization', () => {
  const user = { id: 7, organizationId: 1 };
  const tenant = { id: 30, organizationId: 1 };
  const ownedPrivateFile = { organizationId: 1, ownerUserId: 7, isPrivate: true, tenantId: null };

  assert.equal(canAssociateTenantDocument(user, tenant, ownedPrivateFile), true);
  assert.equal(canAssociateTenantDocument(user, tenant, { ...ownedPrivateFile, ownerUserId: 8 }), false);
  assert.equal(canAssociateTenantDocument(user, tenant, { ...ownedPrivateFile, organizationId: 2 }), false);
  assert.equal(canAssociateTenantDocument(user, tenant, { ...ownedPrivateFile, isPrivate: false }), false);
  assert.equal(canAssociateTenantDocument(user, tenant, { ...ownedPrivateFile, tenantId: 31 }), false);
});

test('uploaded file URLs must contain one well-formed positive file ID', () => {
  assert.equal(parseUploadedFileId('/api/files/12'), 12);
  assert.equal(parseUploadedFileId('/api/files/0'), null);
  assert.equal(parseUploadedFileId('/api/files/1/2'), null);
  assert.equal(parseUploadedFileId('/api/files/12?download=1'), null);
  assert.equal(parseUploadedFileId('/api/files/9007199254740992'), null);
  assert.equal(parseUploadedFileId('https://example.test/api/files/12'), null);
});

test('admission cannot link a portal user from another organization or a non-tenant user', () => {
  assert.equal(canLinkAdmissionUser({ organizationId: 2, role: 'TENANT' }, 1), false);
  assert.equal(canLinkAdmissionUser({ organizationId: 1, role: 'MANAGER' }, 1), false);
  assert.equal(canLinkAdmissionUser({ organizationId: 1, role: 'TENANT' }, 1), true);
});

test('payment review requires the payment, invoice, and tenant relationships to agree', () => {
  const payment = { organizationId: 1, tenantId: 30 };
  const invoice = { organizationId: 1, tenantId: 30, propertyId: 10 };
  const tenant = { id: 30, organizationId: 1, propertyId: 10 };

  assert.equal(hasConsistentPaymentRelations(1, payment, invoice, tenant), true);
  assert.equal(hasConsistentPaymentRelations(1, payment, { ...invoice, tenantId: 31 }, tenant), false);
  assert.equal(hasConsistentPaymentRelations(1, payment, { ...invoice, propertyId: 11 }, tenant), false);
  assert.equal(hasConsistentPaymentRelations(1, payment, { ...invoice, organizationId: 2 }, tenant), false);
});

test('a submitted property filter never broadens to all allowed properties', () => {
  assert.deepEqual(resolvePropertyFilter(undefined, [10, 11]), { kind: 'all' });
  assert.deepEqual(resolvePropertyFilter('abc', [10, 11]), { kind: 'invalid' });
  assert.deepEqual(resolvePropertyFilter('0', [10, 11]), { kind: 'invalid' });
  assert.deepEqual(resolvePropertyFilter('11', [10]), { kind: 'forbidden' });
  assert.deepEqual(resolvePropertyFilter('10', [10]), { kind: 'selected', propertyId: 10 });
});

test('room floors must belong to the selected property and organization', () => {
  const floor = { organizationId: 1, propertyId: 10 };

  assert.equal(floorBelongsToProperty(floor, 1, 10), true);
  assert.equal(floorBelongsToProperty(floor, 1, 11), false);
  assert.equal(floorBelongsToProperty(floor, 2, 10), false);
  assert.equal(floorBelongsToProperty(undefined, 1, 10), false);
});

test('organization-wide notices and settings remain owner-only', () => {
  const owner = createUser('OWNER');
  const manager = createUser('MANAGER', 1, [10], [10]);

  assert.equal(canAccessNoticeScope(owner, null), true);
  assert.equal(canAccessNoticeScope(manager, null), false);
  assert.equal(canAccessNoticeScope(manager, 10), true);
  assert.equal(canAccessOrganizationSettings('OWNER'), true);
  assert.equal(canAccessOrganizationSettings('MANAGER'), false);
});

test('public enquiries are accepted only for visible, active public properties', () => {
  const activePublic = { isPublic: true, deletedAt: null };
  const privateProperty = { isPublic: false, deletedAt: null };
  const deletedProperty = { isPublic: true, deletedAt: new Date() };

  assert.equal(isPublicEnquiryEligible(activePublic, 'org', false, 'platform'), true);
  assert.equal(isPublicEnquiryEligible(privateProperty, 'org', false, 'platform'), false);
  assert.equal(isPublicEnquiryEligible(deletedProperty, 'org', false, 'platform'), false);
  assert.equal(isPublicEnquiryEligible(activePublic, 'platform', true, 'platform'), false);
  assert.equal(isPublicEnquiryEligible(activePublic, 'sharma-residency', false, 'platform'), false);
});
