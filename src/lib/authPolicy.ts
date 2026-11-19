export const FORGOT_PASSWORD_UNAVAILABLE_MESSAGE =
  'Password reset is unavailable during testing. Please contact the administrator.';

export type AuthRole = 'OWNER' | 'MANAGER' | 'TENANT';

export interface AuthTestingPolicy {
  emailVerificationEnabled: boolean;
  smsOtpEnabled: boolean;
  passwordResetEmailEnabled: boolean;
  forgotPasswordMessage: string;
}

export function isEmailVerificationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_EMAIL_VERIFICATION_ENABLED?.trim().toLowerCase() === 'true';
}

export function isSmsOtpEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_SMS_OTP_ENABLED?.trim().toLowerCase() === 'true';
}

export function isPasswordResetEmailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTH_EMAIL_PASSWORD_RESET_ENABLED?.trim().toLowerCase() === 'true';
}

export function getAuthTestingPolicy(env: NodeJS.ProcessEnv = process.env): AuthTestingPolicy {
  return {
    emailVerificationEnabled: isEmailVerificationEnabled(env),
    smsOtpEnabled: isSmsOtpEnabled(env),
    passwordResetEmailEnabled: isPasswordResetEmailEnabled(env),
    forgotPasswordMessage: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
  };
}

export function shouldRequireCurrentPasswordOnUpdate(params: {
  hasPassword: boolean;
  authMethod?: 'SESSION' | 'GOOGLE';
}): boolean {
  if (!params.hasPassword) return false;
  if (params.authMethod === 'GOOGLE') return false;
  return true;
}

/**
 * Organization-level administrator password reset authorization rule.
 * - Only an OWNER may reset passwords for users inside their own organization.
 * - Cross-organization resets are strictly forbidden.
 * - Owners cannot reset other OWNER accounts or their own account through this admin action
 *   (owners manage their own password via authenticated Account & Security settings).
 */
export function canAdminResetUserPassword(params: {
  actorRole: AuthRole;
  actorOrgId: number;
  actorUserId: number;
  targetRole: AuthRole;
  targetOrgId: number;
  targetUserId: number;
}): boolean {
  if (params.actorRole !== 'OWNER') return false;
  if (params.actorOrgId !== params.targetOrgId) return false;
  if (params.actorUserId === params.targetUserId) return false;
  if (params.targetRole === 'OWNER') return false;
  return params.targetRole === 'MANAGER' || params.targetRole === 'TENANT';
}
