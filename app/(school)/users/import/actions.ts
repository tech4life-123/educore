"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/services/auth";
import { getSchoolSettings } from "@/services/school";
import {
  IMPORT_MAX_BYTES,
  previewImport,
  runImport,
  type ImportResult,
  type ImportRow,
} from "@/services/member-import";

export interface ImportState {
  step: "upload" | "preview" | "done";
  error?: string;
  csvText?: string;
  fileName?: string;
  rows?: ImportRow[];
  results?: ImportResult[];
}

async function loadContext() {
  const { school } = await requireCapability("users.manage", "/users/import");
  const settings = await getSchoolSettings(school.id);
  return { school, parentsAllowed: settings?.allow_parent_accounts ?? false };
}

export async function importAction(prev: ImportState, formData: FormData): Promise<ImportState> {
  const { school, parentsAllowed } = await loadContext();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "reset") return { step: "upload" };

  if (intent === "preview") {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { step: "upload", error: "Choose a CSV file to upload." };
    if (file.size > IMPORT_MAX_BYTES) return { step: "upload", error: "The file is too large. Split it into smaller files." };
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      return { step: "upload", error: "Upload a .csv file. In Excel: File → Save As → “CSV UTF-8 (Comma delimited)”." };
    }
    const csvText = await file.text();
    const preview = await previewImport(school, csvText, parentsAllowed);
    if (preview.fileError) return { step: "upload", error: preview.fileError };
    return { step: "preview", csvText, fileName: file.name, rows: preview.rows };
  }

  if (intent === "confirm") {
    // Re-parse and re-validate on the server: never trust rows sent back by the browser.
    const csvText = String(formData.get("csvText") ?? "");
    const preview = await previewImport(school, csvText, parentsAllowed);
    if (preview.fileError) return { step: "upload", error: preview.fileError };
    const valid = preview.rows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) return { step: "preview", csvText, rows: preview.rows, fileName: prev.fileName, error: "There are no valid rows to import." };

    const results = await runImport({ id: school.id, code: school.code }, valid);
    revalidatePath("/users");
    return { step: "done", results, fileName: prev.fileName };
  }

  return { step: "upload" };
}
