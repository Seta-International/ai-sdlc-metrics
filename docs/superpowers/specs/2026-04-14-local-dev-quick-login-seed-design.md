# Local Dev: Quick Login + Seed Data Design

**Date:** 2026-04-14
**Status:** Approved

## Problem

Local development is slow because:

1. Login requires Microsoft/Google SSO or a magic link email — neither works without external services
2. No seed data exists — the DB is empty after `db:up`
3. The magic link flow has two incomplete gaps: `resolveLogin` and `validateMagicLink` don't sign/return a JWT, and the web-shell `/api/auth/magic-link` route doesn't exist

## Goals

1. `LOCAL_DEV=1` flag that enables all local-only shortcuts
2. Quick login: type any seeded email → instant session, no email sent
3. Seed data: 3 tenants (SETA, BlueOC, AIcycle) with ~300 real employees, all 12 roles covered
4. Fix the two broken gaps in the existing auth flow as a prerequisite

## Out of Scope

- Production magic link tenant resolution (resolving tenantId from email domain)
- People module seeding (employment profiles, org placements)
- Any data beyond `tenant`, `actor`, `user_identity`, `role_grant`, `role_permission`

---

## ENV Flags

| Var                     | File                        | Value  | Effect                                                            |
| ----------------------- | --------------------------- | ------ | ----------------------------------------------------------------- |
| `LOCAL_DEV`             | `apps/api/.env`             | `1`    | Registers `identity.devLogin` tRPC procedure at startup           |
| `NEXT_PUBLIC_LOCAL_DEV` | `apps/web-shell/.env.local` | `true` | Web-shell uses instant session path instead of "check your email" |

`LOCAL_DEV` is the server-side gate. The API procedure is not wired if unset — frontend env var alone cannot enable it in production.

Both vars added to their respective `.env.example` files, commented out with a note.

---

## API Changes

### Prerequisite: JWT signing wired into `resolveLogin`

**File:** `apps/api/src/modules/kernel/interface/trpc/identity.router.ts`

Add:

```typescript
let jwtService: JwtService | null = null
export function setIdentityJwtService(svc: JwtService): void {
  jwtService = svc
}
```

`TrpcModule.onModuleInit` calls `setIdentityJwtService(this.jwtService)` (it already holds the service).

`resolveLogin` mutation: after `getCommandBus().execute(ResolveLoginCommand)` returns `{ actorId, tenantId, roles, provider }`, sign and return:

```typescript
const token = await getJwtService().sign({ sub: actorId, tid: tenantId, roles, provider })
return { token }
```

### Prerequisite: `validateMagicLink` completes the loop

Currently returns `{ email, tenantId }` from `ValidateMagicLinkCommand` and stops. After the fix it chains into `ResolveLoginCommand` then signs a JWT:

```typescript
validateMagicLink: publicProcedure.input(...).mutation(async ({ input }) => {
  const { email, tenantId } = await commandBus.execute(new ValidateMagicLinkCommand(input.token))
  const result = await commandBus.execute(
    new ResolveLoginCommand('magic_link', email, email, email, tenantId)
  )
  const token = await getJwtService().sign({ sub: result.actorId, tid: result.tenantId, roles: result.roles, provider: result.provider })
  return { token }
})
```

### New: `findByEmail` on user identity repository

**Interface:** `IUserIdentityRepository`

```typescript
findByEmail(email: string): Promise<UserIdentity | null>
```

**Implementation:** `DrizzleUserIdentityRepository`

```typescript
async findByEmail(email: string): Promise<UserIdentity | null> {
  const rows = await this.db
    .select()
    .from(userIdentity)
    .where(and(eq(userIdentity.email, email), eq(userIdentity.status, 'active')))
    .limit(1)
  return (rows[0] as UserIdentity | undefined) ?? null
}
```

### New: `DevLoginCommand` + `DevLoginHandler`

**Files:**

- `apps/api/src/modules/kernel/application/commands/dev-login.command.ts`
- `apps/api/src/modules/kernel/application/commands/dev-login.handler.ts`

Handler logic:

1. `userIdentityRepo.findByEmail(email)` — error if not found or inactive
2. `actorRepo.findById(actorId, tenantId)` — error if suspended
3. `roleGrantRepo.findByActorId(actorId, tenantId)` — get roles
4. `auditRepo.insert(...)` — record the dev login event
5. Returns `ResolveLoginResult` with `provider: 'dev'`

Registered in `KernelModule` providers (alongside `ResolveLoginHandler`).

### New: `identity.devLogin` tRPC procedure

Added to `identityRouter` conditionally — only when `process.env['LOCAL_DEV'] === '1'`:

```typescript
...(process.env['LOCAL_DEV'] === '1' ? {
  devLogin: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const result = await getCommandBus().execute(new DevLoginCommand(input.email))
      const token = await getJwtService().sign({
        sub: result.actorId, tid: result.tenantId, roles: result.roles, provider: result.provider,
      })
      return { token }
    }),
} : {}),
```

The spread means in production, `identity.devLogin` simply doesn't exist on the router.

---

## Web-shell Changes

### New: `/api/auth/magic-link` route

**File:** `apps/web-shell/src/app/api/auth/magic-link/route.ts`

```
POST /api/auth/magic-link
Body: { email: string }
```

**Dev path** (`NEXT_PUBLIC_LOCAL_DEV === 'true'`):

1. POST to `${API_BASE_URL}/trpc/identity.devLogin` with `{ json: { email } }`
2. Extract `result.data.json.token` from tRPC response
3. Set `_future_session` httpOnly cookie with standard `COOKIE_OPTIONS`
4. Return `{ ok: true, dev: true }`

**Production path:**

- Returns `{ ok: false, error: 'Tenant resolution not yet implemented' }` with status 501
- This keeps the existing broken state explicit rather than silently failing

### Modified: login page redirect on dev login

**File:** `apps/web-shell/src/app/auth/login/page.tsx`

In `handleMagicLink`, after successful POST:

- If `NEXT_PUBLIC_LOCAL_DEV === 'true'` and response includes `dev: true`: do `window.location.href = '/'` instead of `setSent(true)`
- Production path: `setSent(true)` as before (shows "check your email")

---

## Seed Data

### 3 Tenants

| slug      | name               | planTier       | Company field value |
| --------- | ------------------ | -------------- | ------------------- |
| `seta`    | SETA International | `enterprise`   | `SETA`              |
| `blueoc`  | BlueOC             | `professional` | `BlueOC`            |
| `aicycle` | AIcycle            | `starter`      | `AIcycle`           |

Tenant UUIDs are deterministic (UUID v5, namespace = `6ba7b810-9dad-11d1-80b4-00c04fd430c8`, key = slug).

### Tenant assignment rules

Tenant is determined by the `company` field from the source data, **not** email domain. Some AIcycle employees use `@seta-international.vn` emails — they still belong to the `aicycle` tenant.

Fallback for `company=null` (21 employees): assign by email domain (`@blueoc.tech` → blueoc, `@seta-international.vn` → seta). Skip any record whose email is not a company domain (yopmail, gmail, etc.).

### Employee role mapping

| Source field    | Future role    |
| --------------- | -------------- |
| `is_admin=true` | `tenant_admin` |
| `is_pm=true`    | `line_manager` |
| Everyone else   | `employee`     |

### Demo accounts per tenant (all missing roles)

One account per tenant for: `hr_ops`, `recruiter`, `finance_operator`, `executive`, `staffing_owner`, `account_manager`, `review_operator`.

Email pattern: `demo.<role>@<tenant-domain>`. Domains:

- SETA: `demo.hr_ops@seta-international.vn`
- BlueOC: `demo.recruiter@blueoc.tech`
- AIcycle: `demo.finance_operator@aicycle.ai` (`@aicycle.ai` is the AIcycle domain)

`platform_admin` is SETA-only: `demo.platform_admin@seta-international.vn`

### JSON file

**Location:** `apps/api/src/seeds/data/seed-data.json`

```json
{
  "tenants": [
    { "id": "<uuid-v5>", "slug": "seta", "name": "SETA International", "planTier": "enterprise" },
    { "id": "<uuid-v5>", "slug": "blueoc", "name": "BlueOC", "planTier": "professional" },
    { "id": "<uuid-v5>", "slug": "aicycle", "name": "AIcycle", "planTier": "starter" }
  ],
  "employees": [
    {
      "id": "<uuid-v5 from email>",
      "email": "an.nguyen@seta-international.vn",
      "name": "Nguyễn Đức An",
      "tenantSlug": "seta",
      "roles": ["employee"],
      "directManagerEmail": "nam.hoang@seta-international.vn",
      "isActive": true
    }
  ]
}
```

All actor/identity UUIDs are derived from email via UUID v5 — deterministic, so seed is idempotent.

### Seed script

**Location:** `apps/api/src/seeds/seed.ts`

Execution order per tenant:

1. `INSERT INTO core.tenant ... ON CONFLICT DO NOTHING`
2. For each employee: `INSERT INTO core.actor` → `INSERT INTO core.user_identity` → `INSERT INTO core.role_grant` (all `ON CONFLICT DO NOTHING`)
3. Call `SeedRolePermissions` logic inline (insert default permissions per tenant per role key)

`ssoSubject` for all seeded identities = email (they're local accounts, provider = `'local'`).

**Bootstrap actor:** Before seeding employees, a system actor is created per tenant with a deterministic UUID derived from `system@<tenantSlug>` (UUID v5). This actor acts as `grantedBy` for all role_grants in that tenant. The system actor is inserted into `core.actor` with `type = 'system'` and `displayName = 'Seed System'`.

Run with:

```bash
bun run seed   # from apps/api/
```

Added to `apps/api/package.json`:

```json
"seed": "bun run src/seeds/seed.ts"
```

---

## Testing

- `DevLoginCommand` + `DevLoginHandler`: unit tests (happy path + user-not-found + suspended actor)
- `findByEmail`: covered by existing repository integration test pattern
- Seed script: run against `future_dev`, verify counts with `SELECT COUNT(*) FROM core.actor`
- Manual smoke test: `LOCAL_DEV=1`, type `demo.hr_ops@seta-international.vn`, confirm instant redirect to `/`

---

## Files Changed

### New

- `apps/api/src/modules/kernel/application/commands/dev-login.command.ts`
- `apps/api/src/modules/kernel/application/commands/dev-login.handler.ts`
- `apps/api/src/modules/kernel/application/commands/dev-login.handler.spec.ts`
- `apps/api/src/seeds/data/seed-data.json`
- `apps/api/src/seeds/seed.ts`
- `apps/web-shell/src/app/api/auth/magic-link/route.ts`

### Modified

- `apps/api/src/modules/kernel/domain/repositories/user-identity.repository.port.ts` — add `findByEmail`
- `apps/api/src/modules/kernel/infrastructure/repositories/drizzle-user-identity.repository.ts` — implement `findByEmail`
- `apps/api/src/modules/kernel/kernel.module.ts` — register `DevLoginHandler`
- `apps/api/src/modules/kernel/interface/trpc/identity.router.ts` — add `setIdentityJwtService`, fix `resolveLogin`, fix `validateMagicLink`, add conditional `devLogin`
- `apps/api/src/common/trpc/trpc.module.ts` — call `setIdentityJwtService`
- `apps/web-shell/src/app/auth/login/page.tsx` — redirect on dev login success
- `apps/api/.env.example` — add `LOCAL_DEV=1` (commented)
- `apps/web-shell/.env.example` (create if missing) — add `NEXT_PUBLIC_LOCAL_DEV=true` (commented)
- `apps/api/package.json` — add `seed` script
