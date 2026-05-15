# Portal & Tenancy Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish clean DDD boundaries between identity, tenancy, and product modules; extract `apps/console` as the home for login/profile/members/superadmin; flatten `apps/studio` to product-only surfaces; and create a repeatable template for new product SPAs (Finance/PMO/Timesheet).

**Architecture:** One Hono backend with three platform packages (`identity`, `tenancy`, deleted `auth`) and one frontend client lib (`identity-client`). Apps/console owns all session-level UI; product SPAs assume an authenticated user with one tenant. Single origin, app-as-path. Pre-1.0 rename — no shims, full cascade in one branch.

**Tech Stack:** Hono 4 · Drizzle ORM + drizzle-kit · Postgres 16 (RLS) · Vite + TanStack Router + React 19 + React Query · Vitest · Playwright · `pnpm` workspaces.

**Spec:** `docs/superpowers/specs/2026-05-15-portal-tenancy-boundaries-design.md`

---

## Phase 0 — Worktree & baseline

### Task 0.1: Create an isolated worktree

- [ ] **Step 1: Invoke `superpowers:using-git-worktrees`**

Branch name: `feat/portal-tenancy-boundaries`. Base: `main`.

- [ ] **Step 2: Verify baseline**

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
```

Expected: all pass. If any fail on `main` already, stop and surface to the user — do not start the refactor on red.

- [ ] **Step 3: Capture baseline failure surface**

```bash
pnpm test:integration 2>&1 | tee /tmp/baseline-integration.txt
```

Skip if `DATABASE_URL` is not set; otherwise record what passes today.

---

## Phase 1 — Backend renames (no behaviour changes)

These three sub-phases rename packages with no other change. Each ends in a green typecheck + unit-test run + commit.

### Task 1.1: Rename `@seta/identity` → `@seta/identity`

**Files:**
- Rename dir: `platform/sso` → `platform/identity`
- Modify: `platform/identity/package.json` (`name`, `description`)
- Modify all import sites (see Step 2)

- [ ] **Step 1: Move the directory**

```bash
git mv platform/sso platform/identity
```

- [ ] **Step 2: Update `platform/identity/package.json`**

Change `"name": "@seta/identity"` → `"name": "@seta/identity"`. Update `description` to `"Identity: SSO flow, users, sessions, API keys, superadmins"`.

- [ ] **Step 3: Find every consumer**

```bash
grep -rln "@seta/identity" --include='*.ts' --include='*.tsx' --include='package.json' \
  apps modules platform | sort -u
```

Replace `@seta/identity` with `@seta/identity` in every match (use `sed -i '' 's|@seta/identity|@seta/identity|g'` per macOS, or `sed -i` on Linux). Known sites today: `apps/api/package.json:38`, `apps/api/src/main.ts:40`, `apps/api/tests/integration/sso.test.ts:2`, `apps/studio/package.json:21`, plus several SCOPE.md files (update those too — they reference package names).

- [ ] **Step 4: Reinstall + typecheck**

```bash
pnpm install
pnpm --filter @seta/identity typecheck
pnpm --filter @seta/api typecheck
pnpm --filter @seta/studio typecheck
```

Expected: all pass.

- [ ] **Step 5: Run identity unit tests**

```bash
pnpm --filter @seta/identity test:unit
```

Expected: all existing tests pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(identity): rename @seta/identity → @seta/identity"
```

---

### Task 1.2: Rename `@seta/tenant` → `@seta/tenancy`

- [ ] **Step 1: Move the directory**

```bash
git mv platform/tenant platform/tenancy
```

- [ ] **Step 2: Update `platform/tenancy/package.json`**

`"name": "@seta/tenancy"`. Update `description` to `"Tenancy: tenants, members, connector consent, admin"`.

- [ ] **Step 3: Find every consumer**

```bash
grep -rln "@seta/tenant\"\\|@seta/tenant'" --include='*.ts' --include='*.tsx' --include='package.json' \
  apps modules platform | sort -u
```

Replace `@seta/tenant` with `@seta/tenancy`. Known sites: `apps/api/package.json:39`, `apps/api/src/main.ts:48`, `apps/studio/SCOPE.md`, `modules/connectors/ms365-planner/package.json:27`, `modules/connectors/ms365-planner/src/{etag,cache,sync,cache.test,etag.test}.ts`, `modules/products/planner/package.json:30`, `modules/products/planner/src/tools/write/{create_plan.commit,complete_tasks.preview}.ts`, plus SCOPE.md files.

- [ ] **Step 4: Update internal cross-deps**

`platform/identity/package.json` currently lists `"@seta/tenant": "workspace:*"`. Change to `"@seta/tenancy": "workspace:*"`.

- [ ] **Step 5: Reinstall + typecheck**

```bash
pnpm install
pnpm typecheck
```

Expected: full workspace passes.

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @seta/tenancy test:unit
pnpm --filter @seta/identity test:unit
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(tenancy): rename @seta/tenant → @seta/tenancy"
```

---

### Task 1.3: Rename `@seta/portal` → `@seta/identity-client`

**Files:**
- Rename: `platform/portal` → `platform/identity-client`
- Modify: `platform/identity-client/package.json`
- Modify: every consumer's import + package.json

- [ ] **Step 1: Move**

```bash
git mv platform/portal platform/identity-client
```

- [ ] **Step 2: Update `platform/identity-client/package.json`**

```jsonc
{
  "name": "@seta/identity-client",
  "description": "Seta identity client: useMe hook, signIn helper, RequireSession, shared session/tenant types"
}
```

- [ ] **Step 3: Replace imports**

```bash
grep -rln "@seta/portal" --include='*.ts' --include='*.tsx' --include='package.json' \
  apps modules platform | sort -u
```

Known: `apps/studio/package.json:20`, `apps/studio/src/routes/login.tsx:1`, `apps/studio/src/routes/login.$provider.callback.tsx:1`, `apps/studio/src/routes/_authed/tenants.tsx:1`, `apps/studio/src/routes/_authed/tenants.$id.connectors.tsx:2`, `apps/studio/src/routes/_authed/tenants.$id.connectors.$cid.consent.tsx:1`. SCOPE.md files too.

Replace `@seta/portal` with `@seta/identity-client`.

- [ ] **Step 4: Reinstall + typecheck**

```bash
pnpm install
pnpm typecheck
```

- [ ] **Step 5: Run unit tests**

```bash
pnpm --filter @seta/identity-client test:unit
pnpm --filter @seta/studio test:unit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(identity-client): rename @seta/portal → @seta/identity-client"
```

---

## Phase 2 — Delete `@seta/auth`; absorb `api_keys` into `@seta/identity`

### Task 2.1: Move `auth.api_keys` schema into identity

**Files:**
- Modify: `platform/identity/src/schema.ts` (currently single file — split later)
- Delete: `platform/auth/`
- Modify: `apps/api/package.json` (drop `@seta/auth`)
- Modify: every SCOPE.md that references `@seta/auth` (descriptive cleanup)

- [ ] **Step 1: Read current `auth.api_keys` schema**

Read `platform/auth/src/schema.ts`. The table is `auth.api_keys (id uuid PK, tenant_id uuid, hashed_key text, scopes text[], created_at timestamptz, revoked_at timestamptz)`.

- [ ] **Step 2: Restructure identity schema into a folder**

```bash
mkdir -p platform/identity/src/schema
git mv platform/identity/src/schema.ts platform/identity/src/schema/index.ts
```

Edit `platform/identity/src/schema/index.ts` to re-export from sibling files (added next).

- [ ] **Step 3: Add `platform/identity/src/schema/api-keys.ts`**

```ts
import { pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const authSchema = pgSchema('auth')

export const apiKeys = authSchema.table('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  hashedKey: text('hashed_key').notNull(),
  scopes: text('scopes').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
```

Note: `authSchema` is re-declared here. Make `platform/identity/src/schema/index.ts` import the shared `authSchema` from one canonical place (the existing users schema file). Refactor so `authSchema` is declared once and imported by `users.ts`, `sessions.ts`, `user-identities.ts`, `api-keys.ts`, `superadmins.ts` (added later).

- [ ] **Step 4: Re-export from `schema/index.ts`**

```ts
export * from './users'
export * from './user-identities'
export * from './sessions'
export * from './api-keys'
// superadmins added in Phase 3
```

(Split the existing single-file schema into per-table files; the current file already separates them logically.)

- [ ] **Step 5: Delete `platform/auth/`**

```bash
git rm -r platform/auth
```

- [ ] **Step 6: Drop `@seta/auth` from `apps/api/package.json`**

Remove the line `"@seta/auth": "workspace:*",`.

- [ ] **Step 7: Confirm no live imports of `@seta/auth`**

```bash
grep -rln "@seta/auth" --include='*.ts' --include='*.tsx' apps modules platform | sort -u
```

Expected: only SCOPE.md files (descriptive). If any code imports `@seta/auth`, replace with `@seta/identity` (api-keys re-exported) or delete the import if unused. Update SCOPE.md references in the same commit.

- [ ] **Step 8: Update `platform/identity/drizzle.config.ts`**

Change `schema: './src/schema.ts'` → `schema: './src/schema/index.ts'`. `schemaFilter: ['auth']` unchanged.

- [ ] **Step 9: Regenerate identity migrations**

Per spec ("drop old, regen single init"):

```bash
rm -rf platform/identity/migrations
pnpm --filter @seta/identity exec drizzle-kit generate --name init
```

Expected output: `platform/identity/migrations/0000_*.sql` (Drizzle-named) plus `_journal/`.

- [ ] **Step 10: Add custom hardening migration**

```bash
pnpm --filter @seta/identity exec drizzle-kit generate --custom --name security_hardening
```

Open the new `0001_security_hardening.sql` and replace its contents with the *combined* content of the previous `0001_security_hardening.sql` and what's needed for the `api_keys` table — grants and any `FORCE ROW LEVEL SECURITY` lines. Reference: the old `0001_security_hardening.sql` (saved in git history of this branch) plus this new SQL block:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."api_keys" TO "tenant_user";
```

API keys have no RLS in v1 (no route consumes them yet — guarded at app level). Add a TODO comment in the file body referencing the spec section "requireApiKey middleware".

- [ ] **Step 11: typecheck + test**

```bash
pnpm typecheck
pnpm --filter @seta/identity test:unit
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor(identity): absorb api_keys; delete @seta/auth"
```

---

## Phase 3 — Schema changes (superadmins + tenant_members + side-effect removal)

### Task 3.1: Add `auth.superadmins` table

**Files:**
- Create: `platform/identity/src/schema/superadmins.ts`
- Modify: `platform/identity/src/schema/index.ts`
- Test: `platform/identity/src/schema/superadmins.test.ts`
- Migration: regen identity 0000

- [ ] **Step 1: Write the schema test**

`platform/identity/src/schema/superadmins.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { superadmins } from './superadmins'

describe('auth.superadmins schema', () => {
  it('is defined under the auth schema', () => {
    expect(superadmins.userId.name).toBe('user_id')
    expect(superadmins.grantedAt.name).toBe('granted_at')
    expect(superadmins.grantedBy.name).toBe('granted_by')
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seta/identity test:unit src/schema/superadmins.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the schema**

`platform/identity/src/schema/superadmins.ts`:

```ts
import { timestamp, uuid } from 'drizzle-orm/pg-core'
import { authSchema } from './users'
import { users } from './users'

export const superadmins = authSchema.table('superadmins', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
})

export type Superadmin = typeof superadmins.$inferSelect
export type NewSuperadmin = typeof superadmins.$inferInsert
```

- [ ] **Step 4: Re-export from `schema/index.ts`**

Add `export * from './superadmins'`.

- [ ] **Step 5: Run, expect pass**

```bash
pnpm --filter @seta/identity test:unit src/schema/superadmins.test.ts
```

- [ ] **Step 6: Regen the init migration**

```bash
rm -rf platform/identity/migrations
pnpm --filter @seta/identity exec drizzle-kit generate --name init
pnpm --filter @seta/identity exec drizzle-kit generate --custom --name security_hardening
```

Re-apply the hardening SQL from Task 2.1 Step 10 to `0001_security_hardening.sql`. Superadmins has no RLS (platform-level); no extra grants needed beyond migration-default.

- [ ] **Step 7: Integration test — table exists with expected columns**

`platform/identity/tests/integration/superadmins.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

describe('auth.superadmins (integration)', () => {
  it('migration created the table with PK on user_id', async () => {
    const cols = await sql<{ column_name: string; data_type: string; is_nullable: 'YES'|'NO' }[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='auth' AND table_name='superadmins'
      ORDER BY column_name
    `
    expect(cols.map((c) => c.column_name).sort()).toEqual(['granted_at','granted_by','user_id'])
  })
})
```

Run `pnpm migrate` then `pnpm --filter @seta/identity test:integration` (or test:unit if integration not wired here yet — adjust to the package's actual script).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(identity): add auth.superadmins table"
```

---

### Task 3.2: Add `UNIQUE(user_id)` and `source` column to `tenant.tenant_members`

**Files:**
- Modify: `platform/tenancy/src/schema.ts` — already has `tenantMembers` table. Add `source` field; reorganize so `userId` is unique (composite PK already on `user_id, tenant_id` but a separate UNIQUE on `user_id` alone is required for the 1-user-1-tenant invariant).
- Migration: regen tenancy migrations from scratch (pre-1.0 clean slate per user)

- [ ] **Step 1: Read current tenancy schema**

Read `platform/tenancy/src/schema.ts`. Note `tenantMembers` already has `user_id`, `tenant_id`, `role`, `created_at`. PK is `(user_id, tenant_id)`.

- [ ] **Step 2: Write schema test for new shape**

Append to `platform/tenancy/src/schema.test.ts`:

```ts
import { tenantMembers } from './schema'

describe('tenant.tenant_members shape', () => {
  it('has source column with default manual', () => {
    expect(tenantMembers.source.name).toBe('source')
    expect(tenantMembers.source.notNull).toBe(true)
  })
})
```

- [ ] **Step 3: Run, expect fail**

```bash
pnpm --filter @seta/tenancy test:unit
```

- [ ] **Step 4: Add the column to Drizzle schema**

In `platform/tenancy/src/schema.ts`, update `tenantMembers`:

```ts
import { pgSchema, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

export const tenantMembers = tenantSchema.table(
  'tenant_members',
  {
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    role: tenantMemberRole('role').notNull().default('member'),
    source: text('source').notNull().default('manual'),  // 'seed' | 'directory_sync' | 'manual'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tenantId] }),
    unique('tenant_members_user_unique').on(t.userId),
  ],
)
```

- [ ] **Step 5: Run, expect pass**

```bash
pnpm --filter @seta/tenancy test:unit
```

- [ ] **Step 6: Regen tenancy migrations from scratch**

```bash
rm -rf platform/tenancy/migrations
pnpm --filter @seta/tenancy exec drizzle-kit generate --name init
pnpm --filter @seta/tenancy exec drizzle-kit generate --custom --name rls_and_grants
```

In the new `0001_rls_and_grants.sql`, paste the equivalents of the previous RLS + grants from the deleted `0001_tenant_members.sql`/`0002_tenant_members_rls.sql`. Concretely:

```sql
-- tenant_connectors: enable RLS (already implicit via tenant policy framework)
ALTER TABLE "tenant"."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant"."tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenants_self_only" ON "tenant"."tenants"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("id" = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT ON "tenant"."tenants" TO "tenant_user";

ALTER TABLE "tenant"."tenant_connectors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant"."tenant_connectors" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_tenant_connectors" ON "tenant"."tenant_connectors"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant"."tenant_connectors" TO "tenant_user";

ALTER TABLE "tenant"."tenant_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant"."tenant_members" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_tenant_members" ON "tenant"."tenant_members"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "self_read_tenant_members" ON "tenant"."tenant_members"
  AS PERMISSIVE FOR SELECT TO "tenant_user"
  USING ("user_id" = current_setting('app.user_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant"."tenant_members" TO "tenant_user";
```

- [ ] **Step 7: Migrate + integration check**

```bash
pnpm db:down && pnpm db:up
pnpm migrate
```

Then add to `platform/tenancy/tests/integration/`:

```ts
it('tenant_members enforces UNIQUE(user_id)', async () => {
  await expect(
    sql`INSERT INTO tenant.tenants (id, slug) VALUES ('00000000-0000-0000-0000-000000000010','t1'),
                                                     ('00000000-0000-0000-0000-000000000011','t2')`
  ).resolves.toBeDefined()
  await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id)
            VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000010')`
  await expect(
    sql`INSERT INTO tenant.tenant_members (user_id, tenant_id)
        VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000011')`
  ).rejects.toThrow(/tenant_members_user_unique/i)
})
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(tenancy): enforce 1-user-1-tenant via UNIQUE; add source column"
```

---

### Task 3.3: Drop `recordConsent` side-effect of creating tenants

**Files:**
- Modify: `platform/tenancy/src/service.ts` — `recordConsent`
- Test: `platform/tenancy/src/service.test.ts` (add or update)

- [ ] **Step 1: Add failing test**

In `platform/tenancy/src/service.test.ts`:

```ts
it('recordConsent throws NotFound when tenant does not exist', async () => {
  await expect(
    recordConsent(sqlTx, {
      tenantId: '00000000-0000-0000-0000-000000000099',
      connectorIds: ['ms365-planner'],
      scopesGranted: { delegated: [], application: [] },
    })
  ).rejects.toThrow(/tenant not found/i)
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seta/tenancy test:unit -t recordConsent
```

- [ ] **Step 3: Modify `recordConsent`**

In `platform/tenancy/src/service.ts`, remove the `INSERT INTO tenant.tenants … ON CONFLICT DO NOTHING` block and replace with a precondition:

```ts
import { NotFound } from '@seta/middleware/errors'
// ...
await sql.begin(async (tx) => {
  const exists = (await tx`SELECT 1 FROM tenant.tenants WHERE id = ${input.tenantId} LIMIT 1`) as Array<unknown>
  if (exists.length === 0) throw new NotFound('tenant not found')
  for (const connectorId of input.connectorIds) {
    await tx`
      INSERT INTO tenant.tenant_connectors (tenant_id, connector_id, status, consented_at, scope_set)
      VALUES (${input.tenantId}, ${connectorId}, 'active', now(), ${JSON.stringify(input.scopesGranted)}::jsonb)
      ON CONFLICT (tenant_id, connector_id) DO UPDATE
        SET status='active', consented_at=excluded.consented_at,
            scope_set=excluded.scope_set, updated_at=now()
    `
  }
})
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm --filter @seta/tenancy test:unit -t recordConsent
```

- [ ] **Step 5: Verify caller in `apps/api/src/main.ts`**

The consent flow calls `recordConsent` after the OAuth callback (`main.ts:218` in baseline). Tenants must now exist before consent. Add a precondition in `main.ts` if not already enforced by the call path — read the OAuth callback handler around line 218 to confirm `tenantId` is sourced from a verified state (it is; the state was issued for a known tenant context). No change needed beyond surfacing the error via `onError`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(tenancy): require tenant to exist before recording consent"
```

---

## Phase 4 — New backend services & middleware

### Task 4.1: `requireSuperadmin` middleware

**Files:**
- Create: `platform/identity/src/middleware/require-superadmin.ts`
- Create: `platform/identity/src/middleware/require-superadmin.test.ts`
- Modify: `platform/identity/src/index.ts` (export)

- [ ] **Step 1: Write the test**

```ts
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireSuperadmin } from './require-superadmin'

describe('requireSuperadmin', () => {
  it('403 when user is not in auth.superadmins', async () => {
    const app = new Hono()
      .use('/admin/*', requireSuperadmin({ lookup: async () => false }))
      .get('/admin/x', (c) => c.text('ok'))
    // assume requireSession already set userId in c via prior middleware (use a fake variable injection in this test)
    const res = await app.request('/admin/x', {}, { Variables: { userId: 'u1', sessionId: 's1' } } as never)
    expect(res.status).toBe(403)
  })
  it('200 when user is a superadmin', async () => {
    const app = new Hono()
      .use('/admin/*', requireSuperadmin({ lookup: async () => true }))
      .get('/admin/x', (c) => c.text('ok'))
    const res = await app.request('/admin/x', {}, { Variables: { userId: 'u1', sessionId: 's1' } } as never)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seta/identity test:unit -t requireSuperadmin
```

- [ ] **Step 3: Implement**

```ts
// platform/identity/src/middleware/require-superadmin.ts
import { Forbidden } from '@seta/middleware/errors'
import type { MiddlewareHandler } from 'hono'

export type RequireSuperadminOpts = {
  lookup: (userId: string) => Promise<boolean>
}

export function requireSuperadmin(opts: RequireSuperadminOpts): MiddlewareHandler {
  return async (c, next) => {
    const userId = c.get('userId') as string | undefined
    if (!userId) throw new Forbidden('not authenticated')
    const ok = await opts.lookup(userId)
    if (!ok) throw new Forbidden('superadmin required')
    await next()
  }
}
```

- [ ] **Step 4: Export**

In `platform/identity/src/index.ts`, add `export { requireSuperadmin, type RequireSuperadminOpts } from './middleware/require-superadmin'`.

- [ ] **Step 5: Pass + commit**

```bash
pnpm --filter @seta/identity test:unit
git add -A
git commit -m "feat(identity): requireSuperadmin middleware"
```

---

### Task 4.2: Superadmin lookup (sql-backed)

- [ ] **Step 1: Add `isSuperadmin` query to identity service**

`platform/identity/src/superadmin-repo.ts`:

```ts
import type { Sql } from 'postgres'

export async function isSuperadmin(sql: Sql, userId: string): Promise<boolean> {
  const rows = await sql<Array<{ ok: 1 }>>`SELECT 1 AS ok FROM auth.superadmins WHERE user_id = ${userId} LIMIT 1`
  return rows.length > 0
}
```

Export from `index.ts`.

- [ ] **Step 2: Test (integration)**

`platform/identity/tests/integration/superadmin-repo.test.ts`:

```ts
it('isSuperadmin returns true after insert', async () => {
  const userId = '00000000-0000-0000-0000-0000000000a1'
  await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES (${userId},'a@x','A','entra') ON CONFLICT DO NOTHING`
  await sql`INSERT INTO auth.superadmins (user_id) VALUES (${userId}) ON CONFLICT DO NOTHING`
  expect(await isSuperadmin(sql, userId)).toBe(true)
})
```

- [ ] **Step 3: Pass + commit**

```bash
git add -A
git commit -m "feat(identity): isSuperadmin lookup"
```

---

### Task 4.3: `requireTenantAdmin` middleware

**Files:**
- Create: `platform/tenancy/src/middleware/require-tenant-admin.ts`
- Test: same dir
- Modify: `platform/tenancy/src/index.ts`

- [ ] **Step 1: Test**

```ts
import { Hono } from 'hono'
import { requireTenantAdmin } from './require-tenant-admin'

describe('requireTenantAdmin', () => {
  it('403 for member role', async () => {
    const app = new Hono()
      .use('/members/*', requireTenantAdmin({ lookup: async () => ({ role: 'member' }) }))
      .get('/members', (c) => c.text('ok'))
    const res = await app.request('/members', {}, { Variables: { userId: 'u1', sessionId: 's1' } } as never)
    expect(res.status).toBe(403)
  })
  it('200 for admin or owner', async () => {
    const app = new Hono()
      .use('/members/*', requireTenantAdmin({ lookup: async () => ({ role: 'admin' }) }))
      .get('/members', (c) => c.text('ok'))
    const res = await app.request('/members', {}, { Variables: { userId: 'u1', sessionId: 's1' } } as never)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Implement**

```ts
import { Forbidden } from '@seta/middleware/errors'
import type { MiddlewareHandler } from 'hono'
import type { TenantMembershipRole } from '../service'

export type RequireTenantAdminOpts = {
  lookup: (userId: string) => Promise<{ role: TenantMembershipRole } | null>
}

export function requireTenantAdmin(opts: RequireTenantAdminOpts): MiddlewareHandler {
  return async (c, next) => {
    const userId = c.get('userId') as string | undefined
    if (!userId) throw new Forbidden('not authenticated')
    const m = await opts.lookup(userId)
    if (!m) throw new Forbidden('no membership')
    if (m.role !== 'admin' && m.role !== 'owner') throw new Forbidden('tenant admin required')
    await next()
  }
}
```

- [ ] **Step 3: Export + pass + commit**

```bash
git add -A
git commit -m "feat(tenancy): requireTenantAdmin middleware"
```

---

### Task 4.4: Member service (`listMembers`, `setMemberRole`, `removeMember`)

**Files:**
- Create: `platform/tenancy/src/service/members.ts`
- Test: `platform/tenancy/src/service/members.test.ts` (integration; uses real Postgres)
- Modify: `platform/tenancy/src/index.ts`

- [ ] **Step 1: Write integration test (failing)**

```ts
// platform/tenancy/tests/integration/members.test.ts
import { describe, expect, it, beforeAll } from 'vitest'
import postgres from 'postgres'
import { listMembers, setMemberRole, removeMember } from '../../src/service/members'

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

describe('members service', () => {
  const tenantId = '00000000-0000-0000-0000-000000000200'
  const userA = '00000000-0000-0000-0000-00000000a200'
  const userB = '00000000-0000-0000-0000-00000000b200'

  beforeAll(async () => {
    await sql`INSERT INTO tenant.tenants (id, slug) VALUES (${tenantId},'mt-test') ON CONFLICT DO NOTHING`
    await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES
      (${userA},'a200@x','A','entra'),(${userB},'b200@x','B','entra') ON CONFLICT DO NOTHING`
    await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source) VALUES
      (${userA}, ${tenantId}, 'admin', 'seed'),
      (${userB}, ${tenantId}, 'member', 'directory_sync') ON CONFLICT DO NOTHING`
  })

  it('listMembers returns all rows for tenant', async () => {
    const rows = await listMembers(sql, tenantId)
    expect(rows.find((r) => r.userId === userA)?.role).toBe('admin')
    expect(rows.find((r) => r.userId === userB)?.role).toBe('member')
  })

  it('setMemberRole flips a role', async () => {
    const after = await setMemberRole(sql, tenantId, userB, 'admin')
    expect(after.role).toBe('admin')
  })

  it('removeMember deletes the row', async () => {
    await removeMember(sql, tenantId, userB)
    const rows = await listMembers(sql, tenantId)
    expect(rows.find((r) => r.userId === userB)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm --filter @seta/tenancy test:integration -t 'members service'
```

- [ ] **Step 3: Implement service**

`platform/tenancy/src/service/members.ts`:

```ts
import type { Sql } from 'postgres'
import type { TenantMembershipRole } from '../service'

export type Member = {
  userId: string
  email: string
  name: string
  pictureUrl: string | null
  role: TenantMembershipRole
  source: string
  joinedAt: string
}

export async function listMembers(sql: Sql, tenantId: string): Promise<Member[]> {
  return await sql<Member[]>`
    SELECT m.user_id        AS "userId",
           u.email,
           u.name,
           u.picture_url    AS "pictureUrl",
           m.role,
           m.source,
           m.created_at     AS "joinedAt"
    FROM tenant.tenant_members m
    JOIN auth.users u ON u.id = m.user_id
    WHERE m.tenant_id = ${tenantId}
    ORDER BY u.name
  `
}

export async function setMemberRole(
  sql: Sql, tenantId: string, userId: string, role: TenantMembershipRole,
): Promise<{ userId: string; role: TenantMembershipRole }> {
  const [row] = await sql<Array<{ userId: string; role: TenantMembershipRole }>>`
    UPDATE tenant.tenant_members
       SET role = ${role}
     WHERE tenant_id = ${tenantId} AND user_id = ${userId}
     RETURNING user_id AS "userId", role
  `
  if (!row) throw new Error('member not found')
  return row
}

export async function removeMember(sql: Sql, tenantId: string, userId: string): Promise<void> {
  await sql`DELETE FROM tenant.tenant_members WHERE tenant_id = ${tenantId} AND user_id = ${userId}`
}
```

- [ ] **Step 4: Run, expect pass + commit**

```bash
pnpm --filter @seta/tenancy test:integration -t 'members service'
git add -A
git commit -m "feat(tenancy): members service (list/setRole/remove)"
```

---

### Task 4.5: `findOrAttachUser` resolution

**Files:**
- Create: `platform/tenancy/src/service/find-or-attach.ts`
- Test: integration

- [ ] **Step 1: Test (integration)**

```ts
// platform/tenancy/tests/integration/find-or-attach.test.ts
import { findOrAttachUser } from '../../src/service/find-or-attach'

describe('findOrAttachUser', () => {
  it('returns superadmin for users in auth.superadmins', async () => {
    const u = '00000000-0000-0000-0000-000000000301'
    await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES (${u},'s1@x','S','entra') ON CONFLICT DO NOTHING`
    await sql`INSERT INTO auth.superadmins (user_id) VALUES (${u}) ON CONFLICT DO NOTHING`
    expect(await findOrAttachUser(sql, u)).toBe('superadmin')
  })
  it('returns attached for users with tenant_members row', async () => {
    const u = '00000000-0000-0000-0000-000000000302'
    const t = '00000000-0000-0000-0000-000000000202'
    await sql`INSERT INTO tenant.tenants (id, slug) VALUES (${t},'fa-test') ON CONFLICT DO NOTHING`
    await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES (${u},'m1@x','M','entra') ON CONFLICT DO NOTHING`
    await sql`INSERT INTO tenant.tenant_members (user_id, tenant_id, role, source) VALUES (${u}, ${t}, 'member', 'directory_sync') ON CONFLICT DO NOTHING`
    expect(await findOrAttachUser(sql, u)).toBe('attached')
  })
  it('returns no-membership otherwise', async () => {
    const u = '00000000-0000-0000-0000-000000000303'
    await sql`INSERT INTO auth.users (id, email, name, primary_provider) VALUES (${u},'n1@x','N','entra') ON CONFLICT DO NOTHING`
    expect(await findOrAttachUser(sql, u)).toBe('no-membership')
  })
})
```

- [ ] **Step 2: Implement**

```ts
// platform/tenancy/src/service/find-or-attach.ts
import type { Sql } from 'postgres'

export type AttachStatus = 'superadmin' | 'attached' | 'no-membership'

export async function findOrAttachUser(sql: Sql, userId: string): Promise<AttachStatus> {
  const isSuper = await sql<Array<{ ok: 1 }>>`SELECT 1 AS ok FROM auth.superadmins WHERE user_id = ${userId} LIMIT 1`
  if (isSuper.length > 0) return 'superadmin'
  const hasMember = await sql<Array<{ ok: 1 }>>`SELECT 1 AS ok FROM tenant.tenant_members WHERE user_id = ${userId} LIMIT 1`
  if (hasMember.length > 0) return 'attached'
  return 'no-membership'
}
```

- [ ] **Step 3: Pass + commit**

```bash
git add -A
git commit -m "feat(tenancy): findOrAttachUser resolution"
```

---

### Task 4.6: `resolveMeContext` (tenancy → identity contract)

**Files:**
- Create: `platform/identity/src/me/me-context-provider.ts` (interface only)
- Create: `platform/tenancy/src/service/resolve-me-context.ts` (implementation)
- Tests: both sides

- [ ] **Step 1: Define the interface in identity**

```ts
// platform/identity/src/me/me-context-provider.ts
import { z } from '@hono/zod-openapi'

export const TenantSummary = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  isAdmin: z.boolean(),
}).openapi('TenantSummary')

export type TenantSummary = z.infer<typeof TenantSummary>

export type MeContext = {
  tenant: TenantSummary | null
  isSuperadmin: boolean
  apps: string[]
}

export type MeContextProvider = {
  resolve(userId: string): Promise<MeContext>
}
```

Re-export from `platform/identity/src/index.ts`.

- [ ] **Step 2: Implement in tenancy**

```ts
// platform/tenancy/src/service/resolve-me-context.ts
import type { Sql } from 'postgres'
import type { MeContext, MeContextProvider } from '@seta/identity'

export function createMeContextProvider(opts: { sql: Sql; deployedApps: string[] }): MeContextProvider {
  return {
    async resolve(userId): Promise<MeContext> {
      const isSuper = await opts.sql<Array<{ ok: 1 }>>`SELECT 1 AS ok FROM auth.superadmins WHERE user_id = ${userId} LIMIT 1`
      if (isSuper.length > 0) return { tenant: null, isSuperadmin: true, apps: [] }
      const rows = await opts.sql<Array<{ id: string; slug: string; displayName: string | null; role: string }>>`
        SELECT t.id, t.slug, t.display_name AS "displayName", m.role
        FROM tenant.tenant_members m
        JOIN tenant.tenants t ON t.id = m.tenant_id
        WHERE m.user_id = ${userId}
        LIMIT 1
      `
      if (rows.length === 0) return { tenant: null, isSuperadmin: false, apps: [] }
      const r = rows[0]
      return {
        tenant: {
          id: r.id,
          slug: r.slug,
          name: r.displayName ?? r.slug,
          isAdmin: r.role === 'admin' || r.role === 'owner',
        },
        isSuperadmin: false,
        apps: opts.deployedApps,
      }
    },
  }
}
```

- [ ] **Step 3: Test (integration)**

```ts
// platform/tenancy/tests/integration/resolve-me-context.test.ts
describe('resolveMeContext', () => {
  const provider = createMeContextProvider({ sql, deployedApps: ['studio'] })
  it('member: returns tenant + apps; not superadmin', async () => {
    // arrange a user + member row similar to find-or-attach test
    const ctx = await provider.resolve(userA)
    expect(ctx.isSuperadmin).toBe(false)
    expect(ctx.tenant?.slug).toBeTruthy()
    expect(ctx.apps).toEqual(['studio'])
  })
  it('superadmin: tenant null, apps empty', async () => {
    const ctx = await provider.resolve(superUserId)
    expect(ctx.isSuperadmin).toBe(true)
    expect(ctx.tenant).toBeNull()
    expect(ctx.apps).toEqual([])
  })
})
```

- [ ] **Step 4: Pass + commit**

```bash
git add -A
git commit -m "feat: MeContextProvider contract; tenancy implements it"
```

---

### Task 4.7: Update `/me` payload in identity routes

**Files:**
- Modify: `platform/identity/src/schemas.ts` (`MeResponse`)
- Modify: `platform/identity/src/routes.ts` (`createSsoRoutes`)

- [ ] **Step 1: Update `MeResponse` schema**

In `platform/identity/src/schemas.ts`:

```ts
import { TenantSummary } from './me/me-context-provider'

export const SessionUser = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  pictureUrl: z.string().nullable(),
}).openapi('SessionUser')
export type SessionUser = z.infer<typeof SessionUser>

export const MeResponse = z.object({
  user: SessionUser,
  tenant: TenantSummary.nullable(),
  isSuperadmin: z.boolean(),
  apps: z.array(z.string()),
  csrfToken: z.string(),
}).openapi('MeResponse')
export type MeResponse = z.infer<typeof MeResponse>
```

Remove the old `tenants: TenantSummary[]` field.

- [ ] **Step 2: Update `createSsoRoutes` signature to accept `MeContextProvider`**

```ts
export type SsoRoutesDeps = {
  providers: { entra: SsoProvider; google: SsoProvider }
  sql: Sql
  sessionCookie: { name: string; hmacKey: string; ttlSec: number; secure: boolean }
  redirectBase: string
  meContext: MeContextProvider     // ← added
}
```

- [ ] **Step 3: Rewrite the `/me` handler**

```ts
app.get('/me', requireSession({ ... }), async (c) => {
  const userId = c.get('userId')
  const sessionId = c.get('sessionId')
  const rows = await deps.sql<Array<{ id: string; email: string; name: string; picture_url: string | null }>>`
    SELECT id, email, name, picture_url FROM auth.users WHERE id = ${userId} LIMIT 1
  `
  const u = rows[0]
  if (!u) throw new Unauthorized('user not found')
  const ctx = await deps.meContext.resolve(userId)
  return c.json(MeResponse.parse({
    user: { id: u.id, email: u.email, name: u.name, pictureUrl: u.picture_url },
    tenant: ctx.tenant,
    isSuperadmin: ctx.isSuperadmin,
    apps: ctx.apps,
    csrfToken: deriveCsrfToken(sessionId, deps.sessionCookie.hmacKey),
  }))
})
```

- [ ] **Step 4: Update `/sso/callback/:provider` to compute next URL**

In the same file, replace the `return c.redirect(parsed.returnTo)` block:

```ts
const status = await deps.tenancy.findOrAttachUser(user.id)
const next =
  status === 'superadmin'    ? '/console/admin/tenants' :
  status === 'no-membership' ? '/console/no-workspace'  :
  resolveNextUrl({ returnTo: parsed.returnTo, lastApp: getCookie(c, 'seta_last_app') })
return c.redirect(next)
```

Add `tenancy: { findOrAttachUser: (id: string) => Promise<'superadmin'|'attached'|'no-membership'> }` to `SsoRoutesDeps`. Add a tiny `resolveNextUrl` helper in `platform/identity/src/me/resolve-next-url.ts` with the spec's algorithm and unit test.

- [ ] **Step 5: Update SSO unit tests**

`platform/identity/src/routes.test.ts` — adjust to the new deps shape and assertions. Add tests for each branch of the callback: superadmin → `/console/admin/tenants`; no-membership → `/console/no-workspace`; attached + returnTo → returnTo; attached + lastApp → lastApp; attached + neither → `/console/`.

- [ ] **Step 6: Update `apps/api/tests/integration/sso.test.ts`**

Add a `tenancy` stub and `meContext` stub in deps. Update assertions to the new `/me` shape.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm test:unit
git add -A
git commit -m "feat(identity): /me v2 (single tenant + isSuperadmin); callback routes by attach status"
```

---

### Task 4.8: `/members` and `/admin/tenants` routes

**Files:**
- Create: `platform/tenancy/src/routes/members.ts`
- Create: `platform/tenancy/src/routes/admin.ts`
- Modify: `platform/tenancy/src/routes.ts` (compose into `createTenancyRoutes`)
- Tests for each

- [ ] **Step 1: Tests first**

`platform/tenancy/src/routes/members.test.ts`:

```ts
describe('GET /members', () => {
  it('returns 200 with members list for tenant admin', async () => { /* ... */ })
  it('returns 403 for non-admin member', async () => { /* ... */ })
})
describe('PATCH /members/:userId', () => {
  it('flips role and invalidates affected sessions', async () => { /* ... */ })
})
describe('DELETE /members/:userId', () => {
  it('removes the row and invalidates affected sessions', async () => { /* ... */ })
})
```

`platform/tenancy/src/routes/admin.test.ts`:

```ts
describe('GET /admin/tenants', () => {
  it('returns 200 with all tenants for superadmin', async () => { /* ... */ })
  it('returns 403 for non-superadmin', async () => { /* ... */ })
})
```

- [ ] **Step 2: Implement routes**

```ts
// platform/tenancy/src/routes/members.ts
import { OpenAPIHono, z } from '@hono/zod-openapi'
import { tenantContext } from '../context'
import { listMembers, removeMember, setMemberRole } from '../service/members'
import { requireTenantAdmin } from '../middleware/require-tenant-admin'

export type MembersRoutesDeps = {
  sql: Sql
  requireSession: MiddlewareHandler
  membershipLookup: (userId: string) => Promise<{ role: TenantMembershipRole } | null>
  invalidateUserSessions: (userId: string) => Promise<void>   // for session rotation
}

export function createMembersRoutes(deps: MembersRoutesDeps) {
  const app = new OpenAPIHono()
  app.use('*', deps.requireSession)
  app.use('*', requireTenantAdmin({ lookup: deps.membershipLookup }))

  app.get('/members', async (c) => {
    const tenantId = tenantContext.getTenantId()
    return c.json({ members: await listMembers(deps.sql, tenantId) })
  })

  app.patch('/members/:userId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const userId = c.req.param('userId')
    const body = z.object({ role: z.enum(['owner','admin','member']) }).parse(await c.req.json())
    const row = await setMemberRole(deps.sql, tenantId, userId, body.role)
    await deps.invalidateUserSessions(userId)
    return c.json({ member: row })
  })

  app.delete('/members/:userId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const userId = c.req.param('userId')
    await removeMember(deps.sql, tenantId, userId)
    await deps.invalidateUserSessions(userId)
    return c.json({ ok: true })
  })

  return app
}
```

```ts
// platform/tenancy/src/routes/admin.ts
import { requireSuperadmin } from '@seta/identity'
export function createAdminRoutes(deps: {
  sql: Sql; requireSession: MiddlewareHandler;
  isSuperadmin: (userId: string) => Promise<boolean>
}) {
  const app = new OpenAPIHono()
  app.use('*', deps.requireSession)
  app.use('*', requireSuperadmin({ lookup: deps.isSuperadmin }))
  app.get('/admin/tenants', async (c) => {
    const rows = await deps.sql<Array<{ id:string; slug:string; displayName:string|null; status:string; createdAt:string }>>`
      SELECT id, slug, display_name AS "displayName", status, created_at AS "createdAt"
      FROM tenant.tenants ORDER BY created_at DESC`
    return c.json({ tenants: rows })
  })
  return app
}
```

- [ ] **Step 3: Compose**

In `platform/tenancy/src/routes.ts`, export `createTenancyRoutes(deps)` that combines members + admin + existing `/tenants` (deprecate the legacy `/tenants` listing — `/me` carries the info now). Delete or rewrite the legacy `GET /tenants` from `createTenantRoutes` since members get tenant info via `/me`.

- [ ] **Step 4: Run, expect pass + commit**

```bash
pnpm --filter @seta/tenancy test:unit
git add -A
git commit -m "feat(tenancy): /members and /admin/tenants routes"
```

---

### Task 4.9: Session rotation on role change

**Files:**
- Modify: `platform/identity/src/session-store.ts` — add `deleteByUserId`
- Use it from `members.ts` (already wired via `invalidateUserSessions` in deps)

- [ ] **Step 1: Test**

```ts
it('deleteByUserId removes all sessions for a user', async () => {
  // arrange two sessions for u1
  await store.deleteByUserId('u1')
  // assert: get returns null for both
})
```

- [ ] **Step 2: Implement**

```ts
async deleteByUserId(userId: string): Promise<void> {
  await sql`DELETE FROM auth.sessions WHERE user_id = ${userId}`
}
```

- [ ] **Step 3: Wire in `apps/api/src/main.ts`**

```ts
const tenancyRoutes = createTenancyRoutes({
  sql,
  requireSession: requireSessionMiddleware,
  membershipLookup: async (userId) => {
    const rows = await sql<Array<{ role: TenantMembershipRole }>>`
      SELECT role FROM tenant.tenant_members WHERE user_id = ${userId} LIMIT 1`
    return rows[0] ?? null
  },
  invalidateUserSessions: (uid) => sessionStore.deleteByUserId(uid),
  isSuperadmin: (uid) => isSuperadmin(sql, uid),
})
app.route('/', tenancyRoutes)
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(identity): session rotation on member role change"
```

---

## Phase 5 — Seed & env

### Task 5.1: Env additions

**Files:**
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Add the new env vars**

```ts
SETA_SEED_TENANT_ID: z.string().uuid(),
SETA_SEED_TENANT_SLUG: z.string().min(1),
SETA_SEED_TENANT_NAME: z.string().min(1),
SETA_SEED_SUPERADMIN_EMAILS: z.string().default(''),
SETA_APPS_DEPLOYED: z.string().default('studio'), // csv
SSO_ENTRA_ENABLED: z.coerce.boolean().default(true),
SSO_GOOGLE_ENABLED: z.coerce.boolean().default(true),
```

Helper getters:

```ts
export const deployedApps = () => env.SETA_APPS_DEPLOYED.split(',').map((s) => s.trim()).filter(Boolean)
export const superadminEmails = () => env.SETA_SEED_SUPERADMIN_EMAILS.split(',').map((s) => s.trim()).filter(Boolean)
```

- [ ] **Step 2: Update `.env.example`** in `apps/api/`

```
SETA_SEED_TENANT_ID=00000000-0000-0000-0000-000000000001
SETA_SEED_TENANT_SLUG=acme
SETA_SEED_TENANT_NAME="Acme Corp"
SETA_SEED_SUPERADMIN_EMAILS=canh@seta-international.vn
SETA_APPS_DEPLOYED=studio
SSO_ENTRA_ENABLED=true
SSO_GOOGLE_ENABLED=true
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(api): env keys for seed and provider toggles"
```

---

### Task 5.2: Seed implementation

**Files:**
- Create: `apps/api/src/seed.ts`
- Test: `apps/api/tests/integration/seed.test.ts`

- [ ] **Step 1: Test**

```ts
import { runSeed } from '../../src/seed'
describe('seed', () => {
  it('is idempotent', async () => {
    await runSeed({ sql, tenant: { id: tId, slug: 't', name: 'T' }, superadminEmails: ['x@y.com'] })
    await runSeed({ sql, tenant: { id: tId, slug: 't', name: 'T' }, superadminEmails: ['x@y.com'] })
    const t = await sql`SELECT count(*) FROM tenant.tenants WHERE id = ${tId}`
    expect(Number(t[0].count)).toBe(1)
    const s = await sql`SELECT count(*) FROM auth.superadmins WHERE user_id IN (SELECT id FROM auth.users WHERE email='x@y.com')`
    expect(Number(s[0].count)).toBe(1)
  })
  it('does not seed tenant_members', async () => {
    await runSeed({ sql, tenant: { id: tId, slug: 't', name: 'T' }, superadminEmails: [] })
    const m = await sql`SELECT count(*) FROM tenant.tenant_members WHERE tenant_id = ${tId}`
    expect(Number(m[0].count)).toBe(0)
  })
})
```

- [ ] **Step 2: Implement**

```ts
// apps/api/src/seed.ts
import type { Sql } from 'postgres'

export type SeedInput = {
  sql: Sql
  tenant: { id: string; slug: string; name: string }
  superadminEmails: string[]
}

export async function runSeed({ sql, tenant, superadminEmails }: SeedInput): Promise<void> {
  await sql`
    INSERT INTO tenant.tenants (id, slug, display_name, status)
    VALUES (${tenant.id}, ${tenant.slug}, ${tenant.name}, 'active')
    ON CONFLICT (id) DO NOTHING
  `
  for (const email of superadminEmails) {
    const [u] = await sql<Array<{ id: string }>>`
      INSERT INTO auth.users (email, name, primary_provider)
      VALUES (${email}, ${email}, 'entra')
      ON CONFLICT (email) DO UPDATE SET email = excluded.email
      RETURNING id
    `
    await sql`INSERT INTO auth.superadmins (user_id) VALUES (${u.id}) ON CONFLICT DO NOTHING`
  }
}
```

- [ ] **Step 3: Call from `main.ts`**

After `pool` is ready and migrations have run:

```ts
import { runSeed } from './seed'
await runSeed({
  sql,
  tenant: {
    id: env.SETA_SEED_TENANT_ID,
    slug: env.SETA_SEED_TENANT_SLUG,
    name: env.SETA_SEED_TENANT_NAME,
  },
  superadminEmails: superadminEmails(),
})
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): env-driven seed for tenant + superadmins"
```

---

## Phase 6 — Provider toggle, rate limit, last-app cookie

### Task 6.1: `/sso/providers` endpoint + provider gating

- [ ] **Step 1: Test**

```ts
it('returns only enabled providers', async () => {
  const res = await app.request('/sso/providers')
  expect(await res.json()).toEqual({ providers: ['entra'] })  // when google disabled
})
it('/sso/login/google returns 404 when disabled', async () => {
  const res = await app.request('/sso/login/google', { method: 'POST', body: '{}' })
  expect(res.status).toBe(404)
})
```

- [ ] **Step 2: Implement in `platform/identity/src/routes.ts`**

```ts
// Accept enabledProviders in deps
type SsoRoutesDeps = { ..., enabledProviders: Array<'entra'|'google'> }

app.get('/sso/providers', (c) => c.json({ providers: deps.enabledProviders }))

app.post('/sso/login/:provider', async (c) => {
  if (!deps.enabledProviders.includes(providerId)) throw new NotFound('provider disabled')
  // ... existing logic
})
```

Wire from `apps/api/src/main.ts` using `SSO_ENTRA_ENABLED` and `SSO_GOOGLE_ENABLED`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(identity): provider enable/disable via env"
```

---

### Task 6.2: Rate-limit SSO + admin paths

**Files:**
- Modify: `apps/api/src/main.ts` — add `@seta/middleware` rate-limit middleware on `/sso/*`, `/members*`, `/admin/*`

- [ ] **Step 1: Reference policy**

Read `docs/production-readiness/rate-limiting-policy.md` for required RPS. If a rate-limit middleware is not yet in `@seta/middleware`, this task becomes "stub a token-bucket middleware backed by the existing LRU pattern in `@seta/agent-workflows`". Spec ok with stub for v1.

- [ ] **Step 2: Apply**

```ts
import { rateLimit } from '@seta/middleware'
app.use('/sso/login/*',    rateLimit({ rps: 5, burst: 20, key: (c) => c.req.header('x-forwarded-for') ?? 'anon' }))
app.use('/sso/callback/*', rateLimit({ rps: 5, burst: 20, key: (c) => c.req.header('x-forwarded-for') ?? 'anon' }))
app.use('/members*',       rateLimit({ rps: 10, burst: 30, key: (c) => c.get('userId') ?? 'anon' }))
app.use('/admin/*',        rateLimit({ rps: 10, burst: 30, key: (c) => c.get('userId') ?? 'anon' }))
```

- [ ] **Step 3: Test (unit)**

Stub test in `apps/api/tests/integration/rate-limit.test.ts` — burst tolerance, then 429.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): rate-limit sso + admin paths"
```

---

### Task 6.3: `seta_last_app` cookie middleware

**Files:**
- Create: `apps/api/src/last-app-middleware.ts`

- [ ] **Step 1: Test**

```ts
it('refreshes cookie when GET html under /studio/', async () => {
  const res = await app.request('/studio/', { method: 'GET', headers: { accept: 'text/html' } })
  const cookies = res.headers.get('set-cookie') ?? ''
  expect(cookies).toMatch(/seta_last_app=/)
})
```

- [ ] **Step 2: Implement**

```ts
import { setCookie } from 'hono/cookie'
import type { MiddlewareHandler } from 'hono'

const KNOWN_APPS = ['studio','finance','pmo','timesheet']

export function lastAppMiddleware(opts: { hmacKey: string; secure: boolean }): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'GET' && (c.req.header('accept') ?? '').includes('text/html')) {
      const path = c.req.path
      const app = KNOWN_APPS.find((a) => path === `/${a}` || path.startsWith(`/${a}/`))
      if (app) setCookie(c, 'seta_last_app', signCookie(app, opts.hmacKey), {
        httpOnly: true, secure: opts.secure, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 90,
      })
    }
    await next()
  }
}
```

- [ ] **Step 3: Mount**

In `main.ts`:

```ts
app.use('*', lastAppMiddleware({ hmacKey: env.SESSION_HMAC_KEY, secure: env.NODE_ENV === 'production' }))
```

- [ ] **Step 4: Use in `/sso/callback`**

When building `next`, read and verify `seta_last_app` and feed into `resolveNextUrl`. Already wired in Task 4.7 Step 4 — confirm.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): seta_last_app cookie middleware"
```

---

### Task 6.4: Audit logging for admin actions

**Files:**
- Modify: `platform/tenancy/src/routes/members.ts`, `platform/tenancy/src/routes/admin.ts`

- [ ] **Step 1: Inspect `@seta/audit`**

```bash
grep -rln "recordAudit\|createAuditWriter" platform/audit/src apps/api 2>/dev/null
```

Determine the audit event shape (likely `{ kind, tenantId, actorUserId, targetId, metadata }`).

- [ ] **Step 2: Emit events**

In `setMemberRole` route: `await audit.recordAudit({ kind: 'tenancy.role_changed', tenantId, actorUserId: c.get('userId'), targetId: userId, metadata: { from: prev, to: role } })`.

Similar for `removeMember` (`'tenancy.member_removed'`), `superadmin grant` (phase later).

- [ ] **Step 3: Pass audit writer into routes via deps**

Extend `MembersRoutesDeps.audit` field, wire from `main.ts`.

- [ ] **Step 4: Test**

Unit: verify `audit.recordAudit` is called with the right kind on success path.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tenancy): audit role changes and member removals"
```

---

## Phase 7 — Frontend client lib (`@seta/identity-client`)

### Task 7.1: Remove page components from identity-client

**Files:**
- Move: `platform/identity-client/src/LoginPage.tsx` → `apps/console/src/pages/LoginPage.tsx` (created in Phase 8 — for now, stash in branch)
- Move: `platform/identity-client/src/CallbackSplash.tsx` → `apps/console/src/pages/CallbackPage.tsx`
- Move: `platform/identity-client/src/TenantsPage.tsx` → delete
- Move: `platform/identity-client/src/ConnectorsPage.tsx` → `apps/studio/src/pages/ConnectorsPage.tsx`
- Move: `platform/identity-client/src/ConsentLandingPage.tsx` → `apps/studio/src/pages/ConsentLandingPage.tsx`
- Companion `.test.tsx` files move alongside

- [ ] **Step 1: Skip moves to apps until those apps exist**

apps/studio exists today; move `ConnectorsPage` + `ConsentLandingPage` + their tests now. apps/console does not exist yet — leave Login/Callback files in place until Phase 8.

```bash
git mv platform/identity-client/src/ConnectorsPage.tsx        apps/studio/src/pages/ConnectorsPage.tsx
git mv platform/identity-client/src/ConnectorsPage.test.tsx   apps/studio/src/pages/ConnectorsPage.test.tsx
git mv platform/identity-client/src/ConsentLandingPage.tsx    apps/studio/src/pages/ConsentLandingPage.tsx
git mv platform/identity-client/src/ConsentLandingPage.test.tsx apps/studio/src/pages/ConsentLandingPage.test.tsx
git rm platform/identity-client/src/TenantsPage.tsx
git rm platform/identity-client/src/TenantsPage.test.tsx
```

- [ ] **Step 2: Update the studio imports**

`apps/studio/src/routes/_authed/tenants.$id.connectors.tsx` and `tenants.$id.connectors.$cid.consent.tsx` currently import from `@seta/identity-client`. Change to relative `../../pages/ConnectorsPage` and `../../pages/ConsentLandingPage`. (Those route files will be flattened in Phase 9; for now keep them compiling.)

- [ ] **Step 3: Remove exports from `platform/identity-client/src/index.ts`**

Strip exports of moved/deleted components. Leave `signIn`, types.

- [ ] **Step 4: typecheck + tests**

```bash
pnpm typecheck
pnpm --filter @seta/studio test:unit
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(identity-client): move pages out; drop tenants picker"
```

---

### Task 7.2: Add `useMe` hook

**Files:**
- Create: `platform/identity-client/src/useMe.ts`
- Test: `platform/identity-client/src/useMe.test.ts`
- Modify: `platform/identity-client/src/index.ts` + `package.json` (add `@tanstack/react-query` peer)

- [ ] **Step 1: Add peerDependency**

`platform/identity-client/package.json`:

```jsonc
"peerDependencies": {
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "@tanstack/react-query": "5.x"
}
```

(Use the exact pinned version present in `apps/studio`.)

- [ ] **Step 2: Test**

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMe } from './useMe'

it('fetches /me and returns the typed payload', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({
    user: { id: 'u1', email: 'a@x', name: 'A', pictureUrl: null },
    tenant: { id: 't1', slug: 'acme', name: 'Acme', isAdmin: true },
    isSuperadmin: false, apps: ['studio'], csrfToken: 'tok',
  }))
  const qc = new QueryClient()
  const wrapper = ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useMe(), { wrapper })
  await waitFor(() => expect(result.current.data?.tenant?.slug).toBe('acme'))
})
```

- [ ] **Step 3: Implement**

```ts
// platform/identity-client/src/useMe.ts
import { queryOptions, useQuery } from '@tanstack/react-query'
import { MeResponse } from './types'

export const meQueryOptions = queryOptions({
  queryKey: ['me'] as const,
  queryFn: async () => {
    const res = await fetch('/me', { credentials: 'include' })
    if (!res.ok) throw new Error(`me ${res.status}`)
    return MeResponse.parse(await res.json())
  },
  staleTime: 60_000,
})

export function useMe() {
  return useQuery(meQueryOptions)
}
```

`platform/identity-client/src/types.ts`:

```ts
// Re-export Zod schemas from @seta/identity so backend + frontend share the contract
export { MeResponse, SessionUser, TenantSummary, type SessionUser as TSessionUser } from '@seta/identity'
```

Add `@seta/identity` to `platform/identity-client/package.json` deps.

- [ ] **Step 4: Pass + commit**

```bash
git add -A
git commit -m "feat(identity-client): useMe hook + shared types"
```

---

### Task 7.3: `<RequireSession>` component

**Files:**
- Create: `platform/identity-client/src/RequireSession.tsx`
- Test: same dir

- [ ] **Step 1: Test**

```tsx
it('renders children when /me succeeds', async () => { /* ... */ })
it('redirects to /console/login?returnTo=current when /me 401', async () => {
  const assign = vi.fn()
  Object.defineProperty(window, 'location', { value: { href: '/studio/runs', assign } })
  fetchMock.mockResponseOnce('', { status: 401 })
  render(<RequireSession><div>inner</div></RequireSession>, { wrapper: qcWrapper })
  await waitFor(() => {
    expect(window.location.href).toMatch(/\/console\/login\?returnTo=/)
  })
})
```

- [ ] **Step 2: Implement**

```tsx
// platform/identity-client/src/RequireSession.tsx
import type { ReactNode } from 'react'
import { useMe } from './useMe'

export function RequireSession({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { data, isLoading, error } = useMe()
  if (isLoading) return fallback as JSX.Element
  if (error || !data) {
    if (typeof window !== 'undefined') {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/console/login?returnTo=${returnTo}`
    }
    return fallback as JSX.Element
  }
  return <>{children}</>
}
```

- [ ] **Step 3: Export + commit**

```bash
git add -A
git commit -m "feat(identity-client): RequireSession redirect-on-401"
```

---

## Phase 8 — `apps/console` scaffold

Copy `apps/studio`'s wiring (Vite + TanStack Router + react-query + Tailwind via `@seta/ui`) and trim to console-only routes.

### Task 8.1: Scaffold the app

**Files:**
- Create: `apps/console/{package.json, vite.config.ts, tailwind.config.ts, tsconfig.json, playwright.config.ts, index.html}`
- Create: `apps/console/src/{main.tsx, router.tsx, styles.css, env.ts, api/{client.ts, queries.ts}, test/setup.ts}`

- [ ] **Step 1: Copy + rename from studio**

```bash
cp -r apps/studio apps/console
cd apps/console
# rename package
sed -i '' 's/"name": "@seta\/studio"/"name": "@seta\/console"/' package.json
sed -i '' 's/"description":.*/"description": "Seta Console — login, profile, members, superadmin",/' package.json
# vite base
sed -i '' "s|base: '/'|base: '/console/'|" vite.config.ts
# remove routes that don't belong (we'll add new ones in next task)
rm -rf src/routes/_authed
rm -f src/routes/login.tsx src/routes/login.\$provider.callback.tsx
```

- [ ] **Step 2: Update `package.json` deps**

Keep: `@seta/identity-client`, `@seta/ui`, `@tanstack/react-router`, `@tanstack/react-query`, `react`, `react-dom`, `zod`. Drop Studio-specific: `recharts`, `@seta/connector-registry`, `@seta/agent-sdk` (console doesn't render agent UI in v1).

- [ ] **Step 3: Reinstall**

```bash
pnpm install
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(console): scaffold apps/console from studio template"
```

---

### Task 8.2: Console routes

**Files:**
- Create: `apps/console/src/routes/__root.tsx`
- Create: `apps/console/src/routes/login.tsx` (move from former portal `LoginPage.tsx` content)
- Create: `apps/console/src/routes/login.$provider.callback.tsx` (from former `CallbackSplash`)
- Create: `apps/console/src/routes/no-workspace.tsx`
- Create: `apps/console/src/routes/_authed.tsx`
- Create: `apps/console/src/routes/_authed/index.tsx` (ConsoleHome)
- Create: `apps/console/src/routes/_authed/profile.tsx`
- Create: `apps/console/src/routes/_authed/members.tsx` (admin only)
- Create: `apps/console/src/routes/_superadmin.tsx` + `_superadmin/admin.tsx` + `_superadmin/admin/tenants.tsx`

- [ ] **Step 1: `__root.tsx`** — copy from `apps/studio/src/routes/__root.tsx`; same shape.

- [ ] **Step 2: Move `LoginPage` content into the route**

`apps/console/src/routes/login.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { signIn } from '@seta/identity-client'
import { Button } from '@seta/ui'

export const Route = createFileRoute('/login')({
  validateSearch: (s) => ({ returnTo: typeof s.returnTo === 'string' ? s.returnTo : '/' }),
  component: LoginRoute,
})

function LoginRoute() {
  const { returnTo } = Route.useSearch()
  // ... <LoginPage> body inlined from former platform/portal/src/LoginPage.tsx,
  // calling `signIn(provider, { returnTo })`
}
```

Inline the JSX from former `LoginPage.tsx`. Read `/sso/providers` to render only enabled buttons (fetch on mount; fall back to both if request fails).

- [ ] **Step 3: Callback route**

`apps/console/src/routes/login.$provider.callback.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useMe } from '@seta/identity-client'

export const Route = createFileRoute('/login/$provider/callback')({
  component: CallbackRoute,
})

function CallbackRoute() {
  // CallbackSplash UI: full-bleed gradient + spinner.
  // The server set the session cookie and 302'd to here in dev, or directly to next URL in prod.
  // Poll /me once; if returnTo present, redirect there; else stay at /console/.
  const { data } = useMe()
  useEffect(() => {
    if (data) window.location.href = '/console/'
  }, [data])
  return <div className="flex min-h-screen items-center justify-center bg-canvas">Signing in…</div>
}
```

(In practice the server-side callback now 302s to the resolved next URL; this client route is reached only if the server redirected here for diagnostic reasons. Keep it as a no-op safety net.)

- [ ] **Step 4: `no-workspace.tsx`**

```tsx
export const Route = createFileRoute('/no-workspace')({ component: NoWorkspaceRoute })
function NoWorkspaceRoute() {
  return (
    <EmptyState icon={Building2}
      title="No workspace yet"
      description="Your account isn't attached to a workspace. Ask your tenant admin to add you, or wait for directory sync." />
  )
}
```

- [ ] **Step 5: `_authed.tsx`**

Auth gate via `<RequireSession>` from `@seta/identity-client`. Mount `<AppShell nav={consoleNav(me)} />` from `@seta/ui`. Compute `consoleNav` (Home, Profile, Members if admin) from `useMe()`.

- [ ] **Step 6: `_authed/index.tsx` (ConsoleHome)**

Render the user's tenant name + tile grid for apps deployed (`me.apps`). Tile click = `window.location.href = '/<app>/'`. "Resume" CTA based on `seta_last_app` (read by server; here, just show all tiles equally).

- [ ] **Step 7: `_authed/profile.tsx`**

Read-only: name, email, picture, logout button (POST `/sso/logout`, then `window.location.href = '/console/login'`).

- [ ] **Step 8: `_authed/members.tsx` (admin only)**

`beforeLoad`: if `!me.tenant?.isAdmin` → throw redirect to `/console/`. Fetch `/members`, render `DataTable`, allow role change (PATCH) and remove (DELETE) with confirm dialog.

- [ ] **Step 9: `_superadmin.tsx`**

`beforeLoad`: redirect to `/console/` if `!me.isSuperadmin`. Render an AppShell variant with `superadminNav` (Tenants, System).

- [ ] **Step 10: `_superadmin/admin/tenants.tsx`**

Fetch `/admin/tenants`, render read-only table (id, slug, name, status, created_at).

- [ ] **Step 11: Regen route tree**

```bash
pnpm --filter @seta/console exec tsr generate
```

- [ ] **Step 12: Unit tests for each route + commit**

Tests use MSW (existing pattern in `apps/studio/src/test/msw-server.ts`). Cover: login renders provider buttons; members PATCH/DELETE flow; superadmin guard.

```bash
pnpm --filter @seta/console test:unit
git add -A
git commit -m "feat(console): routes for login, profile, members, /admin"
```

---

## Phase 9 — `apps/studio` cleanup (flatten URLs)

### Task 9.1: Remove session-level routes from Studio

**Files (delete):**
- `apps/studio/src/routes/login.tsx`
- `apps/studio/src/routes/login.$provider.callback.tsx`
- `apps/studio/src/routes/_authed/tenants.tsx`
- `apps/studio/src/routes/_authed/tenants.$id.tsx`
- `apps/studio/src/routes/_authed/me.tsx`
- `apps/studio/src/routes/_authed.test.tsx` (rewrite later)

- [ ] **Step 1: Delete login + tenants index**

```bash
git rm apps/studio/src/routes/login.tsx \
       apps/studio/src/routes/login.\$provider.callback.tsx \
       apps/studio/src/routes/_authed/tenants.tsx \
       apps/studio/src/routes/_authed/tenants.\$id.tsx \
       apps/studio/src/routes/_authed/me.tsx
```

- [ ] **Step 2: Flatten each `tenants.$id.<name>.tsx` → `<name>.tsx`**

For each of `agents, connectors, runs, corpus, audit, workflows, tools, threads, metrics, setup, connectors.$cid.consent`:

```bash
git mv apps/studio/src/routes/_authed/tenants.\$id.agents.tsx        apps/studio/src/routes/_authed/agents.tsx
git mv apps/studio/src/routes/_authed/tenants.\$id.connectors.tsx    apps/studio/src/routes/_authed/connectors.tsx
git mv apps/studio/src/routes/_authed/tenants.\$id.runs.tsx          apps/studio/src/routes/_authed/runs.tsx
# ... repeat for each ...
git mv apps/studio/src/routes/_authed/tenants.\$id.connectors.\$cid.consent.tsx \
       apps/studio/src/routes/_authed/connectors.\$cid.consent.tsx
```

- [ ] **Step 3: Strip `tenantId` from each route body**

Each file currently does `useParams({ from: '/_authed/tenants/$id/...' })` to get `params.id`. Replace with `useMe()` to get `me.tenant.id`. Update any URL builders that wrote `/tenants/${id}/...` paths to be flat (`./runs/abc` etc.).

- [ ] **Step 4: Rewrite `_authed.tsx`**

```tsx
// apps/studio/src/routes/_authed.tsx
import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'
import { AppShell } from '@seta/ui'
import { RequireSession, useMe } from '@seta/identity-client'
import { studioNav } from '../nav/studioNav'

export const Route = createFileRoute('/_authed')({ component: AuthedLayout })

function AuthedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return (
    <RequireSession>
      <Inner pathname={pathname} />
    </RequireSession>
  )
}

function Inner({ pathname }: { pathname: string }) {
  const { data: me } = useMe()
  return (
    <AppShell nav={studioNav()} currentPath={pathname} user={me?.user} tenant={me?.tenant}>
      <Outlet />
    </AppShell>
  )
}
```

- [ ] **Step 5: Update `studioNav`**

Remove `tenantId` parameter; all routes become fixed paths.

```ts
export function studioNav(): NavItem[] {
  return [
    { id: 'connectors', label: 'Connectors', icon: PlugZap, to: '/connectors' },
    { id: 'runs',       label: 'Runs',       icon: Activity, to: '/runs' },
    { id: 'corpus',     label: 'Corpus',     icon: FileText, to: '/corpus' },
    { id: 'audit',      label: 'Audit',      icon: ScrollText, to: '/audit' },
    { id: 'agents',     label: 'Agents',     icon: Bot, to: '/agents' },
    { id: 'workflows',  label: 'Workflows',  icon: Workflow, to: '/workflows' },
    { id: 'tools',      label: 'Tools',      icon: Hammer, to: '/tools' },
    { id: 'threads',    label: 'Memory',     icon: BrainCircuit, to: '/threads' },
    { id: 'metrics',    label: 'Metrics',    icon: GaugeCircle, to: '/metrics' },
  ]
}
```

- [ ] **Step 6: Update Vite base**

`apps/studio/vite.config.ts`: `base: '/studio/'`.

- [ ] **Step 7: Regenerate route tree**

```bash
pnpm --filter @seta/studio exec tsr generate
```

- [ ] **Step 8: Update Studio unit tests**

Most flattened routes already test happy paths. Update path strings (`/tenants/$id/runs` → `/runs`) in test fixtures and MSW handlers.

- [ ] **Step 9: typecheck + tests + commit**

```bash
pnpm typecheck
pnpm --filter @seta/studio test:unit
git add -A
git commit -m "refactor(studio): flatten tenant-scoped routes; rely on session tenant"
```

---

## Phase 10 — `AppSwitcher` in `@seta/ui`

### Task 10.1: Add `AppSwitcher` primitive

**Files:**
- Create: `platform/ui/src/AppSwitcher.tsx`
- Test: `platform/ui/src/AppSwitcher.test.tsx`
- Modify: `platform/ui/src/index.ts`

- [ ] **Step 1: Test**

```tsx
it('renders one tile per app and marks current active', () => {
  render(<AppSwitcher apps={['studio','finance']} current="studio" />)
  expect(screen.getByRole('link', { name: /studio/i })).toHaveAttribute('aria-current','page')
  expect(screen.getByRole('link', { name: /finance/i })).not.toHaveAttribute('aria-current','page')
})
it('navigates with full reload on click', async () => {
  // assert anchor href is /<app>/ so the browser does a hard navigation
  render(<AppSwitcher apps={['studio','finance']} current="studio" />)
  expect(screen.getByRole('link', { name: /finance/i })).toHaveAttribute('href','/finance/')
})
```

- [ ] **Step 2: Implement** — popover from `@radix-ui/react-popover`, 2×N tile grid styled per DESIGN.md tokens.

```tsx
import { LayoutGrid } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'

export type AppId = 'studio' | 'finance' | 'pmo' | 'timesheet'
const LABELS: Record<AppId,string> = { studio: 'Studio', finance: 'Finance', pmo: 'PMO', timesheet: 'Timesheet' }

export function AppSwitcher({ apps, current }: { apps: AppId[]; current: AppId }) {
  return (
    <Popover.Root>
      <Popover.Trigger aria-label="Apps"><LayoutGrid className="size-5" /></Popover.Trigger>
      <Popover.Content className="grid grid-cols-2 gap-2 p-3 rounded-lg shadow-card bg-canvas">
        {apps.map((a) => (
          <a key={a} href={`/${a}/`} aria-current={a === current ? 'page' : undefined}
             className={a === current ? 'app-switcher-tile-active' : 'app-switcher-tile-inactive'}>
            {LABELS[a]}
          </a>
        ))}
      </Popover.Content>
    </Popover.Root>
  )
}
```

- [ ] **Step 3: Mount in AppShell**

In `@seta/ui/AppShell` TopBar, add `<AppSwitcher apps={me.apps} current={currentApp} />` (pass `currentApp` prop from consumer).

- [ ] **Step 4: Pass + commit**

```bash
pnpm --filter @seta/ui test:unit
git add -A
git commit -m "feat(ui): AppSwitcher primitive in TopBar"
```

---

## Phase 11 — Reverse proxy & dev wiring

### Task 11.1: Single-origin Vite + API integration

- [ ] **Step 1: Add path bases**

Already done in earlier tasks (`apps/console/vite.config.ts` base `/console/`, `apps/studio` base `/studio/`).

- [ ] **Step 2: Dev proxy**

Add to `apps/api` a small static-serve / proxy block (or rely on Caddy). Simplest dev path: each SPA runs its own Vite dev server on different ports; `apps/api` proxies `/console/*` → vite-console port, `/studio/*` → vite-studio port. Update `pnpm dev` to start the three concurrently (use `npm-run-all` style or `concurrently`).

Add to `apps/api/src/main.ts` a dev-only handler:

```ts
if (env.NODE_ENV === 'development') {
  for (const [prefix, port] of [['/console', 5181], ['/studio', 5180]] as const) {
    app.all(`${prefix}/*`, async (c) => {
      const url = `http://localhost:${port}${c.req.path}`
      return fetch(url, { method: c.req.method, headers: c.req.raw.headers, body: c.req.raw.body })
    })
  }
}
```

- [ ] **Step 3: Production: document Caddy block**

Add `docs/runbooks/single-origin-routing.md` describing the production reverse-proxy mapping per spec §"Origin & cookie strategy". One-page runbook.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): single-origin dev proxy for console + studio"
```

---

## Phase 12 — E2E + final verification

### Task 12.1: Playwright flows in `apps/console`

**Files:**
- Create: `tests/e2e/console/{login.spec.ts,members.spec.ts,superadmin.spec.ts}`

- [ ] **Step 1: Test scenarios from spec §Verification step 5**

Each scenario one spec file. Use Entra mock provider (existing `EntraSsoProvider` test seam) and seeded DB fixtures.

- [ ] **Step 2: Wire pnpm script**

`tests/e2e/console/playwright.config.ts`: starts `pnpm dev` against the seeded test DB.

- [ ] **Step 3: Run + fix until green**

```bash
pnpm test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e2e): console + studio session flows"
```

---

### Task 12.2: Full verification

- [ ] **Step 1: Run the full suite**

```bash
pnpm typecheck
pnpm lint
pnpm format
pnpm test:unit
pnpm test:integration
pnpm test:e2e
```

All must pass.

- [ ] **Step 2: Manual exercise**

Start `pnpm dev`. Verify:
- `/` redirects to `/console/`
- Login as a seeded superadmin email → lands at `/console/admin/tenants`
- Login as a member (after manually inserting a `tenant_members` row) → lands at `/console/` or last app
- AppSwitcher from console → studio works (full reload)
- 401 from studio while a session expires → redirects to `/console/login?returnTo=…`
- `/members` toggle role on a non-admin → that user's next request from Studio returns 401

- [ ] **Step 3: Bundle-size check**

```bash
pnpm --filter @seta/studio check:bundle
```

- [ ] **Step 4: Boundary CI**

```bash
pnpm --filter @seta/check-no-cross-imports run check    # or whatever the existing boundary script is called
```

Confirm:
- `apps/studio` has no `@seta/portal` or `@seta/identity` or `@seta/tenant` imports.
- `modules/products/*` has no frontend imports (no `@seta/identity-client`, no `@seta/ui`).

- [ ] **Step 5: Open the PR**

Title: `feat: portal & tenancy boundary refactor (apps/console + identity/tenancy split)`

Body includes the spec link and the verification checklist. Changesets: one per public package touched (`@seta/identity`, `@seta/tenancy`, `@seta/identity-client`, `@seta/ui`) — `pnpm changeset`.

- [ ] **Step 6: Commit changesets + push**

```bash
pnpm changeset
git add -A
git commit -m "chore: changesets for boundary refactor"
git push -u origin feat/portal-tenancy-boundaries
```

---

## Self-Review Notes

**Spec coverage check:**
- Bounded contexts (backend + frontend): Phases 1–4, 7–10 cover every package mentioned.
- Data model (auth.superadmins, tenant_members alter, side-effect removal): Phase 3.
- Seed (env-driven, idempotent): Phase 5.
- Identity → tenancy resolution (`findOrAttachUser` + callback branching): Tasks 4.5, 4.7.
- `/me` payload: Task 4.7 step 1, 3.
- Module wiring (`MeContextProvider` interface): Task 4.6.
- Frontend route ownership (`apps/console` routes; flattened studio): Phases 8, 9.
- Origin & cookie strategy: Phase 11.
- Session-expiry handling in product SPAs (`<RequireSession>`): Task 7.3.
- AppSwitcher: Phase 10.
- Provider configuration (env-driven enable/disable + `/sso/providers`): Task 6.1.
- Cross-cutting standards (rate limit, audit, session rotation): Tasks 4.9, 6.2, 6.4.
- Migration & rename plan: Phases 1, 2, 3.
- New-module template: documented in spec; no per-task implementation needed since Finance/PMO/Timesheet are deferred.
- Verification: Phase 12.

**Open items the plan does not implement (per spec "deferred"):**
- Tenant CRUD UI (`/admin/tenants` is read-only).
- Per-app RBAC.
- Superadmin impersonation.
- Member self-leave.
- JIT membership from Entra `tid`.
- Federated identity merging across providers.
- Billing/quotas.

These appear in the spec's "Open items (intentionally deferred)" — no plan tasks created. Correct.
