import assert from "node:assert/strict";
import { test } from "node:test";
import { getAdapter, isImplemented } from "@/lib/payments/adapters";
import { handleProviderWebhook, IngestRefused, MAX_BODY_BYTES, type AccountRecord, type WebhookDeps } from "@/lib/payments/handler";
import { SIGNATURE_HEADER, signBody, verifySignature } from "@/lib/payments/sign";
import type { NormalizedPayment } from "@/lib/payments/types";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
const SECRET = "s".repeat(64);
const NOW = 1_800_000_000_000;

const message = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    transaction_id: "T-100",
    status: "successful",
    amount: "25.50",
    currency: "usd",
    paid_at: "2026-10-09T10:00:00Z",
    payer_name: "Jane Doe",
    payer_phone: "+231770000000",
    ...over,
  });

function fakeDeps(over: Partial<{ account: Partial<AccountRecord>; missing: boolean; ingestError: Error }> = {}) {
  const ingested: { accountId: string; payment: NormalizedPayment }[] = [];
  const deps: WebhookDeps = {
    now: () => NOW,
    async loadAccount(id) {
      if (over.missing || id !== ACCOUNT) return null;
      return { account: { id, provider: "mock", environment: "sandbox", status: "active", ...over.account }, secret: SECRET };
    },
    async ingest(accountId, payment) {
      if (over.ingestError) throw over.ingestError;
      ingested.push({ accountId, payment });
      return { outcome: "ingested", duplicate: false };
    },
  };
  return { deps, ingested };
}

function post(body: string, signature: string | null | undefined, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...extra };
  if (signature !== null) headers[SIGNATURE_HEADER] = signature ?? signBody(SECRET, body, NOW / 1000);
  return new Request("https://example.test/api/payments/webhook/mock/" + ACCOUNT, { method: "POST", headers, body });
}

const call = (req: Request, deps: WebhookDeps, provider = "mock", account = ACCOUNT) =>
  handleProviderWebhook(req, { provider, account }, deps);

// ------------------------------------------------------------ signatures
test("a freshly signed body verifies", () => {
  const body = message();
  assert.deepEqual(verifySignature(SECRET, body, signBody(SECRET, body, NOW / 1000), NOW), { ok: true });
});

test("a tampered body fails", () => {
  const sig = signBody(SECRET, message(), NOW / 1000);
  const r = verifySignature(SECRET, message({ amount: "2500" }), sig, NOW);
  assert.equal(r.ok, false);
});

test("the wrong secret fails", () => {
  const body = message();
  assert.equal(verifySignature("x".repeat(64), body, signBody(SECRET, body, NOW / 1000), NOW).ok, false);
});

test("an old signature is rejected (replay protection)", () => {
  const body = message();
  const r = verifySignature(SECRET, body, signBody(SECRET, body, NOW / 1000 - 3600), NOW);
  assert.deepEqual(r, { ok: false, reason: "stale_signature" });
});

test("a signature from the far future is rejected too", () => {
  const body = message();
  assert.equal(verifySignature(SECRET, body, signBody(SECRET, body, NOW / 1000 + 3600), NOW).ok, false);
});

test("changing the timestamp without re-signing fails", () => {
  const body = message();
  const sig = signBody(SECRET, body, NOW / 1000 - 3600).replace(/t=\d+/, `t=${NOW / 1000}`);
  assert.equal(verifySignature(SECRET, body, sig, NOW).ok, false);
});

test("missing and malformed headers fail without throwing", () => {
  const body = message();
  for (const h of [null, "", "garbage", "t=abc,v1=zz", `t=${NOW / 1000}`, `v1=${"a".repeat(64)}`, `t=${NOW / 1000},v1=${"a".repeat(10)}`]) {
    assert.equal(verifySignature(SECRET, body, h, NOW).ok, false, String(h));
  }
});

// ------------------------------------------------------------ adapters
test("only the sandbox provider is implemented", () => {
  assert.equal(isImplemented("mock"), true);
  assert.equal(isImplemented("orange_money"), false);
  assert.equal(isImplemented("mtn_momo"), false);
});

test("Orange Money and MTN MoMo adapters refuse everything until built", () => {
  for (const code of ["orange_money", "mtn_momo"] as const) {
    const a = getAdapter(code);
    assert.equal(a.verify({ rawBody: message(), header: () => signBody(SECRET, message(), NOW / 1000), secret: SECRET, now: NOW }).ok, false);
    assert.equal(a.parse(message()).ok, false);
    assert.equal(a.supportsLive, false);
  }
});

test("the mock adapter normalises a message", () => {
  const r = getAdapter("mock").parse(message());
  assert.ok(r.ok);
  assert.deepEqual(r.payment, {
    externalId: "T-100",
    status: "successful",
    amount: 25.5,
    currency: "USD",
    date: "2026-10-09",
    payerName: "Jane Doe",
    payerPhone: "+231770000000",
  });
});

test("the mock adapter rejects non-objects, bad JSON and a missing id", () => {
  const p = getAdapter("mock").parse;
  assert.equal(p("not json").ok, false);
  assert.equal(p("[1,2]").ok, false);
  assert.equal(p("null").ok, false);
  assert.equal(p(message({ transaction_id: "  " })).ok, false);
  assert.equal(p(message({ transaction_id: 12 })).ok, false);
});

test("odd amounts and dates become null for the database to judge", () => {
  const r = getAdapter("mock").parse(message({ amount: "1e3", paid_at: "yesterday", currency: 5 }));
  assert.ok(r.ok);
  assert.equal(r.payment.amount, null);
  assert.equal(r.payment.date, null);
  assert.equal(r.payment.currency, null);
});

// ------------------------------------------------------------ the handler
test("a valid signed message is ingested once, with 200", async () => {
  const { deps, ingested } = fakeDeps();
  const res = await call(post(message(), undefined), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, outcome: "ingested", duplicate: false });
  assert.equal(ingested.length, 1);
  assert.equal(ingested[0].accountId, ACCOUNT);
  assert.equal(ingested[0].payment.amount, 25.5);
});

test("no signature → 401 and nothing is ingested", async () => {
  const { deps, ingested } = fakeDeps();
  const res = await call(post(message(), null), deps);
  assert.equal(res.status, 401);
  assert.equal(ingested.length, 0);
});

test("a bad signature → 401, and the reply does not say why", async () => {
  const { deps, ingested } = fakeDeps();
  const res = await call(post(message(), `t=${NOW / 1000},v1=${"0".repeat(64)}`), deps);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { ok: false, error: "invalid_signature" });
  assert.equal(ingested.length, 0);
});

test("a signature made with another account's secret is refused", async () => {
  const { deps, ingested } = fakeDeps();
  const body = message();
  const res = await call(post(body, signBody("o".repeat(64), body, NOW / 1000)), deps);
  assert.equal(res.status, 401);
  assert.equal(ingested.length, 0);
});

test("unknown provider or malformed account id → 404", async () => {
  const { deps } = fakeDeps();
  assert.equal((await call(post(message(), undefined), deps, "paypal")).status, 404);
  assert.equal((await call(post(message(), undefined), deps, "mock", "not-a-uuid")).status, 404);
  assert.equal((await call(post(message(), undefined), deps, "mock", "22222222-2222-4222-8222-222222222222")).status, 404);
});

test("an account that does not exist → 404, same as a wrong provider", async () => {
  assert.equal((await call(post(message(), undefined), fakeDeps({ missing: true }).deps)).status, 404);
  assert.equal((await call(post(message(), undefined), fakeDeps().deps, "orange_money")).status, 404);
});

test("a disabled account → 403 before any signature work", async () => {
  const { deps, ingested } = fakeDeps({ account: { status: "disabled" } });
  assert.equal((await call(post(message(), undefined), deps)).status, 403);
  assert.equal(ingested.length, 0);
});

test("a live mock account is refused (501)", async () => {
  const { deps } = fakeDeps({ account: { environment: "live" } });
  assert.equal((await call(post(message(), undefined), deps)).status, 501);
});

test("Orange Money / MTN accounts answer 501 even with a 'valid' signature", async () => {
  for (const provider of ["orange_money", "mtn_momo"]) {
    const { deps, ingested } = fakeDeps({ account: { provider } });
    assert.equal((await call(post(message(), undefined), deps, provider)).status, 501);
    assert.equal(ingested.length, 0);
  }
});

test("a signed but unparseable message → 422", async () => {
  const { deps, ingested } = fakeDeps();
  assert.equal((await call(post("{not json", undefined), deps)).status, 422);
  assert.equal((await call(post(message({ transaction_id: "" }), undefined), deps)).status, 422);
  assert.equal(ingested.length, 0);
});

test("an oversized body → 413 (declared and actual)", async () => {
  const { deps, ingested } = fakeDeps();
  const big = message({ payer_name: "x".repeat(MAX_BODY_BYTES) });
  assert.equal((await call(post(big, undefined), deps)).status, 413);
  const lying = post(big, undefined, { "content-length": "10" });
  assert.equal((await call(lying, deps)).status, 413);
  assert.equal(ingested.length, 0);
});

test("a database refusal → 422; any other failure → 500 so the provider retries", async () => {
  assert.equal((await call(post(message(), undefined), fakeDeps({ ingestError: new IngestRefused("no") }).deps)).status, 422);
  const res = await call(post(message(), undefined), fakeDeps({ ingestError: new Error("secret db detail") }).deps);
  assert.equal(res.status, 500);
  assert.ok(!JSON.stringify(await res.json()).includes("secret db detail"));
});

test("responses are never cacheable and never contain the secret", async () => {
  const res = await call(post(message(), undefined), fakeDeps().deps);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.ok(!(await res.text()).includes(SECRET));
});
