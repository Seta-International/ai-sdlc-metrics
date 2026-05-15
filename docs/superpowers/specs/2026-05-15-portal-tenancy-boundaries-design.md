# Portal & Tenancy Boundaries — Design

**Date:** 2026-05-15
**Status:** Proposed
**Owners:** Platform

## Problem

Boundaries between authentication, user identity, tenancy, tenant administration, and product modules are unclear in the current codebase:

- `platform/auth` only contains a single `auth.api_keys` table — its name implies it owns authentication, but real authentication (SSO, sessions, users) lives in `platform/sso`.
- `platform/sso` owns the OIDC flow but also the `auth.users` table and the `/me` endpoint — it conflates "SSO protocol" with "user identity".
- `platform/portal` is a React component library that ships `LoginPage`, `TenantsPage`, and `CallbackSplash`. These are not primitives; they are pages that belong to one specific application.
- `apps/studio` owns the `/tenants` and `/tenants/$id/*` routes for every administrative concern (connectors, runs, agents, audit, members-to-be), mixing the role of "tenant picker / workspace home" with the role of "agent operations console".
- There is no model for `user ↔ tenant ↔ role` membership. The `/me` endpoint returns `tenants: []` hard-coded.
- There is no surface for tenant administration (managing members of a tenant).
- There is no surface for Seta-side super administration (managing the set of tenants).
- `recordConsent` silently inserts rows into `tenant.tenants` from the connector flow, so tenants exist as a side effect of consenting rather than as a first-class concept.

This becomes blocking as soon as a second product module (Finance, PMO, Timesheet) is added: there is no defined place for that module's UI to mount, no defined place for tenant-admin user management, and no defined place for super administration.

## Goals

- Establish clear DDD boundaries between **identity**, **tenancy**, and **product modules**.
- Define a dedicated front-end application — `apps/console` — that owns login, profile, members management, and super administration.
- Define an isolated shared client library — `@seta/identity-client` — that lets every SPA bootstrap session state without duplicating fetch logic.
- Define a deterministic post-login flow.
- Define a repeatable template so adding Finance, PMO, or Timesheet does not require revisiting platform packages.
- Keep v1 minimal: a single tenant is seeded from environment variables; tenant CRUD is deferred.

## Non-goals (deferred)

- Multi-tenant per user (the data model enforces 1 user = 1 tenant via a uniqueness constraint).
- Tenant CRUD UI (seeded from env in v1).
- Per-app RBAC (v1 has `is_admin` boolean only; members can access every app of their tenant).
- Superadmin impersonation / "view as tenant".
- Member self-leave.
- Federated identity linking across providers (a single user record per verified email is enforced; cross-provider link rules are unchanged from current upsert).
- Billing, quota, usage metering.

## Constraints

- Pre-1.0: no backward compatibility; old schema and migrations are deleted and regenerated rather than versioned. Old package names are renamed without aliases.
- Schema-per-module DDD: every package owns its own Drizzle schema and migrations. No cross-schema foreign keys; cross-context references are by ID only.
- Multi-tenant. Every persisted business row carries `tenant_id` with RLS enforcement.
- One Hono backend (`apps/api`). Each platform/module package exports `routes(deps) => Hono`; `apps/api/src/main.ts` is the only composition root.
- ESM only, no path aliases, no `any`, types derived from Zod and Drizzle.

## Personas

| Persona | Description | Surface |
|---|---|---|
| Seta superadmin | Platform-level account. Not a member of any tenant. | `apps/console` → `/admin/*` |
| Tenant admin | A tenant member with `is_admin=true`. Manages members of their tenant. | `apps/console` → `/members` (and member surfaces) |
| Tenant member | A regular user belonging to exactly one tenant. | `apps/studio`, `apps/finance`, `apps/pmo`, `apps/timesheet`, `apps/console` (profile/home) |
| End user (external) | Interacts only through channels (Teams bot, email, web widget). Out of scope for this spec. | (channels) |

## Bounded contexts

### Backend

```
platform/identity                ← renamed from platform/sso; absorbs platform/auth
  Owns: auth.users, auth.user_identities, auth.sessions, auth.api_keys, auth.superadmins
  HTTP routes:
    POST /sso/login/:provider
    GET  /sso/callback/:provider
    POST /sso/logout
    GET  /me
  Middleware: requireSession, requireSuperadmin, csrfMiddleware
              requireApiKey is defined but unused in v1 (no routes consume API keys yet);
              kept here so the next phase can wire machine-to-machine endpoints without a re-home.
  Service:
    upsertUserByIdentity (existing)
    resolveMeContext(userId): { user, tenant | null, isSuperadmin, apps, csrfToken }
      (calls into platform/tenancy via a thin service interface; see Module wiring)

platform/tenancy                 ← renamed from platform/tenant; expanded
  Owns: tenant.tenants, tenant.tenant_users, tenant.tenant_connectors
  HTTP routes:
    GET    /members                              requireSession + requireTenantAdmin
    PATCH  /members/:userId  { isAdmin }         requireSession + requireTenantAdmin
    DELETE /members/:userId                      requireSession + requireTenantAdmin
    GET    /admin/tenants                        requireSession + requireSuperadmin
  Middleware: tenantMiddleware (existing), requireTenantAdmin
  Service:
    findOrAttachUser(userId): 'superadmin' | 'attached' | 'no-membership'
    listMembers(tenantId): Member[]
    setMemberAdmin(tenantId, userId, isAdmin): Member
    removeMember(tenantId, userId): void
    listAllTenants(): Tenant[]  (superadmin)

(deleted) platform/auth          ← package removed entirely; api_keys schema moved
```

### Frontend

```
@seta/identity-client            ← renamed from @seta/portal
  No page components. Pure client glue + types.
  Exports:
    useMe(): UseQueryResult<MeResponse>
    signIn(provider, { returnTo })
    <RequireSession>              redirect on 401 to /console/login?returnTo=...
    types re-exported from platform/identity (isomorphic Zod schemas)

@seta/ui                         ← unchanged role (design tokens + primitives); gains AppSwitcher
  + AppSwitcher                  pure UI primitive; receives apps[] + current

apps/console                     ← NEW
  Owns: login, callback, no-workspace splash, ConsoleHome, /profile,
        /members (tenant-admin), /admin/* (superadmin)

apps/studio                      ← cleaned up
  Drops: /login, /login/callback, /tenants, /tenants/$id/*
  Routes become flat (tenant implicit from session); only product surfaces remain.

apps/finance / apps/pmo / apps/timesheet
  Future SPAs following the same template as cleaned-up apps/studio.
```

## Data model

All migrations regenerated from scratch (no version history).

### `auth` schema (owned by `platform/identity`)

- `users` — `(id, email, name, picture_url, created_at)`. Existing.
- `user_identities` — `(provider, subject) PK → user_id`. Existing.
- `sessions` — `(id, user_id, expires_at, ip, user_agent)`. Existing.
- `api_keys` — `(id, tenant_id, hashed_key, scopes[], created_at, revoked_at)`. Moved from deleted `platform/auth`.
- `superadmins` — **new**:
  - `user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
  - `granted_at timestamptz NOT NULL DEFAULT now()`
  - `granted_by uuid NULL REFERENCES users(id)` (NULL when seeded from env)
  - No RLS; superadmins are platform-level.

### `tenant` schema (owned by `platform/tenancy`)

- `tenants` — `(id, slug, display_name, status, metadata, created_at)`. Existing.
- `tenant_connectors` — existing.
- `tenant_members` — **already exists**, keep name and role enum; one ALTER required:
  - `user_id uuid NOT NULL` (no foreign key — cross-schema reference by ID)
  - `tenant_id uuid NOT NULL REFERENCES tenants(id)`
  - `role tenant_member_role NOT NULL DEFAULT 'member'` — enum `('owner','admin','member')` (existing)
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `PRIMARY KEY (user_id, tenant_id)` (existing)
  - **ALTER**: add `UNIQUE (user_id)` — enforces v1 invariant "one user belongs to at most one tenant" at the storage layer. Existing RLS policies (`tenant_isolation_tenant_members`, `self_read_tenant_members`) and grants are preserved.
  - **ALTER**: add `source text NOT NULL DEFAULT 'manual'` — `'seed' | 'directory_sync' | 'manual'` (for v1 audit traceability).

The `/me` payload's `tenant.isAdmin` boolean is **derived** from `role IN ('owner','admin')`. Per-app RBAC remains deferred; the richer enum is a free win since the existing schema already carries it.

### Side effects removed

- `tenancy.recordConsent` no longer inserts into `tenant.tenants`. The `INSERT … ON CONFLICT DO NOTHING` block is removed. If a consent attempt arrives for an unknown `tenant_id`, the call throws `NotFound('tenant')` and the connector flow returns a 404 to the caller. Bootstrap happens through seed.

## Seed (v1)

`apps/api/src/seed.ts` runs at startup, idempotent. Reads env (validated via Zod in `apps/api/src/env.ts`):

```
SETA_SEED_TENANT_ID=uuid
SETA_SEED_TENANT_SLUG=string
SETA_SEED_TENANT_NAME=string
SETA_SEED_SUPERADMIN_EMAILS=csv (e.g. "canh@seta-international.vn")
```

Behavior:

1. Upsert tenant row matching `SETA_SEED_TENANT_*` (status `active`).
2. For each email in `SETA_SEED_SUPERADMIN_EMAILS`:
   - Upsert a placeholder row in `auth.users` (name/picture filled on first SSO login).
   - Insert into `auth.superadmins` if missing.
3. Do **not** seed `tenant_users` — population happens through the `ms365-directory` connector sync (already in repo) or future manual admin actions.

## Identity → Tenancy resolution

On SSO callback (`platform/identity`), after `upsertUserByIdentity`:

```
status = await tenancy.findOrAttachUser(user.id)

  case 'superadmin'       → set session, 302 /console/admin/tenants
  case 'attached'         → set session, 302 to resolveNextUrl(returnTo, sessionUser)
  case 'no-membership'    → set session, 302 /console/no-workspace
```

`resolveNextUrl` (member only):

1. `returnTo` from signed state cookie, **if** the path begins with an app prefix the user can access (`/console/`, `/studio/`, `/finance/`, `/pmo/`, `/timesheet/`).
2. Else, signed HttpOnly `seta_last_app` cookie value (e.g. `studio` → `/studio/`).
3. Else, `/console/`.

`seta_last_app` is maintained by a small middleware in `apps/api` that observes GET HTML requests for `/console/`, `/studio/`, etc. and refreshes the cookie. No dedicated endpoint.

## `/me` contract

```jsonc
{
  "user": {
    "id": "uuid",
    "email": "string",
    "name": "string",
    "pictureUrl": "string | null"
  },
  "tenant": {
    "id": "uuid",
    "slug": "string",
    "name": "string",
    "isAdmin": "boolean"
  } | null,
  "isSuperadmin": "boolean",
  "apps": ["studio" | "finance" | "pmo" | "timesheet"],
  "csrfToken": "string"
}
```

- Members: `tenant` populated, `isSuperadmin=false`, `apps` lists every app the user can access. V1 logic: every product app that is currently deployed is included for any tenant member. Apps are deployed independently; until Finance/PMO/Timesheet ship, only `"studio"` appears. The deployed-app set is configured via env (`SETA_APPS_DEPLOYED=studio,finance,…`) read at boot in `apps/api/src/env.ts`.
- Superadmins: `tenant=null`, `isSuperadmin=true`, `apps=[]`.
- No-membership: `tenant=null`, `isSuperadmin=false`, `apps=[]`.

`MeResponse` is a Zod schema exported by `@seta/identity` (isomorphic); `@seta/identity-client` re-exports it.

## Module wiring

`platform/identity` must not import `platform/tenancy` directly (DDD: identity is the more primitive context). Instead, `apps/api/src/main.ts` injects a thin interface:

```ts
const meContext: MeContextProvider = {
  resolve(userId) { return tenancy.resolveMeContext(userId) }
}
app.route('/', identityRoutes({ ...identityDeps, meContext }))
app.route('/', tenancyRoutes({ ...tenancyDeps }))
```

`MeContextProvider` lives in `platform/identity`. Concrete implementation lives in `platform/tenancy`. The api app is the only place that wires them together — there is no DI container.

## Frontend route ownership

```
apps/console (mounted at /console/*)
  /login                                  public
  /login/:provider/callback               public
  /no-workspace                           public (after login, if no membership)
  /                          authed       ConsoleHome (apps + last-app jump)
  /profile                   authed       ProfilePage
  /members                   authed+admin MembersPage (list, toggle is_admin, remove)
  /admin                     superadmin   AdminLayout (index)
  /admin/tenants             superadmin   TenantsList (read-only v1)

apps/studio (mounted at /studio/*)        ALL routes authed + tenant-member
  /                                       dashboard
  /agents /runs /runs/:id /workflows /tools /threads /corpus /audit
  /connectors /metrics /setup

apps/finance, apps/pmo, apps/timesheet    Future, same template; no /tenants/$id prefix.
```

## Origin & cookie strategy

Single origin (`seta.app`); apps are paths. Reverse proxy:

```
/                  → 302 /console/
/console/*         → apps/console (Vite build, base="/console/")
/studio/*          → apps/studio  (base="/studio/")
/finance/*         → apps/finance (future)
/api/v1/*          → apps/api
/sso/*  /me  /members  /admin/*  → apps/api
```

Session cookie:

```
name:     seta_session
domain:   seta.app
path:     /
httpOnly: true
secure:   true (production)
sameSite: Lax
signed:   HMAC via SESSION_COOKIE_HMAC_KEY
ttl:      configured (existing)
```

`seta_last_app`: same attrs, separate signed cookie, value is one of `studio | finance | pmo | timesheet`.

## Session-expiry handling in product SPAs

Product SPAs (Studio/Finance/PMO/Timesheet) do not show a login UI. On a 401 from any fetch:

```ts
// inside @seta/identity-client RequireSession
window.location.href =
  `/console/login?returnTo=${encodeURIComponent(window.location.href)}`
```

Login lives in exactly one place: `apps/console`.

## AppSwitcher (`@seta/ui`)

Shared waffle popover with one tile per app. Data sourced from `useMe().apps`. The current app is marked active by the host SPA. Clicking a tile triggers a full navigation:

```ts
window.location.href = `/${appId}/`
```

This is an explicit exception to the DESIGN.md guideline against `window.location.href`: inter-SPA navigation crosses bundle boundaries and must be a full reload. Documented in `@seta/ui/AppSwitcher` source.

## Provider configuration

Boot-time env validation (`apps/api/src/env.ts`):

```
SSO_ENTRA_ENABLED=true|false
SSO_ENTRA_CLIENT_ID, SSO_ENTRA_TENANT_ID, SSO_ENTRA_CLIENT_SECRET
SSO_GOOGLE_ENABLED=true|false
SSO_GOOGLE_CLIENT_ID, SSO_GOOGLE_CLIENT_SECRET
```

`/sso/login/:provider` returns `404` for disabled providers. The `LoginPage` in `apps/console` derives its visible provider list from `/sso/providers` (a tiny config endpoint) so disabling a provider hides the button without a frontend redeploy.

`id_token.email_verified === true` is required; otherwise the callback returns `403`. Standard SaaS hardening; prevents trust-on-first-use for unverified emails.

## Cross-cutting standards (SaaS production defaults)

- **Rate limiting** on `/sso/login/:provider`, `/sso/callback/:provider`, `/sso/logout`, `/members*`, `/admin/*` per the policy in `docs/production-readiness/rate-limiting-policy.md`.
- **Audit logging** for: superadmin grant/revoke, `is_admin` toggle, member remove, tenant create (phase later). Uses the existing audit infrastructure used by Studio's `/audit` surface; tenancy emits structured events.
- **Session rotation**: when a tenant-admin toggles `is_admin` on a user, the affected user's existing sessions are invalidated (forcing re-login with the new claim).
- **Structured logs**: every route in `platform/identity` and `platform/tenancy` emits `tenant_id`, `user_id`, correlation id, and event name via `@seta/observability` (see CLAUDE.md logging conventions).
- **No `process.env.X` reads** outside `apps/api/src/env.ts`.

## Migration & rename plan (single PR)

Old packages renamed, no shims:

| From | To | Notes |
|---|---|---|
| `platform/sso` (`@seta/sso`) | `platform/identity` (`@seta/identity`) | All references updated in same PR |
| `platform/tenant` (`@seta/tenant`) | `platform/tenancy` (`@seta/tenancy`) | |
| `platform/portal` (`@seta/portal`) | `platform/identity-client` (`@seta/identity-client`) | Page components removed (see below) |
| `platform/auth` | (deleted) | Only contained `auth.api_keys` schema; moved into `platform/identity`. The `apps/api` dependency on `@seta/auth` is removed in the same PR. |

`@seta/portal` ships 5 page components today; they relocate as:

| Component | Destination | Notes |
|---|---|---|
| `LoginPage.tsx` | `apps/console/src/pages/LoginPage.tsx` | Login is owned by console |
| `CallbackSplash.tsx` | `apps/console/src/pages/CallbackPage.tsx` | Callback handler in console |
| `TenantsPage.tsx` | (deleted) | Concept removed: 1 user = 1 tenant |
| `ConnectorsPage.tsx` | `apps/studio/src/pages/ConnectorsPage.tsx` | Studio owns `/connectors` (tenant implicit) |
| `ConsentLandingPage.tsx` | `apps/studio/src/pages/ConsentLandingPage.tsx` | Rendered at `/connectors/:cid/consent` |

Companion test files relocate alongside each component. After the moves, `platform/portal` (renamed to `platform/identity-client`) contains no page components — only hooks, fetch helpers, types, and `<RequireSession>`.

Deletions in `apps/studio`:

- `src/routes/login.tsx`
- `src/routes/login.$provider.callback.tsx`
- `src/routes/_authed/tenants.tsx`
- `src/routes/_authed/tenants.$id.tsx`
- `src/routes/_authed/tenants.$id.{agents,connectors,runs,corpus,audit,workflows,tools,threads,metrics,setup}.tsx` (moved to flat `src/routes/_authed/<name>.tsx`, `tenantId` removed from URL and code).
- `src/routes/_authed/me.tsx` (concept moves to `apps/console/profile`).

`@tanstack/router` route tree regenerated.

Migrations: all old SQL files under `platform/sso/migrations`, `platform/tenant/migrations`, and `platform/auth/migrations` are deleted. Two fresh init migrations per package (`0001_init.sql` from `drizzle-kit generate`, `0002_init_custom.sql` for RLS/grants via `drizzle-kit generate --custom`).

Bug fix in same PR: `TenantSummary` is currently exported from `@seta/agent-sdk` (see `apps/studio/src/routes/_authed/tenants.tsx:1`). It moves to `@seta/identity` and `@seta/identity-client` re-exports.

## New-module template (Finance / PMO / Timesheet)

This is the answer to "what does a new module reuse and how is it defined?"

### Backend

```
modules/products/<name>/
├── package.json                @seta/<name>
├── drizzle.config.ts           own schema (e.g. 'finance')
├── migrations/0001_init.sql    drizzle-kit generated
├── src/
│   ├── schema/                 all rows have tenant_id + RLS
│   ├── service/
│   ├── routes.ts               export create<Name>Routes(deps): Hono
│   ├── tools/                  agent tools (optional)
│   └── index.ts
└── tests/
```

Mount in `apps/api/src/main.ts`:

```ts
app.route('/api/v1/<name>', create<Name>Routes(deps))
```

Constraints (CI-enforced by existing boundary scripts):
- May import `platform/*` and `modules/connectors/*`.
- Must not import other `modules/products/*` or `modules/channels/*`.
- Schema-per-module: own Drizzle config and migrations directory.

### Frontend

```
apps/<name>/
├── package.json
│   dependencies: @seta/identity-client, @seta/ui, @seta/agent-sdk (optional),
│                 @tanstack/react-router, @tanstack/react-query, react, react-dom, zod
├── vite.config.ts              base: '/<name>/'
├── src/
│   ├── main.tsx                QueryClientProvider + RouterProvider
│   ├── router.tsx
│   ├── routeTree.gen.ts        TanStack CLI
│   ├── styles.css              @import '@seta/ui/styles.css'
│   ├── api/{client,queries}.ts
│   ├── nav/<name>Nav.ts        fixed NavItem[] (no tenantId param)
│   └── routes/
│       ├── __root.tsx
│       ├── _authed.tsx         <RequireSession> + <AppShell nav agentContext>
│       └── _authed/<surfaces>.tsx
└── tests/e2e
```

Boot a new app by copying the template, replacing the nav, and adding the AppId to the enum in `@seta/ui/AppSwitcher`. Reverse-proxy gains one prefix rule. Authentication, sessions, tenancy, design tokens, AppShell, and AppSwitcher are inherited as zero-config dependencies.

### What gets reused

| Concern | Lives in | New module action |
|---|---|---|
| SSO + sessions + `/me` | `platform/identity` | none |
| Tenant + members + RLS | `platform/tenancy` | none |
| Identity client (hooks + 401 redirect) | `@seta/identity-client` | `import { useMe, RequireSession }` |
| Design tokens, AppShell, AppSwitcher | `@seta/ui` | `import { AppShell, AppSwitcher }` |
| Agent panel + streaming | `@seta/agent-sdk` | optional |
| Outbound vendor OAuth | new `modules/connectors/<vendor>` | only if a new external system is added |
| Module schema | `modules/products/<name>/migrations` | yes |
| Module routes | `modules/products/<name>/src/routes.ts` | yes |
| Module mount | `apps/api/src/main.ts` | one line |
| App tile | `@seta/ui/AppSwitcher` AppId enum | one entry |

## Verification

Per `superpowers:verification-before-completion`:

1. `pnpm typecheck` across the workspace.
2. `pnpm lint` (Biome).
3. `pnpm test:unit` — `platform/identity`, `platform/tenancy`, `@seta/identity-client`, `@seta/ui` (AppSwitcher).
4. `pnpm test:integration` against Postgres:
   - Seed run is idempotent.
   - `/sso/login → /sso/callback → /me` paths for: superadmin email, member email, unknown email.
   - `findOrAttachUser` branches: `superadmin`, `attached`, `no-membership`.
   - `/members` requires `is_admin`; non-admin gets 403.
   - `/admin/tenants` requires superadmin; non-superadmin gets 403.
   - RLS: `tenant_users` queries from one tenant cannot read another tenant's rows.
   - Toggling `is_admin` invalidates the affected user's existing sessions.
   - Disabled provider returns 404 from `/sso/login/:provider`.
5. `pnpm test:e2e` (Playwright) across `apps/console` + `apps/studio`:
   - Member login → redirected to last-app (`/studio/`) when cookie is set; `/console/` otherwise.
   - Superadmin login → `/console/admin/tenants`.
   - Unknown user → `/console/no-workspace`.
   - Studio receives a 401 → redirected to `/console/login?returnTo=…` → after login, returned to the original URL.
   - AppSwitcher navigates between console ↔ studio with full reload.
   - Tenant admin toggles `is_admin` on a member; member's open Studio tab returns 401 on next request and is sent back to login.
6. Manual: `pnpm dev` against an Entra dev tenant; click through console → studio → AppSwitcher → `/members`.
7. Bundle size check on `apps/studio` (existing script).
8. Boundary CI: `apps/studio` no longer imports `@seta/portal`; `modules/products/*` does not import `@seta/identity-client`; `modules/channels/*` and `modules/connectors/*` boundaries unchanged.

## Open items (intentionally deferred)

- Tenant CRUD UI (superadmin write surface) — `/admin/tenants` is read-only in v1.
- Per-app RBAC matrix — current model is `is_admin` boolean only.
- Superadmin impersonation ("view as tenant") with audit logging.
- Member self-leave endpoint.
- JIT membership attachment from Entra `tid` claim.
- Federated identity merging across providers for the same verified email.
- Billing, quotas, usage metering.
