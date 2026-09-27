import "server-only";

import { envInt, type UsageLimits } from "./limits";
import { AnthropicProvider } from "./providers/anthropic";
import { MockProvider } from "./providers/mock";
import type { AiProvider } from "./types";

/**
 * EduCore AI configuration — server-side environment variables only.
 * None of these has a NEXT_PUBLIC_ prefix, so Next.js never ships them to
 * browsers, and this module imports "server-only" so the build fails if a
 * Client Component ever imports it.
 *
 *   AI_PROVIDER                 anthropic (default) | mock (development only)
 *   ANTHROPIC_API_KEY           required for anthropic
 *   AI_MODEL                    default claude-haiku-4-5-20251001 (fast, lowest cost)
 *   AI_ENABLED                  set to "false" to switch the assistant off everywhere
 *   AI_MAX_OUTPUT_TOKENS        per reply, default 800
 *   AI_TIMEOUT_MS               per request, default 45000
 *   AI_USER_REQUESTS_PER_MINUTE default 6
 *   AI_USER_REQUESTS_PER_DAY    default 60 (rolling 24 hours)
 *   AI_SCHOOL_REQUESTS_PER_DAY  default 1500 (rolling 24 hours, whole school)
 */

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

export interface AiConfig {
  enabled: boolean;
  /** Why the assistant is off, for the platform status card (never shown to school users). */
  disabledReason: string | null;
  provider: "anthropic" | "mock";
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  limits: UsageLimits;
}

export function getAiConfig(): AiConfig {
  const providerName = (process.env.AI_PROVIDER ?? "anthropic").trim().toLowerCase();
  const provider = providerName === "mock" ? "mock" : "anthropic";
  const model = provider === "mock" ? "mock-1" : (process.env.AI_MODEL ?? "").trim() || DEFAULT_MODEL;

  let disabledReason: string | null = null;
  if ((process.env.AI_ENABLED ?? "").trim().toLowerCase() === "false") disabledReason = "Switched off (AI_ENABLED=false).";
  else if (providerName !== "anthropic" && providerName !== "mock") disabledReason = `Unknown AI_PROVIDER "${providerName}".`;
  else if (provider === "mock" && process.env.NODE_ENV === "production") disabledReason = "The mock provider is for development only.";
  else if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) disabledReason = "ANTHROPIC_API_KEY is not set.";
  else if (!process.env.SUPABASE_SERVICE_ROLE_KEY) disabledReason = "SUPABASE_SERVICE_ROLE_KEY is not set (needed for usage limits).";

  return {
    enabled: disabledReason === null,
    disabledReason,
    provider,
    model,
    maxOutputTokens: envInt(process.env.AI_MAX_OUTPUT_TOKENS, 800, 64, 4000),
    timeoutMs: envInt(process.env.AI_TIMEOUT_MS, 45000, 5000, 120000),
    limits: {
      userPerMinute: envInt(process.env.AI_USER_REQUESTS_PER_MINUTE, 6, 1, 120),
      userPerDay: envInt(process.env.AI_USER_REQUESTS_PER_DAY, 60, 1, 5000),
      schoolPerDay: envInt(process.env.AI_SCHOOL_REQUESTS_PER_DAY, 1500, 1, 1000000),
    },
  };
}

/** The configured provider, or null when the assistant is off. */
export function createAiProvider(config: AiConfig = getAiConfig()): AiProvider | null {
  if (!config.enabled) return null;
  if (config.provider === "mock") return new MockProvider();
  return new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: config.model,
    timeoutMs: config.timeoutMs,
  });
}
