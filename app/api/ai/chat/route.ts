import { handleChat } from "@/lib/ai/handler";
import { chatDeps } from "@/lib/ai/server";

/**
 * EduCore AI chat endpoint. All checks (same origin, sign-in, role, school,
 * input limits, usage limits) live in lib/ai/handler.ts; this file only wires
 * in the production dependencies. Only POST is exported, so other methods
 * receive 405 from Next.js.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleChat(request, chatDeps());
}
