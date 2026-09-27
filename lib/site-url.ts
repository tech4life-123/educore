import "server-only";

import { headers } from "next/headers";

/** Public origin of this deployment, derived from the incoming request (no hard-coded hosts). */
export async function currentSiteUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
