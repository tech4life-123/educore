"use server";

import type { ActionState } from "@/lib/action-state";
import { createAiProvider, getAiConfig } from "@/lib/ai/config";
import { userMessage } from "@/lib/ai/errors";
import { createUsageStore } from "@/lib/ai/server";
import { AiError } from "@/lib/ai/types";
import { requireSuperAdmin } from "@/services/auth";

/**
 * Super admin only: send one tiny request to the configured AI provider to
 * confirm the key, model and network path work. Costs a few tokens; logged in
 * ai_usage_events as kind "check".
 */
export async function testAiConnection(): Promise<ActionState> {
  const { profile } = await requireSuperAdmin();
  const config = getAiConfig();
  const provider = createAiProvider(config);
  const usage = createUsageStore();
  if (!provider || !usage) return { status: "error", message: `EduCore AI is off: ${config.disabledReason ?? "not configured"}` };

  const viewer = { profileId: profile.id, role: "super_admin" as const, schoolId: null, schoolName: null };
  const started = Date.now();
  try {
    const reply = await provider.complete({
      system: "You are a connection test. Reply with exactly: OK",
      messages: [{ role: "user", content: "Connection test" }],
      maxOutputTokens: 5,
      temperature: 0,
    });
    const ms = Date.now() - started;
    await usage
      .record({ viewer, kind: "check", provider: provider.name, model: reply.model, status: "ok", inputTokens: reply.usage.inputTokens, outputTokens: reply.usage.outputTokens, toolCalls: 0, durationMs: ms })
      .catch(() => console.error("[ai] usage record failed"));
    return { status: "success", message: `Connected to ${provider.name} (${reply.model}) in ${(ms / 1000).toFixed(1)} s.` };
  } catch (error) {
    const code = error instanceof AiError ? error.code : "unavailable";
    await usage
      .record({ viewer, kind: "check", provider: provider.name, model: provider.model, status: "error", errorCode: code, inputTokens: 0, outputTokens: 0, toolCalls: 0, durationMs: Date.now() - started })
      .catch(() => console.error("[ai] usage record failed"));
    const hint =
      code === "auth" ? " The API key was rejected — check ANTHROPIC_API_KEY." : code === "bad_request" ? " Check AI_MODEL is a valid model name." : "";
    return { status: "error", message: `${userMessage(code)}${hint}` };
  }
}
