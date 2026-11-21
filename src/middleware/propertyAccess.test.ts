import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessProperty, getAllowedPropertyIds } from './propertyAccess.ts';
import type { AppUserRole } from '../lib/authRoles.ts';

function createUser(
  role: AppUserRole,
  organizationPropertyIds: number[],
  assignedPropertyIds: number[]
) {
  return { role, organizationPropertyIds, assignedPropertyIds };
}

test('owners can access only properties in their organization', () => {
  const owner = createUser('OWNER', [10, 11], []);

  assert.equal(canAccessProperty(owner, 10), true);
  assert.equal(canAccessProperty(owner, 99), false);
  assert.deepEqual(getAllowedPropertyIds(owner, [10, 99]), [10]);
});

test('managers can access only assigned properties in their organization', () => {
  const manager = createUser('MANAGER', [10, 11], [11, 99]);

  assert.equal(canAccessProperty(manager, 11), true);
  assert.equal(canAccessProperty(manager, 10), false);
  assert.equal(canAccessProperty(manager, 99), false);
  assert.deepEqual(getAllowedPropertyIds(manager, [10, 11, 99]), [11]);
});

test('an empty manager assignment list grants no property access', () => {
  const manager = createUser('MANAGER', [10, 11], []);

  assert.equal(canAccessProperty(manager, 10), false);
  assert.deepEqual(getAllowedPropertyIds(manager, [10, 11]), []);
});

test('tenants cannot use management property access helpers', () => {
  const tenant = createUser('TENANT', [10], [10]);

  assert.equal(canAccessProperty(tenant, 10), false);
  assert.deepEqual(getAllowedPropertyIds(tenant, [10]), []);
});

test('missing organization scope fails closed', () => {
  const owner = createUser('OWNER', [], []);

  assert.equal(canAccessProperty(owner, 10), false);
  assert.deepEqual(getAllowedPropertyIds(owner, [10]), []);
});
