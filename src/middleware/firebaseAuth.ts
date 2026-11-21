import type { AppUserRole } from '../lib/authRoles.ts';

export interface FirebaseAuthAccount {
  id: number;
  uid: string | null;
  organizationId: number;
  name: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  role: string;
  assignedPropertyIds: number[];
  isActive: boolean;
  tokenVersion: number | null;
}

export interface FirebaseIdentity {
  uid: string;
  email?: string | null;
  emailVerified: unknown;
}

export interface FirebaseAuthRepository {
  findByUid(uid: string): Promise<FirebaseAuthAccount | null>;
  findByEmail(email: string): Promise<FirebaseAuthAccount | null>;
  linkUnlinkedAccount(userId: number, email: string, uid: string): Promise<FirebaseAuthAccount | null>;
}

export type FirebaseAuthResolution =
  | { kind: 'AUTHORIZED'; account: FirebaseAuthAccount & { role: AppUserRole } }
  | { kind: 'REJECTED' };

function isPermittedActiveAccount(
  account: FirebaseAuthAccount | null
): account is FirebaseAuthAccount & { role: AppUserRole } {
  return Boolean(
    account &&
      account.isActive &&
      (account.role === 'OWNER' || account.role === 'MANAGER' || account.role === 'TENANT')
  );
}

export async function resolveFirebaseAccount(
  identity: FirebaseIdentity,
  repository: FirebaseAuthRepository
): Promise<FirebaseAuthResolution> {
  if (identity.emailVerified !== true || !identity.uid) {
    return { kind: 'REJECTED' };
  }

  const uidAccount = await repository.findByUid(identity.uid);
  if (uidAccount) {
    return isPermittedActiveAccount(uidAccount)
      ? { kind: 'AUTHORIZED', account: uidAccount }
      : { kind: 'REJECTED' };
  }

  const email = identity.email?.trim().toLowerCase();
  if (!email) return { kind: 'REJECTED' };

  const emailAccount = await repository.findByEmail(email);
  if (
    !isPermittedActiveAccount(emailAccount) ||
    emailAccount.email.trim().toLowerCase() !== email
  ) {
    return { kind: 'REJECTED' };
  }

  if (emailAccount.uid === identity.uid) {
    return { kind: 'AUTHORIZED', account: emailAccount };
  }
  if (emailAccount.uid !== null) return { kind: 'REJECTED' };

  const linkedAccount = await repository.linkUnlinkedAccount(emailAccount.id, email, identity.uid);
  if (
    linkedAccount?.uid === identity.uid &&
    isPermittedActiveAccount(linkedAccount) &&
    linkedAccount.email.trim().toLowerCase() === email
  ) {
    return { kind: 'AUTHORIZED', account: linkedAccount };
  }

  const concurrentlyLinkedAccount = await repository.findByUid(identity.uid);
  if (
    concurrentlyLinkedAccount?.id === emailAccount.id &&
    isPermittedActiveAccount(concurrentlyLinkedAccount) &&
    concurrentlyLinkedAccount.email.trim().toLowerCase() === email
  ) {
    return { kind: 'AUTHORIZED', account: concurrentlyLinkedAccount };
  }

  return { kind: 'REJECTED' };
}
