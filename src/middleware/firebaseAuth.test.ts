import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveFirebaseAccount,
  type FirebaseAuthAccount,
  type FirebaseAuthRepository,
  type FirebaseIdentity,
} from './firebaseAuth.ts';

function createAccount(overrides: Partial<FirebaseAuthAccount> = {}): FirebaseAuthAccount {
  return {
    id: 1,
    uid: null,
    organizationId: 7,
    name: 'Demo User',
    email: 'demo@pgdesk.in',
    phone: null,
    photoUrl: null,
    role: 'OWNER',
    assignedPropertyIds: [],
    isActive: true,
    tokenVersion: 1,
    ...overrides,
  };
}

function createRepository(options: {
  byUid?: FirebaseAuthAccount | null;
  byEmail?: FirebaseAuthAccount | null;
} = {}) {
  const calls: string[] = [];
  let linkedAccount: FirebaseAuthAccount | null = null;
  let organizationCreations = 0;
  const repository: FirebaseAuthRepository & { createOrganization: () => void } = {
    async findByUid(uid) {
      calls.push(`uid:${uid}`);
      return linkedAccount?.uid === uid ? linkedAccount : options.byUid ?? null;
    },
    async findByEmail(email) {
      calls.push(`email:${email}`);
      return options.byEmail ?? null;
    },
    async linkUnlinkedAccount(userId, email, uid) {
      calls.push(`link:${userId}:${email}:${uid}`);
      if (options.byEmail?.id !== userId || options.byEmail.uid !== null) return null;
      linkedAccount = { ...options.byEmail, uid };
      return linkedAccount;
    },
    createOrganization() {
      organizationCreations += 1;
    },
  };
  return { repository, calls, get organizationCreations() { return organizationCreations; } };
}

test('existing PGDesk demo accounts can link by their verified email without changing roles or organizations', async () => {
  const demoAccounts = [
    { email: 'owner@pgdesk.in', role: 'OWNER' },
    { email: 'manager@pgdesk.in', role: 'MANAGER' },
    { email: 'aarav.k@pgdesk.in', role: 'TENANT' },
  ];

  for (const [index, demoAccount] of demoAccounts.entries()) {
    const account = createAccount({
      id: index + 1,
      email: demoAccount.email,
      role: demoAccount.role,
    });
    const { repository } = createRepository({ byEmail: account });
    const result = await resolveFirebaseAccount(
      { uid: `firebase-${index}`, email: demoAccount.email, emailVerified: true },
      repository
    );

    assert.equal(result.kind, 'AUTHORIZED');
    if (result.kind === 'AUTHORIZED') {
      assert.equal(result.account.email, demoAccount.email);
      assert.equal(result.account.role, demoAccount.role);
      assert.equal(result.account.organizationId, account.organizationId);
      assert.equal(result.account.uid, `firebase-${index}`);
    }
  }
});

test('an active permitted account continues to authenticate by its existing Firebase UID', async () => {
  const account = createAccount({ uid: 'known-uid', email: 'changed@example.com', role: 'MANAGER' });
  const { repository, calls } = createRepository({ byUid: account });
  const result = await resolveFirebaseAccount(
    { uid: 'known-uid', email: 'other@example.com', emailVerified: true },
    repository
  );

  assert.equal(result.kind, 'AUTHORIZED');
  assert.deepEqual(calls, ['uid:known-uid']);
});

test('an unknown Google account is rejected without creating an organization or linking an account', async () => {
  const { repository, calls, organizationCreations } = createRepository();
  const result = await resolveFirebaseAccount(
    { uid: 'unknown-uid', email: 'unknown@example.com', emailVerified: true },
    repository
  );

  assert.equal(result.kind, 'REJECTED');
  assert.deepEqual(calls, ['uid:unknown-uid', 'email:unknown@example.com']);
  assert.equal(organizationCreations, 0);
});

test('Google identities without an exactly true email_verified claim are rejected before account lookup', async () => {
  for (const emailVerified of [false, undefined, 'true', 1]) {
    const { repository, calls } = createRepository({
      byUid: createAccount({ uid: 'known-uid' }),
    });
    const identity: FirebaseIdentity = {
      uid: 'known-uid',
      email: 'demo@pgdesk.in',
      emailVerified,
    };

    const result = await resolveFirebaseAccount(identity, repository);

    assert.equal(result.kind, 'REJECTED');
    assert.deepEqual(calls, []);
  }
});

test('an existing account linked to a different Firebase UID cannot be relinked', async () => {
  const account = createAccount({ uid: 'another-firebase-uid', email: 'demo@pgdesk.in' });
  const { repository, calls } = createRepository({ byEmail: account });
  const result = await resolveFirebaseAccount(
    { uid: 'attacker-uid', email: 'demo@pgdesk.in', emailVerified: true },
    repository
  );

  assert.equal(result.kind, 'REJECTED');
  assert.deepEqual(calls, ['uid:attacker-uid', 'email:demo@pgdesk.in']);
});

test('email-based linking rejects an account whose registered email differs from the verified Firebase email', async () => {
  const account = createAccount({ email: 'different@pgdesk.in' });
  const { repository, calls } = createRepository({ byEmail: account });
  const result = await resolveFirebaseAccount(
    { uid: 'new-uid', email: 'demo@pgdesk.in', emailVerified: true },
    repository
  );

  assert.equal(result.kind, 'REJECTED');
  assert.deepEqual(calls, ['uid:new-uid', 'email:demo@pgdesk.in']);
});

test('inactive users and users with unpermitted roles remain rejected by UID', async () => {
  for (const account of [
    createAccount({ uid: 'known-uid', isActive: false }),
    createAccount({ uid: 'known-uid', role: 'ADMIN' }),
  ]) {
    const { repository } = createRepository({ byUid: account });
    const result = await resolveFirebaseAccount(
      { uid: 'known-uid', emailVerified: true },
      repository
    );
    assert.equal(result.kind, 'REJECTED');
  }
});
