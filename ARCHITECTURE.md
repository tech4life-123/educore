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

## 20. School background image (milestone 12)

A school admin uploads one background image for their whole school; it is shown, softly blurred, behind every portal (student, parent/guardian, teacher, admin) for everyone in that school by default. School admins additionally get a personal on/off toggle for their own screen only — every other role always sees the background their school has set, when it has one.

**Storage & data model.** The image is stored in the existing, previously-unused `schools.cover_image_url` column — no new schools-table column, and no new RLS/grants on `schools`, since a school admin could already write that column (the same policy and grant that cover the rest of the school-profile form). Only two things were added: the `school-backgrounds` public storage bucket (PNG/JPEG/WebP, up to 3 MB, same per-school-folder insert/read/delete policies as `school-logos`) and `profiles.show_school_background` (`boolean not null default true`), an ordinary personal-profile column with the same column-level grant shape as `photo_url`. Upload/remove server actions mirror the logo actions exactly: magic-byte sniffing (never trust the browser's `Content-Type` or filename), the old object deleted only after the new URL is saved, writes go through the caller's own RLS-bound session.

**Personal opt-out, enforced server-side.** The toggle is a plain boolean on the caller's own profile row, but `updateBackgroundPreference` is gated behind `requireCapability("school.manage", …)` — the same capability check as every other admin-only action — so only school admins can flip it for themselves, even though the column itself has no role check at the database level (matching `photo_url`'s existing shape). Every other role's screen is computed the same way (`show_school_background ? cover_image_url : null`), so the default (`true`) simply always resolves to "show the school's background" for anyone who was never given a way to turn it off.

**Rendering.** `AppShell` takes an optional `backgroundImageUrl` prop and renders a `position: fixed; inset: 0` layer with a negative z-index (`-z-10`), `aria-hidden`, `pointer-events-none`, scaled 1.1× to avoid blurred edge artefacts at the viewport boundary, with `filter: blur(18px)` and a semi-opaque overlay tinted to the app's `--background` token so the effect stays subtle. The shell's own opaque `bg-background` is dropped only when a background image is active — the fixed layer needs something behind translucent surfaces (the header's `bg-surface/95 backdrop-blur`) to show through, and `Card`/table surfaces stay fully opaque throughout, so the image is visible in the page margins and faintly through the header, never behind readable content.

## 21. Multi-school domains (Phase 1 — schema only)

First step of the multi-school website/subdomain/custom-domain expansion. This phase adds only `school_domains` and its RLS — no hostname resolution, no public marketing site, no Vercel API calls yet. Those are later phases of the same plan.

**Model.** `school_domains` holds every hostname a school is reachable at: exactly one system-issued subdomain row (`domain_type = 'subdomain'`), plus zero or more school-requested custom domains (`domain_type = 'custom'`), with at most one row per school flagged `is_primary` (enforced by a partial unique index, not app code). `schools.slug` — already unique and already constrained to a valid subdomain-safe shape (`^[a-z0-9]+(-[a-z0-9]+)*$`) — needed no change; it's the natural seed for a school's subdomain.

**Hostname is routing, never authorization.** This table exists to answer "whose site is this visitor looking at", nothing more. `private.current_school_id()` — the only thing any RLS policy or data query trusts for *who may see what* — is still derived solely from the signed-in user's own profile (§1, §5) and has no idea `school_domains` exists. A future hostname→school lookup in `proxy.ts` feeds only which marketing page to show an anonymous visitor; it is never wired into any authorization decision.

**Verification/SSL state is platform-controlled, same shape as `schools.status`/`code`/`slug`.** A school admin can INSERT a `custom` domain request for their own school and read its status, and can flip `is_primary` among their own (already-settled) domains — nothing else. `verification_status`, `ssl_status`, `verification_token`, `vercel_domain_id` and `domain_type` itself are column-grant-excluded from `authenticated` and additionally locked by a guard trigger (mirrors `private.guard_profile_identity_columns()`), so no grant added later by mistake could let a school mark its own domain "verified" — that only happens server-side, after a real DNS/Vercel check (future phase, same pattern as §7's super-admin writes).

**Subdomains are never browser-insertable.** Only `domain_type = 'custom'` passes the INSERT policy's `with check`. A school's own subdomain row is created server-side at school-creation time (future phase, extending the existing `new-school-form` flow) — never by a school admin inserting a row — so there's no path for one school to claim or collide with another's subdomain through the RLS-gated API, even scoped to "their own school_id only."

**Tests.** `supabase/tests/school_domains.sql` (same throwaway-fixture/forged-JWT approach as the other per-feature suites) covers: custom-domain self-service request/withdraw, subdomain-insert and cross-school-claim denial, all four platform-controlled columns resisting a direct UPDATE from the owning school admin, cross-tenant read/write isolation, super admin having no RLS bypass, and the one-primary-per-school constraint. Verified locally against the full migration chain (foundation through this one) on a throwaway Postgres instance with a minimal `auth`/`storage` shim; the SQL suites still need running against the live project per decision #44 — the project's one connected Supabase instance in this session is a different, unrelated project.

### 21.1 Public hostname resolution (Phase 2)

`proxy.ts` needs to answer "which school, if any, owns this hostname" for a visitor who may not be signed in at all — that lookup has to work for `anon`, which until now had no access to this table whatsoever.

**What `anon` can see, exactly.** `grant select (domain, school_id)` — nothing else — restricted by RLS to rows where `verification_status = 'verified'` **and** the owning school is `active`. The active-school check cannot be written as a direct subquery against `schools` in the policy: `anon` has no SELECT grant on `schools` at all (by design), so a bare `exists (select 1 from schools …)` inside the policy fails the whole lookup with "permission denied for table schools" instead of just filtering rows — caught by a local test before this shipped (`supabase/tests/school_domains_public_resolution.sql`, R04 — a verified domain of a *suspended* school must resolve to nothing). Fixed with a `SECURITY DEFINER` helper, `private.is_school_active(uuid)`, the same shape as `private.current_school_id()`: it can check `schools.status` without the caller needing any privilege on that table.

**Why this is safe to expose publicly.** A verified domain's existence is already public — anyone who resolves its DNS or looks at its TLS certificate learns it points at EduCore. This grant only lets `anon` confirm what the internet already shows, and only for domains that have actually passed verification. `ssl_status`, `verification_token`, `vercel_domain_id`, `domain_type`, and every write path stay exactly as locked down as §21 left them — confirmed by dedicated anon-denial cases in the same test file.

**`lib/tenant-host.ts`** (`resolveTenantHost(host)`) does the lookup with a plain anonymous REST call (no cookies, no session) and returns `null` on no match *or* any failure — callers must fall through to today's behaviour, never treat a miss as an error.

### 21.2 Hostname gate in `proxy.ts`, off by default (Phase 3)

`proxy.ts`'s existing session-refresh logic already caused one production incident this project (decision #45), so this phase wires in the smallest, most reversible thing that could work rather than editing that logic directly.

**Gated entirely behind `EDUCORE_PRIMARY_HOSTS`.** Unset (the default on every environment today, including production), `getPrimaryHosts()` returns `[]` and the new block in `proxy.ts` is skipped completely before it does anything else — `updateSession(request)` runs exactly as before, byte-for-byte today's behaviour. The feature only exists once someone deliberately sets that variable to the host(s) they actually sign in through.

**What it does once configured.** For a request whose hostname is neither a configured primary host nor `*.vercel.app`/`localhost` (`isKnownAppHost`, `lib/tenant-host.ts`) nor a verified school domain (`resolveTenantHost`), `proxy.ts` rewrites — never redirects, so the address bar keeps whatever domain the visitor typed — to `/site-unavailable`, a static, generic page that names no school and confirms nothing about which domains exist. A resolved match, or a known app host, falls through to the ordinary app unchanged; there's still no marketing page for a resolved match to show, so "fall through to the ordinary app" is today's exact behaviour either way.

**Why `*.vercel.app` is hardcoded rather than configured.** It's this project's own preview/production domain family — a school's custom domain can never legitimately be one, so treating the whole suffix as "the app" is safe without needing every preview URL listed by hand.

**Verified without a live project.** `isKnownAppHost` and `resolveTenantHost` are pure/isolated enough to run directly under Node (the same `--experimental-strip-types` + path-alias loader `npm run test:ai` already uses) with `fetch` mocked — confirmed host-matching for configured hosts, `*.vercel.app`, `localhost`/`127.0.0.1` (case-insensitive), and rejection of everything else; confirmed `resolveTenantHost` lowercases and strips the port before querying, and returns `null` on a miss, a `null` input, and a failed request alike.

### 21.3 Super Admin domains dashboard (Phase 4)

A review queue for the custom-domain requests schools submit through §21 — `/platform/domains`, built on the same `app/platform` shell as the Schools and Statistics pages.

**Reads via the service-role client, same as every other platform list.** `listDomainsForPlatform()` (`services/platform.ts`) calls `requireSuperAdmin()` first, then uses `createAdminClient()` — a super admin has no RLS read access to any school's `school_domains` rows (decision #50's counterpart: §21's RLS only ever grants a school's *own* admins read access to their *own* rows), so this is the only way to see requests across every school at once. The query joins `schools(name, code)` through PostgREST embedding so the dashboard can show which school each request belongs to without a second round trip.

**Writes through a new SECURITY DEFINER function, mirroring `platform_set_school_status` exactly.** `platform_set_domain_verification(p_domain_id, p_status)` checks `private.current_app_role() = 'super_admin'` first, then flips `verification_status` to `verified` or `failed`. It refuses to touch a `subdomain`-type row (those were never submitted for review) and refuses an unknown id, both as a plain exception rather than silently doing nothing. The server action (`app/platform/domains/actions.ts`) calls it via `supabase.rpc(...)` under the caller's own session — never the service role — same as `setSchoolStatusAction`.

**What "approve" means today, and what it doesn't.** This only records a super admin's review decision. It does not call Vercel's API, does not point DNS anywhere, and does not issue a certificate — that integration is step 5 of the plan, not yet built. The dashboard says so directly rather than implying a domain is live once approved.

**Tests.** Added to `supabase/tests/school_domains.sql` (D20–D26): every non-super-admin actor (the requesting school's own admin, a teacher, another school's admin) is denied; a super admin can approve a pending custom request and the row updates; a super admin cannot "review" a subdomain row or an unknown id. Verified locally against the full migration chain on the same disposable Postgres + shim harness as §21, alongside every other SQL test file in the project, with no regressions.

**`types/database.ts` needs regenerating (`npm run db:types`) before this typechecks.** Both new call sites — `services/platform.ts`'s `.from("school_domains")` select and the server action's `.rpc("platform_set_domain_verification", …)` — reference types the generator hasn't produced yet, since it was last run before the §21 migrations existed. `npm run typecheck` currently fails with exactly those two call sites and nothing else; running `db:types` against the live project is the only fix (there's no live Supabase connection available to do it from this session).

## 23. Finance (Phase 1 — foundation)

Spec: "Finance, Payments & Document Services". Phase 1 delivers the database foundation only (no pages yet): fee structures, student accounts, invoices, a payment lifecycle with manual recording, an append-only ledger, derived balances and a financial audit log. Migrations: `20261007100000_finance_officer_role.sql` (run first, alone — a new enum value cannot be used in the transaction that adds it) and `20261007100100_finance_foundation.sql`. Tests: `supabase/tests/finance.sql`.

**Model.** One currency per invoice, one default currency per school (`finance_settings`, USD or LRD), no conversion anywhere. EduCore never holds money and never bills schools. Each school's data is isolated by RLS plus composite `(id, school_id)` foreign keys.

**Ledger is the truth.** `student_account_entries` is append-only (trigger blocks update/delete even for the table owner). Balances are never stored: `student_balances` and `invoice_balances` are `security_invoker` views over the ledger/payments, so the caller's own RLS applies. Invoices store only `draft | issued | cancelled`; "paid / partially paid / overdue" are derived in the view.

**Writes go through functions only.** Browser roles have SELECT on every finance table (plus admin-only edits of fee structures/items and settings). Invoices, payments and ledger entries change only via SECURITY DEFINER functions that re-check the caller is a school admin or finance officer and take the school from the caller's profile: `finance_create_invoice`, `finance_issue_invoice`, `finance_cancel_invoice`, `finance_record_payment`, `finance_confirm_payment`, `finance_reject_payment`, `finance_reverse_payment`. A payment reaches the ledger only in `finance_confirm_payment` (database-side check, never a client flag); it refuses to overpay an invoice. Mistakes are reversed or cancelled with offsetting entries, never deleted.

**Payment lifecycle.** `pending → processing → confirmed → reconciled → posted`, plus `failed / rejected / reversed / refunded / cancelled`. A trigger enforces the transition table, requires a reason for negative outcomes, and refuses `posted` without a ledger entry. Payment details are immutable once recorded. Duplicates are blocked by a partial unique index on `(school, method, reference)` and an idempotency key (retrying returns the same payment).

**Roles.** `finance_officer` is a new school-scoped role. School admin and finance officer: full finance operations. Finance officers read fee configuration but only school admins edit it. Teachers: nothing. Students/parents: read their own (or linked child's) non-draft invoices, ledger, and posted/reversed/refunded payments. Super admin: no financial access (platform-level aggregates are a later phase). Finance staff find students through the `finance_students` view (name + admission number only), not the sensitive student record.

**Audit.** `financial_audit_logs` (append-only) records named events — FEE_CHANGED, INVOICE_CREATED/ISSUED/CANCELLED, PAYMENT_CREATED/CONFIRMED/POSTED/REJECTED/REVERSED… — with actor, role, before/after and request metadata. Readable by finance staff only.

**Deferred.** Phase 2 manual-payment UI, receipts/QR, reconciliation centre; Phase 3 document fees, clearance, admissions officer; Phase 4 mobile money; Phase 5 bank/API; Phase 6 installments, discounts, refunds, reports. TypeScript plumbing for `finance_officer` is in `lib/auth/roles.ts` (label + `finance.manage`); finance officers see only Dashboard and Settings and do not get the AI assistant (it has no finance tools).

## 22. Security decisions log

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
| 42 | Server errors captured once in `instrumentation.ts`, logged as structured stderr, not sent to a third party | Vercel's own Runtime Logs already ingest this — no new account, no new place secrets could leak to. Trades push alerting for zero setup cost; revisit if a school needs guaranteed incident response. |
| 43 | Privacy policy / terms published as pages, explicitly marked draft/not-lawyer-reviewed | Real student data (including minors') shouldn't be collected from a real school with nothing published at all; but claiming legal review that hasn't happened would be worse than the gap it fills. |
| 44 | CI runs the app-level suite (lint/typecheck/build/AI tests) only, not the SQL suites | The SQL suites need direct access to the live Supabase project (not just its REST API), which isn't available to a GitHub-hosted runner without provisioning a whole test project; they continue to run manually against the live database each session. |
| 45 | A 5-minute inactivity auto sign-out (client-side wall-clock poll + a server-side `proxy.ts` backstop) was built, shipped, then fully reverted the same day | It shipped with a bug (`Number("")` parsing as `0`, not `NaN`, in the server-side staleness check) that signed people out immediately on login, not just after 5 idle minutes. The owner asked for the whole thing removed rather than patched further. If revisited: add real test coverage for `proxy.ts`'s cookie parsing before re-shipping — the project's test suite only covered the AI tools, which is how this got through `npm run check` clean. |
| 46 | Background image reuses `schools.cover_image_url` instead of a new column | It was already unused, already had the right RLS/grants/CHECK coverage, and adding a second image column would have meant duplicating that coverage for no benefit. |
| 47 | Personal background opt-out enforced by capability check in the server action, not by a database-level role constraint on the column | Matches the existing pattern for other personal-profile columns (`photo_url`); keeps the schema simple while still making it impossible for a non-admin to reach the toggle, since the only path to it is the gated server action. |
| 48 | `school_domains.verification_status`/`ssl_status`/`verification_token`/`vercel_domain_id`/`domain_type` excluded from `authenticated`'s column grants, plus a guard trigger | A school admin can request a custom domain and watch its status, but can never mark it verified themselves — that decision has to come from a real DNS/Vercel check run server-side. |
| 49 | Only `domain_type = 'custom'` passes the `school_domains` insert policy | Subdomains are provisioned server-side at school creation; a browser-insertable subdomain row would let a school admin attempt to claim or collide with a subdomain outside the normal flow, even though RLS would still confine it to their own `school_id`. |
| 50 | Anon's `school_domains` read policy uses a `SECURITY DEFINER` helper (`private.is_school_active`) instead of querying `schools` directly | `anon` has no grant on `schools` at all; a direct subquery doesn't fail closed, it fails the whole policy with a permission error, breaking hostname resolution outright rather than just hiding suspended schools. |
| 51 | `proxy.ts`'s hostname gate is skipped entirely unless `EDUCORE_PRIMARY_HOSTS` is set | That file's session-refresh logic already caused one production incident (#45); an unconfigured, off-by-default feature can't regress existing traffic no matter what it does once turned on. |
| 52 | Unrecognized-host fallback is a `rewrite`, not a `redirect` | A redirect would expose the internal `/site-unavailable` path and change the address bar; a rewrite serves the generic page while the visitor's own domain stays in the URL. |
| 53 | `*.vercel.app` always treated as the app, hardcoded rather than configured | It's this project's own preview/production domain family; a school's custom domain can never legitimately be one, so the whole suffix is safe to trust without listing every preview URL. |
| 54 | Domain-review listing uses the service-role client; the write goes through a new SECURITY DEFINER function that re-checks the caller's role | A super admin has no RLS power over any school's `school_domains` rows (by design, §21); the read needs the service role to see across schools at all, and the write still has to prove the caller is a super admin itself rather than trusting the page that got them there. |
| 55 | `platform_set_domain_verification` refuses to act on a `subdomain`-type row | Those rows are provisioned server-side, never submitted for review; letting the review queue touch them by id would blur "a school asked for this" with "the system issued this automatically." |
| 56 | Balances are derived by views over an append-only ledger, never stored | A stored balance can drift from the entries behind it; a view cannot, and the ledger trigger makes history unalterable even for the table owner. |
| 57 | Finance tables are read-only to browser roles; every write is a SECURITY DEFINER function | The rules (who may confirm, no overpay, status transitions, numbering) live in one place the browser can't bypass, and a function derives the school from the caller so a school id is never trusted from the client. |
| 58 | A payment is credited only inside `finance_confirm_payment` | "Confirmed" must be a database-side decision, never a client button or webhook flag; the same path will serve manual, mobile-money and bank confirmation. |
| 59 | Invoice status stores only draft/issued/cancelled; paid/partial/overdue are derived | Stored payment status goes stale as payments arrive or reverse, or as the due date passes. |
| 60 | New `finance_officer` role instead of reusing school_admin | Least privilege: a bursar can run payments without administering users, grades or settings; super admin deliberately gets no financial access. |
| 61 | Finance staff read students through a narrow `finance_students` view | Invoicing needs name and admission number, not birth date, address or emergency contacts. |
| 62 | Receipts snapshot the balance and are issued only inside payment confirmation | A receipt can never exist for money that isn't on the ledger, and it never changes after the fact. |
| 63 | Public receipt verification returns first name + last initial only | Proves a receipt is genuine without exposing a child's full name to anyone who scans the code. |
| 64 | Reconciliation never auto-assigns money | Wrong automatic matches are worse than a short manual queue; suggestions are shown, a person decides. |
| 65 | `reconcile_and_post` is private and ungranted | The only way into the reconciled state is a logged, audited match by finance staff. |

## 24. Finance (Phase 2 — manual payments, receipts, reconciliation, reports)

Migrations (run in order): `20261007110000_finance_receipts.sql`, `20261007120000_finance_reconciliation.sql`. Pages under `/finance` (Overview, Invoices, Payments, Reconciliation, Reports, Fees), printable receipt at `/print/receipts/[id]`, public verification at `/verify/receipt/[token]`.

**Receipts.** Issued only inside `finance_confirm_payment`, in the same transaction that posts the ledger entry. A receipt snapshots the previous and remaining balance at that moment, is immutable (trigger), and is kept even if the payment is later reversed (the verify page then says so). Numbers are gap-free (`RCT-YYYY-NNNNN`, `finance_counters`). Each carries a random verification token encoded in a QR code; `verify_receipt(token)` is the only anonymous entry point and returns the receipt number, school, date, amount and the student's first name plus last initial only. The token is stripped from the audit log.

**Reconciliation.** `incoming_transactions` holds lines from a bank or mobile-money statement that finance staff log by hand (provider/bank automation arrives in Phases 4–5 through the same table). Each line is resolved by a person: match to a pending payment (same method, currency, amount), assign to a student/invoice (creates and posts a payment), or reject with a reason. Suggestions are shown, never applied. Matching walks the payment confirmed → reconciled → posted through the private `reconcile_and_post`, which has no public grant.

**Reports.** Collections by date range, method and currency (posted payments only) and an ageing view of unpaid issued invoices, with CSV export (`/finance/reports/export`, formula-injection-safe).
