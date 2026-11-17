/**
 * Pure first-create admin bootstrap policy (D-04).
 *
 * The allowlist is applied ONLY in the local-user creation branch, and only
 * for a verified primary email. Later profile refreshes never call this
 * policy, so a changed email can neither grant nor revoke admin.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isAdminOnFirstCreate(
  email: string,
  emailVerified: boolean,
  adminEmails: readonly string[],
): boolean {
  if (emailVerified !== true) return false;
  const normalized = normalizeEmail(email);
  if (normalized.length === 0) return false;
  return adminEmails.some((candidate) => normalizeEmail(candidate) === normalized);
}
