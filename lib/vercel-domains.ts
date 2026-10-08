import "server-only";

/**
 * Thin client for the Vercel REST API calls needed to put a school's custom
 * domain on this project. Off by default: with no VERCEL_API_TOKEN /
 * VERCEL_PROJECT_ID the platform dashboard keeps its manual review flow.
 * The token only ever lives in server environment variables.
 */

export interface VercelConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

export function getVercelConfig(env: Record<string, string | undefined> = process.env): VercelConfig | null {
  const token = env.VERCEL_API_TOKEN?.trim();
  const projectId = env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) return null;
  return { token, projectId, teamId: env.VERCEL_TEAM_ID?.trim() || undefined };
}

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
}

export interface DomainState {
  /** Vercel knows the domain and the ownership check passed. */
  verified: boolean;
  /** DNS does not (yet) point at Vercel. */
  misconfigured: boolean;
  /** Records the school still has to add, in plain form. */
  records: DnsRecord[];
}

export type VercelResult<T> = { ok: true; value: T } | { ok: false; message: string };

type Fetch = typeof fetch;
const BASE = "https://api.vercel.com";

/** Hostnames only: lowercase labels, no scheme/path/port. Mirrors the school_domains check. */
export function isValidHostname(domain: string): boolean {
  return domain.length <= 253 && domain === domain.toLowerCase() && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

async function call(cfg: VercelConfig, f: Fetch, method: string, path: string, body?: unknown): Promise<VercelResult<Record<string, unknown>>> {
  const url = new URL(path, BASE);
  if (cfg.teamId) url.searchParams.set("teamId", cfg.teamId);
  try {
    const res = await f(url, {
      method,
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = json.error as { message?: string; code?: string } | undefined;
      // Never echo the token; Vercel's own message is enough for the operator.
      return { ok: false, message: err?.message ?? `Vercel answered ${res.status}` };
    }
    return { ok: true, value: json };
  } catch {
    return { ok: false, message: "Could not reach Vercel. Try again in a moment." };
  }
}

/** Pulls the DNS records out of Vercel's verification list and config answer. Defensive: shapes vary. */
export function recordsFrom(project: Record<string, unknown>, config: Record<string, unknown> | null, domain: string): DnsRecord[] {
  const out: DnsRecord[] = [];
  const ver = Array.isArray(project.verification) ? (project.verification as Record<string, unknown>[]) : [];
  for (const v of ver) {
    if (typeof v.type === "string" && typeof v.domain === "string" && typeof v.value === "string") {
      out.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value });
    }
  }
  if (config?.misconfigured === true) {
    const apex = domain.split(".").length === 2;
    const first = (k: string): string | null => {
      const list = config[k];
      if (!Array.isArray(list) || list.length === 0) return null;
      const best = [...(list as { rank?: number; value?: unknown }[])].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0];
      const v = best?.value;
      return typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
    };
    if (apex) out.push({ type: "A", name: domain, value: first("recommendedIPv4") ?? "76.76.21.21" });
    else out.push({ type: "CNAME", name: domain, value: first("recommendedCNAME") ?? "cname.vercel-dns.com" });
  }
  return out;
}

async function state(cfg: VercelConfig, f: Fetch, domain: string, project: Record<string, unknown>): Promise<VercelResult<DomainState>> {
  const conf = await call(cfg, f, "GET", `/v6/domains/${encodeURIComponent(domain)}/config`);
  if (!conf.ok) return conf;
  return {
    ok: true,
    value: {
      verified: project.verified === true,
      misconfigured: conf.value.misconfigured !== false,
      records: recordsFrom(project, conf.value, domain),
    },
  };
}

/** Adds the domain to the project (idempotent: "already exists" is treated as success) and reports what is left to do. */
export async function connectDomain(domain: string, cfg: VercelConfig | null = getVercelConfig(), f: Fetch = fetch): Promise<VercelResult<DomainState>> {
  if (!cfg) return { ok: false, message: "Vercel is not configured." };
  if (!isValidHostname(domain)) return { ok: false, message: "That is not a valid hostname." };
  const added = await call(cfg, f, "POST", `/v10/projects/${encodeURIComponent(cfg.projectId)}/domains`, { name: domain });
  let project = added;
  if (!added.ok) {
    if (!/already|exists/i.test(added.message)) return added;
    project = await call(cfg, f, "GET", `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(domain)}`);
    if (!project.ok) return project;
  }
  return state(cfg, f, domain, (project as { ok: true; value: Record<string, unknown> }).value);
}

/** Asks Vercel to re-check ownership, then reports the current state. */
export async function checkDomain(domain: string, cfg: VercelConfig | null = getVercelConfig(), f: Fetch = fetch): Promise<VercelResult<DomainState>> {
  if (!cfg) return { ok: false, message: "Vercel is not configured." };
  if (!isValidHostname(domain)) return { ok: false, message: "That is not a valid hostname." };
  const p = encodeURIComponent(cfg.projectId);
  const d = encodeURIComponent(domain);
  // A failed verify just means DNS is not ready; the follow-up read tells us the truth either way.
  await call(cfg, f, "POST", `/v9/projects/${p}/domains/${d}/verify`);
  const project = await call(cfg, f, "GET", `/v9/projects/${p}/domains/${d}`);
  if (!project.ok) return project;
  return state(cfg, f, domain, project.value);
}

/** Takes the domain off the project. Already gone counts as done. */
export async function disconnectDomain(domain: string, cfg: VercelConfig | null = getVercelConfig(), f: Fetch = fetch): Promise<VercelResult<null>> {
  if (!cfg) return { ok: false, message: "Vercel is not configured." };
  if (!isValidHostname(domain)) return { ok: false, message: "That is not a valid hostname." };
  const res = await call(cfg, f, "DELETE", `/v9/projects/${encodeURIComponent(cfg.projectId)}/domains/${encodeURIComponent(domain)}`);
  if (!res.ok && !/not.?found/i.test(res.message)) return res;
  return { ok: true, value: null };
}

/** One line of plain instructions per record, for the dashboard and for relaying to the school. */
export function describeRecords(records: DnsRecord[]): string {
  return records.map((r) => `${r.type} record, name ${r.name}, value ${r.value}`).join("; ");
}
