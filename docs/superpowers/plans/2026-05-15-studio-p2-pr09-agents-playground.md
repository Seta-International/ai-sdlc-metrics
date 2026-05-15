# PR-9: Agents + Playground Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the agents page + playground chat end-to-end: createAgentAdminRoutes, SDK methods, Studio /agents list, /agents/:agentId detail with Tabs (Overview / Playground / Tools), and a focused Playground chat using useChat against /agent.

**Architecture:** @seta/agent-server exposes createAgentAdminRoutes reading from the existing agent profile registry/storage. Studio's Playground is an in-canvas chat tab on `/agents/:agentId` using its own `useChat` instance scoped to the selected agent profile, with a dedicated `AbortController` and a Reset button. Studio is admin-only and does NOT mount the global right-side `AgentPanel` (master plan §0), so the Playground is the only chat surface in Studio — there is no second thread to coexist with.

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, @seta/ui (Tabs from PR-8, AgentMessageList, AgentInput, KeyValueList from PR-8, Code, DataTable, SectionCard from PR-8), useChat from @seta/ui, parseSseStream from @seta/agent-sdk.

---

## Phase 0 — Preflight

- [ ] **Step 0.1** — Confirm prerequisite PRs are merged into the local branch.

  ```sh
  git log --oneline --grep="PR-8" --grep="PR-3" --grep="PR-4" --all | head
  ```

  Required: PR-3 (apps/studio kickoff, route stubs incl. `_authed/tenants.$id.agents.tsx` + `.agents.$agentId.tsx`; AppShell mounted WITHOUT `agentContext` — admin-only), PR-4 (`@seta/tenant` exports `requireTenantMembership`), PR-8 (`@seta/ui` exports `Tabs`, `KeyValueList`, `SectionCard`, `Searchbar`). PR-1 ships `@seta/sso` with `requireSession`. If any of those primitives is missing, stop and resolve before continuing.

- [ ] **Step 0.2** — Read the existing agent profile shape.

  Read:
  - `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/schema.ts` (table `agent.agent_profiles` columns: `agent_id`, `tenant_id`, `slug`, `name`, `description`, `instructions`, `model`, `tool_ids` (text[]), `working_memory_template`, `temperature`, `metadata` (jsonb), `status`, `created_at`, `updated_at`).
  - `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/profile-registry.ts` (existing `resolveAgentProfile`).
  - `/Users/canh/Projects/Seta/seta-os/platform/agent/server/src/routes.ts` (existing CRUD shape; the new admin routes must NOT overlap with the runtime `/agent` router — they live in a new factory).

- [ ] **Step 0.3** — Resolve any new pins.

  PR-9 introduces no new external dependencies. All Studio deps (`@tanstack/react-query`, `@tanstack/react-router`, `@seta/ui`, `@seta/agent-sdk`) shipped in earlier PRs. Skip pin resolution.

---

## Phase 1 — `@seta/agent-server` schemas

### Task 1.1 — Add Zod schemas for admin agent listing/detail (TDD)

- [ ] **Step 1.1.1** — Create failing unit test `platform/agent/server/src/admin/schemas.test.ts`.

  ```ts
  import { describe, expect, it } from 'vitest'
  import { AgentProfile, AgentProfileDetail, ListAgentsResponse } from './schemas'

  describe('AgentProfile', () => {
    it('accepts a minimal profile row', () => {
      const parsed = AgentProfile.parse({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Planner',
        description: null,
        model: 'gpt-4o',
        toolIds: ['list_tasks'],
        systemPromptPreview: 'You are a planner …',
        lastUsedAt: null,
      })
      expect(parsed.toolIds).toEqual(['list_tasks'])
    })

    it('rejects when id is not a uuid', () => {
      expect(() =>
        AgentProfile.parse({
          id: 'not-a-uuid',
          name: 'x',
          description: null,
          model: 'm',
          toolIds: [],
          systemPromptPreview: '',
          lastUsedAt: null,
        }),
      ).toThrow()
    })
  })

  describe('AgentProfileDetail', () => {
    it('extends AgentProfile with full systemPrompt + memory config', () => {
      const parsed = AgentProfileDetail.parse({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Planner',
        description: null,
        model: 'gpt-4o',
        toolIds: ['list_tasks'],
        systemPromptPreview: 'You are a planner …',
        systemPrompt: 'You are a planner. Timezone: {{timezone}} Conv: {{convType}}',
        memory: { workingMemoryTemplate: null, temperature: null },
        metadata: {},
        lastUsedAt: null,
      })
      expect(parsed.systemPrompt.startsWith('You are a planner')).toBe(true)
    })
  })

  describe('ListAgentsResponse', () => {
    it('wraps an array of AgentProfile', () => {
      const parsed = ListAgentsResponse.parse({
        agents: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Planner',
            description: null,
            model: 'gpt-4o',
            toolIds: [],
            systemPromptPreview: '',
            lastUsedAt: null,
          },
        ],
      })
      expect(parsed.agents).toHaveLength(1)
    })
  })
  ```

  Run `pnpm --filter @seta/agent-server vitest run src/admin/schemas.test.ts` → expect FAIL (module not found).

- [ ] **Step 1.1.2** — Implement `platform/agent/server/src/admin/schemas.ts`.

  ```ts
  import { z } from '@hono/zod-openapi'

  export const AgentProfile = z
    .object({
      id: z.string().uuid().openapi({ example: '11111111-1111-1111-1111-111111111111' }),
      name: z.string(),
      description: z.string().nullable(),
      model: z.string(),
      toolIds: z.array(z.string()),
      systemPromptPreview: z.string(),
      lastUsedAt: z.string().datetime().nullable(),
    })
    .openapi('AgentProfile')

  export const AgentMemoryConfig = z
    .object({
      workingMemoryTemplate: z.string().nullable(),
      temperature: z.number().min(0).max(2).nullable(),
    })
    .openapi('AgentMemoryConfig')

  export const AgentProfileDetail = AgentProfile.extend({
    systemPrompt: z.string(),
    memory: AgentMemoryConfig,
    metadata: z.record(z.string(), z.unknown()),
  }).openapi('AgentProfileDetail')

  export const ListAgentsResponse = z
    .object({ agents: z.array(AgentProfile) })
    .openapi('ListAgentsResponse')

  export type AgentProfile = z.infer<typeof AgentProfile>
  export type AgentProfileDetail = z.infer<typeof AgentProfileDetail>
  export type ListAgentsResponse = z.infer<typeof ListAgentsResponse>
  ```

  Re-run the test → expect PASS.

- [ ] **Step 1.1.3** — Wire exports.

  Append to `platform/agent/server/src/index.ts`:

  ```ts
  export { AgentMemoryConfig, AgentProfile, AgentProfileDetail, ListAgentsResponse } from './admin/schemas'
  export type {
    AgentProfile as AgentProfileT,
    AgentProfileDetail as AgentProfileDetailT,
    ListAgentsResponse as ListAgentsResponseT,
  } from './admin/schemas'
  ```

  Run `pnpm --filter @seta/agent-server typecheck` → expect PASS.

- [ ] **Step 1.1.4** — Add `@hono/zod-openapi` to `@seta/agent-server` if not already a dep.

  ```sh
  pnpm --filter @seta/agent-server list @hono/zod-openapi
  ```

  If absent:

  ```sh
  pnpm --filter @seta/agent-server add @hono/zod-openapi@workspace:*
  ```

  (Workspace marker if pinned via root — otherwise `pnpm view @hono/zod-openapi version` and pin explicitly.)

- [ ] **Step 1.1.5** — Commit.

  ```sh
  git add platform/agent/server/src/admin/schemas.ts \
          platform/agent/server/src/admin/schemas.test.ts \
          platform/agent/server/src/index.ts \
          platform/agent/server/package.json pnpm-lock.yaml
  git commit -m "feat(agent-server): admin AgentProfile + AgentProfileDetail Zod schemas"
  ```

---

## Phase 2 — `@seta/agent-server` listAgents service (TDD)

### Task 2.1 — listAgents integration test

- [ ] **Step 2.1.1** — Create `platform/agent/server/tests/integration/admin/list-agents.test.ts`.

  ```ts
  import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
  import postgres from 'postgres'
  import { seedAgentProfiles } from '../../../src/agent-seeder'
  import { listAgents } from '../../../src/admin/list-agents'

  const DB = process.env.DATABASE_URL
  if (!DB) throw new Error('DATABASE_URL required for integration tests')
  const sql = postgres(DB, { max: 4 })

  const TENANT_A = '11111111-1111-1111-1111-111111111111'
  const TENANT_B = '22222222-2222-2222-2222-222222222222'

  beforeAll(async () => {
    await sql`DELETE FROM agent.agent_profiles WHERE name LIKE 'PR9-%'`
  })

  beforeEach(async () => {
    await sql`DELETE FROM agent.agent_profiles WHERE name LIKE 'PR9-%'`
    await sql`
      INSERT INTO agent.agent_profiles (tenant_id, slug, name, description, instructions, model, tool_ids, status)
      VALUES
        (${TENANT_A}::uuid, 'pr9-a', 'PR9-A', 'Tenant A', 'Sys A {{timezone}}', 'gpt-4o', ${sql.array(['a-tool'])}, 'published'),
        (${TENANT_B}::uuid, 'pr9-b', 'PR9-B', 'Tenant B', 'Sys B', 'gpt-4o', ${sql.array(['b-tool'])}, 'published'),
        (NULL, 'pr9-global', 'PR9-Global', 'global', 'Sys G', 'gpt-4o', ${sql.array(['g-tool'])}, 'published'),
        (${TENANT_A}::uuid, 'pr9-draft', 'PR9-Draft', null, 'draft', 'gpt-4o', ${sql.array([])}, 'draft')
    `
  })

  afterAll(async () => {
    await sql`DELETE FROM agent.agent_profiles WHERE name LIKE 'PR9-%'`
    await sql.end()
  })

  describe('listAgents', () => {
    it('returns published agents scoped to tenant + global', async () => {
      const result = await listAgents(sql as never, { tenantId: TENANT_A })
      const names = result.agents.map((a) => a.name).sort()
      expect(names).toEqual(['PR9-A', 'PR9-Global'])
    })

    it('excludes drafts', async () => {
      const result = await listAgents(sql as never, { tenantId: TENANT_A })
      expect(result.agents.find((a) => a.name === 'PR9-Draft')).toBeUndefined()
    })

    it('returns no other-tenant agents', async () => {
      const result = await listAgents(sql as never, { tenantId: TENANT_A })
      expect(result.agents.find((a) => a.name === 'PR9-B')).toBeUndefined()
    })

    it('shape matches AgentProfile (id is uuid, toolIds is string[])', async () => {
      const result = await listAgents(sql as never, { tenantId: TENANT_A })
      const a = result.agents.find((x) => x.name === 'PR9-A')
      expect(a).toBeDefined()
      expect(typeof a?.id).toBe('string')
      expect(Array.isArray(a?.toolIds)).toBe(true)
    })

    it('systemPromptPreview is truncated to <= 200 chars', async () => {
      const long = 'x'.repeat(500)
      await sql`
        INSERT INTO agent.agent_profiles (tenant_id, name, instructions, model, tool_ids, status)
        VALUES (${TENANT_A}::uuid, 'PR9-Long', ${long}, 'gpt-4o', ${sql.array([])}, 'published')
      `
      const result = await listAgents(sql as never, { tenantId: TENANT_A })
      const a = result.agents.find((x) => x.name === 'PR9-Long')
      expect((a?.systemPromptPreview ?? '').length).toBeLessThanOrEqual(200)
    })
  })
  ```

  Run `DATABASE_URL=... pnpm --filter @seta/agent-server vitest run tests/integration/admin/list-agents.test.ts` → expect FAIL.

- [ ] **Step 2.1.2** — Implement `platform/agent/server/src/admin/list-agents.ts`.

  ```ts
  import type { ListAgentsResponse } from './schemas'

  type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

  interface ProfileRow {
    agent_id: string
    name: string
    description: string | null
    model: string
    tool_ids: string[]
    instructions: string
    last_used_at: string | null
  }

  const PREVIEW_LEN = 200

  export async function listAgents(
    sql: DbSql,
    opts: { tenantId: string },
  ): Promise<ListAgentsResponse> {
    const rows = (await sql`
      SELECT
        agent_id::text                          AS agent_id,
        name,
        description,
        model,
        tool_ids,
        instructions,
        (SELECT MAX(created_at)::text
           FROM agent.agent_runs r
          WHERE r.agent_id = p.agent_id
            AND r.tenant_id = ${opts.tenantId}::uuid) AS last_used_at
      FROM agent.agent_profiles p
      WHERE status = 'published'
        AND (tenant_id = ${opts.tenantId}::uuid OR tenant_id IS NULL)
      ORDER BY tenant_id NULLS LAST, name
    `) as ProfileRow[]

    return {
      agents: rows.map((r) => ({
        id: r.agent_id,
        name: r.name,
        description: r.description,
        model: r.model,
        toolIds: r.tool_ids,
        systemPromptPreview: r.instructions.slice(0, PREVIEW_LEN),
        lastUsedAt: r.last_used_at,
      })),
    }
  }
  ```

  Note: if `agent.agent_runs` doesn't exist yet at the time of this PR (PR-5 introduces the runs surface), the `last_used_at` subselect falls back to `NULL`. The query above returns `NULL` when the table is missing only if wrapped in `to_regclass`; to keep it portable, replace the subselect with `NULL::text AS last_used_at` if PR-5 has not landed. The integration test asserts `lastUsedAt: null` either way.

  Re-run integration test → expect PASS.

- [ ] **Step 2.1.3** — Export from index.

  Append to `platform/agent/server/src/index.ts`:

  ```ts
  export { listAgents } from './admin/list-agents'
  ```

- [ ] **Step 2.1.4** — Commit.

  ```sh
  git add platform/agent/server/src/admin/list-agents.ts \
          platform/agent/server/tests/integration/admin/list-agents.test.ts \
          platform/agent/server/src/index.ts
  git commit -m "feat(agent-server): listAgents service for admin surface"
  ```

---

## Phase 3 — `@seta/agent-server` getAgent service (TDD)

### Task 3.1 — getAgent integration test

- [ ] **Step 3.1.1** — Create `platform/agent/server/tests/integration/admin/get-agent.test.ts`.

  ```ts
  import { afterAll, beforeEach, describe, expect, it } from 'vitest'
  import postgres from 'postgres'
  import { DomainError } from '@seta/middleware'
  import { getAgent } from '../../../src/admin/get-agent'

  const DB = process.env.DATABASE_URL
  if (!DB) throw new Error('DATABASE_URL required')
  const sql = postgres(DB, { max: 4 })

  const TENANT_A = '11111111-1111-1111-1111-111111111111'
  const TENANT_B = '22222222-2222-2222-2222-222222222222'

  let agentIdA: string
  let agentIdB: string
  let agentIdGlobal: string

  beforeEach(async () => {
    await sql`DELETE FROM agent.agent_profiles WHERE name LIKE 'PR9-GA-%'`
    const a = await sql`
      INSERT INTO agent.agent_profiles (tenant_id, name, description, instructions, model, tool_ids, working_memory_template, temperature, metadata, status)
      VALUES (${TENANT_A}::uuid, 'PR9-GA-A', 'desc-a', 'Sys A', 'gpt-4o', ${sql.array(['t1','t2'])}, 'WM template', 0.7, '{"k":"v"}'::jsonb, 'published')
      RETURNING agent_id::text AS id
    `
    agentIdA = (a[0] as { id: string }).id
    const b = await sql`
      INSERT INTO agent.agent_profiles (tenant_id, name, instructions, model, tool_ids, status)
      VALUES (${TENANT_B}::uuid, 'PR9-GA-B', 'Sys B', 'gpt-4o', ${sql.array([])}, 'published')
      RETURNING agent_id::text AS id
    `
    agentIdB = (b[0] as { id: string }).id
    const g = await sql`
      INSERT INTO agent.agent_profiles (tenant_id, name, instructions, model, tool_ids, status)
      VALUES (NULL, 'PR9-GA-Global', 'Sys G', 'gpt-4o', ${sql.array([])}, 'published')
      RETURNING agent_id::text AS id
    `
    agentIdGlobal = (g[0] as { id: string }).id
  })

  afterAll(async () => {
    await sql`DELETE FROM agent.agent_profiles WHERE name LIKE 'PR9-GA-%'`
    await sql.end()
  })

  describe('getAgent', () => {
    it('returns own-tenant profile with full systemPrompt', async () => {
      const a = await getAgent(sql as never, agentIdA, TENANT_A)
      expect(a.name).toBe('PR9-GA-A')
      expect(a.systemPrompt).toBe('Sys A')
      expect(a.memory.workingMemoryTemplate).toBe('WM template')
      expect(a.memory.temperature).toBe(0.7)
      expect(a.metadata).toEqual({ k: 'v' })
    })

    it('returns global profile to any tenant', async () => {
      const g = await getAgent(sql as never, agentIdGlobal, TENANT_A)
      expect(g.name).toBe('PR9-GA-Global')
    })

    it('404s on other-tenant profile', async () => {
      await expect(getAgent(sql as never, agentIdB, TENANT_A)).rejects.toBeInstanceOf(DomainError)
    })

    it('404s on unknown id', async () => {
      await expect(
        getAgent(sql as never, '99999999-9999-9999-9999-999999999999', TENANT_A),
      ).rejects.toBeInstanceOf(DomainError)
    })
  })
  ```

  Run → expect FAIL.

- [ ] **Step 3.1.2** — Implement `platform/agent/server/src/admin/get-agent.ts`.

  ```ts
  import { DomainError } from '@seta/middleware'
  import type { AgentProfileDetail } from './schemas'

  type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

  interface DetailRow {
    agent_id: string
    name: string
    description: string | null
    model: string
    tool_ids: string[]
    instructions: string
    working_memory_template: string | null
    temperature: string | null
    metadata: Record<string, unknown>
  }

  const PREVIEW_LEN = 200

  export async function getAgent(
    sql: DbSql,
    agentId: string,
    tenantId: string,
  ): Promise<AgentProfileDetail> {
    const rows = (await sql`
      SELECT
        agent_id::text  AS agent_id,
        name, description, model, tool_ids, instructions,
        working_memory_template, temperature::text AS temperature, metadata
      FROM agent.agent_profiles
      WHERE status = 'published'
        AND agent_id = ${agentId}::uuid
        AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
      LIMIT 1
    `) as DetailRow[]

    if (rows.length === 0) {
      throw new DomainError(404, `Agent profile not found: ${agentId}`, { detail: agentId })
    }
    const r = rows[0]!
    return {
      id: r.agent_id,
      name: r.name,
      description: r.description,
      model: r.model,
      toolIds: r.tool_ids,
      systemPromptPreview: r.instructions.slice(0, PREVIEW_LEN),
      systemPrompt: r.instructions,
      memory: {
        workingMemoryTemplate: r.working_memory_template,
        temperature: r.temperature !== null ? Number(r.temperature) : null,
      },
      metadata: r.metadata ?? {},
      lastUsedAt: null,
    }
  }
  ```

  Re-run → expect PASS.

- [ ] **Step 3.1.3** — Export from index.

  Append to `platform/agent/server/src/index.ts`:

  ```ts
  export { getAgent } from './admin/get-agent'
  ```

- [ ] **Step 3.1.4** — Commit.

  ```sh
  git add platform/agent/server/src/admin/get-agent.ts \
          platform/agent/server/tests/integration/admin/get-agent.test.ts \
          platform/agent/server/src/index.ts
  git commit -m "feat(agent-server): getAgent service with tenant-scope guard"
  ```

---

## Phase 4 — `createAgentAdminRoutes` factory (TDD)

### Task 4.1 — Factory integration test

- [ ] **Step 4.1.1** — Create `platform/agent/server/tests/integration/admin/routes.test.ts`.

  ```ts
  import { afterAll, beforeEach, describe, expect, it } from 'vitest'
  import postgres from 'postgres'
  import { Hono } from 'hono'
  import { onError } from '@seta/middleware'
  import { tenantContext, tenantMiddleware } from '@seta/tenant'
  import { createAgentAdminRoutes } from '../../../src/admin/routes'

  const DB = process.env.DATABASE_URL
  if (!DB) throw new Error('DATABASE_URL required')
  const sql = postgres(DB, { max: 4 })

  const TENANT_A = '11111111-1111-1111-1111-111111111111'
  const USER_A = '00000000-0000-0000-0000-000000000001'

  // Stub session middleware: sets a userId, header sets tenantId.
  const stubSession = async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', USER_A)
    await next()
  }
  // Stub membership preflight: always pass for USER_A + TENANT_A.
  const stubMembership = async (_c: unknown, next: () => Promise<void>) => {
    await next()
  }

  let agentId: string
  beforeEach(async () => {
    await sql`DELETE FROM agent.agent_profiles WHERE name LIKE 'PR9-R-%'`
    const row = await sql`
      INSERT INTO agent.agent_profiles (tenant_id, name, instructions, model, tool_ids, status)
      VALUES (${TENANT_A}::uuid, 'PR9-R-A', 'Sys', 'gpt-4o', ${sql.array(['t1'])}, 'published')
      RETURNING agent_id::text AS id
    `
    agentId = (row[0] as { id: string }).id
  })

  afterAll(async () => {
    await sql`DELETE FROM agent.agent_profiles WHERE name LIKE 'PR9-R-%'`
    await sql.end()
  })

  function buildApp() {
    const app = new Hono().onError(onError)
    app.use('*', stubSession as never)
    app.use('*', tenantMiddleware)
    app.use('*', stubMembership as never)
    app.route('/', createAgentAdminRoutes({ sql: sql as never }))
    return app
  }

  describe('createAgentAdminRoutes', () => {
    it('GET /agents returns list scoped to tenant', async () => {
      const app = buildApp()
      const res = await app.request('/agents', {
        headers: { 'x-tenant-id': TENANT_A },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { agents: { id: string; name: string }[] }
      expect(body.agents.some((a) => a.name === 'PR9-R-A')).toBe(true)
    })

    it('GET /agents/:id returns detail', async () => {
      const app = buildApp()
      const res = await app.request(`/agents/${agentId}`, {
        headers: { 'x-tenant-id': TENANT_A },
      })
      expect(res.status).toBe(200)
      const body = (await res.json()) as { id: string; systemPrompt: string }
      expect(body.id).toBe(agentId)
      expect(body.systemPrompt).toBe('Sys')
    })

    it('GET /agents/:id with bogus id returns RFC 7807 404', async () => {
      const app = buildApp()
      const res = await app.request('/agents/99999999-9999-9999-9999-999999999999', {
        headers: { 'x-tenant-id': TENANT_A },
      })
      expect(res.status).toBe(404)
      const body = (await res.json()) as { title?: string }
      expect(body.title).toBeDefined()
    })
  })
  ```

  Run → expect FAIL.

- [ ] **Step 4.1.2** — Implement `platform/agent/server/src/admin/routes.ts`.

  ```ts
  import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
  import { requireSession } from '@seta/sso'
  import { requireTenantMembership, tenantContext } from '@seta/tenant'
  import { getAgent } from './get-agent'
  import { listAgents } from './list-agents'
  import { AgentProfile, AgentProfileDetail, ListAgentsResponse } from './schemas'

  type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

  export interface CreateAgentAdminRoutesOptions {
    sql: DbSql
  }

  const listRoute = createRoute({
    method: 'get',
    path: '/agents',
    responses: {
      200: {
        content: { 'application/json': { schema: ListAgentsResponse } },
        description: 'Published agents visible to the current tenant',
      },
    },
  })

  const detailRoute = createRoute({
    method: 'get',
    path: '/agents/{id}',
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
      200: {
        content: { 'application/json': { schema: AgentProfileDetail } },
        description: 'Full agent profile',
      },
    },
  })

  export function createAgentAdminRoutes(opts: CreateAgentAdminRoutesOptions): OpenAPIHono {
    const app = new OpenAPIHono()
    // requireSession is mounted at the apps/api level; the factory assumes
    // session + tenant middleware have already populated context. We re-apply
    // requireTenantMembership here as a defence-in-depth preflight.
    app.use('*', requireSession)
    app.use('*', requireTenantMembership)

    app.openapi(listRoute, async (c) => {
      const tenantId = tenantContext.getTenantId()
      const body = await listAgents(opts.sql, { tenantId })
      return c.json(body, 200)
    })

    app.openapi(detailRoute, async (c) => {
      const tenantId = tenantContext.getTenantId()
      const { id } = c.req.valid('param')
      const body = await getAgent(opts.sql, id, tenantId)
      return c.json(body, 200)
    })

    return app
  }
  ```

  Notes:
  - Uses `OpenAPIHono` so PR-13's OpenAPI doc collection picks routes up.
  - `requireSession` no-ops in the integration test (`stubSession` sets `userId` first); double-mount is idempotent.

  Re-run integration test → expect PASS.

- [ ] **Step 4.1.3** — Export from index.

  Append to `platform/agent/server/src/index.ts`:

  ```ts
  export { createAgentAdminRoutes, type CreateAgentAdminRoutesOptions } from './admin/routes'
  ```

- [ ] **Step 4.1.4** — Verify boundaries.

  ```sh
  pnpm --filter @seta/agent-server lint
  pnpm --filter @seta/agent-server typecheck
  ```

  Both must pass.

- [ ] **Step 4.1.5** — Commit.

  ```sh
  git add platform/agent/server/src/admin/routes.ts \
          platform/agent/server/tests/integration/admin/routes.test.ts \
          platform/agent/server/src/index.ts
  git commit -m "feat(agent-server): createAgentAdminRoutes factory (GET /agents, GET /agents/:id)"
  ```

---

## Phase 5 — Mount in apps/api

### Task 5.1 — Composition diff in `apps/api/src/main.ts`

- [ ] **Step 5.1.1** — Edit `apps/api/src/main.ts`. Add to the existing `@seta/agent-server` import block:

  ```ts
  import {
    createAgentAdminRoutes,
    createAgentRouter,
    // … existing exports
  } from '@seta/agent-server'
  ```

  Below the `app.route('/agent', agentRouter)` line, add:

  ```ts
  app.route(
    '/',
    createAgentAdminRoutes({ sql: sql as never }),
  )
  ```

  The session + tenant middleware is already wired globally in `apps/api/src/main.ts` (PR-2 / PR-4), so the routes inherit auth + tenant resolution.

- [ ] **Step 5.1.2** — Smoke integration test `apps/api/src/agents.smoke.test.ts`.

  ```ts
  import { describe, expect, it } from 'vitest'
  import { app } from './main'

  describe('apps/api smoke: /agents', () => {
    it('GET /agents returns 401 without session', async () => {
      const res = await app.request('/agents')
      expect([401, 403]).toContain(res.status)
    })
  })
  ```

  Run `pnpm --filter @seta/api vitest run src/agents.smoke.test.ts` → expect PASS.

- [ ] **Step 5.1.3** — Commit.

  ```sh
  git add apps/api/src/main.ts apps/api/src/agents.smoke.test.ts
  git commit -m "feat(api): mount createAgentAdminRoutes for /agents surface"
  ```

---

## Phase 6 — `@seta/agent-sdk` additions

### Task 6.1 — Add `AgentProfile` + `AgentProfileDetail` Zod schemas

- [ ] **Step 6.1.1** — Failing unit test `platform/agent/sdk/src/schemas/agent-profile.test.ts`.

  ```ts
  import { describe, expect, it } from 'vitest'
  import { AgentProfile, AgentProfileDetail, ListAgentsResponse } from './agent-profile'

  describe('AgentProfile (sdk)', () => {
    it('parses minimal shape', () => {
      const parsed = AgentProfile.parse({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Planner',
        description: null,
        model: 'gpt-4o',
        toolIds: [],
        systemPromptPreview: '',
        lastUsedAt: null,
      })
      expect(parsed.id).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  describe('ListAgentsResponse (sdk)', () => {
    it('wraps an array', () => {
      const parsed = ListAgentsResponse.parse({ agents: [] })
      expect(parsed.agents).toEqual([])
    })
  })

  describe('AgentProfileDetail (sdk)', () => {
    it('extends AgentProfile with memory + systemPrompt', () => {
      const parsed = AgentProfileDetail.parse({
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Planner',
        description: null,
        model: 'gpt-4o',
        toolIds: [],
        systemPromptPreview: 'x',
        systemPrompt: 'x',
        memory: { workingMemoryTemplate: null, temperature: null },
        metadata: {},
        lastUsedAt: null,
      })
      expect(parsed.memory.workingMemoryTemplate).toBeNull()
    })
  })
  ```

  Run → expect FAIL.

- [ ] **Step 6.1.2** — Implement `platform/agent/sdk/src/schemas/agent-profile.ts`.

  ```ts
  import { z } from 'zod'

  export const AgentProfile = z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    model: z.string(),
    toolIds: z.array(z.string()),
    systemPromptPreview: z.string(),
    lastUsedAt: z.string().datetime().nullable(),
  })

  export const AgentMemoryConfig = z.object({
    workingMemoryTemplate: z.string().nullable(),
    temperature: z.number().min(0).max(2).nullable(),
  })

  export const AgentProfileDetail = AgentProfile.extend({
    systemPrompt: z.string(),
    memory: AgentMemoryConfig,
    metadata: z.record(z.string(), z.unknown()),
  })

  export const ListAgentsResponse = z.object({
    agents: z.array(AgentProfile),
  })

  export type AgentProfile = z.infer<typeof AgentProfile>
  export type AgentMemoryConfig = z.infer<typeof AgentMemoryConfig>
  export type AgentProfileDetail = z.infer<typeof AgentProfileDetail>
  export type ListAgentsResponse = z.infer<typeof ListAgentsResponse>
  ```

  Re-run → expect PASS.

### Task 6.2 — Add `listAgents`, `getAgent`, `streamChatToAgent` to `AgentClient`

- [ ] **Step 6.2.1** — Failing test `platform/agent/sdk/src/client/AgentClient.agents.test.ts`.

  ```ts
  import { setupServer } from 'msw/node'
  import { http, HttpResponse } from 'msw'
  import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
  import { AgentClient } from './AgentClient'

  const server = setupServer()
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  const baseUrl = 'https://api.test'

  describe('AgentClient.listAgents', () => {
    it('returns the parsed agents list', async () => {
      server.use(
        http.get(`${baseUrl}/agents`, () =>
          HttpResponse.json({
            agents: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                name: 'Planner',
                description: null,
                model: 'gpt-4o',
                toolIds: ['list_tasks'],
                systemPromptPreview: 'You are a planner …',
                lastUsedAt: null,
              },
            ],
          }),
        ),
      )
      const client = new AgentClient({ baseUrl })
      const res = await client.listAgents()
      expect(res.agents).toHaveLength(1)
      expect(res.agents[0]?.name).toBe('Planner')
    })
  })

  describe('AgentClient.getAgent', () => {
    it('returns the parsed detail', async () => {
      server.use(
        http.get(`${baseUrl}/agents/abc`, () =>
          HttpResponse.json({
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Planner',
            description: null,
            model: 'gpt-4o',
            toolIds: [],
            systemPromptPreview: 'sys',
            systemPrompt: 'sys',
            memory: { workingMemoryTemplate: null, temperature: null },
            metadata: {},
            lastUsedAt: null,
          }),
        ),
      )
      const client = new AgentClient({ baseUrl })
      const res = await client.getAgent('abc')
      expect(res.systemPrompt).toBe('sys')
    })
  })

  describe('AgentClient.streamChatToAgent', () => {
    it('POSTs to /agent and returns the SSE body stream', async () => {
      let captured: { agentId?: string; text?: string } = {}
      server.use(
        http.post(`${baseUrl}/agent`, async ({ request }) => {
          captured = (await request.json()) as never
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              const enc = new TextEncoder()
              controller.enqueue(enc.encode('event: chunk\ndata: {"type":"text","text":"hi"}\n\n'))
              controller.enqueue(enc.encode('event: chunk\ndata: {"type":"finish"}\n\n'))
              controller.close()
            },
          })
          return new HttpResponse(body, {
            status: 200,
            headers: { 'content-type': 'text/event-stream' },
          })
        }),
      )
      const client = new AgentClient({ baseUrl })
      const stream = await client.streamChatToAgent(
        { agentId: 'planner', messages: [], text: 'hello', agentContext: { tenantId: 't1', page: 'playground' } },
      )
      expect(captured.agentId).toBe('planner')
      expect(captured.text).toBe('hello')
      const reader = stream.getReader()
      const first = await reader.read()
      expect(first.done).toBe(false)
    })
  })
  ```

  Run → expect FAIL.

- [ ] **Step 6.2.2** — Extend `platform/agent/sdk/src/client/AgentClient.ts`.

  Add imports at the top:

  ```ts
  import {
    AgentProfile,
    AgentProfileDetail,
    ListAgentsResponse,
  } from '../schemas/agent-profile'
  ```

  Add request body schema next to `MeSchema`:

  ```ts
  export const StreamChatToAgentInput = z.object({
    agentId: z.string(),
    text: z.string(),
    messages: z.array(z.unknown()),
    agentContext: z
      .object({
        tenantId: z.string().nullable(),
        page: z.string(),
      })
      .passthrough(),
  })
  export type StreamChatToAgentInput = z.infer<typeof StreamChatToAgentInput>
  ```

  Add methods inside the class:

  ```ts
  listAgents(init: { signal?: AbortSignal } = {}) {
    const reqInit: { schema: typeof ListAgentsResponse; signal?: AbortSignal } = {
      schema: ListAgentsResponse,
    }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, '/agents', reqInit)
  }

  getAgent(agentId: string, init: { signal?: AbortSignal } = {}) {
    const reqInit: { schema: typeof AgentProfileDetail; signal?: AbortSignal } = {
      schema: AgentProfileDetail,
    }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, `/agents/${encodeURIComponent(agentId)}`, reqInit)
  }

  async streamChatToAgent(
    input: StreamChatToAgentInput,
    init: { signal?: AbortSignal } = {},
  ): Promise<ReadableStream<Uint8Array>> {
    const reqInit: {
      method: 'POST'
      expect: 'stream'
      body: StreamChatToAgentInput
      headers: Record<string, string>
      signal?: AbortSignal
    } = {
      method: 'POST',
      expect: 'stream',
      body: StreamChatToAgentInput.parse(input),
      headers: { accept: 'text/event-stream' },
    }
    if (init.signal) reqInit.signal = init.signal
    const res = await request(this.opts, '/agent', reqInit)
    if (!res.body) throw new Error('streamChatToAgent: response has no body')
    return res.body
  }
  ```

  Re-run tests → expect PASS.

- [ ] **Step 6.2.3** — Update exports in `platform/agent/sdk/src/index.ts`.

  ```ts
  export {
    AgentMemoryConfig,
    AgentProfile,
    AgentProfileDetail,
    ListAgentsResponse,
  } from './schemas/agent-profile'
  export type {
    AgentMemoryConfig as AgentMemoryConfigT,
    AgentProfile as AgentProfileT,
    AgentProfileDetail as AgentProfileDetailT,
    ListAgentsResponse as ListAgentsResponseT,
  } from './schemas/agent-profile'
  export { StreamChatToAgentInput } from './client/AgentClient'
  ```

  `pnpm --filter @seta/agent-sdk typecheck` → PASS.

- [ ] **Step 6.2.4** — Commit.

  ```sh
  git add platform/agent/sdk/src/schemas/agent-profile.ts \
          platform/agent/sdk/src/schemas/agent-profile.test.ts \
          platform/agent/sdk/src/client/AgentClient.ts \
          platform/agent/sdk/src/client/AgentClient.agents.test.ts \
          platform/agent/sdk/src/index.ts
  git commit -m "feat(agent-sdk): listAgents, getAgent, streamChatToAgent"
  ```

---

## Phase 7 — Studio TanStack Query options

### Task 7.1 — `agentsQueryOptions` + `agentQueryOptions`

- [ ] **Step 7.1.1** — Edit `apps/studio/src/api/queries.ts`. Append:

  ```ts
  import { queryOptions } from '@tanstack/react-query'
  import type { AgentProfileDetailT, ListAgentsResponseT } from '@seta/agent-sdk'
  import { client } from './client'

  export const agentsQueryOptions = (tenantId: string) =>
    queryOptions<ListAgentsResponseT>({
      queryKey: ['agents', tenantId],
      queryFn: ({ signal }) => client.listAgents({ signal }),
      staleTime: 30_000,
    })

  export const agentQueryOptions = (agentId: string) =>
    queryOptions<AgentProfileDetailT>({
      queryKey: ['agents', 'detail', agentId],
      queryFn: ({ signal }) => client.getAgent(agentId, { signal }),
      staleTime: 30_000,
    })
  ```

  `pnpm --filter @seta/studio typecheck` → PASS.

- [ ] **Step 7.1.2** — Commit.

  ```sh
  git add apps/studio/src/api/queries.ts
  git commit -m "feat(studio): agentsQueryOptions, agentQueryOptions"
  ```

---

## Phase 8 — Studio agents feature: list page

### Task 8.1 — `/tenants/:id/agents` DataTable page

- [ ] **Step 8.1.1** — Create `apps/studio/src/features/agents/AgentList.tsx`.

  ```tsx
  import type { AgentProfileT } from '@seta/agent-sdk'
  import { DataTable, EmptyState, type Column } from '@seta/ui'
  import { Link } from '@tanstack/react-router'

  interface Props {
    tenantId: string
    agents: readonly AgentProfileT[]
  }

  const dateFmt = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

  export function AgentList({ tenantId, agents }: Props) {
    if (agents.length === 0) {
      return <EmptyState title="No agents yet" description="Agent profiles will appear once seeded." />
    }
    const columns: Column<AgentProfileT>[] = [
      {
        key: 'name',
        header: 'Name',
        cell: (a) => (
          <Link
            to="/tenants/$id/agents/$agentId"
            params={{ id: tenantId, agentId: a.id }}
            className="font-medium text-ink hover:text-primary"
          >
            {a.name}
          </Link>
        ),
      },
      { key: 'model', header: 'Model', cell: (a) => <span className="tabular-nums">{a.model}</span> },
      { key: 'tools', header: 'Tools', cell: (a) => <span className="tabular-nums">{a.toolIds.length}</span> },
      {
        key: 'lastUsed',
        header: 'Last used',
        cell: (a) =>
          a.lastUsedAt ? (
            <span className="tabular-nums text-ink-subtle">{dateFmt.format(new Date(a.lastUsedAt))}</span>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
    ]
    return <DataTable rows={agents} columns={columns} getRowKey={(a) => a.id} />
  }
  ```

- [ ] **Step 8.1.2** — Update the route file `apps/studio/src/routes/_authed/tenants.$id.agents.tsx` (stub from PR-3 → wire to query).

  ```tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { useSuspenseQuery } from '@tanstack/react-query'
  import { SectionCard } from '@seta/ui'
  import { agentsQueryOptions } from '../../api/queries'
  import { AgentList } from '../../features/agents/AgentList'

  export const Route = createFileRoute('/_authed/tenants/$id/agents')({
    loader: ({ context, params }) =>
      context.queryClient.ensureQueryData(agentsQueryOptions(params.id)),
    component: AgentsPage,
  })

  function AgentsPage() {
    const { id: tenantId } = Route.useParams()
    const { data } = useSuspenseQuery(agentsQueryOptions(tenantId))
    return (
      <SectionCard title="Agents" description="Published agent profiles available in this tenant.">
        <AgentList tenantId={tenantId} agents={data.agents} />
      </SectionCard>
    )
  }
  ```

- [ ] **Step 8.1.3** — Component test `apps/studio/src/features/agents/AgentList.test.tsx`.

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { describe, expect, it } from 'vitest'
  import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
  import { AgentList } from './AgentList'

  function wrap(ui: React.ReactNode) {
    const root = createRootRoute({ component: () => ui as JSX.Element })
    const tenantsRoute = createRoute({ getParentRoute: () => root, path: '/tenants/$id/agents/$agentId', component: () => null })
    const router = createRouter({
      routeTree: root.addChildren([tenantsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    return <RouterProvider router={router} />
  }

  describe('<AgentList>', () => {
    it('renders rows with name + model + tool count', () => {
      render(
        wrap(
          <AgentList
            tenantId="t1"
            agents={[
              {
                id: '11111111-1111-1111-1111-111111111111',
                name: 'Planner',
                description: null,
                model: 'gpt-4o',
                toolIds: ['a', 'b'],
                systemPromptPreview: '',
                lastUsedAt: null,
              },
            ]}
          />,
        ),
      )
      expect(screen.getByText('Planner')).toBeInTheDocument()
      expect(screen.getByText('gpt-4o')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('renders empty state when list is empty', () => {
      render(wrap(<AgentList tenantId="t1" agents={[]} />))
      expect(screen.getByText('No agents yet')).toBeInTheDocument()
    })
  })
  ```

  Run `pnpm --filter @seta/studio vitest run src/features/agents/AgentList.test.tsx` → PASS.

- [ ] **Step 8.1.4** — Commit.

  ```sh
  git add apps/studio/src/features/agents/AgentList.tsx \
          apps/studio/src/features/agents/AgentList.test.tsx \
          apps/studio/src/routes/_authed/tenants.\$id.agents.tsx
  git commit -m "feat(studio): /agents list page with DataTable"
  ```

---

## Phase 9 — Studio agents feature: Playground hook + chat

### Task 9.1 — `useAgentPlayground` hook (wraps useChat)

- [ ] **Step 9.1.1** — Create `apps/studio/src/features/agents/useAgentPlayground.ts`.

  ```ts
  import { useChat } from '@seta/ui'
  import { useCallback } from 'react'
  import { client } from '../../api/client'

  interface Args {
    agentId: string
    tenantId: string
  }

  /**
   * Playground-only chat instance. Scoped to the selected agent profile with
   * its own `useChat`, `AbortController`, and messages array. The only chat
   * surface in Studio — Studio is admin-only and does not mount the global
   * right-side AgentPanel (master plan §0). Reset is in-memory only — there
   * is no server-side thread persistence in P2.
   */
  export function useAgentPlayground({ agentId, tenantId }: Args) {
    const stream = useCallback(
      async (
        { text, messages }: { text: string; messages: readonly unknown[] },
        { signal }: { signal: AbortSignal },
      ) =>
        client.streamChatToAgent(
          {
            agentId,
            text,
            messages: messages as never[],
            agentContext: { tenantId, page: 'playground' },
          },
          { signal },
        ),
      [agentId, tenantId],
    )
    const chat = useChat({ stream })
    return chat
  }
  ```

- [ ] **Step 9.1.2** — Create `apps/studio/src/features/agents/PlaygroundTab.tsx`.

  ```tsx
  import { AgentInput, AgentMessageList, Button, SectionCard } from '@seta/ui'
  import { RotateCcw } from 'lucide-react'
  import { useKey, useState } from 'react'
  import { useAgentPlayground } from './useAgentPlayground'

  interface Props {
    agentId: string
    tenantId: string
  }

  export function PlaygroundTab({ agentId, tenantId }: Props) {
    // Resetting = remount with a new key, which clears useChat's in-memory state
    // and disposes the current AbortController.
    const [resetKey, setResetKey] = useState(0)
    return (
      <SectionCard
        title="Playground"
        description="Per-agent chat. Independent from the global agent panel. Not persisted."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setResetKey((n) => n + 1)}
            aria-label="Reset playground thread"
          >
            <RotateCcw className="size-3.5 stroke-[1.5]" /> Reset
          </Button>
        }
      >
        <PlaygroundInner key={resetKey} agentId={agentId} tenantId={tenantId} />
      </SectionCard>
    )
  }

  function PlaygroundInner({ agentId, tenantId }: Props) {
    const { messages, sendMessage, isRunning } = useAgentPlayground({ agentId, tenantId })
    return (
      <div className="flex flex-col h-[560px]">
        <AgentMessageList messages={messages} streaming={isRunning} />
        <AgentInput onSubmit={sendMessage} pending={isRunning} />
      </div>
    )
  }
  ```

  Drop the `useKey` import (typo); the final file is:

  ```tsx
  import { AgentInput, AgentMessageList, Button, SectionCard } from '@seta/ui'
  import { RotateCcw } from 'lucide-react'
  import { useState } from 'react'
  import { useAgentPlayground } from './useAgentPlayground'

  interface Props {
    agentId: string
    tenantId: string
  }

  export function PlaygroundTab({ agentId, tenantId }: Props) {
    const [resetKey, setResetKey] = useState(0)
    return (
      <SectionCard
        title="Playground"
        description="Per-agent chat. Independent from the global agent panel. Not persisted."
        action={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setResetKey((n) => n + 1)}
            aria-label="Reset playground thread"
          >
            <RotateCcw className="size-3.5 stroke-[1.5]" /> Reset
          </Button>
        }
      >
        <PlaygroundInner key={resetKey} agentId={agentId} tenantId={tenantId} />
      </SectionCard>
    )
  }

  function PlaygroundInner({ agentId, tenantId }: Props) {
    const { messages, sendMessage, isRunning } = useAgentPlayground({ agentId, tenantId })
    return (
      <div className="flex flex-col h-[560px]">
        <AgentMessageList messages={messages} streaming={isRunning} />
        <AgentInput onSubmit={sendMessage} pending={isRunning} />
      </div>
    )
  }
  ```

- [ ] **Step 9.1.3** — Commit.

  ```sh
  git add apps/studio/src/features/agents/useAgentPlayground.ts \
          apps/studio/src/features/agents/PlaygroundTab.tsx
  git commit -m "feat(studio): playground useChat instance + Reset"
  ```

---

## Phase 10 — Studio agents feature: Overview + Tools tabs

### Task 10.1 — `OverviewTab`

- [ ] **Step 10.1.1** — Create `apps/studio/src/features/agents/OverviewTab.tsx`.

  ```tsx
  import type { AgentProfileDetailT } from '@seta/agent-sdk'
  import { Code, KeyValueList, SectionCard } from '@seta/ui'

  interface Props {
    agent: AgentProfileDetailT
  }

  export function OverviewTab({ agent }: Props) {
    return (
      <div className="flex flex-col gap-4">
        <SectionCard title={agent.name} description={agent.description ?? undefined}>
          <KeyValueList
            entries={[
              { key: 'Model', value: agent.model, copyable: true },
              { key: 'Tools', value: String(agent.toolIds.length) },
              {
                key: 'Working memory template',
                value: agent.memory.workingMemoryTemplate ?? '—',
              },
              {
                key: 'Temperature',
                value:
                  agent.memory.temperature !== null
                    ? agent.memory.temperature.toFixed(2)
                    : '—',
              },
              {
                key: 'Last used',
                value: agent.lastUsedAt ?? '—',
              },
            ]}
          />
        </SectionCard>
        <SectionCard title="System prompt">
          <Code lang="text">{agent.systemPrompt}</Code>
        </SectionCard>
      </div>
    )
  }
  ```

### Task 10.2 — `ToolsTab`

- [ ] **Step 10.2.1** — Create `apps/studio/src/features/agents/ToolsTab.tsx`.

  ```tsx
  import { EmptyState, SectionCard } from '@seta/ui'
  import { Link } from '@tanstack/react-router'

  interface Props {
    tenantId: string
    toolIds: readonly string[]
  }

  export function ToolsTab({ tenantId, toolIds }: Props) {
    if (toolIds.length === 0) {
      return <EmptyState title="No tools" description="This agent has no tools wired." />
    }
    return (
      <SectionCard title="Tools" description="Tools available to this agent.">
        <ul className="flex flex-col divide-y divide-hairline">
          {toolIds.map((id) => (
            <li key={id} className="py-2">
              <Link
                to="/tenants/$id/tools/$toolId"
                params={{ id: tenantId, toolId: id }}
                className="font-mono text-[13px] text-ink hover:text-primary"
              >
                {id}
              </Link>
            </li>
          ))}
        </ul>
      </SectionCard>
    )
  }
  ```

  Note: `/tenants/$id/tools/$toolId` is a PR-11 route. Until PR-11 lands, the route stub from PR-3 renders an `EmptyState("Coming soon", BadgeAlert)`. No additional stub is needed in this PR.

- [ ] **Step 10.2.2** — Commit.

  ```sh
  git add apps/studio/src/features/agents/OverviewTab.tsx \
          apps/studio/src/features/agents/ToolsTab.tsx
  git commit -m "feat(studio): agent overview + tools tabs"
  ```

---

## Phase 11 — Studio agents feature: detail page wiring

### Task 11.1 — `/tenants/:id/agents/:agentId` with Tabs

- [ ] **Step 11.1.1** — Update `apps/studio/src/routes/_authed/tenants.$id.agents.$agentId.tsx`.

  ```tsx
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@seta/ui'
  import { useSuspenseQuery } from '@tanstack/react-query'
  import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
  import { z } from 'zod'
  import { agentQueryOptions } from '../../api/queries'
  import { OverviewTab } from '../../features/agents/OverviewTab'
  import { PlaygroundTab } from '../../features/agents/PlaygroundTab'
  import { ToolsTab } from '../../features/agents/ToolsTab'

  const TabValue = z.enum(['overview', 'playground', 'tools']).catch('overview')

  export const Route = createFileRoute('/_authed/tenants/$id/agents/$agentId')({
    validateSearch: (s) => ({ tab: TabValue.parse((s as { tab?: unknown }).tab) }),
    loader: ({ context, params }) =>
      context.queryClient.ensureQueryData(agentQueryOptions(params.agentId)),
    component: AgentDetailPage,
  })

  function AgentDetailPage() {
    const { id: tenantId, agentId } = Route.useParams()
    const { tab } = useSearch({ from: Route.id })
    const navigate = useNavigate({ from: Route.fullPath })
    const { data: agent } = useSuspenseQuery(agentQueryOptions(agentId))

    return (
      <Tabs
        value={tab}
        onValueChange={(next) =>
          navigate({ search: { tab: TabValue.parse(next) }, replace: true })
        }
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="playground">Playground</TabsTrigger>
          <TabsTrigger value="tools">Tools</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab agent={agent} />
        </TabsContent>
        <TabsContent value="playground">
          <PlaygroundTab agentId={agentId} tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="tools">
          <ToolsTab tenantId={tenantId} toolIds={agent.toolIds} />
        </TabsContent>
      </Tabs>
    )
  }
  ```

  Tab selection is URL search-param (`?tab=playground`), so deep-links work. Studio has no right-side `AgentPanel` (admin-only layout — master plan §0); the in-canvas Playground is the only chat surface.

- [ ] **Step 11.1.2** — Commit.

  ```sh
  git add apps/studio/src/routes/_authed/tenants.\$id.agents.\$agentId.tsx
  git commit -m "feat(studio): /agents/:agentId detail with Tabs"
  ```

---

## Phase 12 — Studio `agentContext.ts` updates — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel` (master plan §0). There is no `apps/studio/src/nav/agentContext.ts` to extend for `/agents` or `/agents/:agentId`. The `'agents' | 'agent-detail' | 'playground'` `AgentContext['page']` union values remain reserved in `@seta/ui` for OTHER Workspace modules. The Playground itself is an in-canvas `useChat` instance (Phase 10) that posts to `/agent` with `{ agentId, agentContext: { tenantId, page: 'playground' } }` baked into the request body — this is request-level metadata for the agent backend, NOT a shell-level mount and not stored in a `nav/agentContext.ts` helper.

---

## Phase 13 — Studio MSW recordings + component tests

### Task 13.1 — Record SDK fixtures

- [ ] **Step 13.1.1** — Create `apps/studio/src/test/__recordings__/sdk/list-agents.json`.

  ```json
  {
    "request": { "method": "GET", "path": "/agents" },
    "response": {
      "status": 200,
      "body": {
        "agents": [
          {
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Planner",
            "description": "Plans tasks",
            "model": "gpt-4o",
            "toolIds": ["list_tasks", "create_task"],
            "systemPromptPreview": "You are a planner …",
            "lastUsedAt": "2026-05-15T10:00:00.000Z"
          },
          {
            "id": "22222222-2222-2222-2222-222222222222",
            "name": "Analyst",
            "description": "Analyses ERP data",
            "model": "gpt-4o",
            "toolIds": ["query_erp"],
            "systemPromptPreview": "You are an ERP analyst …",
            "lastUsedAt": null
          }
        ]
      }
    }
  }
  ```

- [ ] **Step 13.1.2** — Create `apps/studio/src/test/__recordings__/sdk/get-agent-planner.json`.

  ```json
  {
    "request": { "method": "GET", "path": "/agents/11111111-1111-1111-1111-111111111111" },
    "response": {
      "status": 200,
      "body": {
        "id": "11111111-1111-1111-1111-111111111111",
        "name": "Planner",
        "description": "Plans tasks",
        "model": "gpt-4o",
        "toolIds": ["list_tasks", "create_task"],
        "systemPromptPreview": "You are a planner …",
        "systemPrompt": "You are a planner. Timezone: {{timezone}}",
        "memory": { "workingMemoryTemplate": "tasks: []", "temperature": 0.7 },
        "metadata": { "owner": "planner-team" },
        "lastUsedAt": "2026-05-15T10:00:00.000Z"
      }
    }
  }
  ```

- [ ] **Step 13.1.3** — Create `apps/studio/src/test/__recordings__/sdk/agent-sse-hello.txt`.

  ```
  event: chunk
  data: {"type":"text","text":"Hello"}

  event: chunk
  data: {"type":"text","text":" there"}

  event: chunk
  data: {"type":"finish"}

  ```

  Plain text — newlines preserved.

### Task 13.2 — Component tests

- [ ] **Step 13.2.1** — Add MSW handler factory `apps/studio/src/test/handlers/agents.ts`.

  ```ts
  import { http, HttpResponse } from 'msw'
  import listAgents from '../__recordings__/sdk/list-agents.json'
  import getAgent from '../__recordings__/sdk/get-agent-planner.json'
  import sseHello from '../__recordings__/sdk/agent-sse-hello.txt?raw'

  const BASE = '/api'

  export const agentsHandlers = [
    http.get(`${BASE}/agents`, () => HttpResponse.json(listAgents.response.body)),
    http.get(`${BASE}/agents/:id`, ({ params }) => {
      if (params.id === '11111111-1111-1111-1111-111111111111') {
        return HttpResponse.json(getAgent.response.body)
      }
      return new HttpResponse(JSON.stringify({ title: 'not-found' }), { status: 404 })
    }),
    http.post(`${BASE}/agent`, () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sseHello))
          controller.close()
        },
      })
      return new HttpResponse(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }),
  ]
  ```

- [ ] **Step 13.2.2** — Detail page test `apps/studio/src/routes/_authed/tenants.$id.agents.$agentId.test.tsx`.

  ```tsx
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
  import { render, screen, waitFor } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { setupServer } from 'msw/node'
  import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
  import { routeTree } from '../../routeTree.gen'
  import { agentsHandlers } from '../../test/handlers/agents'

  const server = setupServer(...agentsHandlers)
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  function renderAt(initialPath: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createRouter({
      routeTree,
      context: { queryClient: qc, client: undefined as never, me: null },
      history: createMemoryHistory({ initialEntries: [initialPath] }),
    })
    return render(
      <QueryClientProvider client={qc}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }

  describe('/_authed/tenants/$id/agents/$agentId', () => {
    it('renders Overview by default', async () => {
      renderAt('/tenants/t1/agents/11111111-1111-1111-1111-111111111111')
      await waitFor(() => expect(screen.getByText('Planner')).toBeInTheDocument())
      expect(screen.getByText('System prompt')).toBeInTheDocument()
      expect(screen.getByText(/You are a planner/)).toBeInTheDocument()
    })

    it('switches to Playground when tab clicked', async () => {
      renderAt('/tenants/t1/agents/11111111-1111-1111-1111-111111111111')
      await waitFor(() => screen.getByText('Planner'))
      await userEvent.click(screen.getByRole('tab', { name: /playground/i }))
      expect(await screen.findByRole('textbox', { name: /message agent/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reset playground thread/i })).toBeInTheDocument()
    })

    it('streams an assistant reply on submit', async () => {
      renderAt('/tenants/t1/agents/11111111-1111-1111-1111-111111111111?tab=playground')
      const input = await screen.findByRole('textbox', { name: /message agent/i })
      await userEvent.type(input, 'hi')
      await userEvent.click(screen.getByRole('button', { name: /send message/i }))
      await waitFor(() => expect(screen.getByText(/Hello there/)).toBeInTheDocument())
    })

    it('Reset clears messages', async () => {
      renderAt('/tenants/t1/agents/11111111-1111-1111-1111-111111111111?tab=playground')
      const input = await screen.findByRole('textbox', { name: /message agent/i })
      await userEvent.type(input, 'hi')
      await userEvent.click(screen.getByRole('button', { name: /send message/i }))
      await waitFor(() => expect(screen.getByText(/Hello there/)).toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: /reset playground thread/i }))
      expect(screen.queryByText(/Hello there/)).not.toBeInTheDocument()
    })
  })
  ```

  Run `pnpm --filter @seta/studio vitest run src/routes/_authed/tenants.\$id.agents.\$agentId.test.tsx` → expect PASS.

- [ ] **Step 13.2.3** — List page test `apps/studio/src/routes/_authed/tenants.$id.agents.test.tsx` (analogous setup; asserts both agents render in a `DataTable` row).

  ```tsx
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
  import { render, screen, waitFor } from '@testing-library/react'
  import { setupServer } from 'msw/node'
  import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
  import { routeTree } from '../../routeTree.gen'
  import { agentsHandlers } from '../../test/handlers/agents'

  const server = setupServer(...agentsHandlers)
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  describe('/_authed/tenants/$id/agents', () => {
    it('renders the agents list', async () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      const router = createRouter({
        routeTree,
        context: { queryClient: qc, client: undefined as never, me: null },
        history: createMemoryHistory({ initialEntries: ['/tenants/t1/agents'] }),
      })
      render(
        <QueryClientProvider client={qc}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      )
      await waitFor(() => expect(screen.getByText('Planner')).toBeInTheDocument())
      expect(screen.getByText('Analyst')).toBeInTheDocument()
      expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    })
  })
  ```

  Run → PASS.

- [ ] **Step 13.2.4** — Commit.

  ```sh
  git add apps/studio/src/test/__recordings__/sdk/list-agents.json \
          apps/studio/src/test/__recordings__/sdk/get-agent-planner.json \
          apps/studio/src/test/__recordings__/sdk/agent-sse-hello.txt \
          apps/studio/src/test/handlers/agents.ts \
          apps/studio/src/routes/_authed/tenants.\$id.agents.test.tsx \
          apps/studio/src/routes/_authed/tenants.\$id.agents.\$agentId.test.tsx
  git commit -m "test(studio): agents list + detail + playground streaming via MSW"
  ```

---

## Phase 14 — E2E test

### Task 14.1 — Playwright spec

- [ ] **Step 14.1.1** — Create `/tests/e2e/studio/agents.spec.ts`.

  ```ts
  import { test, expect } from '@playwright/test'

  test.describe('Studio /agents', () => {
    test.beforeEach(async ({ context, baseURL }) => {
      // Recorded fixture stack assumed to provide /agents, /agents/:id, and /agent SSE.
      // Seed session cookie via helper (defined in /tests/e2e/studio/setup.ts).
      await context.addCookies([
        {
          name: 'seta_sess',
          value: 'fixture-session',
          url: baseURL ?? 'http://localhost:5173',
        },
      ])
    })

    test('list → detail → playground streamed reply', async ({ page }) => {
      await page.goto('/tenants/t1/agents')
      await expect(page.getByRole('link', { name: 'Planner' })).toBeVisible()
      await page.getByRole('link', { name: 'Planner' }).click()
      await expect(page.getByText('System prompt')).toBeVisible()
      await page.getByRole('tab', { name: /playground/i }).click()
      const input = page.getByRole('textbox', { name: /message agent/i })
      await input.fill('hello')
      await page.getByRole('button', { name: /send message/i }).click()
      await expect(page.getByText(/Hello there/)).toBeVisible({ timeout: 5_000 })
    })
  })
  ```

- [ ] **Step 14.1.2** — Run E2E locally with the docker stack.

  ```sh
  pnpm db:up
  pnpm --filter @seta/api dev &
  pnpm --filter @seta/studio dev &
  pnpm test:e2e -- tests/e2e/studio/agents.spec.ts
  ```

  Expect PASS. Kill the dev processes after.

- [ ] **Step 14.1.3** — Commit.

  ```sh
  git add tests/e2e/studio/agents.spec.ts
  git commit -m "test(studio): e2e /agents → detail → playground stream"
  ```

---

## Phase 15 — SCOPE updates

### Task 15.1 — `apps/api/SCOPE.md`

- [ ] **Step 15.1.1** — Append under "Routes mounted" a row for `GET /agents` and `GET /agents/:id` (owner `@seta/agent-server`, factory `createAgentAdminRoutes`).

### Task 15.2 — `apps/studio/SCOPE.md`

- [ ] **Step 15.2.1** — Under "Routes shipped" add `/tenants/:id/agents` and `/tenants/:id/agents/:agentId` with brief descriptions:

  - `/tenants/:id/agents` — DataTable of agent profiles.
  - `/tenants/:id/agents/:agentId` — Tabs (overview / playground / tools); playground is an independent `useChat` instance against `POST /agent`.

- [ ] **Step 15.2.2** — Commit.

  ```sh
  git add apps/api/SCOPE.md apps/studio/SCOPE.md
  git commit -m "docs(api,studio): document /agents surface + playground"
  ```

---

## Phase 16 — Final verification

- [ ] **Step 16.1** — Repo-level checks.

  ```sh
  pnpm lint
  pnpm typecheck
  pnpm test:unit
  DATABASE_URL=... pnpm test:integration
  ```

  All must pass.

- [ ] **Step 16.2** — Bundle budget (Studio).

  ```sh
  pnpm --filter @seta/studio build
  pnpm --filter @seta/studio check:bundle
  ```

  ≤250 kB gzipped main, ≤100 kB per route chunk. If the agents route chunk exceeds 100 kB, switch the detail route to a TanStack lazy route.

- [ ] **Step 16.3** — Demo state check.

  ```sh
  pnpm db:up
  pnpm --filter @seta/api dev &
  pnpm --filter @seta/studio dev
  ```

  Open `http://localhost:5173/tenants/<seeded-tenant-id>/agents`. Confirm:
  1. The list renders both seeded profiles (Planner, Analyst).
  2. Click Planner → detail page lands on Overview, system prompt visible.
  3. Switch to Playground tab → input visible, Reset button visible.
  4. Type "hello", press Enter → assistant message streams in token-by-token from the live `/agent` endpoint (or recorded SSE fixture when running with MSW).
  5. Click Reset → messages cleared.
  6. Switch to Tools tab → list of toolIds linking to `/tenants/:id/tools/:toolId` (placeholder route until PR-11).

  Tear down with `pnpm db:down`.

- [ ] **Step 16.4** — Self-review against spec §13.

  Confirm against `/Users/canh/Projects/Seta/seta-os/docs/superpowers/specs/2026-05-15-studio-p2-master-plan.md` §13:
  - [x] Backend: `createAgentAdminRoutes` exposes `GET /agents?tenantId=` (tenant resolved from context, not query) + `GET /agents/:id`.
  - [x] Studio `/tenants/:id/agents` — `DataTable` with name, model, tool count, last-used.
  - [x] Studio `/tenants/:id/agents/:agentId` — Tabs (Overview / Playground / Tools).
  - [x] Overview tab: SectionCard with name, system prompt `Code`, KeyValueList of config.
  - [x] Playground tab: in-canvas `useChat`, `stream` posts to `/agent` with `{ agentId, agentContext: { tenantId, page: 'playground' } }`, Reset clears in-memory.
  - [x] Tools tab: tool list with links to `/tenants/:id/tools/:toolId`.
  - [x] No global right-side `AgentPanel` in Studio — Playground is the only chat surface (master plan §0).

- [ ] **Step 16.5** — Open the PR.

  ```sh
  gh pr create --title "feat(agent-server,agent-sdk,studio): PR-9 agents + playground slice" --body "$(cat <<'EOF'
  ## Summary
  - `createAgentAdminRoutes` in `@seta/agent-server` exposing `GET /agents` and `GET /agents/:id`, mounted in `apps/api`.
  - SDK adds `listAgents`, `getAgent`, `streamChatToAgent` with Zod-validated request/response.
  - Studio ships `/tenants/:id/agents` list and `/tenants/:id/agents/:agentId` detail with Tabs (Overview / Playground / Tools); Playground is an in-canvas `useChat` instance against `/agent` with a Reset that clears the in-memory thread. Studio is admin-only — no global right-side `AgentPanel`; Playground is the only chat surface.

  ## Test plan
  - [ ] `pnpm test:unit`
  - [ ] `pnpm test:integration` (DATABASE_URL set)
  - [ ] `pnpm test:e2e -- tests/e2e/studio/agents.spec.ts`
  - [ ] Manual demo: list → detail → playground → send "hello" → streamed reply → Reset.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  EOF
  )"
  ```

---

## Appendix A — Files touched (summary)

```
platform/agent/server/src/admin/schemas.ts                     (new)
platform/agent/server/src/admin/schemas.test.ts                (new)
platform/agent/server/src/admin/list-agents.ts                 (new)
platform/agent/server/src/admin/get-agent.ts                   (new)
platform/agent/server/src/admin/routes.ts                      (new)
platform/agent/server/tests/integration/admin/*.test.ts        (new)
platform/agent/server/src/index.ts                             (add exports)

platform/agent/sdk/src/schemas/agent-profile.ts                (new)
platform/agent/sdk/src/schemas/agent-profile.test.ts           (new)
platform/agent/sdk/src/client/AgentClient.ts                   (extend)
platform/agent/sdk/src/client/AgentClient.agents.test.ts       (new)
platform/agent/sdk/src/index.ts                                (add exports)

apps/api/src/main.ts                                           (mount diff)
apps/api/src/agents.smoke.test.ts                              (new)
apps/api/SCOPE.md                                              (update)

apps/studio/src/api/queries.ts                                 (add options)
apps/studio/src/features/agents/AgentList.tsx                  (new)
apps/studio/src/features/agents/AgentList.test.tsx             (new)
apps/studio/src/features/agents/OverviewTab.tsx                (new)
apps/studio/src/features/agents/PlaygroundTab.tsx              (new)
apps/studio/src/features/agents/ToolsTab.tsx                   (new)
apps/studio/src/features/agents/useAgentPlayground.ts          (new)
apps/studio/src/routes/_authed/tenants.$id.agents.tsx          (wire to query)
apps/studio/src/routes/_authed/tenants.$id.agents.$agentId.tsx (replace stub)
apps/studio/src/routes/_authed/tenants.$id.agents.test.tsx     (new)
apps/studio/src/routes/_authed/tenants.$id.agents.$agentId.test.tsx (new)
apps/studio/src/test/__recordings__/sdk/list-agents.json       (new)
apps/studio/src/test/__recordings__/sdk/get-agent-planner.json (new)
apps/studio/src/test/__recordings__/sdk/agent-sse-hello.txt    (new)
apps/studio/src/test/handlers/agents.ts                        (new)
apps/studio/SCOPE.md                                           (update)

tests/e2e/studio/agents.spec.ts                                (new)
```

---

## Appendix B — Playground chat ownership

Studio is admin-only and does NOT mount the global right-side `AgentPanel` (master plan §0). The Playground tab is the single conversational surface in Studio. It calls `useChat` inside `PlaygroundTab`, which owns its own `useState`, `AbortController`, and message array, scoped to the selected agent profile. Posts go to `/agent` with `{ agentId, agentContext: { tenantId, page: 'playground' } }` selecting the per-agent profile server-side. The Reset button clears the in-memory thread. Switching tabs unmounts the Playground tree (so the in-memory thread is lost unless the user stays on the tab); switching agents creates a new `useChat` instance scoped to the new `agentId`.
