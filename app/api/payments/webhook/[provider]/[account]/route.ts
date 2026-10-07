import { handleProviderWebhook } from "@/lib/payments/handler";
import { webhookDeps } from "@/lib/payments/server";

/**
 * Callback URL a payment provider posts to:
 *   POST /api/payments/webhook/<provider>/<account id>
 * All checks live in lib/payments/handler.ts. Only POST is exported, so other
 * methods receive 405. Never cached.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request, ctx: RouteContext<"/api/payments/webhook/[provider]/[account]">) {
  const deps = webhookDeps();
  if (!deps) return Response.json({ ok: false, error: "unavailable" }, { status: 503 });
  const params = await ctx.params;
  return handleProviderWebhook(request, params, deps);
}
