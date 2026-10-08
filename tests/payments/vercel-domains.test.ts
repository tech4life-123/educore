import assert from "node:assert/strict";
import { test } from "node:test";
import { checkDomain, connectDomain, describeRecords, disconnectDomain, getVercelConfig, isValidHostname, recordsFrom } from "@/lib/vercel-domains";

const cfg = { token: "tok_secret", projectId: "prj_1", teamId: "team_1" };
type Call = { method: string; url: string; body?: string; auth?: string };

function fake(routes: Record<string, { status: number; json: unknown }>, calls: Call[] = []): typeof fetch {
  return (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method} ${url.pathname}`;
    calls.push({ method: String(init?.method), url: url.toString(), body: init?.body as string | undefined, auth: (init?.headers as Record<string, string>)?.Authorization });
    const r = routes[key] ?? { status: 404, json: { error: { message: `no route ${key}` } } };
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as typeof fetch;
}

test("config needs both token and project; team is optional", () => {
  assert.equal(getVercelConfig({}), null);
  assert.equal(getVercelConfig({ VERCEL_API_TOKEN: "t" }), null);
  assert.deepEqual(getVercelConfig({ VERCEL_API_TOKEN: " t ", VERCEL_PROJECT_ID: "p" }), { token: "t", projectId: "p", teamId: undefined });
});

test("hostname check rejects schemes, paths, uppercase and single labels", () => {
  assert.equal(isValidHostname("www.school.edu.lr"), true);
  for (const bad of ["https://a.com", "a.com/x", "A.com", "localhost", "a..com", "-a.com"]) assert.equal(isValidHostname(bad), false, bad);
});

test("connect adds the domain, sends the team and reports records to add", async () => {
  const calls: Call[] = [];
  const f = fake(
    {
      "POST /v10/projects/prj_1/domains": { status: 200, json: { name: "www.school.edu.lr", verified: false, verification: [{ type: "TXT", domain: "_vercel.school.edu.lr", value: "vc-domain-verify=abc", reason: "pending" }] } },
      "GET /v6/domains/www.school.edu.lr/config": { status: 200, json: { misconfigured: true, recommendedCNAME: [{ rank: 1, value: "abc.vercel-dns-017.com." }] } },
    },
    calls,
  );
  const r = await connectDomain("www.school.edu.lr", cfg, f);
  assert.ok(r.ok);
  assert.equal(r.value.verified, false);
  assert.equal(r.value.misconfigured, true);
  assert.deepEqual(r.value.records, [
    { type: "TXT", name: "_vercel.school.edu.lr", value: "vc-domain-verify=abc" },
    { type: "CNAME", name: "www.school.edu.lr", value: "abc.vercel-dns-017.com." },
  ]);
  assert.match(calls[0].url, /teamId=team_1/);
  assert.equal(calls[0].auth, "Bearer tok_secret");
  assert.equal(calls[0].body, JSON.stringify({ name: "www.school.edu.lr" }));
});

test("connect treats an already-added domain as success", async () => {
  const f = fake({
    "POST /v10/projects/prj_1/domains": { status: 409, json: { error: { code: "domain_already_in_use", message: "Domain already exists on this project" } } },
    "GET /v9/projects/prj_1/domains/a.school.lr": { status: 200, json: { name: "a.school.lr", verified: true } },
    "GET /v6/domains/a.school.lr/config": { status: 200, json: { misconfigured: false } },
  });
  const r = await connectDomain("a.school.lr", cfg, f);
  assert.ok(r.ok);
  assert.deepEqual(r.value, { verified: true, misconfigured: false, records: [] });
});

test("apex domains get an A record, with a safe default", () => {
  assert.deepEqual(recordsFrom({ verified: true }, { misconfigured: true }, "school.lr"), [{ type: "A", name: "school.lr", value: "76.76.21.21" }]);
});

test("check re-verifies then reads; a verify failure is not fatal", async () => {
  const calls: Call[] = [];
  const f = fake(
    {
      "POST /v9/projects/prj_1/domains/a.school.lr/verify": { status: 400, json: { error: { message: "not verified" } } },
      "GET /v9/projects/prj_1/domains/a.school.lr": { status: 200, json: { verified: false } },
      "GET /v6/domains/a.school.lr/config": { status: 200, json: { misconfigured: true } },
    },
    calls,
  );
  const r = await checkDomain("a.school.lr", cfg, f);
  assert.ok(r.ok);
  assert.equal(r.value.verified, false);
  assert.deepEqual(calls.map((c) => c.method), ["POST", "GET", "GET"]);
});

test("errors never contain the token and unreachable Vercel is reported kindly", async () => {
  const bad = fake({ "POST /v10/projects/prj_1/domains": { status: 403, json: { error: { message: "Forbidden" } } } });
  const r = await connectDomain("a.school.lr", cfg, bad);
  assert.equal(r.ok, false);
  assert.ok(!JSON.stringify(r).includes("tok_secret"));
  const down = (async () => {
    throw new Error("boom tok_secret");
  }) as unknown as typeof fetch;
  const r2 = await checkDomain("a.school.lr", cfg, down);
  assert.equal(r2.ok, false);
  assert.ok(!JSON.stringify(r2).includes("tok_secret"));
});

test("disconnect treats not-found as done and refuses bad hostnames", async () => {
  const f = fake({ "DELETE /v9/projects/prj_1/domains/a.school.lr": { status: 404, json: { error: { message: "Domain not found" } } } });
  assert.deepEqual(await disconnectDomain("a.school.lr", cfg, f), { ok: true, value: null });
  assert.equal((await disconnectDomain("https://x.com", cfg, f)).ok, false);
  assert.equal((await connectDomain("a.school.lr", null)).ok, false);
});

test("records read as plain sentences", () => {
  assert.equal(describeRecords([{ type: "A", name: "x.lr", value: "1.2.3.4" }]), "A record, name x.lr, value 1.2.3.4");
});
