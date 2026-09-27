import "server-only";

import { parseCsv } from "@/lib/csv";
import { MemberError, createMember, existingUsernames, validateNewMember, type MemberRole, type NewMemberInput } from "./members";

export const IMPORT_MAX_ROWS = 100;
export const IMPORT_MAX_BYTES = 200_000;

export const IMPORT_COLUMNS = ["first_name", "middle_name", "last_name", "role", "username", "email", "phone"] as const;

const ROLE_ALIASES: Record<string, MemberRole> = {
  student: "student",
  students: "student",
  pupil: "student",
  teacher: "teacher",
  teachers: "teacher",
  staff: "teacher",
  parent: "parent",
  parents: "parent",
  guardian: "parent",
  admin: "school_admin",
  administrator: "school_admin",
  school_admin: "school_admin",
};

export interface ImportRow {
  line: number;
  input: NewMemberInput;
  errors: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  fileError?: string;
}

function normaliseHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^firstname$/, "first_name").replace(/^lastname$/, "last_name")
    .replace(/^middlename$/, "middle_name").replace(/^surname$/, "last_name").replace(/^e_?mail$/, "email");
}

/** Parse + validate a CSV file. Never creates anything. */
export async function previewImport(
  school: { id: string },
  csvText: string,
  parentsAllowed: boolean,
): Promise<ImportPreview> {
  if (csvText.length > IMPORT_MAX_BYTES) return { rows: [], fileError: "The file is too large. Split it into smaller files." };

  const table = parseCsv(csvText);
  if (table.length < 2) return { rows: [], fileError: "The file has no data rows. The first row must be the column headings." };

  const headers = table[0].map(normaliseHeader);
  const col = (name: string) => headers.indexOf(name);
  const missing = ["first_name", "last_name", "role"].filter((c) => col(c) === -1);
  if (missing.length) {
    return { rows: [], fileError: `Missing required column(s): ${missing.join(", ")}. Download the template to see the expected headings.` };
  }
  if (col("username") === -1 && col("email") === -1) {
    return { rows: [], fileError: "Add a “username” column, an “email” column, or both." };
  }

  const body = table.slice(1);
  if (body.length > IMPORT_MAX_ROWS) {
    return { rows: [], fileError: `Import up to ${IMPORT_MAX_ROWS} people at a time. This file has ${body.length}.` };
  }

  const get = (cells: string[], name: string) => (col(name) === -1 ? "" : (cells[col(name)] ?? "").trim());
  const rows: ImportRow[] = body.map((cells, i) => {
    const roleRaw = get(cells, "role").toLowerCase();
    const input: NewMemberInput = {
      firstName: get(cells, "first_name"),
      middleName: get(cells, "middle_name"),
      lastName: get(cells, "last_name"),
      role: ROLE_ALIASES[roleRaw] ?? (roleRaw as MemberRole),
      username: get(cells, "username").toLowerCase(),
      email: get(cells, "email").toLowerCase(),
      phone: get(cells, "phone"),
    };
    const errors: string[] = [];
    try {
      Object.assign(input, validateNewMember(input));
    } catch (e) {
      errors.push(e instanceof MemberError ? e.message : "Invalid row.");
    }
    if (input.role === "parent" && !parentsAllowed) errors.push("Parent accounts are turned off for this school.");
    return { line: i + 2, input, errors };
  });

  // Duplicates inside the file.
  const seenU = new Map<string, number>();
  const seenE = new Map<string, number>();
  for (const r of rows) {
    const u = r.input.username;
    const e = r.input.email;
    if (u) {
      if (seenU.has(u)) r.errors.push(`Username “${u}” is also used on line ${seenU.get(u)}.`);
      else seenU.set(u, r.line);
    }
    if (e) {
      if (seenE.has(e)) r.errors.push(`Email is also used on line ${seenE.get(e)}.`);
      else seenE.set(e, r.line);
    }
  }

  // Usernames already taken at the school.
  const taken = await existingUsernames(school.id, [...seenU.keys()]);
  for (const r of rows) {
    if (r.input.username && taken.has(r.input.username)) r.errors.push(`Username “${r.input.username}” already exists at this school.`);
  }

  return { rows };
}

export interface ImportResult {
  line: number;
  fullName: string;
  role: MemberRole;
  loginId?: string;
  temporaryPassword?: string;
  error?: string;
}

/** Create accounts for already-validated rows, a few at a time. */
export async function runImport(school: { id: string; code: string }, inputs: { line: number; input: NewMemberInput }[]) {
  const results: ImportResult[] = [];
  const queue = [...inputs];
  const CONCURRENCY = 4;

  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const name = [item.input.firstName, item.input.middleName, item.input.lastName].filter(Boolean).join(" ");
      try {
        const created = await createMember(school, item.input);
        results.push({ line: item.line, fullName: created.fullName, role: created.role, loginId: created.loginId, temporaryPassword: created.temporaryPassword });
      } catch (e) {
        results.push({ line: item.line, fullName: name, role: item.input.role, error: e instanceof MemberError ? e.message : "Couldn’t create this account." });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return results.sort((a, b) => a.line - b.line);
}
