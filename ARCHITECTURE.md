# EduCore Architecture

This document records the foundation's architectural and security decisions. When something here changes, update this file in the same pull request.

## 1. Multi-tenancy

**Model:** shared database, shared schema, tenant column. Every school-owned row carries `school_id → schools.id`. One deployment serves all schools; there is no per-school code or configuration in the source.

**Why:** simplest model to operate on Supabase, cheapest per school, and isolation is enforced by PostgreSQL itself (RLS), not by application discipline.

**Rule for every new table:** add `school_id uuid not null references schools(id) on delete restrict`, enable + force RLS, write policies using `private.current_school_id()`, index `school_id`, and add a case to `supabase/tests/tenant_isolation.sql`. Exceptions must be documented here. Current exceptions:

| Table | Why no/nullable `school_id` |
| --- | --- |
| `schools` | It *is* the tenant; scoped by `id`. |
| `profiles` | Nullable only for `super_admin` (platform operators belong to no school). Enforced by `profiles_role_scope` check. |
| `audit_logs` | Nullable for platform-level events (e.g. changes to a super-admin profile). |

**Membership:** one profile per auth user (`profiles.user_id` unique), so a person belongs to one school. A future need (e.g. a parent with children at two schools) should be met with a membership table rather than relaxing this constraint silently.

## 2. Database structure

```text
auth.users (Supabase Auth — credentials)
    │ 1:1  (profiles.user_id, ON DELETE RESTRICT)
    ▼
profiles ──(school_id, RESTRICT)──► schools ◄──(school_id, RESTRICT, unique)── school_settings
                                        ▲
audit_logs ──(school_id, RESTRICT)──────┘   (user_id intentionally not an FK)
```

| Table | Notes |
| --- | --- |
| `schools` | Unique `code` (upper-case) and `slug`; `school_type`, `status` enums; hex-colour, https-URL, email and IANA time-zone validation. Default country Liberia, currency LRD, time zone Africa/Monrovia. |
| `school_settings` | Exactly one row per school, created automatically by trigger. Passing score / attendance threshold constrained to 0–100. |
| `profiles` | Name, phone, photo, `role` (enum), `status` (`invited`/`active`/`suspended`/`inactive`). No password fields. |
| `audit_logs` | Append-only (UPDATE/DELETE raise). `action` = `<table>.<op>`, `old_data`/`new_data` JSONB. |

**Deletion policy:** every FK is `ON DELETE RESTRICT`. Schools are retired via `status = 'archived'`, users via profile `status`. Deleting a school that has any history fails — deliberately — so academic records cannot be destroyed by accident.

**Enums** (`app_role`, `school_status`, `school_type`, `profile_status`, `academic_system`) keep values strongly constrained and flow into generated TypeScript types.

## 3. Authentication

- Supabase Auth (email/password) owns credentials and sessions. Public sign-up should be disabled; users are provisioned (see README).
- `@supabase/ssr` stores the session in cookies. `proxy.ts` runs on every request, calls `auth.getClaims()` (JWT verification + refresh) and forwards refreshed cookies plus the library's no-cache headers.
- Server code establishes identity with `auth.getUser()` (validated against the Auth server) inside `services/auth.ts#getAuthContext`, memoised per request with React `cache`.
- `getAuthContext` returns a discriminated union — `unauthenticated | not_configured | error | no_profile | profile_inactive | school_unavailable | platform | ok` — so every state has an explicit UI path and nothing crashes on missing data.

## 4. Authorization

Three independent layers; each would still hold if the one above it failed.

| Layer | Where | What it does |
| --- | --- | --- |
| 1. Proxy | `proxy.ts` | Optimistic: signed-out requests to protected prefixes (`/dashboard`, `/platform`, `/settings`, `/account`, `/users`, `/academics`, `/classes`, `/change-password`) → `/login?next=…`. Not trusted for authorization. |
| 2. Server guards | `services/auth.ts` | `requireSchoolMember`, `requireSuperAdmin`, `requireCapability` called in layouts **and** pages/actions (layouts don't re-run on client navigation). |
| 3. Database | RLS + privileges | Final authority. Applies to every query made with a user session, from any client. |

Capabilities (`lib/auth/roles.ts`) map roles to actions for UI/guards; the database encodes the same rules independently. Navigation visibility is cosmetic only.

## 5. Row Level Security

Helper functions live in the **`private` schema**, which PostgREST does not expose, and are `SECURITY DEFINER` with `search_path = ''`:

- `private.current_school_id()` → the caller's school **only if** their profile is `active` and the school is `active`; otherwise `NULL` (which matches no rows). Suspending a school or user therefore cuts off data access immediately.
- `private.current_app_role()` → the caller's role if their profile is active.

They are `SECURITY DEFINER` so they can read `profiles` without recursing into profiles' own policies; they only ever return facts about the caller (`auth.uid()`).

| Table | SELECT | UPDATE | INSERT / DELETE |
| --- | --- | --- | --- |
| `schools` | own school | school_admin, own school, branding/contact columns only (not `code`, `slug`, `school_type`, `status`) | none |
| `school_settings` | own school | school_admin, own school | none |
| `profiles` | own row; school_admin & teacher see profiles in own school | own row; columns `first_name`, `middle_name`, `last_name`, `phone`, `photo_url` only | none |
| `audit_logs` | school_admin, own school | none (append-only trigger) | none (written by definer triggers) |

Additional hardening: RLS is **forced** (applies to the table owner too); `anon` has no table privileges at all; a trigger rejects any change to `role`, `school_id`, `user_id` or `status` from a browser-role session even if a future grant is too broad; Supabase's default "every new public function is executable by anon/authenticated" grant is revoked.

Policies wrap `auth.uid()` and helper calls in `(select …)` so Postgres evaluates them once per statement rather than per row.

## 6. Role model

| Role | Scope | Lands on |
| --- | --- | --- |
| `super_admin` | Platform; `school_id IS NULL` | `/platform` |
| `school_admin` | One school | `/dashboard` |
| `teacher` | One school | `/dashboard` |
| `student` | One school | `/dashboard` |
| `parent` | One school | `/dashboard` |

Roles are assigned only by privileged server-side paths (today: the SQL snippet run by an operator). No browser-reachable path can create a profile or change a role — verified by tests E1–E5.

<a id="super-admin"></a>
## 7. Super Admin

A naive design (`role = 'super_admin'` → RLS grants everything) would hand every table to any browser holding a super admin's token, including via the public REST API. EduCore does not do that:

1. **No RLS privileges.** Under RLS a super admin sees only their own profile (tests S1, S2).
2. **Server-side verification.** `/platform` pages call `requireSuperAdmin()`, which validates the session with Supabase Auth and reads the caller's own profile under RLS; it must be `active` with `role = 'super_admin'`.
3. **Privileged, server-only query.** Only after that check does `services/platform.ts` use `createAdminClient()` (service-role key) to run a specific, read-only cross-tenant query. The result is rendered to HTML on the server; the key and raw client never reach the browser.
4. **Key isolation.** `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix (never inlined into client bundles) and `lib/supabase/admin.ts` imports `server-only`, so the build fails if any Client Component imports it (verified).

Platform write operations follow the same pattern: Server Action → `requireSuperAdmin()` → validated input → authorization again inside the database (a SECURITY DEFINER function that checks `current_app_role() = 'super_admin'` first) → narrowly scoped change → audit entry. See section 16 for the milestone 9 tools.

## 8. Server / client boundaries

| Module | Runs | Credentials | RLS |
| --- | --- | --- | --- |
| `lib/supabase/client.ts` | Browser | Publishable key + user session | Enforced |
| `lib/supabase/server.ts` | Server (`server-only`) | Publishable key + user session cookies | Enforced |
| `lib/supabase/proxy.ts` | Proxy | Publishable key + cookies | n/a (session refresh only) |
| `lib/supabase/admin.ts` | Server (`server-only`) | **Service role** | **Bypassed** — use only after an explicit guard |
| `services/*` | Server (`server-only`) | via the above | — |

Client Components receive only the display data they need (names, school branding) as props. Pages are dynamically rendered because they read cookies; nothing user-specific is statically cached.

## 9. User management (milestone 2)

**Login identities.** People sign in with a real email *or* a school-issued username written as `username@SCHOOLCODE` (e.g. `stu0042@PILOT-01`). Supabase Auth needs an email, so username accounts are stored in Auth as `username@schoolcode.educore.invalid`. `.invalid` is a reserved TLD (RFC 2606) that can never receive mail. The login form tells the two apart by whether the part after `@` contains a dot (`lib/auth/login-id.ts`).

**Temporary passwords.** Admins never choose passwords. The server generates a 10-character one-time password (CSPRNG, no look-alike characters), shows it once, and sets `profiles.must_change_password`. Every protected route (`requireSchoolMember` / `requireSuperAdmin`) redirects flagged users to `/change-password`. Only the server (service role) can clear the flag, and only after `auth.updateUser` succeeds, so users can't skip the change.

**Authorization lives in the database.** Each privileged operation runs in two steps:

| Operation | 1. DB authorizes (caller's own session) | 2. Server applies in Auth (service role) |
| --- | --- | --- |
| Create user | `create_member()`: caller is school_admin of *that* school, or super_admin; no super_admin role; parents only if enabled | `auth.admin.createUser` (done first, deleted again if step 1 refuses) |
| Suspend / reactivate | `set_member_status()`: same-school target, not self, not a super admin | `ban_duration` 876000h / none |
| Reset password | `require_password_change()`: same rules | `auth.admin.updateUserById({ password })` |
| Create school | `platform_create_school()`: super_admin only | — |

These functions are `SECURITY DEFINER` with an empty `search_path`, and they derive the caller's school from the caller's own profile. Supabase's linter flags them as "callable by signed-in users". That is intentional, because each one enforces its own authorization (tests in `supabase/tests/user_management.sql`). Profile changes they make are audited by the existing trigger, with the acting admin as `user_id`.

**Bulk import.** CSV only (no spreadsheet library), up to 100 rows / 200 KB. Step 1 validates without creating anything. On confirm, the server re-parses and re-validates the original file rather than trusting rows sent back by the browser. Accounts are then created 4 at a time, and the credentials sheet is built in the browser for download or printing; it is never stored. CSV output escapes formula-injection characters.

## 10. Branding & academic structure (milestone 3)

**Branding.** School admins edit the school profile, colours and academic settings from `/settings` using their own session; the existing column grants decide what they may change (not `code`, `slug`, `school_type` or `status`). Logos go to the public `school-logos` bucket at `<school_id>/logo-<timestamp>.<ext>`. Storage policies allow insert/read/delete only inside the caller's own school folder and only for school admins. The bucket accepts PNG/JPEG/WebP up to 1 MB. The server also checks the file's magic bytes, so SVG (which can carry script) is never accepted. The old logo object is deleted after the new URL is saved.

**Calendar model.** `academic_years` → `academic_terms` (semesters) → `grading_periods` (`marking_period` or `exam`). `create_academic_year(..., 'liberia', ...)` builds the Liberian standard atomically: 2 semesters × (3 marking periods + a semester exam) with evenly spread, editable dates. At most one year per school is current (partial unique index).

**Classes & enrolment.** A class belongs to one year and one grade level and has an optional homeroom teacher. `class_subjects` holds the subject taught in the class and its teacher. `enrollments` allows one class per student per year (unique `(student_id, academic_year_id)`), and the year is always copied from the class by a trigger. Every child table references its parent by `(id, school_id)` composite foreign keys, so a row can never point into another school, even if a policy were wrong. Triggers check roles: homeroom and subject teachers must be staff, the enrolled person must be a student, a guardian must be a parent and the child a student.

**Who sees what.** Structural tables (years, terms, periods, grades, subjects, classes, class subjects) are readable by every active member of the school. Enrolments are readable by staff, the student themself, and parents linked to that student. Guardian links are readable by staff and the two people on the link. Only school admins can write, through one policy per command. Subjects are deactivated rather than deleted, and deleting a class or year that has enrolments fails (`RESTRICT`), so future grades keep their references.

**Ordering.** Grade order is `unique (school_id, sequence)` and `DEFERRABLE`, so `move_grade_level()` can swap two rows atomically. Deferrable constraints can't be `ON CONFLICT` arbiters, so the seeder uses `NOT EXISTS`.

**Atomic setup RPCs** (`create_academic_year`, `set_current_academic_year`, `add_standard_subjects`, `move_grade_level`) are `SECURITY INVOKER`. They run with the caller's rights, so RLS still decides, and they re-check that the caller is a school admin.

## 11. Assessments & grades (milestone 4)

**Model.** `assessment_categories` hold the school's weighted categories (default Tests 40, Quizzes 20, Assignments 20, Projects 10, Class participation 10). `assessments` belong to one class subject and one grading period. `assessment_scores` store one student's score, or mark them excused. `grade_submissions` record a teacher handing a class subject's period in for review. `grading_periods.published_at` marks a period as released. `school_settings.exam_weight` defaults to 50%, which is the Liberian standard.

**Calculation** (`lib/grades/compute.ts`, pure and unit-checked):
- **Marking-period grade:** the average of the category percentages, weighted by category. Only categories with scored work count.
- **Exam grade:** points earned ÷ points possible.
- **Semester average:** the average of the rounded period grades × (1 − w), plus the rounded exam × w.
- **Yearly average:** the mean of the semester averages.
- **Scores that don't count:** missing scores are left out as not graded yet, and so are excused scores. A score of 0 counts.

Grades are computed on read from raw scores, never stored, so a correction can't leave a stale average behind.

**Who may do what** (database-enforced):
- **Entering grades:** `private.can_grade()` allows the teacher assigned to that class subject, or a school admin. Other teachers can't read or write that gradebook.
- **Seeing scores:** students see their own and parents their linked children's, only once the period is published (`is_self_or_child` + `assessment_published`).
- **Submission lock:** once a teacher submits, the triggers lock that class subject's period for the teacher. An admin can still correct scores or return the submission.
- **Publish lock:** publishing locks the period for everyone until it is unpublished.
- **Score checks:** triggers cap scores at the maximum and reject students who aren't enrolled in the class. They also stop a period's assessments from pointing at another academic year, and they refuse to remove a graded student from a class.

**Publishing** is an admin-only RPC (`set_grading_period_published`, `SECURITY INVOKER`) that stamps who published and when.

## 12. Report cards (milestone 5)

**Issued snapshots.** An admin issues a class's cards for one semester. The server reads every score (which RLS allows only for admins) and builds each card with `lib/grades/report-card.ts`. It uses **published periods only**, adds class ranks, and stores one `report_cards` row per student: a jsonb snapshot of the card as issued, plus its average and rank. Students and parents read their own rows. They never need access to classmates' scores, which is how a rank can be shown without leaking anyone else's grades. Re-issuing replaces the snapshot; every issue is audited.

**Ranking.**
- The ranking basis is the semester average once every period of the semester is published; until then it is the latest published period's overall average.
- Ranks use standard competition ranking, so ties share a place (1, 2, 2, 4).
- The final semester also shows a yearly rank.

**Remarks and promotion.**
- **Remarks:** `report_card_remarks` are written by the class's homeroom teacher or an admin (`private.is_homeroom`). Students and parents can read a remark only once a card is issued (`private.report_card_issued`).
- **Promotion:** it is automatic from the yearly average versus the passing score. An admin can override it per student (`promotion_decisions`).
- Remarks and overrides are read live, so corrections don't require re-issuing.

**Printing.** Pages under `/print` use a bare layout (no app shell). Each `.report-card` breaks to a new A4 page, and the browser's "Save as PDF" produces the file, so no server PDF engine is needed.

**Group password reset.**
- **Choosing accounts:** `/users/reset` re-resolves the accounts on the server when you confirm, and resets only those that were on the confirmed list *and* still match the filters.
- **Authorization:** every reset still goes through `require_password_change()` first.
- **Delivery:** new passwords are shown once, as printable slips or a CSV, and are never stored.

## 13. Attendance (milestone 6)

**Model.**
- `attendance_registers` holds one register per class per day, recording who took it and when.
- `attendance_records` holds one mark per student: present, absent, late or excused, with an optional note.
- A record's class and date are always copied from its register by a trigger, so the two can't disagree.

**Rules** (database-enforced):
- Only the class's homeroom teacher or an admin takes or edits a register (`private.can_take_register`).
- Teachers of the class (homeroom teacher or subject teacher) and admins can read the register (`private.teaches_class`).
- Students read their own marks, and parents read their linked children's.
- A register can't be dated in the future in the school's time zone, or outside the academic year.
- Only enrolled students can be marked.

**Rate.** The attendance rate is (present + late) ÷ (present + late + absent); excused days don't count against the student. The rate is compared with `school_settings.attendance_threshold`. When report cards are issued, each semester's attendance is added to the snapshot.

## 14. Students & teachers (milestone 7)

`student_profiles` and `staff_profiles` hold school-record details, one row per person. Admins write them. Triggers make sure a student record belongs to a student and a staff record to a teacher or admin. Admission and employee numbers are unique per school, case-insensitively.

Personal data follows need-to-know, enforced by RLS:
- **Student details** are visible to admins, to teachers who teach one of the student's classes (`private.teaches_student`), to the student, and to linked parents.
- **Staff details** are visible to admins and to the staff member themself.

The Students directory shows admins everyone. It shows a teacher only the students of classes they teach. "Assign admission numbers" numbers any unnumbered students `<year>-0001`, `-0002`, … continuing after the highest existing number.

## 15. Announcements (milestone 8)

**Audiences.** An announcement goes to one of: `everyone`, `staff`, `students`, `parents`, or one `class`. A class announcement reaches the class's students, their linked parents and the teachers of the class (`private.in_announcement_audience`).

**Posting.** Admins may post to any audience. Teachers may post only to a class they teach (`private.can_post_announcement`), and RLS applies the same check again when a post is edited, so a teacher can't widen their own post to the whole school. Authors edit or delete their own posts; admins can edit or delete any post.

**Visibility.** Readers see a post only once `publish_at` has passed, until `expires_on`, and only if they are in its audience. Admins and authors also see scheduled and expired posts.

**Unread markers.** `announcement_reads` records one row per person per post; the database sets the `profile_id`, and a read can only be recorded for a post the person can see. These rows drive the unread dot, the bell badge and the dashboard card. Reads are not audited (high volume, low value); announcements themselves are.

## 16. Platform tools (milestone 9)

**School status.** `platform_set_school_status` (super admins only) moves a school between active, suspended and archived; `pending` can't be set by hand. Suspending needs no per-user work: `current_school_id()` already returns nothing for a school that isn't active, so every RLS policy stops matching at once and nothing is deleted. Archived schools also refuse new accounts (`assert_can_manage_school`). Each change is recorded by the existing `schools_audit` trigger with the super admin as actor.

**Administrators.** `/platform/schools/[id]` lists a school's administrators (service-role read after `requireSuperAdmin()`), adds new ones through the same `createMember` path as school onboarding, and can reset an administrator's password or suspend/reactivate the account. The action first confirms the target is an administrator of *that* school, then the existing database functions authorize the change again.

**Statistics.** `platform_school_statistics()` returns one row of counts per school — never individual records: active students (girls / boys), enrolments, teachers, administrators, classes, attendance marks in the current year, and students passing on their latest issued report card of the year. The app sums counts and recomputes rates (so larger schools weigh more), groups by county, and offers a CSV export (formula-safe) and an A4 printable report. It is called with the super admin's own session, so the database, not the app, decides who may run it.

## 17. Reports & analytics (milestone 10)

`/reports` (school admins, capability `reports.view`) shows the current year: headline figures, attendance by month against the school's target, results by class and by subject, girls vs boys, and a list of students who need attention (failing the semester, or below the attendance target after at least 5 school days). A CSV gives one row per student.

**Where the numbers come from.** Attendance is counted in the database by `report_attendance_by_month` / `report_attendance_by_student`. They are SECURITY INVOKER, so they run with the caller's rights and RLS decides which marks are counted; they add no access (tests R04–R08). Results come from the report cards the school has issued, the same published figures parents and students see, so the report never shows unpublished grades. The maths lives in `lib/reports.ts` (pure, unit-tested): a subject's figure is its semester average, or its latest published period while the semester is running; passing uses the rounded result, as on report cards.

**Printing.** The app shell hides its sidebar and top bar when printing, so any page prints as a clean document.

## 18. Demonstration schools (milestone 11)

`schools.is_demo` marks a school whose people and records are fictional. Nobody can set it through the API (it isn't in any column grant); the app shows a banner inside such a school, prints "DEMONSTRATION — fictional … not a real record" on its report cards, labels it on platform screens, and the Ministry statistics state when demo schools are included (with a switch to leave them out).

The generator lives in the `demo` schema: not exposed by the API, no grants to `anon`/`authenticated`, runnable only by the database owner. Generated people have Auth accounts without a password, so they can't sign in until a school administrator gives one a temporary password. Report cards are computed with exactly the app's rules; one student's 72 period grades were recomputed with `lib/grades/compute.ts` and matched. Bulk rows are written with triggers off (`session_replication_role = replica`) to keep fictional rows out of the audit log, so `supabase/demo/verify.sql` re-checks every foreign key and trigger rule afterwards. `demo.remove_school` refuses any school without `is_demo`.

## 19. EduCore AI (AI-1 foundation, AI-2 panel, AI-3 context, AI-4 data tools)

```
Browser (same origin, signed in)
   │  POST /api/ai/chat  {messages}
   ▼
lib/ai/handler.ts   origin + JSON → identity (getAuthContext) → configured → input limits → usage limits
   │
lib/ai/prompt.ts    fixed system prompt: role + school name only, safety rules
   │
lib/ai/types.ts     AiProvider interface  ←  providers/anthropic.ts (fetch + SSE) | providers/mock.ts
   │
   ▼  (from AI-4) EduCore AI tools — authorised, RLS-bound, per role
Supabase
```

- **Provider-neutral.** The app talks to `AiProvider` only; swapping providers means adding one file under `lib/ai/providers`. The Anthropic provider uses `fetch` directly (no SDK), maps every failure to a fixed error code, and never reads or forwards the provider's error text.
- **Identity on the server.** The endpoint uses the same `getAuthContext()` as every page: session validated with Supabase Auth, own profile and school read under RLS. Inactive accounts, suspended schools and accounts that still have to change their password are refused.
- **Cross-site protection.** Route handlers don't get Server Actions' built-in origin check, so the endpoint requires a same-origin `Origin` (or `Sec-Fetch-Site: same-origin`) and a JSON body. Another website can't use a signed-in person's session to spend a school's AI budget.
- **No stored conversations.** The browser keeps the conversation and resends it (capped at 20 messages / 16,000 characters). `ai_usage_events` records metadata only: who, school, role, model, status, error code, tokens and duration. It has no column for text. Rows are written by the server (service role) after authentication; browsers can only read their own rows (school admins: their school's).
- **Cost control.** Per person 6/minute and 60/day, and per school 1,500/day (environment variables), plus a cap on reply length and a timeout. If limits can't be checked (no service key, database error), the assistant refuses rather than running unmetered.
- **Data minimisation.** The prompt carries only role, first name, school and dates (AI-3). Records reach the model only through tools that re-check authorisation (AI-4), and tool results are data, never instructions.
- **Secrets.** `ANTHROPIC_API_KEY` has no `NEXT_PUBLIC_` prefix and is read only in `lib/ai/config.ts` (`server-only`). A build scan of `.next/static` confirms no key name, provider URL or header appears in browser code.

### AI-2: chat panel

- `components/ai/assistant.tsx` — the **Ask AI** launcher and panel (native `<dialog>`: focus trap, Escape, focus returns to the button). Mounted by the school and platform layouts only when `getAiConfig().enabled`; only booleans and suggestion strings cross to the browser.
- **Conversation in memory only.** Kept in React state in the shell, so it survives page changes but not a reload or sign-out. Nothing is written to localStorage, sessionStorage or the server. `lib/ai/client.ts` trims the history to the server's limits before sending.
- **Safe rendering.** Replies are parsed by `lib/ai/rich-text.ts` (paragraphs, lists, bold, code) and rendered as React elements, never as HTML, so model output can't inject markup or scripts.
- **Accessibility.** The conversation is a `role="log"`; screen readers get a single announcement per reply (not every streamed word) and errors as alerts. axe (WCAG 2 A/AA) reports no violations on the empty or answered panel, on desktop and phone.
- **Suggestions per role** live in `lib/ai/suggestions.ts`; data questions are shown now that `AI_DATA_TOOLS_AVAILABLE` is on (AI-4).

### AI-3: user context

- The system prompt (`lib/ai/prompt.ts`) gets the role, first name, school name, today's date (school time zone) and the current academic year and semester — no records. Names from the database are flattened to one short line, so a crafted name can't add lines to the prompt.
- Each role's scope is written into the prompt (student: own records; parent: linked children; teacher: classes taught; admin: own school; platform: totals), so the model can explain a refusal — but enforcement is in the tools, not the prompt.

### AI-4: role-aware data tools

```
handler.ts  round 1..5: stream model reply → tool_use? → status line → ToolBox.run → tool_result → next round
   │
tools/registry.ts   14 read-only tools; offered by role; every run re-checks role + scope (resolveStudent / resolveClass)
   │
tools/data.ts       EduCoreData over existing services, with the person's OWN Supabase session → RLS
```

- **Two independent locks.** A tool is offered only to its roles, refuses by itself (student ≠ other id; parent → linked child; teacher → student enrolled in a class they teach, own subjects only, report cards only as homeroom; admin → own school; platform → aggregates), and then reads through RLS as the signed-in person. No service-role key and no SQL from the model; ids from the model must be UUIDs.
- **Grading engine, not the model.** Grades are computed by `lib/grades/compute.ts` from the gradebook. Students and parents see published periods only, and a semester average only once every period in it is published. School figures come from the Reports service; platform figures from `platform_school_statistics`.
- **Minimal, bounded results.** Tools return names, class names and figures — no usernames, emails, birth dates, phone numbers or addresses — capped in length (24 KB) and in list size. Announcement text is labelled as information only (prompt-injection defence).
- **Safe failures.** A refusal returns a plain message for the model to relay; any other error becomes "The information couldn't be loaded right now." and only the tool name is logged.
- **Bounded loop.** At most 5 model rounds and 8 tool calls per question. After a tool round the definitions are still sent (the provider requires them when the history has tool calls) with `tool_choice: none` in the final round.
- **Audit.** `ai_usage_events.tool_names` records which tools a request used (names only), with summed tokens across rounds.

## 20. Security decisions log

| # | Decision | Rationale |
| --- | --- | --- |
| 1 | Tenant isolation in RLS, not app code | A single missed `where school_id = …` in app code would leak data; RLS cannot be forgotten. |
| 2 | Helpers in unexposed `private` schema | Prevents calling definer functions via `/rest/v1/rpc`. |
| 3 | Inactive profile or non-active school ⇒ no data | Suspension takes effect instantly without app changes. |
| 4 | Column-level UPDATE grants + guard trigger | Blocks role/school self-escalation at two levels. |
| 5 | No INSERT/DELETE for browser roles | Creation/removal will go through audited server actions. |
| 6 | `ON DELETE RESTRICT` everywhere; append-only audit | Protect historical academic records. |
| 7 | Super admin has no RLS bypass | See §7. |
| 8 | Profiles provisioned, sign-up disabled | No orphan accounts; prevents enumeration and abuse. |
| 9 | Generic sign-in errors; open-redirect-safe `next` | Avoid account enumeration and phishing redirects. |
| 10 | Security headers (`X-Frame-Options: DENY`, nosniff, HSTS, referrer, permissions) | Baseline hardening against clickjacking and sniffing. |
| 11 | Logos optimised only from the project's Supabase Storage | `next/image` is not an open proxy; other hosts fall back to initials. |
| 12 | System font stack, no icon/UI libraries | Small bundles for low-bandwidth networks. |
| 13 | Username accounts use `@<code>.educore.invalid` Auth emails | Students without email can sign in; the reserved TLD means no mail can ever be delivered to a stranger. |
| 14 | Admin-set one-time passwords + forced change | Works without any email service; admins never learn the final password. |
| 15 | DB-side authorization for member RPCs, service role only after | A bug in app code can't let one school's admin manage another school's users. |
| 16 | Suspension = profile status (RLS cut-off) **and** Auth ban | Data access stops immediately; sign-in and token refresh stop too. |
| 17 | Composite `(id, school_id)` foreign keys on all academic tables | Cross-school references are impossible at the schema level, independent of RLS. |
| 18 | Role-check triggers on classes, class subjects, enrolments, guardian links | A student can't be made a teacher, a parent can't be enrolled, etc. — even by an admin. |
| 19 | Logo uploads: bucket MIME/size limits + server-side magic-byte check, no SVG, per-school folder policies | Prevents script-bearing images and cross-school overwrites. |
| 20 | Academic writes use the caller's session, never the service role | The database alone decides; there is no privileged path to misuse. |
| 21 | Scores visible to students/parents only after publishing, enforced in RLS | Draft or disputed grades never leak, even through the REST API. |
| 22 | Submission/publish locks in triggers, not UI | A stale form or crafted request can't alter reviewed or released grades. |
| 23 | Grades computed from raw scores on read | One source of truth; corrections propagate everywhere immediately. |
| 24 | Report cards stored as issued snapshots, readable per student | Ranks can be shown to families without exposing classmates' scores. |
| 25 | Bulk reset re-validates targets server-side at confirm time | A tampered or stale confirmation list can't reset accounts outside the chosen group. |
| 26 | Attendance class/date derived from the register by trigger | A mark can never be filed against another class or day than its register. |
| 27 | Student personal details readable only by admins, the student's teachers, the student and linked parents | Dates of birth, addresses and emergency contacts are need-to-know. |
| 28 | Platform statistics are aggregates computed in a super-admin-only database function | The Ministry view never needs a student's record; returning only counts keeps personal data inside each school. |
| 29 | School status changed only through `platform_set_school_status`, which re-checks the caller's role | A forged request to the app can't suspend or archive a school; the audit trail names who did it. |
| 30 | School report aggregates are SECURITY INVOKER | Counting in the database for speed must not become a way around RLS; the caller only ever counts rows they could already read. |
| 31 | School reports use issued report cards, not raw scores | Leaders see the same published figures families see; unpublished grades never leak into a report or export. |
| 32 | Demonstration schools flagged in the database and labelled everywhere they appear | Fictional records can't be mistaken for, or presented as, real results — including on printed report cards and Ministry reports. |
| 33 | Demo generator in a non-API schema, owner-only; removal refuses real schools | Nobody can create or delete demo data through the app, and cleanup can never touch a real school. |
| 34 | AI endpoint requires same origin and a JSON body | Route handlers lack Server Actions' origin check; without it another site could spend a school's AI budget with a visitor's session. |
| 35 | AI usage log stores metadata only, written by the server | Limits and monitoring need who/when/tokens, not what was asked; students' questions are not kept. |
| 36 | AI refuses to run if usage limits can't be enforced | A misconfiguration must never mean unmetered spending. |
| 37 | AI conversations kept only in page memory | Shared school computers: nothing a student asked is left behind in browser storage or on the server. |
| 38 | AI replies rendered from a parsed structure, never as HTML | Text from the model, or from school data it quotes, can't inject markup or scripts. |
| 39 | AI data tools read with the person's own session, never the service role | RLS stays a second, independent lock even if a tool's own check had a bug. |
| 40 | Fixed, read-only tools instead of model-written queries | The model can only ask the questions EduCore defines; it can't reach tables, columns or schools the tools don't expose. |
| 41 | Teachers see only their own subjects' grades through the assistant | Matches RLS and the gradebook; avoids partial rows that would look like missing grades. |
