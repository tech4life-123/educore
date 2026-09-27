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

## 17. Security decisions log

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
