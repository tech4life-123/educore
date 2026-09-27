"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/services/auth";

/**
 * School administration actions. Every one of them:
 *   1. re-checks the caller server-side (requireCapability "school.manage"),
 *   2. validates input against the same rules as the database constraints,
 *   3. writes through the caller's own RLS-bound session — never the service
 *      role — so the database independently limits the write to the caller's
 *      own school and to the columns school admins may change.
 */

export interface SchoolFormState {
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
  /** Submitted values, echoed back on validation errors so the form keeps them. */
  values?: Record<string, string>;
}

const HEX = /^#[0-9a-f]{6}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function unreachable(): SchoolFormState {
  return {
    status: "error",
    message: "We couldn’t reach the server. Check your connection and try again.",
  };
}

// ---------------------------------------------------------------------------
// School profile & brand colours
// ---------------------------------------------------------------------------

export async function updateSchoolProfile(_prev: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  const { school } = await requireCapability("school.manage", "/settings");

  const v = {
    name: text(formData, "name"),
    motto: text(formData, "motto"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    county: text(formData, "county"),
    phone: text(formData, "phone"),
    email: text(formData, "email").toLowerCase(),
    website: text(formData, "website"),
    primary_color: text(formData, "primary_color").toLowerCase(),
    secondary_color: text(formData, "secondary_color").toLowerCase(),
  };

  const e: Record<string, string> = {};
  if (v.name.length < 2 || v.name.length > 200) e.name = "Enter the school name (2–200 characters).";
  if (v.motto.length > 300) e.motto = "Use 300 characters or fewer.";
  if (v.address.length > 500) e.address = "Use 500 characters or fewer.";
  if (v.city.length > 100) e.city = "Use 100 characters or fewer.";
  if (v.county.length > 100) e.county = "Use 100 characters or fewer.";
  if (v.phone && !PHONE.test(v.phone)) e.phone = "Enter a valid phone number, e.g. +231 77 000 0000.";
  if (v.email && (!EMAIL.test(v.email) || v.email.length > 254)) e.email = "Enter a valid email address.";
  if (v.website) {
    if (!/^https?:\/\//i.test(v.website)) v.website = `https://${v.website}`;
    try {
      const url = new URL(v.website);
      if (!url.hostname.includes(".") || v.website.length > 300) throw new Error();
    } catch {
      e.website = "Enter a valid web address, e.g. https://myschool.edu.lr.";
    }
  }
  if (!HEX.test(v.primary_color)) e.primary_color = "Choose a colour.";
  if (v.secondary_color && !HEX.test(v.secondary_color)) e.secondary_color = "Choose a colour.";

  if (Object.keys(e).length > 0) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: e,
      values: v,
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("schools")
      .update({
        name: v.name,
        motto: v.motto || null,
        address: v.address || null,
        city: v.city || null,
        county: v.county || null,
        phone: v.phone || null,
        email: v.email || null,
        website: v.website || null,
        primary_color: v.primary_color,
        secondary_color: v.secondary_color || null,
      })
      .eq("id", school.id)
      .select("id");

    if (error || !data || data.length !== 1) {
      console.error("[settings] school update failed", error?.code ?? "no-row");
      return {
        status: "error",
        message: "The school details couldn’t be saved. Please try again.",
      };
    }
  } catch {
    return unreachable();
  }

  revalidatePath("/", "layout");
  return {
    status: "success",
    message: "School details saved. The new branding is live for everyone in your school.",
  };
}

// ---------------------------------------------------------------------------
// Academic configuration
// ---------------------------------------------------------------------------

const ACADEMIC_SYSTEMS = ["semester", "trimester", "quarter", "term"] as const;

function percent(raw: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 0 && n <= 100 ? n : null;
}

export async function updateAcademicSettings(_prev: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  const { school } = await requireCapability("school.manage", "/settings");

  const system = text(formData, "academic_system");
  const passing = percent(text(formData, "passing_score"));
  const attendance = percent(text(formData, "attendance_threshold"));
  const allowParents = formData.get("allow_parent_accounts") === "on";

  const e: Record<string, string> = {};
  if (!(ACADEMIC_SYSTEMS as readonly string[]).includes(system)) e.academic_system = "Choose an academic system.";
  if (passing === null) e.passing_score = "Enter a number from 0 to 100.";
  if (attendance === null) e.attendance_threshold = "Enter a number from 0 to 100.";
  if (Object.keys(e).length > 0) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: e,
      values: {
        academic_system: system,
        passing_score: text(formData, "passing_score"),
        attendance_threshold: text(formData, "attendance_threshold"),
        allow_parent_accounts: allowParents ? "on" : "",
      },
    };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("school_settings")
      .update({
        academic_system: system as (typeof ACADEMIC_SYSTEMS)[number],
        passing_score: passing!,
        attendance_threshold: attendance!,
        allow_parent_accounts: allowParents,
      })
      .eq("school_id", school.id)
      .select("id");

    if (error || !data || data.length !== 1) {
      console.error("[settings] academic settings update failed", error?.code ?? "no-row");
      return {
        status: "error",
        message: "The academic settings couldn’t be saved. Please try again.",
      };
    }
  } catch {
    return unreachable();
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "Academic settings saved." };
}

// ---------------------------------------------------------------------------
// Logo
// ---------------------------------------------------------------------------

const BUCKET = "school-logos";
const MAX_LOGO_BYTES = 1024 * 1024;

/** Identify the image by its first bytes — never trust the browser's type or file name. */
function sniffImage(bytes: Uint8Array): { ext: "png" | "jpg" | "webp"; type: string } | null {
  const b = bytes;
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { ext: "png", type: "image/png" };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (
    b.length > 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP"
  ) {
    return { ext: "webp", type: "image/webp" };
  }
  return null;
}

/** Path of an object in our logo bucket inside this school's folder, or null. */
function ownLogoPath(url: string | null, schoolId: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path.startsWith(`${schoolId}/`) && !path.includes("..") ? path : null;
}

export async function uploadSchoolLogo(_prev: SchoolFormState, formData: FormData): Promise<SchoolFormState> {
  const { school } = await requireCapability("school.manage", "/settings");

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return {
      status: "error",
      message: "Choose an image file first.",
      fieldErrors: { logo: "Choose an image file." },
    };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return {
      status: "error",
      message: "That image is larger than 1 MB.",
      fieldErrors: { logo: "Use an image under 1 MB." },
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) {
    return {
      status: "error",
      message: "Only PNG, JPEG or WebP images can be used as a logo.",
      fieldErrors: { logo: "Use a PNG, JPEG or WebP image." },
    };
  }

  const path = `${school.id}/logo-${Date.now()}.${kind.ext}`;

  try {
    const supabase = await createClient();

    // Current logo (to clean up afterwards). RLS: own school only.
    const { data: current } = await supabase.from("schools").select("logo_url").eq("id", school.id).maybeSingle();

    // Storage policies allow this only for a school admin writing into their own school's folder.
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: kind.type,
      upsert: false,
      cacheControl: "31536000",
    });
    if (uploadError) {
      console.error("[settings] logo upload failed", uploadError.name);
      return {
        status: "error",
        message: "The logo couldn’t be uploaded. Please try again.",
      };
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { data, error } = await supabase
      .from("schools")
      .update({ logo_url: publicUrl })
      .eq("id", school.id)
      .select("id");

    if (error || !data || data.length !== 1) {
      console.error("[settings] logo_url update failed", error?.code ?? "no-row");
      await supabase.storage.from(BUCKET).remove([path]);
      return {
        status: "error",
        message: "The logo couldn’t be saved. Please try again.",
      };
    }

    const oldPath = ownLogoPath(current?.logo_url ?? null, school.id);
    if (oldPath && oldPath !== path) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (removeError) console.warn("[settings] old logo cleanup failed", removeError.name);
    }
  } catch {
    return unreachable();
  }

  revalidatePath("/", "layout");
  return { status: "success", message: "New logo saved." };
}

// Called through useActionState; the previous state and form data are not needed.
export async function removeSchoolLogo(): Promise<SchoolFormState> {
  const { school } = await requireCapability("school.manage", "/settings");

  try {
    const supabase = await createClient();
    const { data: current } = await supabase.from("schools").select("logo_url").eq("id", school.id).maybeSingle();

    const { data, error } = await supabase.from("schools").update({ logo_url: null }).eq("id", school.id).select("id");
    if (error || !data || data.length !== 1) {
      console.error("[settings] logo removal failed", error?.code ?? "no-row");
      return {
        status: "error",
        message: "The logo couldn’t be removed. Please try again.",
      };
    }

    const oldPath = ownLogoPath(current?.logo_url ?? null, school.id);
    if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  } catch {
    return unreachable();
  }

  revalidatePath("/", "layout");
  return {
    status: "success",
    message: "Logo removed. Your school’s initials are shown instead.",
  };
}
