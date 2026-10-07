import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/services/auth";
import { createAiProvider, getAiConfig } from "./config";
import type { ChatDeps, UsageEvent, UsageStore, Viewer, ViewerLookup } from "./handler";
import type { UsageCounts } from "./limits";
import type { ViewerRole } from "./prompt";
import { createEduCoreData } from "./tools/data";
import { createToolBox } from "./tools/registry";

/**
 * Production wiring for the AI endpoint.
 *
 * Identity comes from the same server-side check every EduCore page uses
 * (getAuthContext: session validated with Supabase Auth, own profile and
 * school read under RLS). The service-role client is used ONLY for the usage
 * log and limits, and only after that check has established who is asking —
 * never to read school data for the model. School data for the tools is read
 * with the person's own session (lib/ai/tools/data.ts).
 */

export async function getAiViewer(): Promise<ViewerLookup> {
  const ctx = await getAuthContext();
  switch (ctx.status) {
    case "unauthenticated":
    case "not_configured":
      return { status: "unauthenticated" };
    case "error":
      return { status: "error" };
    case "no_profile":
    case "profile_inactive":
    case "school_unavailable":
      return { status: "forbidden" };
    case "platform":
      if (ctx.profile.must_change_password) return { status: "forbidden" };
      return { status: "ok", viewer: { profileId: ctx.profile.id, role: "super_admin", schoolId: null, schoolName: null, firstName: ctx.profile.first_name } };
    case "ok":
      if (ctx.profile.must_change_password) return { status: "forbidden" };
      // The assistant has no finance tools; finance officers don't get it.
      if (ctx.profile.role === "finance_officer" || ctx.profile.role === "admissions_officer") return { status: "forbidden" };
      return {
        status: "ok",
        viewer: {
          profileId: ctx.profile.id,
          role: ctx.profile.role as ViewerRole,
          schoolId: ctx.school.id,
          schoolName: ctx.school.name,
          firstName: ctx.profile.first_name,
        },
      };
  }
}

/** Counted toward limits: requests that reached the provider. */
const COUNTED = ["ok", "error"];

export function createUsageStore(): UsageStore | null {
  const admin = createAdminClient();
  if (!admin) return null;

  async function count(filter: { profileId?: string; schoolId?: string }, sinceMs: number): Promise<number> {
    let query = admin!
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .in("status", COUNTED)
      .gte("created_at", new Date(sinceMs).toISOString());
    if (filter.profileId) query = query.eq("profile_id", filter.profileId);
    if (filter.schoolId) query = query.eq("school_id", filter.schoolId);
    const { count: n, error } = await query;
    if (error) throw new Error(`usage count failed (${error.code})`);
    return n ?? 0;
  }

  return {
    async counts(viewer: Viewer, now: number): Promise<UsageCounts> {
      const [userLastMinute, userLastDay, schoolLastDay] = await Promise.all([
        count({ profileId: viewer.profileId }, now - 60_000),
        count({ profileId: viewer.profileId }, now - 86_400_000),
        viewer.schoolId ? count({ schoolId: viewer.schoolId }, now - 86_400_000) : Promise.resolve(null),
      ]);
      return { userLastMinute, userLastDay, schoolLastDay };
    },
    async record(e: UsageEvent): Promise<void> {
      const { error } = await admin!.from("ai_usage_events").insert({
        profile_id: e.viewer.profileId,
        school_id: e.viewer.schoolId,
        role: e.viewer.role,
        kind: e.kind,
        provider: e.provider.slice(0, 40),
        model: e.model.slice(0, 80),
        status: e.status,
        error_code: e.errorCode?.slice(0, 40) ?? null,
        input_tokens: Math.max(0, Math.round(e.inputTokens)),
        output_tokens: Math.max(0, Math.round(e.outputTokens)),
        tool_calls: e.toolCalls,
        tool_names: (e.toolNames ?? []).slice(0, 20),
        duration_ms: Math.max(0, Math.round(e.durationMs)),
      });
      if (error) throw new Error(`usage record failed (${error.code})`);
    },
  };
}

export function chatDeps(): ChatDeps {
  const config = getAiConfig();
  return {
    getViewer: getAiViewer,
    getProvider: () => createAiProvider(config),
    usage: config.enabled ? createUsageStore() : null,
    limits: config.limits,
    maxOutputTokens: config.maxOutputTokens,
    // Data tools read with the signed-in person's own session (RLS applies);
    // each tool also checks the person's role and scope itself.
    getTools: (viewer) => createToolBox(viewer, createEduCoreData(viewer.schoolId)),
  };
}
