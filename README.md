# EduCore

**One Platform. Many Schools.**

EduCore is a multi-tenant school management platform. A single deployment serves many schools; each school sees only its own data, enforced by PostgreSQL Row Level Security. The first target market is high schools in Liberia; the data model deliberately avoids assumptions that would block colleges and universities later.

> **Milestones done:** 1. Foundation (auth, tenants, roles, RLS, audit, branded shell). 2. School onboarding & user management (username or email logins, one-time passwords, CSV import, suspend/reset, platform "add school"). Academic modules come next; see [Roadmap](#roadmap).

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
    dashboard/         Landing page for school users
    settings/          Own-profile editing, read-only school configuration
  platform/            Super-admin area (server-side privileged access)
  account/             Explains blocked access (no profile, suspended, …)
components/
  ui/                  Button, TextField, Card, Table, Dialog, DropdownMenu, Alert, …
  shell/               AppShell, navigation, mobile drawer, user menu, school logo
lib/
  supabase/            client.ts (browser) · server.ts (RLS-bound) · admin.ts (service role, server-only) · proxy.ts
  auth/                roles & capabilities, safe redirect helper
  env.ts, branding.ts, navigation.ts, format.ts
services/              Server-only data access: auth.ts (guards), school.ts, platform.ts
types/database.ts      Generated Supabase types
supabase/
  migrations/          Reproducible schema, RLS and audit migrations
  tests/               tenant_isolation.sql — 37-case security test (self-cleaning)
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

or paste the file into the Supabase SQL editor. It creates throwaway tenants/users, runs 37 checks as the real `authenticated`/`anon` roles, prints PASS/FAIL per case, and rolls everything back. `supabase/tests/user_management.sql` works the same way and adds 28 checks for the user-management functions.

## Deployment (Vercel)

1. Import the GitHub repository in Vercel (framework preset: Next.js; no custom build settings needed).
2. Add the environment variables above for Production (and Preview if used). Mark `SUPABASE_SERVICE_ROLE_KEY` as sensitive; do not add it to Preview unless needed.
3. Deploy, then set the Supabase Auth Site URL to the Vercel domain.

There are no hard-coded hosts or localhost URLs; redirects are built from the incoming request.

## Current milestone status

Foundation — complete except for items marked NOT VERIFIED in the milestone report (end-to-end sign-in against a live project was not executable from the build environment).

## Roadmap

1. ~~School onboarding & user management~~ ✅
2. School settings & branding editor (logo upload, colours, academic settings)
3. Academic structure — academic years/terms, classes, subjects, enrolment.
4. Attendance.
5. Assessments, examinations and grades.
6. Report cards.
7. Announcements and notifications.
8. Parent portal.
9. Reports and analytics.
10. University support (faculties, programmes, credit hours, GPA).
