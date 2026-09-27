"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { zonedLocalToIso, type Audience } from "@/lib/announcements";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireSchoolMember } from "@/services/auth";
import { getSchoolProfile } from "@/services/school";

/**
 * Announcements. RLS decides who may post to which audience (admins: any;
 * teachers: a class they teach) and who may edit (author or admin).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUDIENCES = new Set<Audience>(["everyone", "staff", "students", "parents", "class"]);

export interface AnnouncementFormState extends ActionState {
  values?: Record<string, string>;
}

async function parse(formData: FormData, schoolId: string) {
  const values = Object.fromEntries(
    ["title", "body", "audience", "class_id", "publish_at", "expires_on", "pinned"].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const title = values.title.trim().replace(/\s+/g, " ");
  const body = values.body.trim();
  const audience = values.audience as Audience;
  const classId = audience === "class" ? values.class_id : "";
  if (title.length < 3 || title.length > 120) return { error: "Give the announcement a title (3–120 characters).", values };
  if (!body || body.length > 5000) return { error: "Write the message (up to 5,000 characters).", values };
  if (!AUDIENCES.has(audience)) return { error: "Choose who should see it.", values };
  if (audience === "class" && !UUID.test(classId)) return { error: "Choose the class.", values };

  const school = await getSchoolProfile(schoolId);
  const tz = school?.timezone ?? "Africa/Monrovia";
  let publishAt: string | null = null;
  if (values.publish_at) {
    publishAt = zonedLocalToIso(values.publish_at, tz);
    if (!publishAt) return { error: "Enter a valid publish date and time.", values };
  }
  const expires = values.expires_on && /^\d{4}-\d{2}-\d{2}$/.test(values.expires_on) ? values.expires_on : null;
  if (values.expires_on && !expires) return { error: "Enter a valid expiry date.", values };

  return {
    row: {
      title,
      body,
      audience,
      class_id: classId || null,
      pinned: values.pinned === "on",
      expires_on: expires,
      ...(publishAt ? { publish_at: publishAt } : {}),
    },
    values,
  };
}

export async function createAnnouncement(_prev: AnnouncementFormState, formData: FormData): Promise<AnnouncementFormState> {
  const { school, profile } = await requireCapability("grades.enter", "/announcements");
  const parsed = await parse(formData, school.id);
  if ("error" in parsed) return { status: "error", message: parsed.error, values: parsed.values };
  if (profile.role !== "school_admin") parsed.row.pinned = false;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .insert({ school_id: school.id, ...parsed.row })
    .select("id")
    .single();
  if (error?.code === "42501") {
    return { status: "error", message: "Teachers can post only to a class they teach.", values: parsed.values };
  }
  if (error || !data) return { status: "error", message: friendlyDbError(error, "The announcement couldn’t be posted."), values: parsed.values };
  revalidatePath("/", "layout");
  redirect(`/announcements/${data.id}?posted=1`);
}

export async function updateAnnouncement(_prev: AnnouncementFormState, formData: FormData): Promise<AnnouncementFormState> {
  const { school, profile } = await requireCapability("grades.enter", "/announcements");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { status: "error", message: "That announcement wasn’t found." };
  const parsed = await parse(formData, school.id);
  if ("error" in parsed) return { status: "error", message: parsed.error, values: parsed.values };
  if (profile.role !== "school_admin") parsed.row.pinned = false;

  const supabase = await createClient();
  const { data, error } = await supabase.from("announcements").update(parsed.row).eq("id", id).eq("school_id", school.id).select("id");
  if (error?.code === "42501") return { status: "error", message: "Teachers can post only to a class they teach.", values: parsed.values };
  if (error || !data?.length) return { status: "error", message: friendlyDbError(error, "The announcement couldn’t be saved."), values: parsed.values };
  revalidatePath("/", "layout");
  redirect(`/announcements/${id}?saved=1`);
}

export async function deleteAnnouncement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { school } = await requireCapability("grades.enter", "/announcements");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { status: "error", message: "That announcement wasn’t found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("announcements").delete().eq("id", id).eq("school_id", school.id).select("id");
  if (error || !data?.length) return { status: "error", message: friendlyDbError(error, "The announcement couldn’t be deleted.") };
  revalidatePath("/", "layout");
  redirect("/announcements?deleted=1");
}

/** Record that the caller has read an announcement (idempotent). */
export async function markAnnouncementRead(id: string): Promise<void> {
  const { school, profile } = await requireSchoolMember("/announcements");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase
    .from("announcement_reads")
    .upsert({ school_id: school.id, announcement_id: id, profile_id: profile.id }, { onConflict: "announcement_id,profile_id", ignoreDuplicates: true });
  revalidatePath("/", "layout");
}
