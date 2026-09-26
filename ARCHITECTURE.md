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
| 1. Proxy | `proxy.ts` | Optimistic: signed-out requests to `/dashboard`, `/platform`, `/settings`, `/account` → `/login?next=…`. Not trusted for authorization. |
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

Future platform write operations (creating schools, assigning admins) must follow the same pattern: Server Action → `requireSuperAdmin()` → validated input → narrowly scoped admin query → audit entry.

## 8. Server / client boundaries

| Module | Runs | Credentials | RLS |
| --- | --- | --- | --- |
| `lib/supabase/client.ts` | Browser | Publishable key + user session | Enforced |
| `lib/supabase/server.ts` | Server (`server-only`) | Publishable key + user session cookies | Enforced |
| `lib/supabase/proxy.ts` | Proxy | Publishable key + cookies | n/a (session refresh only) |
| `lib/supabase/admin.ts` | Server (`server-only`) | **Service role** | **Bypassed** — use only after an explicit guard |
| `services/*` | Server (`server-only`) | via the above | — |

Client Components receive only the display data they need (names, school branding) as props. Pages are dynamically rendered because they read cookies; nothing user-specific is statically cached.

## 9. Security decisions log

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
