"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, landingPathFor, requireUser } from "@/services/auth";

export interface ChangePasswordState {
  formError?: string;
  fieldErrors?: { password?: string; confirm?: string };
}

export async function changePassword(_prev: ChangePasswordState, formData: FormData): Promise<ChangePasswordState> {
  await requireUser("/change-password");
  const context = await getAuthContext();
  if (context.status !== "ok" && context.status !== "platform") redirect("/account");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const fieldErrors: ChangePasswordState["fieldErrors"] = {};
  if (password.length < 8) fieldErrors.password = "Use at least 8 characters.";
  else if (password.length > 72) fieldErrors.password = "Use 72 characters or fewer.";
  else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    fieldErrors.password = "Include at least one letter and one number.";
  }
  if (!fieldErrors.password && confirm !== password) fieldErrors.confirm = "The two passwords don’t match.";
  if (fieldErrors.password || fieldErrors.confirm) return { fieldErrors };

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      if (error.code === "same_password") {
        return { fieldErrors: { password: "Choose a password different from your temporary one." } };
      }
      if (error.code === "weak_password") {
        return { fieldErrors: { password: "That password is too easy to guess. Try a longer one." } };
      }
      console.error("[auth] password update failed", error.code ?? error.status);
      return { formError: "Your password couldn’t be changed. Please try again." };
    }

    if (context.profile.must_change_password) {
      // Clearing the flag is a server-side, privileged step: browser roles
      // cannot write this column, so a user can't skip the forced change.
      const admin = createAdminClient();
      if (!admin) return { formError: "Your password was changed, but the server isn’t fully configured. Contact your administrator." };
      const { error: flagError } = await admin
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", context.profile.id);
      if (flagError) {
        console.error("[auth] clearing password flag failed", flagError.code);
        return { formError: "Your password was changed, but we couldn’t finish setting up your account. Please try again." };
      }
    }
  } catch (error) {
    console.error("[auth] change password threw", error instanceof Error ? error.name : "unknown");
    return { formError: "We couldn’t reach the server. Check your connection and try again." };
  }

  redirect(`${landingPathFor(context)}?password=changed`);
}
