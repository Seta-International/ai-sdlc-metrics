# PR-4: Tenants + Connector Admin Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tenant + connector admin slice end-to-end: tenant_members table, createTenantRoutes, createConnectorAdminRoutes, SDK methods, Studio /tenants (full) and /tenants/:id/connectors pages plus consent landing, TenantSwitcher wiring.

**Architecture:** @seta/tenant gains tenant_members + listTenantsForUser + requireTenantMembership + createTenantRoutes. @seta/connector-registry gains createConnectorAdminRoutes that joins registry definitions with per-tenant consent and delegates /connectors/:cid/consent-url to @seta/oauth. apps/api gets a 2-line composition diff. Studio replaces PR-3's smoke /tenants page with a full DataTable, adds the connectors list + consent landing, wires TenantSwitcher. **Studio is admin-only and does NOT mount the right-side `AgentPanel`** — PR-3's Phase 0.5 already amended `@seta/ui` `AppShell` to omit the panel column when no `agentContext` prop is passed, and PR-3 mounted `AppShell` without one. This PR adds no panel wiring.

**Tech Stack:** Drizzle + drizzle-kit, Hono, @hono/zod-openapi, Zod 4.4.3, MSW 2.14.6, Playwright, TanStack Query + Router, @seta/ui DataTable + StatusBadge + Card + EmptyState.

---

## Phase 0 — Worktree + branch

- [ ] Use `superpowers:using-git-worktrees` to enter an isolated worktree at `../seta-os.pr04-tenants-connectors`. Create branch `feat/studio-pr04-tenants-connectors` from `main`.
- [ ] Run `pnpm install --frozen-lockfile` inside the worktree. Verify with `pnpm typecheck` and `pnpm test:unit` (baseline green).

---

## Phase 1 — `@seta/tenant`: tenant_members schema + migration

### 1.1 Failing schema test (TDD)

- [ ] Add `platform/tenant/src/schema.test.ts` asserting the Drizzle `tenantMembers` table shape (columns `userId`, `tenantId`, `role` (enum `'owner' | 'admin' | 'member'`), `createdAt`; composite PK `(userId, tenantId)`; FK to `tenant.tenants.id`). Use `tenantMembers.$inferSelect` / `$inferInsert` typeof assertions.

Complete file:

```ts
// platform/tenant/src/schema.test.ts
import { describe, expect, it } from 'vitest'
import { tenantMembers } from './schema'

describe('auth.tenant_members schema', () => {
  it('exposes the expected columns', () => {
    const cols = Object.keys(tenantMembers)
    expect(cols).toEqual(expect.arrayContaining(['userId', 'tenantId', 'role', 'createdAt']))
  })

  it('row select type is the union role', () => {
    type Row = typeof tenantMembers.$inferSelect
    const row: Row = {
      userId: '00000000-0000-0000-0000-000000000001',
      tenantId: '00000000-0000-0000-0000-000000000002',
      role: 'admin',
      createdAt: new Date(),
    }
    expect(row.role).toBe('admin')
  })
})
```

- [ ] Confirm it FAILS: `pnpm --filter @seta/tenant test:unit -t 'auth.tenant_members schema'`.

### 1.2 Extend the Drizzle schema

- [ ] Edit `platform/tenant/src/schema.ts` to introduce the `auth` pgSchema and the `tenant_members` table. Drizzle file (full appended block):

```ts
import { pgEnum, pgSchema, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// existing tenant schema unchanged …

export const authSchema = pgSchema('auth')

export const tenantMemberRole = authSchema.enum('tenant_member_role', [
  'owner',
  'admin',
  'member',
])

export const tenantMembers = authSchema.table(
  'tenant_members',
  {
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    role: tenantMemberRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tenantId] })],
)

export type TenantMember = typeof tenantMembers.$inferSelect
export type NewTenantMember = typeof tenantMembers.$inferInsert
```

- [ ] Update `platform/tenant/drizzle.config.ts` `schemaFilter` to `['tenant', 'auth']` so the generator emits the `auth` schema's tables.
- [ ] `pnpm --filter @seta/tenant test:unit -t 'auth.tenant_members schema'` → must pass.

### 1.3 Generate Drizzle migration

- [ ] From repo root: `pnpm --filter @seta/tenant exec drizzle-kit generate --name tenant_members`. Confirm a new file is added under `platform/tenant/migrations/` containing `CREATE SCHEMA "auth"`, `CREATE TYPE "auth"."tenant_member_role"`, and `CREATE TABLE "auth"."tenant_members"` with the composite PK and FK to `tenant.tenants`.
- [ ] DO NOT hand-edit the generated SQL.

### 1.4 Custom migration: RLS force + policy + grants

- [ ] `pnpm --filter @seta/tenant exec drizzle-kit generate --custom --name tenant_members_rls`. Edit the new file with the following body:

```sql
ALTER TABLE "auth"."tenant_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "auth"."tenant_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation_tenant_members" ON "auth"."tenant_members"
  AS PERMISSIVE FOR ALL TO "tenant_user"
  USING ("auth"."tenant_members"."tenant_id" = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK ("auth"."tenant_members"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "self_read_tenant_members" ON "auth"."tenant_members"
  AS PERMISSIVE FOR SELECT TO "tenant_user"
  USING ("auth"."tenant_members"."user_id" = current_setting('app.user_id', true)::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "auth"."tenant_members" TO "tenant_user";
```

- [ ] Run `pnpm migrate` against the local DB (`pnpm db:up` if not running). Verify no errors.

### 1.5 Commit

- [ ] `git add platform/tenant/src/schema.ts platform/tenant/src/schema.test.ts platform/tenant/drizzle.config.ts platform/tenant/migrations/`
- [ ] Commit: `feat(tenant): add auth.tenant_members table with RLS`

---

## Phase 2 — `@seta/tenant`: listTenantsForUser

### 2.1 Failing integration test (TDD)

- [ ] Add `platform/tenant/tests/integration/listTenantsForUser.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { listTenantsForUser } from '../../src/service'

const url = process.env.DATABASE_URL
const sql = postgres(url!, { onnotice: () => {} })

beforeAll(async () => {
  if (!url) throw new Error('DATABASE_URL is required for integration tests')
})

afterAll(async () => {
  await sql.end()
})

beforeEach(async () => {
  await sql`TRUNCATE auth.tenant_members CASCADE`
  await sql`TRUNCATE tenant.tenants CASCADE`
})

describe('listTenantsForUser', () => {
  it('returns rows joined by tenant_members + tenants for the given user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const tA = '22222222-2222-2222-2222-22222222aaaa'
    const tB = '22222222-2222-2222-2222-22222222bbbb'
    await sql`INSERT INTO tenant.tenants (id, slug, display_name) VALUES (${tA}, 'acme', 'Acme'), (${tB}, 'globex', 'Globex')`
    await sql`INSERT INTO auth.tenant_members (user_id, tenant_id, role) VALUES (${userId}, ${tA}, 'admin'), (${userId}, ${tB}, 'member')`

    const rows = await listTenantsForUser(sql as never, userId)
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: tA, name: 'Acme', role: 'admin' },
        { id: tB, name: 'Globex', role: 'member' },
      ]),
    )
  })

  it('returns [] for a user with no memberships', async () => {
    const rows = await listTenantsForUser(sql as never, '99999999-9999-9999-9999-999999999999')
    expect(rows).toEqual([])
  })
})
```

- [ ] Confirm it FAILS: `DATABASE_URL=postgres://seta:dev@localhost:5432/seta pnpm --filter @seta/tenant exec vitest run tests/integration/listTenantsForUser.test.ts`. (The integration test runner is configured at the workspace level — see Phase 9 if needed.)

### 2.2 Implement `listTenantsForUser`

- [ ] Edit `platform/tenant/src/service.ts` to add:

```ts
export type TenantMembershipRow = {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
}

export async function listTenantsForUser(
  sql: Sql,
  userId: string,
): Promise<TenantMembershipRow[]> {
  const rows = (await sql`
    SELECT t.id::text AS id,
           COALESCE(t.display_name, t.slug) AS name,
           m.role AS role
    FROM auth.tenant_members m
    JOIN tenant.tenants t ON t.id = m.tenant_id
    WHERE m.user_id = ${userId}
      AND t.status = 'active'
    ORDER BY name ASC
  `) as Array<{ id: string; name: string; role: 'owner' | 'admin' | 'member' }>
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role }))
}
```

- [ ] Re-export from `platform/tenant/src/index.ts` next to `getActiveTenantIds`.
- [ ] Test must pass.

### 2.3 Commit

- [ ] `git add platform/tenant/src/service.ts platform/tenant/src/index.ts platform/tenant/tests/integration/listTenantsForUser.test.ts`
- [ ] Commit: `feat(tenant): listTenantsForUser`

---

## Phase 3 — `@seta/tenant`: requireTenantMembership middleware

### 3.1 Failing unit test (TDD)

- [ ] Add `platform/tenant/src/membership.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { requireTenantMembership } from './membership'

describe('requireTenantMembership', () => {
  it('403 when user has no membership row for the route tenant', async () => {
    const lookup = async () => null
    const app = new Hono().use('*', requireTenantMembership({ lookup })).get('/tenants/:id/x', (c) =>
      c.json({ ok: true }),
    )
    const res = await app.request('/tenants/t1/x', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(403)
  })

  it('continues when lookup returns a member row', async () => {
    const lookup = async () => ({ role: 'admin' as const })
    const app = new Hono().use('*', requireTenantMembership({ lookup })).get('/tenants/:id/x', (c) =>
      c.json({ ok: true, role: c.get('membership').role }),
    )
    const res = await app.request('/tenants/t1/x', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, role: 'admin' })
  })

  it('401 if no session user on context', async () => {
    const lookup = async () => ({ role: 'admin' as const })
    const app = new Hono()
      .use('*', requireTenantMembership({ lookup, sessionUser: () => undefined }))
      .get('/tenants/:id/x', (c) => c.json({ ok: true }))
    const res = await app.request('/tenants/t1/x')
    expect(res.status).toBe(401)
  })
})
```

- [ ] Confirm it FAILS.

### 3.2 Implement

- [ ] Add `platform/tenant/src/membership.ts`:

```ts
import { Forbidden, Unauthorized } from '@seta/middleware'
import type { Context, MiddlewareHandler } from 'hono'

export type TenantMembershipRole = 'owner' | 'admin' | 'member'
export type TenantMembership = { role: TenantMembershipRole }

export type RequireTenantMembershipOpts = {
  /**
   * Resolve session user id from request context. Default reads
   * `c.get('sessionUser')?.id` (set by @seta/identity requireSession) and falls
   * back to the `x-session-user` header (test seam).
   */
  sessionUser?: (c: Context) => string | undefined
  lookup: (
    args: { userId: string; tenantId: string },
  ) => Promise<TenantMembership | null>
  /** Route param name. Default `'id'` to match `/tenants/:id/*`. */
  paramName?: string
}

declare module 'hono' {
  interface ContextVariableMap {
    membership: TenantMembership
  }
}

const defaultSessionUser = (c: Context) =>
  (c.get('sessionUser') as { id?: string } | undefined)?.id ??
  c.req.header('x-session-user')

export function requireTenantMembership(
  opts: RequireTenantMembershipOpts,
): MiddlewareHandler {
  const getUser = opts.sessionUser ?? defaultSessionUser
  const paramName = opts.paramName ?? 'id'
  return async (c, next) => {
    const userId = getUser(c)
    if (!userId) throw new Unauthorized('no session user')
    const tenantId = c.req.param(paramName)
    if (!tenantId) throw new Forbidden('missing tenant route param')
    const row = await opts.lookup({ userId, tenantId })
    if (!row) throw new Forbidden('not a member of this tenant')
    c.set('membership', row)
    await next()
  }
}
```

- [ ] Add `Forbidden` to `@seta/middleware/errors` if not already exported (verify and add if missing).
- [ ] Re-export from `platform/tenant/src/index.ts`.
- [ ] Unit test passes.

### 3.3 Integration test against real Postgres

- [ ] Add `platform/tenant/tests/integration/requireTenantMembership.test.ts` that builds a `lookup` closure over `sql` and asserts 200 for a seeded membership, 403 for a non-member, 401 for missing header.

### 3.4 Commit

- [ ] `git add platform/tenant/src/membership.ts platform/tenant/src/membership.test.ts platform/tenant/src/index.ts platform/tenant/tests/integration/requireTenantMembership.test.ts`
- [ ] Commit: `feat(tenant): requireTenantMembership middleware`

---

## Phase 4 — `@seta/tenant`: createTenantRoutes factory

### 4.1 Add `@hono/zod-openapi` workspace dep

- [ ] `pnpm --filter @seta/tenant add @hono/zod-openapi@<pin>` — propose pin first via `pnpm view @hono/zod-openapi version`.

### 4.2 Failing route test (TDD)

- [ ] Add `platform/tenant/src/routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createTenantRoutes } from './routes'

describe('createTenantRoutes', () => {
  it('GET /tenants returns the membership rows for the session user', async () => {
    const app = createTenantRoutes({
      listTenants: async ({ userId }) =>
        userId === 'u1'
          ? [{ id: 't1', name: 'Acme', role: 'admin' }]
          : [],
      sessionUser: (c) => c.req.header('x-session-user'),
    })
    const res = await app.request('/tenants', { headers: { 'x-session-user': 'u1' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ id: 't1', name: 'Acme', role: 'admin' }])
  })

  it('401 without session', async () => {
    const app = createTenantRoutes({
      listTenants: async () => [],
      sessionUser: () => undefined,
    })
    const res = await app.request('/tenants')
    expect(res.status).toBe(401)
  })
})
```

- [ ] Confirm it FAILS.

### 4.3 Implement

- [ ] Add `platform/tenant/src/routes.ts`:

```ts
import { Unauthorized } from '@seta/middleware'
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Context } from 'hono'
import type { TenantMembershipRow } from './service'

export const TenantSummary = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
})
export type TenantSummary = z.infer<typeof TenantSummary>

const TenantSummaryList = z.array(TenantSummary)

export type CreateTenantRoutesOpts = {
  listTenants: (args: { userId: string }) => Promise<TenantMembershipRow[]>
  sessionUser?: (c: Context) => string | undefined
}

const defaultSessionUser = (c: Context) =>
  (c.get('sessionUser') as { id?: string } | undefined)?.id

export function createTenantRoutes(opts: CreateTenantRoutesOpts) {
  const app = new OpenAPIHono()
  const getUser = opts.sessionUser ?? defaultSessionUser

  const route = createRoute({
    method: 'get',
    path: '/tenants',
    responses: {
      200: {
        content: { 'application/json': { schema: TenantSummaryList } },
        description: 'Tenants visible to the current session user',
      },
    },
  })

  app.openapi(route, async (c) => {
    const userId = getUser(c)
    if (!userId) throw new Unauthorized('no session user')
    const rows = await opts.listTenants({ userId })
    return c.json(rows satisfies TenantSummary[], 200)
  })

  return app
}
```

- [ ] Re-export `createTenantRoutes` + `TenantSummary` from `platform/tenant/src/index.ts`.
- [ ] Test passes.
- [ ] Verify the SDK's pre-existing `MeSchema.tenants[].role` enum (`'admin' | 'member' | 'viewer'` in `platform/agent/sdk/src/client/AgentClient.ts`) is updated in Phase 7 to match `'owner' | 'admin' | 'member'`. CLAUDE.md forbids parallel shapes — pick one and replace the other across all callers in this PR.

### 4.4 Commit

- [ ] `git add platform/tenant/src/routes.ts platform/tenant/src/routes.test.ts platform/tenant/src/index.ts platform/tenant/package.json pnpm-lock.yaml`
- [ ] Commit: `feat(tenant): createTenantRoutes factory exposing GET /tenants`

---

## Phase 5 — `@seta/connector-registry`: createConnectorAdminRoutes

### 5.1 Workspace deps

- [ ] `pnpm --filter @seta/connector-registry add @seta/oauth@workspace:*`
- [ ] `pnpm --filter @seta/connector-registry add @hono/zod-openapi@<pin>` (same pin as tenant).
- [ ] Verify `@seta/oauth` is already importable: `platform/connector-registry/SCOPE.md` lists `@seta/oauth` as a sibling platform package; CLAUDE.md "Boundaries" permits `platform/*` ↔ `platform/*` imports.

### 5.2 Failing test (TDD)

- [ ] Add `platform/connector-registry/src/admin-routes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createConnectorAdminRoutes } from './admin-routes'
import { createConnectorRegistry } from './runtime'
import type { ConnectorDefinition } from './types'

const plannerDef: ConnectorDefinition = {
  id: 'ms365-planner',
  providerId: 'entra',
  displayName: 'Microsoft Planner',
  description: 'Sync Planner tasks.',
  customerFacingRationale: 'Required so the agent can read tasks.',
  requiredScopes: { delegated: ['Tasks.Read'], application: ['Tasks.Read.All'] },
  capabilities: { syncable: true, writes: false },
}

function build(consented: Set<string>) {
  const registry = createConnectorRegistry(async (_t, id) => consented.has(id))
  registry.register(plannerDef)
  return createConnectorAdminRoutes({
    registry,
    isConsented: async (_tenantId, connectorId) => consented.has(connectorId),
    sessionUser: (c) => c.req.header('x-session-user'),
    lookupMembership: async () => ({ role: 'admin' }),
    buildConsentUrl: async ({ tenantId, providerId, connectorIds }) => ({
      url: `https://login.microsoftonline.com/${tenantId}/${providerId}?connectors=${connectorIds.join(',')}`,
      state: 'st_test',
    }),
  })
}

describe('createConnectorAdminRoutes', () => {
  it('GET /tenants/:id/connectors joins definitions with consent status', async () => {
    const app = build(new Set(['ms365-planner']))
    const res = await app.request('/tenants/t1/connectors', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      expect.objectContaining({
        id: 'ms365-planner',
        providerId: 'entra',
        status: 'consented',
      }),
    ])
  })

  it('returns status=pending when no consent row', async () => {
    const app = build(new Set())
    const res = await app.request('/tenants/t1/connectors', {
      headers: { 'x-session-user': 'u1' },
    })
    expect((await res.json())[0].status).toBe('pending')
  })

  it('POST /connectors/:cid/consent-url delegates to buildConsentUrl', async () => {
    const app = build(new Set())
    const res = await app.request('/tenants/t1/connectors/ms365-planner/consent-url', {
      method: 'POST',
      headers: { 'x-session-user': 'u1', 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      url: expect.stringContaining('connectors=ms365-planner'),
      state: 'st_test',
    })
  })

  it('403 when membership lookup returns null', async () => {
    const registry = createConnectorRegistry(async () => false)
    registry.register(plannerDef)
    const app = createConnectorAdminRoutes({
      registry,
      isConsented: async () => false,
      sessionUser: (c) => c.req.header('x-session-user'),
      lookupMembership: async () => null,
      buildConsentUrl: async () => ({ url: '', state: '' }),
    })
    const res = await app.request('/tenants/t1/connectors', {
      headers: { 'x-session-user': 'u1' },
    })
    expect(res.status).toBe(403)
  })
})
```

- [ ] Confirm it FAILS.

### 5.3 Implement

- [ ] Add `platform/connector-registry/src/admin-routes.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Unauthorized, Forbidden, BadRequest } from '@seta/middleware'
import type { Context } from 'hono'
import type { ConnectorRegistry } from './types'

export const ConnectorStatus = z.enum([
  'consented',
  'pending',
  'failed',
  'token-expired',
])
export type ConnectorStatus = z.infer<typeof ConnectorStatus>

export const ConnectorAdminRow = z.object({
  id: z.string(),
  providerId: z.string(),
  displayName: z.string(),
  description: z.string(),
  customerFacingRationale: z.string(),
  requiredScopes: z.object({
    delegated: z.array(z.string()),
    application: z.array(z.string()),
  }),
  capabilities: z.object({ syncable: z.boolean(), writes: z.boolean() }),
  status: ConnectorStatus,
  lastConsentedAt: z.string().nullable(),
})
export type ConnectorAdminRow = z.infer<typeof ConnectorAdminRow>

const ConsentUrlBody = z.object({
  tenantId: z.uuid().optional(),
  tenantHint: z.string().optional(),
})

const ConsentUrlResponse = z.object({
  url: z.string().url(),
  state: z.string(),
})

export type ConnectorAdminLookup = (args: {
  userId: string
  tenantId: string
}) => Promise<{ role: 'owner' | 'admin' | 'member' } | null>

export type CreateConnectorAdminRoutesOpts = {
  registry: ConnectorRegistry
  /** Per-tenant consent status read. Wired by composition root to tenant.tenant_connectors. */
  isConsented: (
    tenantId: string,
    connectorId: string,
  ) => Promise<boolean>
  /** Optional: enrich with last-consented-at timestamp. */
  lastConsentedAt?: (
    tenantId: string,
    connectorId: string,
  ) => Promise<string | null>
  lookupMembership: ConnectorAdminLookup
  sessionUser?: (c: Context) => string | undefined
  /**
   * Delegated to @seta/oauth — composition root wires it to call into
   * createOAuthRoutes' state-store + provider adapter. Keeps this package
   * vendor-neutral while reusing the existing consent-url builder.
   */
  buildConsentUrl: (args: {
    tenantId: string
    providerId: string
    connectorIds: string[]
    tenantHint?: string
  }) => Promise<{ url: string; state: string }>
}

const defaultSessionUser = (c: Context) =>
  (c.get('sessionUser') as { id?: string } | undefined)?.id

export function createConnectorAdminRoutes(opts: CreateConnectorAdminRoutesOpts) {
  const app = new OpenAPIHono()
  const getUser = opts.sessionUser ?? defaultSessionUser

  async function requireMembership(
    c: Context,
    tenantId: string,
  ): Promise<{ role: 'owner' | 'admin' | 'member' }> {
    const userId = getUser(c)
    if (!userId) throw new Unauthorized('no session user')
    const row = await opts.lookupMembership({ userId, tenantId })
    if (!row) throw new Forbidden('not a member of this tenant')
    return row
  }

  const listRoute = createRoute({
    method: 'get',
    path: '/tenants/{id}/connectors',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(ConnectorAdminRow) } },
        description: 'Connectors visible for this tenant with consent status',
      },
    },
  })

  app.openapi(listRoute, async (c) => {
    const tenantId = c.req.param('id')
    await requireMembership(c, tenantId)
    const defs = opts.registry.list()
    const rows: ConnectorAdminRow[] = await Promise.all(
      defs.map(async (d) => {
        const consented = await opts.isConsented(tenantId, d.id)
        const lastConsentedAt = opts.lastConsentedAt
          ? await opts.lastConsentedAt(tenantId, d.id)
          : null
        return {
          id: d.id,
          providerId: d.providerId,
          displayName: d.displayName,
          description: d.description,
          customerFacingRationale: d.customerFacingRationale,
          requiredScopes: d.requiredScopes,
          capabilities: d.capabilities,
          status: consented ? 'consented' : 'pending',
          lastConsentedAt,
        }
      }),
    )
    return c.json(rows, 200)
  })

  const consentUrlRoute = createRoute({
    method: 'post',
    path: '/tenants/{id}/connectors/{cid}/consent-url',
    request: {
      params: z.object({ id: z.string(), cid: z.string() }),
      body: {
        content: { 'application/json': { schema: ConsentUrlBody } },
        required: false,
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: ConsentUrlResponse } },
        description: 'Admin-consent URL for the connector',
      },
    },
  })

  app.openapi(consentUrlRoute, async (c) => {
    const tenantId = c.req.param('id')
    const connectorId = c.req.param('cid')
    await requireMembership(c, tenantId)
    const def = opts.registry.get(connectorId)
    const raw = c.req.header('content-type')?.includes('application/json')
      ? await c.req.json().catch(() => ({}))
      : {}
    const body = ConsentUrlBody.parse(raw)
    if (body.tenantId && body.tenantId !== tenantId) {
      throw new BadRequest('body.tenantId must match route tenant')
    }
    const out = await opts.buildConsentUrl({
      tenantId,
      providerId: def.providerId,
      connectorIds: [connectorId],
      ...(body.tenantHint !== undefined ? { tenantHint: body.tenantHint } : {}),
    })
    return c.json(out, 200)
  })

  return app
}
```

- [ ] Re-export from `platform/connector-registry/src/index.ts`.
- [ ] Tests pass.

### 5.4 Commit

- [ ] `git add platform/connector-registry/ pnpm-lock.yaml`
- [ ] Commit: `feat(connector-registry): createConnectorAdminRoutes (list + consent-url delegate)`

---

## Phase 6 — `apps/api`: mount + smoke integration

### 6.1 Composition diff in `apps/api/src/main.ts`

- [ ] Add imports:

```ts
import { listTenantsForUser, createTenantRoutes } from '@seta/tenant'
import { createConnectorAdminRoutes } from '@seta/connector-registry'
```

- [ ] After the existing `app.route('/oauth', createOAuthRoutes({ … }))` block, insert:

```ts
// Helper that delegates to the same consent-url builder createOAuthRoutes uses.
// Mirrors the body of POST /oauth/:provider/consent-url.
const buildConsentUrl: Parameters<typeof createConnectorAdminRoutes>[0]['buildConsentUrl'] =
  async ({ tenantId, providerId, connectorIds, tenantHint }) => {
    const provider = { entra }[providerId as 'entra']
    if (!provider) throw new Error(`unknown provider '${providerId}'`)
    const union = registry.scopeUnion(connectorIds)
    const state = await stateStore.mint({ providerId, connectorIds })
    const url = provider.buildAdminConsentUrl({
      scopes: union.application.concat(union.delegated),
      redirectUri: `${env.PUBLIC_BASE_URL}/oauth/${providerId}/callback`,
      state,
      ...(tenantHint !== undefined ? { tenantHint } : { tenantHint: tenantId }),
    })
    return { url, state }
  }

app.route(
  '/',
  createTenantRoutes({
    listTenants: async ({ userId }) => listTenantsForUser(sql as never, userId),
  }),
)

app.route(
  '/',
  createConnectorAdminRoutes({
    registry,
    isConsented: async (tenantId, connectorId) =>
      isConnectorConsented(sql as never, tenantId, connectorId),
    lookupMembership: async ({ userId, tenantId }) => {
      const rows = (await sql`
        SELECT role FROM auth.tenant_members
        WHERE user_id = ${userId} AND tenant_id = ${tenantId}
        LIMIT 1
      `) as Array<{ role: 'owner' | 'admin' | 'member' }>
      return rows[0] ?? null
    },
    buildConsentUrl,
  }),
)
```

### 6.2 Smoke integration test

- [ ] Add `apps/api/tests/integration/tenants-and-connectors.test.ts` that:
  1. Seeds `tenant.tenants` and `auth.tenant_members` for a synthetic `userId`.
  2. Uses MSW to mock the upstream Microsoft `/v2.0/adminconsent` for the build-url provider call (not strictly needed — `buildAdminConsentUrl` returns synchronously).
  3. `GET /tenants` with `x-session-user: <userId>` returns the seeded rows.
  4. `GET /tenants/:id/connectors` returns connectors with consent status.
  5. `POST /tenants/:id/connectors/ms365-planner/consent-url` returns `{ url, state }` and the `url` host matches `login.microsoftonline.com`.

### 6.3 Commit

- [ ] `git add apps/api/src/main.ts apps/api/tests/integration/tenants-and-connectors.test.ts`
- [ ] Commit: `feat(api): mount tenant + connector admin routes`

---

## Phase 7 — `@seta/agent-sdk`: SDK methods + recordings

### 7.1 Align `MeSchema` with new role enum

- [ ] In `platform/agent/sdk/src/client/AgentClient.ts`, change `role: z.enum(['admin', 'member', 'viewer'])` to `role: z.enum(['owner', 'admin', 'member'])`. Update `AgentClient.test.ts` `me` fixture accordingly. CLAUDE.md "no legacy, no backward compat" — delete the old shape.

### 7.2 Add schema module

- [ ] Create `platform/agent/sdk/src/schemas/tenants.ts`:

```ts
import { z } from 'zod'

export const TenantSummary = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
})
export type TenantSummary = z.infer<typeof TenantSummary>
export const TenantSummaryList = z.array(TenantSummary)
```

- [ ] Create `platform/agent/sdk/src/schemas/connectors.ts`:

```ts
import { z } from 'zod'

export const ConnectorStatus = z.enum([
  'consented',
  'pending',
  'failed',
  'token-expired',
])
export type ConnectorStatus = z.infer<typeof ConnectorStatus>

export const ConnectorSummary = z.object({
  id: z.string(),
  providerId: z.string(),
  displayName: z.string(),
  description: z.string(),
  customerFacingRationale: z.string(),
  requiredScopes: z.object({
    delegated: z.array(z.string()),
    application: z.array(z.string()),
  }),
  capabilities: z.object({ syncable: z.boolean(), writes: z.boolean() }),
  status: ConnectorStatus,
  lastConsentedAt: z.string().nullable(),
})
export type ConnectorSummary = z.infer<typeof ConnectorSummary>
export const ConnectorSummaryList = z.array(ConnectorSummary)

export const ConsentUrlResponse = z.object({
  url: z.string().url(),
  state: z.string(),
})
export type ConsentUrlResponse = z.infer<typeof ConsentUrlResponse>
```

### 7.3 Extend `AgentClient`

- [ ] Edit `platform/agent/sdk/src/client/AgentClient.ts` to add methods:

```ts
import { TenantSummaryList, type TenantSummary } from '../schemas/tenants'
import {
  ConnectorSummaryList,
  ConsentUrlResponse,
  type ConnectorSummary,
} from '../schemas/connectors'

// inside class AgentClient { … }
listTenants(init: { signal?: AbortSignal } = {}): Promise<TenantSummary[]> {
  const reqInit: { schema: typeof TenantSummaryList; signal?: AbortSignal } = {
    schema: TenantSummaryList,
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, '/tenants', reqInit)
}

listConnectors(
  tenantId: string,
  init: { signal?: AbortSignal } = {},
): Promise<ConnectorSummary[]> {
  const reqInit: { schema: typeof ConnectorSummaryList; signal?: AbortSignal } = {
    schema: ConnectorSummaryList,
  }
  if (init.signal) reqInit.signal = init.signal
  return request(
    this.opts,
    `/tenants/${encodeURIComponent(tenantId)}/connectors`,
    reqInit,
  )
}

grantConsentUrl(
  args: { tenantId: string; connectorId: string; tenantHint?: string },
  init: { signal?: AbortSignal } = {},
): Promise<{ url: string; state: string }> {
  const body: Record<string, string> = {}
  if (args.tenantHint) body.tenantHint = args.tenantHint
  const reqInit: {
    method: 'POST'
    schema: typeof ConsentUrlResponse
    body: string
    headers: Record<string, string>
    signal?: AbortSignal
  } = {
    method: 'POST',
    schema: ConsentUrlResponse,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }
  if (init.signal) reqInit.signal = init.signal
  return request(
    this.opts,
    `/tenants/${encodeURIComponent(args.tenantId)}/connectors/${encodeURIComponent(args.connectorId)}/consent-url`,
    reqInit,
  )
}
```

- [ ] Verify `platform/agent/sdk/src/transport/request.ts` already supports `method` + `body` + `headers`; if not, extend it (TDD a small test for it first).

### 7.4 MSW recordings

- [ ] Create `platform/agent/sdk/src/__recordings__/listTenants.json`:

```json
{
  "request": { "method": "GET", "url": "/tenants" },
  "response": {
    "status": 200,
    "body": [
      { "id": "00000000-0000-0000-0000-0000000000a1", "name": "Acme", "role": "admin" },
      { "id": "00000000-0000-0000-0000-0000000000a2", "name": "Globex", "role": "member" }
    ]
  }
}
```

- [ ] Create `platform/agent/sdk/src/__recordings__/listConnectors.json`:

```json
{
  "request": { "method": "GET", "url": "/tenants/00000000-0000-0000-0000-0000000000a1/connectors" },
  "response": {
    "status": 200,
    "body": [
      {
        "id": "ms365-planner",
        "providerId": "entra",
        "displayName": "Microsoft Planner",
        "description": "Sync Planner tasks.",
        "customerFacingRationale": "Required so the agent can read tasks.",
        "requiredScopes": { "delegated": ["Tasks.Read"], "application": ["Tasks.Read.All"] },
        "capabilities": { "syncable": true, "writes": false },
        "status": "pending",
        "lastConsentedAt": null
      }
    ]
  }
}
```

- [ ] Create `platform/agent/sdk/src/__recordings__/grantConsentUrl.json`:

```json
{
  "request": {
    "method": "POST",
    "url": "/tenants/00000000-0000-0000-0000-0000000000a1/connectors/ms365-planner/consent-url",
    "body": {}
  },
  "response": {
    "status": 200,
    "body": {
      "url": "https://login.microsoftonline.com/00000000-0000-0000-0000-0000000000a1/v2.0/adminconsent?client_id=app&state=st_test&redirect_uri=https%3A%2F%2Fapi.test%2Foauth%2Fentra%2Fcallback&scope=Tasks.Read+Tasks.Read.All",
      "state": "st_test"
    }
  }
}
```

### 7.5 Co-located unit tests

- [ ] Extend `platform/agent/sdk/src/client/AgentClient.test.ts` with three `describe` blocks driven by the recordings (read JSON, register MSW handlers, call method, assert request shape + parsed response).

### 7.6 Re-exports + commit

- [ ] Add re-exports to `platform/agent/sdk/src/index.ts` for `TenantSummary`, `TenantSummaryList`, `ConnectorSummary`, `ConnectorSummaryList`, `ConnectorStatus`, `ConsentUrlResponse`.
- [ ] `git add platform/agent/sdk/`
- [ ] Commit: `feat(agent-sdk): listTenants, listConnectors, grantConsentUrl methods`

---

## Phase 8 — Studio: query helpers + mutation

### 8.1 Replace placeholder `tenantsQueryOptions` in PR-3 scaffold

- [ ] Edit `apps/studio/src/api/queries.ts` to add (or rewrite) the helpers:

```ts
import { queryOptions } from '@tanstack/react-query'
import type { AgentClient } from '@seta/agent-sdk'

export const tenantsQueryOptions = (client: AgentClient) =>
  queryOptions({
    queryKey: ['tenants'],
    queryFn: ({ signal }) => client.listTenants({ signal }),
    staleTime: 60_000,
  })

export const connectorsQueryOptions = (client: AgentClient, tenantId: string) =>
  queryOptions({
    queryKey: ['connectors', tenantId],
    queryFn: ({ signal }) => client.listConnectors(tenantId, { signal }),
    staleTime: 30_000,
  })

export const grantConsentMutation = (client: AgentClient) => ({
  mutationKey: ['connectors', 'consent-url'],
  mutationFn: (args: { tenantId: string; connectorId: string }) =>
    client.grantConsentUrl(args),
})
```

- [ ] Note: `grantConsentMutation` does NOT invalidate `['connectors', tenantId]` because the redirect roundtrip is the source of truth; the consent landing page invalidates on mount.

### 8.2 Commit

- [ ] `git add apps/studio/src/api/queries.ts`
- [ ] Commit: `feat(studio): tenants + connectors query helpers + consent mutation`

---

## Phase 9 — Studio: /tenants full DataTable

### 9.1 Failing component test (TDD)

- [ ] Add `apps/studio/src/features/tenants/TenantsPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { TenantsPage } from './TenantsPage'
import { renderWithProviders } from '../../test/renderWithProviders'

describe('TenantsPage', () => {
  it('renders DataTable rows for each tenant', async () => {
    server.use(
      http.get('https://api.test/tenants', () =>
        HttpResponse.json([
          { id: 't1', name: 'Acme', role: 'admin' },
          { id: 't2', name: 'Globex', role: 'member' },
        ]),
      ),
    )
    renderWithProviders(<TenantsPage />)
    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument())
    expect(screen.getByText('Globex')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2
  })

  it('renders EmptyState when no tenants', async () => {
    server.use(http.get('https://api.test/tenants', () => HttpResponse.json([])))
    renderWithProviders(<TenantsPage />)
    await waitFor(() =>
      expect(screen.getByText(/no tenants/i)).toBeInTheDocument(),
    )
  })
})
```

- [ ] Confirm it FAILS.

### 9.2 Implement page

- [ ] Add `apps/studio/src/features/tenants/TenantsPage.tsx`:

```tsx
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import { DataTable, EmptyState, StatusBadge, type Column } from '@seta/ui'
import { useAgentClient } from '@seta/ui'
import type { TenantSummary } from '@seta/agent-sdk'
import { tenantsQueryOptions } from '../../api/queries'

const columns: Column<TenantSummary>[] = [
  {
    key: 'name',
    header: 'Tenant',
    cell: (row) => (
      <Link to="/tenants/$id/connectors" params={{ id: row.id }} className="text-primary hover:underline">
        {row.name}
      </Link>
    ),
  },
  {
    key: 'role',
    header: 'Role',
    cell: (row) => <StatusBadge variant={row.role === 'admin' || row.role === 'owner' ? 'info' : 'neutral'}>{row.role}</StatusBadge>,
  },
  {
    key: 'id',
    header: 'Tenant id',
    cell: (row) => <span className="font-mono text-xs text-muted">{row.id}</span>,
  },
]

export function TenantsPage() {
  const client = useAgentClient()
  const { data } = useSuspenseQuery(tenantsQueryOptions(client))
  if (data.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No tenants"
        description="You aren't a member of any tenant yet. Ask an admin to invite you."
      />
    )
  }
  return <DataTable columns={columns} rows={data} getRowId={(r) => r.id} />
}
```

- [ ] Wire `apps/studio/src/routes/_authed/tenants.tsx` to render `<TenantsPage />`, replacing the PR-3 smoke listing.

### 9.3 Commit

- [ ] `git add apps/studio/src/features/tenants/ apps/studio/src/routes/_authed/tenants.tsx`
- [ ] Commit: `feat(studio): full /tenants DataTable + EmptyState`

---

## Phase 10 — Studio: /tenants/:id/connectors page

### 10.1 grantConsent helper (the single `window.location.href` exception)

- [ ] Add `apps/studio/src/features/connectors/grantConsent.ts`:

```ts
import type { AgentClient } from '@seta/agent-sdk'

/**
 * Single sanctioned use of window.location.href in Studio (cross-origin OAuth).
 * All other navigation goes through TanStack Router.
 */
export async function grantConsent(
  client: AgentClient,
  args: { tenantId: string; connectorId: string },
): Promise<void> {
  const { url } = await client.grantConsentUrl(args)
  window.location.href = url
}
```

### 10.2 Failing component test (TDD)

- [ ] Add `apps/studio/src/features/connectors/ConnectorsPage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/setup'
import { ConnectorsPage } from './ConnectorsPage'
import { renderWithProviders } from '../../test/renderWithProviders'

describe('ConnectorsPage', () => {
  it('lists connectors with StatusBadge', async () => {
    server.use(
      http.get('https://api.test/tenants/t1/connectors', () =>
        HttpResponse.json([
          {
            id: 'ms365-planner',
            providerId: 'entra',
            displayName: 'Microsoft Planner',
            description: 'Sync Planner tasks.',
            customerFacingRationale: 'Required so the agent can read tasks.',
            requiredScopes: { delegated: ['Tasks.Read'], application: ['Tasks.Read.All'] },
            capabilities: { syncable: true, writes: false },
            status: 'pending',
            lastConsentedAt: null,
          },
        ]),
      ),
    )
    renderWithProviders(<ConnectorsPage tenantId="t1" />)
    await waitFor(() => expect(screen.getByText('Microsoft Planner')).toBeInTheDocument())
    expect(screen.getByText(/pending/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /grant consent/i })).toBeEnabled()
  })

  it('Grant consent button assigns window.location to the returned url', async () => {
    server.use(
      http.get('https://api.test/tenants/t1/connectors', () =>
        HttpResponse.json([
          {
            id: 'ms365-planner', providerId: 'entra', displayName: 'Microsoft Planner',
            description: '', customerFacingRationale: '',
            requiredScopes: { delegated: [], application: [] },
            capabilities: { syncable: true, writes: false },
            status: 'pending', lastConsentedAt: null,
          },
        ]),
      ),
      http.post('https://api.test/tenants/t1/connectors/ms365-planner/consent-url', () =>
        HttpResponse.json({ url: 'https://login.microsoftonline.com/x', state: 's' }),
      ),
    )
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign, set href(v: string) { assign(v) } },
    })
    renderWithProviders(<ConnectorsPage tenantId="t1" />)
    const btn = await screen.findByRole('button', { name: /grant consent/i })
    await userEvent.click(btn)
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('https://login.microsoftonline.com/x'),
    )
  })
})
```

- [ ] Confirm it FAILS.

### 10.3 Implement page

- [ ] Add `apps/studio/src/features/connectors/ConnectorsPage.tsx`:

```tsx
import { useSuspenseQuery } from '@tanstack/react-query'
import { Button, DataTable, StatusBadge, useAgentClient, type Column } from '@seta/ui'
import type { ConnectorSummary } from '@seta/agent-sdk'
import { connectorsQueryOptions } from '../../api/queries'
import { grantConsent } from './grantConsent'

const statusVariant = (s: ConnectorSummary['status']) =>
  s === 'consented' ? 'success' : s === 'pending' ? 'warning' : s === 'failed' ? 'error' : 'neutral'

export function ConnectorsPage({ tenantId }: { tenantId: string }) {
  const client = useAgentClient()
  const { data } = useSuspenseQuery(connectorsQueryOptions(client, tenantId))

  const columns: Column<ConnectorSummary>[] = [
    { key: 'name', header: 'Connector', cell: (r) => r.displayName },
    {
      key: 'scopes',
      header: 'Scopes',
      cell: (r) => {
        const all = [...r.requiredScopes.application, ...r.requiredScopes.delegated]
        const head = all.slice(0, 2).join(', ')
        return (
          <span className="font-mono text-xs text-muted" title={all.join('\n')}>
            {head}{all.length > 2 ? ` +${all.length - 2}` : ''}
          </span>
        )
      },
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge variant={statusVariant(r.status)}>{r.status}</StatusBadge> },
    {
      key: 'last',
      header: 'Last consented',
      cell: (r) => (r.lastConsentedAt ? new Date(r.lastConsentedAt).toLocaleString() : '—'),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <Button
          variant="primary"
          size="sm"
          onClick={() => grantConsent(client, { tenantId, connectorId: r.id })}
        >
          Grant consent
        </Button>
      ),
    },
  ]

  return <DataTable columns={columns} rows={data} getRowId={(r) => r.id} />
}
```

- [ ] Wire route file `apps/studio/src/routes/_authed/tenants.$id.connectors.tsx` to render `<ConnectorsPage tenantId={params.id} />`. Use TanStack Router `beforeLoad` to `ensureQueryData(connectorsQueryOptions(client, params.id))`.

### 10.4 Commit

- [ ] `git add apps/studio/src/features/connectors/ apps/studio/src/routes/_authed/tenants.$id.connectors.tsx`
- [ ] Commit: `feat(studio): /tenants/:id/connectors DataTable + grant-consent action`

---

## Phase 11 — Studio: /tenants/:id/connectors/:cid/consent landing

### 11.1 Page

- [ ] Add `apps/studio/src/features/connectors/ConsentLandingPage.tsx`:

```tsx
import { Link, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Card, StatusBadge } from '@seta/ui'

type ConsentSearch = { ok?: '1' | '0'; error?: string }

export function ConsentLandingPage({
  tenantId,
  connectorId,
}: { tenantId: string; connectorId: string }) {
  const search = useSearch({ strict: false }) as ConsentSearch
  const queryClient = useQueryClient()
  const ok = search.ok === '1'

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['connectors', tenantId] })
  }, [queryClient, tenantId])

  return (
    <Card>
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-lg font-medium">Connector consent</h1>
        <div className="flex items-center gap-3">
          <StatusBadge variant={ok ? 'success' : 'error'}>
            {ok ? 'consented' : 'failed'}
          </StatusBadge>
          <span className="font-mono text-sm">{connectorId}</span>
        </div>
        {!ok && search.error ? (
          <p className="text-sm text-error">{search.error}</p>
        ) : null}
        <Link
          to="/tenants/$id/connectors"
          params={{ id: tenantId }}
          className="text-primary hover:underline"
        >
          Back to connectors
        </Link>
      </div>
    </Card>
  )
}
```

- [ ] Wire `apps/studio/src/routes/_authed/tenants.$id.connectors.$cid.consent.tsx`. Validate the search params via Zod (`z.object({ ok: z.enum(['0','1']).optional(), error: z.string().optional() })`).

### 11.2 Server-side: update `apps/api`'s OAuth callback redirect target

- [ ] In `apps/api/src/main.ts`, replace the `c.html('<!doctype html>…')` returned by `createOAuthRoutes`'s callback. Since the route is defined inside `@seta/oauth`, instead pass an `onConsentRedirect` option:
  - Audit: this is a small API surface addition to `createOAuthRoutes` (`@seta/oauth`).
  - Add `onConsentRedirect?: (input: { tenantId: string; connectorIds: string[]; ok: boolean; error?: string }) => string` to `OAuthRoutesDeps`. When present, callback returns `c.redirect(opts.onConsentRedirect(...))` instead of HTML.
  - Update `platform/oauth/src/routes.test.ts` for the new behaviour.
  - In `apps/api/src/main.ts`, set `onConsentRedirect: ({ tenantId, connectorIds, ok, error }) => \`${env.PUBLIC_STUDIO_URL}/tenants/${tenantId}/connectors/${connectorIds[0]}/consent?ok=${ok ? 1 : 0}${error ? \`&error=\${encodeURIComponent(error)}\` : ''}\``.
  - Add `PUBLIC_STUDIO_URL` to `apps/api/src/env.ts` Zod schema.

### 11.3 Commit (two commits — oauth then api+studio)

- [ ] `git add platform/oauth/src/routes.ts platform/oauth/src/routes.test.ts`
- [ ] Commit: `feat(oauth): onConsentRedirect option for createOAuthRoutes`
- [ ] `git add apps/api/src/main.ts apps/api/src/env.ts apps/studio/src/features/connectors/ConsentLandingPage.tsx apps/studio/src/routes/_authed/tenants.$id.connectors.$cid.consent.tsx`
- [ ] Commit: `feat(studio): consent landing page wired to oauth callback redirect`

---

## Phase 12 — Studio: TenantSwitcher wiring

### 12.1 Hook up in `_authed.tsx`

- [ ] Edit `apps/studio/src/routes/_authed.tsx` TopBar slot to mount `<TenantSwitcher>` from `@seta/ui`. Props derived from `useSession()` (`session.tenants`) + current route params:

```tsx
import { TenantSwitcher } from '@seta/ui'
import { useRouter, useParams } from '@tanstack/react-router'

const router = useRouter()
const params = useParams({ strict: false }) as { id?: string }
const session = useSession()

<TenantSwitcher
  tenants={session.tenants}
  activeTenantId={params.id ?? null}
  onSwitch={(newId) => {
    const match = router.state.location.pathname.match(/^\/tenants\/[^/]+(\/.*)?$/)
    const suffix = match?.[1] ?? '/connectors'
    router.navigate({ to: `/tenants/$id${suffix}`, params: { id: newId } })
  }}
/>
```

Fallback: if the current path has no `/tenants/:id/*` shape (e.g. `/me`), switch navigates to `/tenants/$id/connectors`.

### 12.2 Component test

- [ ] Add `apps/studio/src/routes/_authed.test.tsx` that renders the shell with two tenants and asserts switching navigates to `/tenants/t2/connectors`.

### 12.3 Commit

- [ ] `git add apps/studio/src/routes/_authed.tsx apps/studio/src/routes/_authed.test.tsx`
- [ ] Commit: `feat(studio): wire TenantSwitcher in TopBar`

---

## Phase 13 — Studio: AppShell composition (no AgentPanel)

> **Admin-only Studio.** PR-3 Phase 0.5 amended `@seta/ui` `AppShell` so that omitting `agentContext` collapses the right-side panel column and hides the Bot toggle. PR-3 mounted `AppShell` in `_authed.tsx` without an `agentContext` prop. There is nothing to do in PR-4 for the panel — no mount, no helper, no route map. This phase is intentionally empty and kept as a marker so the surrounding numbering matches the master plan §8. The `TenantSwitcher` wiring lives in Phase 12; that already covers the only `_authed.tsx` work this slice requires.

---

## Phase 14 — E2E

### 14.1 Spec

- [ ] Add `/tests/e2e/studio/connectors.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('grant connector consent end-to-end', async ({ page, baseURL }) => {
  await page.goto(`${baseURL}/login`)
  await page.getByRole('button', { name: /sign in with microsoft/i }).click()
  // The dockerized stack runs a fake OIDC provider that auto-confirms.
  await page.waitForURL(`${baseURL}/tenants`)
  await expect(page.getByRole('heading', { name: /tenants/i })).toBeVisible()

  // Switch into the seeded tenant.
  await page.getByRole('row', { name: /Acme/i }).getByRole('link').click()
  await page.waitForURL(/\/tenants\/[^/]+\/connectors$/)

  // Pending row visible.
  const plannerRow = page.getByRole('row', { name: /Microsoft Planner/i })
  await expect(plannerRow.getByText('pending')).toBeVisible()

  // Click grant consent — redirects to the fake admin-consent endpoint
  // which immediately calls back into /oauth/entra/callback?admin_consent=True&...
  await Promise.all([
    page.waitForURL(/\/tenants\/[^/]+\/connectors\/ms365-planner\/consent\?ok=1/),
    plannerRow.getByRole('button', { name: /grant consent/i }).click(),
  ])

  // Landing page shows success.
  await expect(page.getByText('consented')).toBeVisible()
  await page.getByRole('link', { name: /back to connectors/i }).click()

  // Connectors list now reflects consented.
  await expect(page.getByRole('row', { name: /Microsoft Planner/i }).getByText('consented')).toBeVisible()
})
```

### 14.2 Fake provider env

- [ ] Confirm the e2e stack has `FAKE_OIDC=1` + a stub `/v2.0/adminconsent` that 302s straight back to `${PUBLIC_BASE_URL}/oauth/entra/callback?admin_consent=True&tenant=<seeded tid>&state=<echoed>`. If not present, add a small stub in `tests/e2e/fixtures/entra-stub.ts` and wire it via Docker compose `EXTRA_HOSTS` for the api container.

### 14.3 Commit

- [ ] `git add tests/e2e/studio/connectors.spec.ts tests/e2e/fixtures/`
- [ ] Commit: `test(studio): e2e for tenant switch + connector consent round-trip`

---

## Phase 15 — SCOPE.md updates

### 15.1 `apps/api/SCOPE.md`

- [ ] Update the "Current state" section to add:
  - `GET /tenants` (owner `@seta/tenant.createTenantRoutes`)
  - `GET /tenants/:id/connectors`, `POST /tenants/:id/connectors/:cid/consent-url` (owner `@seta/connector-registry.createConnectorAdminRoutes`)
  - `onConsentRedirect` env hook on `/oauth/:provider/callback`.

### 15.2 `apps/studio/SCOPE.md`

- [ ] Update the "Current state (P2)" + "HTTP endpoints consumed" sections to list:
  - `/tenants` full DataTable
  - `/tenants/:id/connectors` with status + grant-consent
  - `/tenants/:id/connectors/:cid/consent` landing
  - `TenantSwitcher` wired in `_authed` TopBar. Note: Studio mounts `AppShell` without `agentContext`; no right-side `AgentPanel` (admin-only layout).
- [ ] Bump the "this is a placeholder" line out of date — replace with a "PR-3 scaffold + PR-4 tenants/connectors slice shipped" status.

### 15.3 Commit

- [ ] `git add apps/api/SCOPE.md apps/studio/SCOPE.md`
- [ ] Commit: `docs(scope): record tenants + connector admin routes`

---

## Phase 16 — Verification (superpowers:verification-before-completion)

Run each command and confirm green BEFORE creating the PR:

- [ ] `pnpm lint` — no new warnings.
- [ ] `pnpm typecheck` — clean.
- [ ] `pnpm --filter @seta/tenant test:unit` — green (schema, membership, routes).
- [ ] `pnpm --filter @seta/connector-registry test:unit` — green (existing runtime test + new admin-routes test).
- [ ] `pnpm --filter @seta/agent-sdk test:unit` — green (recordings + new methods).
- [ ] `pnpm --filter @seta/studio test:unit` — green (tenants, connectors, consent, _authed).
- [ ] `pnpm db:up && pnpm migrate` — both migrations apply cleanly to a fresh DB.
- [ ] `pnpm test:integration` — green for tenant + connector-registry + apps/api smoke.
- [ ] `pnpm test:e2e -- connectors.spec.ts` — green.
- [ ] `pnpm --filter @seta/oauth exec changeset` — author one changeset for the new `onConsentRedirect` option (oauth is published; tenant + connector-registry are `"private": true`).
- [ ] `pnpm --filter @seta/agent-sdk exec changeset` — author one changeset for the new SDK methods.

### Demo state (must reproduce manually)

```
pnpm db:up
pnpm --filter @seta/api dev          # in one terminal
pnpm --filter @seta/studio dev       # in another → opens http://localhost:5173
```

Then:
1. Sign in with Microsoft (the local OIDC stub).
2. Land on `/tenants` — the page renders the seeded tenants in a DataTable (not the PR-3 smoke `<ul>`).
3. Click a tenant → router goes to `/tenants/<id>/connectors`. Two connectors (ms365-planner, ms365-directory) render with `StatusBadge` `pending`.
4. Click "Grant consent" on planner. Browser redirects to `login.microsoftonline.com/.../v2.0/adminconsent` (or stub).
5. After admin-consent the stub redirects to `http://localhost:5173/tenants/<id>/connectors/ms365-planner/consent?ok=1`.
6. Landing page renders `StatusBadge="consented"` plus "Back to connectors" link.
7. Clicking back → connectors list shows planner with `StatusBadge="consented"`.
8. `TenantSwitcher` in the TopBar swaps to the second tenant and navigates to `/tenants/<otherId>/connectors`.
9. No right-side `AgentPanel` is rendered — Studio is admin-only; the main canvas extends to the right viewport edge across all three pages.

Integration verification:
```
DATABASE_URL=postgres://seta:dev@localhost:5432/seta pnpm test:integration
```
Must report 0 failures across the new `@seta/tenant` and `apps/api` integration suites.

E2E verification:
```
pnpm test:e2e -- connectors.spec.ts
```
Must report 1 passing spec.

---

## Phase 17 — Exit worktree + PR

- [ ] Push branch `feat/studio-pr04-tenants-connectors`.
- [ ] Open PR with title `feat: tenants + connector admin slice (Studio P2 PR-4)`. Body lists:
  - new tenant_members table + RLS
  - createTenantRoutes + createConnectorAdminRoutes
  - SDK methods (listTenants / listConnectors / grantConsentUrl)
  - Studio /tenants full table + /connectors + consent landing
  - TenantSwitcher
  - changesets for `@seta/oauth` + `@seta/agent-sdk`.
- [ ] Use `superpowers:using-git-worktrees` exit flow to leave the worktree once the PR is merged.
