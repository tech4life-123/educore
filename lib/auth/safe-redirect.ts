/**
 * Only allow same-origin, absolute-path redirects (prevents open redirects
 * such as ?next=//evil.example or ?next=https://evil.example).
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(value)) return null;
  if (value === "/login" || value.startsWith("/login?")) return null;
  return value;
}
