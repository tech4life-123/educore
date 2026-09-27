/**
 * Login identities.
 *
 * People sign in with either:
 *   - a real email address, e.g.  teacher@gmail.com
 *   - a school-issued username,   e.g.  stu0042@PILOT-01
 *
 * Supabase Auth requires an email for password sign-in, so a username account
 * is stored in Auth under an internal address:
 *   stu0042@PILOT-01  →  stu0042@pilot-01.educore.invalid
 *
 * `.invalid` is a reserved top-level domain (RFC 2606): it can never receive
 * mail, so these internal addresses can never leak messages to anyone.
 */

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const INTERNAL_LOGIN_DOMAIN = "educore.invalid";

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value);
}

/** Internal Auth address for a username account. */
export function internalAuthEmail(username: string, schoolCode: string): string {
  return `${normalizeUsername(username)}@${schoolCode.trim().toLowerCase()}.${INTERNAL_LOGIN_DOMAIN}`;
}

/** What the person types at sign-in. */
export function displayLoginId(profile: { username: string | null; email: string | null }, schoolCode: string): string {
  if (profile.email) return profile.email;
  if (profile.username) return `${profile.username}@${schoolCode.toUpperCase()}`;
  return "—";
}

export type ParsedIdentifier =
  | { kind: "email"; authEmail: string }
  | { kind: "username"; authEmail: string }
  | { kind: "invalid" };

/**
 * Turn what the user typed into the Auth email to sign in with.
 *  - "name@domain.tld"   (domain has a dot) → a real email
 *  - "username@SCHOOL-CODE" (no dot)        → a school username
 */
export function parseLoginIdentifier(raw: string): ParsedIdentifier {
  const value = raw.trim();
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1 || value.length > 254) return { kind: "invalid" };

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);

  if (domain.includes(".")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { kind: "email", authEmail: value.toLowerCase() } : { kind: "invalid" };
  }

  const username = normalizeUsername(local);
  if (!isValidUsername(username) || !/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(domain)) return { kind: "invalid" };
  return { kind: "username", authEmail: internalAuthEmail(username, domain) };
}
