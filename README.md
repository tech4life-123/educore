# EduCore

**One Platform. Many Schools.**

EduCore is a multi-tenant school management platform. A single deployment serves many schools; each school sees only its own data, enforced by PostgreSQL Row Level Security. The first target market is high schools in Liberia; the data model deliberately avoids assumptions that would block colleges and universities later.

> **Milestones done:** 1. Foundation (auth, tenants, roles, RLS, audit, branded shell). 2. School onboarding & user management (username or email logins, one-time passwords, CSV import, suspend/reset, platform "add school"). 3. School branding & academic structure (logo, colours, settings; academic years with the Liberian 2 × (3 periods + exam) calendar; grade levels Nursery–12; subjects; classes, subject teachers, enrolment; parent ↔ child links; setup checklist). 4. Assessments & grades (weighted categories, marking-period and exam grades, Liberian semester averages, submit → review → publish, student & parent results). 5. Report cards (issued snapshots with class rank, homeroom remarks, promotion, A4 printing) and group password resets. 6. Attendance (daily class registers, school overview, class summaries, attendance on report cards). See [Roadmap](#roadmap).

---

## Technology stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`) |
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS 4, small in‑house component set (no UI library) |
| Backend | Supabase — PostgreSQL 17, Auth, Storage |
| Hosting | Vercel (app) + Supabase (database/auth) |

Runtime dependencies beyond Next/React: `@supabase/ssr`, `@supabase/supabase-js`, `server-only`. That's it.

## Project structure

```text
app/
  (auth)/login/        Sign-in page, form and server actions (signIn / signOut)
  (school)/            School area — shared branded shell (layout.tsx)
    dashboard/         Landing page (admins also get a setup checklist)
    settings/          Own profile; admins: logo upload, school profile & colours, academic settings
    users/             User accounts, bulk import, parent ↔ child links
    academics/         Academic years & marking periods, grade levels, subjects (admins)
    classes/           Classes, subject teachers, enrolment (admins edit; teachers view)
    grades/            Gradebooks, score entry, review & publish (staff); published results (students, parents)
    report-cards/      Issue, remarks, promotion (staff); issued cards (students, parents)
    attendance/        Daily registers (homeroom/admin), school day overview, class summaries; own record (students, parents)
  print/               Bare A4 layouts for printing (report cards)
  platform/            Super-admin area (server-side privileged access)
  account/             Explains blocked access (no profile, suspended, …)
components/
  ui/                  Button, TextField, Card, Table, Dialog, DropdownMenu, Alert, …
  shell/               AppShell, navigation, mobile drawer, user menu, school logo
lib/
  supabase/            client.ts (browser) · server.ts (RLS-bound) · admin.ts (service role, server-only) · proxy.ts
  auth/                roles & capabilities, safe redirect helper
  env.ts, branding.ts, navigation.ts, format.ts
services/              Server-only data access: auth.ts (guards), school.ts, members.ts, academics.ts, classes.ts, grades.ts, platform.ts
lib/grades/            Pure calculations: compute.ts (grades & averages), report-card.ts (cards, ranking, promotion)
types/database.ts      Generated Supabase types
supabase/
  migrations/          Reproducible schema, RLS and audit migrations
  tests/               tenant_isolation.sql (37), user_management.sql (28), academics.sql (48), grades.sql (39), report_cards.sql (27), attendance.sql (23) — self-cleaning security tests
  snippets/            attach_profile.sql — provision users
  seed.sql             Local-only demo data ("Demo School")
proxy.ts               Session refresh + optimistic route protection
```

Architecture and security decisions are documented in **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Local development

Prerequisites: Node.js ≥ 20.9, npm, and either a hosted Supabase project or Docker (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local        # fill in values (see below)
npm run dev                        # http://localhost:3000
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | lint + typecheck + build |
| `npm run db:types` | Regenerate `types/database.ts` from the linked Supabase project |

## Environment variables

| Variable | Required | Exposed to browser | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Yes | Publishable key (`sb_publishable_…`) or legacy anon key. Safe to expose — all access is constrained by RLS. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a fallback name. |
| `SUPABASE_SERVICE_ROLE_KEY` | For user management and `/platform` | **Never** | Bypasses RLS. Read only by `lib/supabase/admin.ts` (guarded by `server-only`), and only after a database-side authorization check. |

`.env*` files are git-ignored (except `.env.example`). Never commit real keys.

## Supabase setup

### Hosted project

1. Create a Supabase project (the reference deployment uses the `educore` project, region eu-west-1).
2. Apply the migrations in `supabase/migrations/` in filename order — either with the CLI (`supabase link --project-ref <ref>` then `supabase db push`) or by pasting each file into the SQL editor.
3. **Authentication → Sign In / Providers:** turn **off** “Allow new users to sign up”. Accounts are provisioned by administrators; a self-registered user has no profile and therefore no data access, but there is no reason to allow it.
4. **Authentication → URL Configuration:** set the Site URL to your production URL.
5. Create your first school and users — see [Provisioning users](#provisioning-users).

### Local stack (Docker)

```bash
npx supabase start          # starts Postgres/Auth/Studio locally
npx supabase db reset       # applies migrations + seed.sql (Demo School, Demo School Two)
```

Use the printed API URL and publishable key in `.env.local`. Public sign-up is disabled in `supabase/config.toml`.

### Provisioning users

- **Lost login slips:** **User accounts → Reset passwords** gives a whole role or class new one-time passwords and prints fresh slips (by default only accounts still on a temporary password).
- **School users:** a school administrator uses **User accounts** in the app. They can add one person, or import a CSV of up to 100 people. Each person gets a login (their email, or `username@SCHOOLCODE`) and a one-time password that they must change at first sign-in.
- **Schools:** a platform super admin uses **/platform → Add school**, which creates the school and its first administrator.
- **The first platform super admin** has to be bootstrapped once. Create the user in Supabase Dashboard → Authentication → Users, then run the super-admin block of `supabase/snippets/attach_profile.sql`.

Public sign-up stays disabled. The `SUPABASE_SERVICE_ROLE_KEY` environment variable is **required** for user management (creating accounts, suspending, resetting passwords). The Supabase ↔ Vercel integration sets it automatically.

## Database migrations

| Migration | Contents |
| --- | --- |
| `…_foundation_schema.sql` | Enums; `schools`, `school_settings`, `profiles`, `audit_logs`; constraints, indexes, `updated_at` triggers, default-settings trigger |
| `…_tenant_isolation_rls.sql` | `private` helper functions, table/column privileges, RLS policies, identity-column guard |
| `…_audit_triggers.sql` | Append-only audit logging on schools, school_settings, profiles |
| `…_security_hardening.sql` | Advisor fixes: revoke RPC execute on a platform helper, merge profile SELECT policies |
| `…_user_management.sql` | `profiles.username/email/must_change_password`; `create_member`, `set_member_status`, `require_password_change`, `platform_create_school` |
| `…_academic_structure.sql` | Academic years, semesters, grading periods, grade levels (seeded Nursery–12 per school), subjects, classes, class subjects, enrolments, guardian links; RLS; `create_academic_year`, `set_current_academic_year`, `add_standard_subjects`; `school-logos` storage bucket and policies |
| `…_academic_indexes.sql` | Indexes covering the composite foreign keys |
| `…_grade_level_ordering.sql` | Deferrable grade-order constraint; `move_grade_level` (atomic reorder) |
| `…_seed_grade_levels_without_on_conflict.sql` | Grade-level seeder compatible with the deferrable constraint |
| `…_assessments_and_grades.sql` | Assessment categories (seeded per school), assessments, scores, grade submissions, period publishing, exam weight; RLS, locking triggers, `set_grading_period_published` |
| `…_grades_indexes.sql` | Indexes covering the grades foreign keys |
| `…_report_cards.sql` | Issued report cards (jsonb snapshot, average, rank), homeroom remarks, promotion overrides; RLS and scope triggers |
| `…_promotion_decision_message.sql` | Clearer validation message |
| `…_attendance.sql` | Attendance registers and marks; RLS (homeroom/admin write, class teachers read, self/parent read); date and enrolment checks |

Schema changes must always be made through new migration files — never only in the dashboard. After changing the schema, run `npm run db:types`.

## Authentication

- Email + password via Supabase Auth; credentials never touch EduCore tables.
- Sessions live in HTTP-only cookies managed by `@supabase/ssr`; `proxy.ts` refreshes them on each request.
- After sign-in the server reads the user's profile and routes by role: `super_admin → /platform`, everyone else → `/dashboard` (or a validated `?next=` path).
- Missing profile, deactivated profile, or suspended school → `/account`, which explains the situation instead of crashing.
- Sign-in errors never reveal whether an account exists. Supabase Auth applies rate limiting.

## Security model (summary)

- **Tenant isolation in the database.** RLS is enabled *and forced* on every table. Each policy resolves the caller's school from their own active profile; a user from School A cannot read or change School B's rows through any API path.
- **Least privilege.** Browser roles have no INSERT/DELETE on any table and only column-scoped UPDATE (e.g. users can edit their own name/phone, never `role`, `status` or `school_id`).
- **Layered route protection.** `proxy.ts` (optimistic redirect) → server-side guards in every layout/page/action (`services/auth.ts`) → RLS.
- **Super Admin** has no special RLS powers. Cross-school access happens only in server-only code after a server-side role check. Details in [ARCHITECTURE.md](./ARCHITECTURE.md#super-admin).
- **Audit trail.** Changes to schools, settings and profiles are recorded (who, what, when, old → new) in an append-only table.

### Running the security tests

```bash
psql "$DATABASE_URL" -f supabase/tests/tenant_isolation.sql
```

or paste the file into the Supabase SQL editor. It creates throwaway tenants/users, runs 37 checks as the real `authenticated`/`anon` roles, prints PASS/FAIL per case, and rolls everything back. `supabase/tests/user_management.sql` (28 checks) `supabase/tests/academics.sql` (48 checks: academic structure, classes, enrolment, parent links, logo storage) `supabase/tests/grades.sql` (39 checks: who may grade, who may see scores, submission and publishing locks) `supabase/tests/report_cards.sql` (27 checks: who issues, who sees cards and remarks, promotion overrides) and `supabase/tests/attendance.sql` (23 checks: who takes registers, who sees marks, date rules) work the same way.

## Deployment (Vercel)

1. Import the GitHub repository in Vercel (framework preset: Next.js; no custom build settings needed).
2. Add the environment variables above for Production (and Preview if used). Mark `SUPABASE_SERVICE_ROLE_KEY` as sensitive; do not add it to Preview unless needed.
3. Deploy, then set the Supabase Auth Site URL to the Vercel domain.

There are no hard-coded hosts or localhost URLs; redirects are built from the incoming request.

## Current milestone status

Foundation — complete except for items marked NOT VERIFIED in the milestone report (end-to-end sign-in against a live project was not executable from the build environment).

## Roadmap

1. ~~School onboarding & user management~~ ✅
2. ~~School settings & branding editor (logo upload, colours, academic settings)~~ ✅
3. ~~Academic structure — academic years/terms, classes, subjects, enrolment, parent links~~ ✅
4. ~~Assessments, examinations and grades~~ ✅
5. ~~Report cards (printable, per student and per class)~~ ✅
6. ~~Attendance~~ ✅
7. Announcements and notifications.
8. Parent portal.
9. Reports and analytics.
10. University support (faculties, programmes, credit hours, GPA).
