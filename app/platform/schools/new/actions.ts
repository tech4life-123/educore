"use server";

import { revalidatePath } from "next/cache";
import { getSchoolDomainBase } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/services/auth";
import { MemberError, createMember, type CreatedMember } from "@/services/members";
import type { Enums } from "@/types/database";

export interface CreateSchoolState {
  formError?: string;
  fieldErrors?: Partial<Record<"name" | "code" | "slug" | "primaryColor" | "adminUsername" | "adminEmail", string>>;
  values?: Record<string, string>;
  created?: { schoolName: string; schoolCode: string; admin?: CreatedMember; adminError?: string; address?: string };
}

const SCHOOL_TYPES = new Set(["high_school", "junior_high", "elementary", "university", "college", "vocational", "other"]);

export async function createSchoolAction(_prev: CreateSchoolState, formData: FormData): Promise<CreateSchoolState> {
  await requireSuperAdmin();

  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const values = {
    name: f("name"),
    code: f("code").toUpperCase(),
    slug: f("slug").toLowerCase(),
    schoolType: f("schoolType"),
    motto: f("motto"),
    city: f("city"),
    county: f("county"),
    primaryColor: f("primaryColor"),
    adminFirstName: f("adminFirstName"),
    adminLastName: f("adminLastName"),
    adminUsername: f("adminUsername").toLowerCase(),
    adminEmail: f("adminEmail").toLowerCase(),
  };

  const fieldErrors: CreateSchoolState["fieldErrors"] = {};
  if (values.name.length < 2 || values.name.length > 200) fieldErrors.name = "Enter the school’s name.";
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(values.code)) fieldErrors.code = "2–20 capital letters, numbers or dashes, e.g. SPHS-01.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(values.slug) || values.slug.length > 63) {
    fieldErrors.slug = "Lower-case letters, numbers and single dashes, e.g. st-peters-high.";
  }
  if (values.primaryColor && !/^#[0-9A-Fa-f]{6}$/.test(values.primaryColor)) fieldErrors.primaryColor = "Use a colour like #1E3A8A.";
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };
  if (!values.adminFirstName || !values.adminLastName || (!values.adminUsername && !values.adminEmail)) {
    return { formError: "Enter the first administrator’s name and a username or email.", values };
  }

  const supabase = await createClient();
  const { data: schoolId, error } = await supabase.rpc("platform_create_school", {
    p_name: values.name,
    p_code: values.code,
    p_slug: values.slug,
    p_school_type: (SCHOOL_TYPES.has(values.schoolType) ? values.schoolType : "high_school") as Enums<"school_type">,
    p_motto: values.motto,
    p_city: values.city,
    p_county: values.county,
    p_country: "Liberia",
    p_primary_color: values.primaryColor,
  });

  if (error || !schoolId) {
    if (error?.code === "23505") {
      const which = error.message.includes("slug") ? "slug" : "code";
      return { fieldErrors: { [which]: `That ${which} is already used by another school.` }, values };
    }
    if (error?.code === "42501") return { formError: "Only platform administrators can create schools.", values };
    console.error("[platform] create school failed", error?.code);
    return { formError: "The school couldn’t be created. Check the details and try again.", values };
  }

  revalidatePath("/platform");

  // Give the school its own address (<slug>.<base>) when the platform has a base
  // domain configured. A failure never undoes the school; the Domains page can retry.
  let address: string | undefined;
  const base = getSchoolDomainBase();
  if (base) {
    const { data: domain, error: domainError } = await supabase.rpc("platform_provision_subdomain", { p_school_id: schoolId, p_base: base });
    if (domainError) console.error("[platform] subdomain provisioning failed", domainError.code);
    else address = domain ?? undefined;
  }

  try {
    const admin = await createMember(
      { id: schoolId, code: values.code },
      {
        firstName: values.adminFirstName,
        lastName: values.adminLastName,
        role: "school_admin",
        username: values.adminUsername,
        email: values.adminEmail,
      },
    );
    return { created: { schoolName: values.name, schoolCode: values.code, admin, address } };
  } catch (e) {
    return {
      created: {
        schoolName: values.name,
        schoolCode: values.code,
        address,
        adminError: e instanceof MemberError ? e.message : "The administrator account couldn’t be created.",
      },
    };
  }
}
