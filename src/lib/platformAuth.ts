export const PLATFORM_ORG_SLUG = 'pgdesk-platform';

export function normalizeTokenCode(raw: string | null | undefined): string {
  return String(raw || '').trim().toUpperCase();
}

export function isValidStudentLinkCodeFormat(code: string | null | undefined): boolean {
  return /^PGDESKSTU-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeTokenCode(code));
}
