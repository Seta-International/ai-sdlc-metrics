# Agent Server Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `platform/agent/server` (`@seta/agent-server`) — the HTTP infrastructure package that stores agent profiles in Postgres, resolves them at runtime, provides an injectable tool registry, and exposes Hono route factories for agent CRUD, streaming run, threads, and workflow management.

**Architecture:** Platform package — imports nothing from `modules/*`. DB schema lives in the `agent` Postgres schema. Profile resolution uses a 5-minute LRU cache. Tools are registered at startup by `apps/api`; the registry is injected into every route handler. Seeds (PLANNER_PROFILE_SEED etc.) are passed in as data by `apps/api` — never imported directly here.

**Tech Stack:** Drizzle ORM, `drizzle-kit`, Hono + `@hono/zod-openapi`, `lru-cache`, `@seta/agent-core` (run loop, streamKernelSSE), `@seta/agent-memory`, `@seta/agent-workflows`, `@seta/middleware` (DomainError), `@seta/tenant`

**Depends on:** Plan 1 complete (plan_members table must exist before permission views in Plan 3, but this plan has no Plan 1 dependency — can be built in parallel).

---

## File map

| Action | File |
|---|---|
| Create (scaffold) | `platform/agent/server/` via `pnpm new:package` |
| Create | `platform/agent/server/src/schema.ts` |
| Create | `platform/agent/server/drizzle.config.ts` |
| Create | `platform/agent/server/src/tool-registry.ts` |
| Create | `platform/agent/server/src/profile-registry.ts` |
| Create | `platform/agent/server/src/actions/build-action-tool.ts` |
| Create | `platform/agent/server/src/agent-seeder.ts` |
| Create | `platform/agent/server/src/routes/agents.ts` |
| Create | `platform/agent/server/src/routes/run.ts` |
| Create | `platform/agent/server/src/routes/threads.ts` |
| Create | `platform/agent/server/src/routes/workflows.ts` |
| Create | `platform/agent/server/src/routes.ts` |
| Create | `platform/agent/server/src/index.ts` |
| Create | `platform/agent/server/src/tool-registry.test.ts` |
| Create | `platform/agent/server/src/profile-registry.test.ts` |
| Create | `platform/agent/server/src/agent-seeder.test.ts` |
| Generate | `platform/agent/server/migrations/` |

---

## Task 1: Scaffold package + install dependencies

**Files:**
- Create: `platform/agent/server/` (via scaffold)

- [ ] **Step 1: Scaffold the package**

```bash
pnpm new:package
```

When prompted:
- Kind: `platform-agent`
- Short name: `server`

This creates `platform/agent/server/` with package name `@seta/agent-server`.

- [ ] **Step 2: Add runtime dependencies**

```bash
pnpm --filter @seta/agent-server add \
  @seta/agent-core@workspace:* \
  @seta/agent-memory@workspace:* \
  @seta/agent-workflows@workspace:* \
  @seta/middleware@workspace:* \
  @seta/tenant@workspace:* \
  @seta/db@workspace:* \
  drizzle-orm@0.45.2 \
  lru-cache@11.3.6 \
  hono@4.12.18 \
  zod@4.4.3
```

```bash
pnpm --filter @seta/agent-server add -D \
  drizzle-kit@0.31.10 \
  @hono/zod-openapi@workspace:*
```

> If `@hono/zod-openapi` is not a workspace package, run `pnpm view @hono/zod-openapi version` first and pin the version.

- [ ] **Step 3: Create `drizzle.config.ts`**

```typescript
// platform/agent/server/drizzle.config.ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  schemaFilter: ['agent'],
  casing: 'snake_case',
})
```

- [ ] **Step 4: Commit scaffold**

```bash
git add platform/agent/server/
git commit -m "feat(agent-server): scaffold platform package"
```

---

## Task 2: DB schema — `agent.agent_profiles` + `agent.agent_actions`

**Files:**
- Create: `platform/agent/server/src/schema.ts`
- Generate: `platform/agent/server/migrations/`

- [ ] **Step 1: Create `schema.ts`**

```typescript
// platform/agent/server/src/schema.ts
import {
  check,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
  numeric,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const agentSchema = pgSchema('agent')

export const agentProfiles = agentSchema.table(
  'agent_profiles',
  {
    agentId: uuid('agent_id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    slug: text('slug'),
    name: text('name').notNull(),
    description: text('description'),
    instructions: text('instructions').notNull(),
    model: text('model').notNull(),
    toolIds: text('tool_ids').array().notNull().default(sql`'{}'`),
    workingMemoryTemplate: text('working_memory_template'),
    temperature: numeric('temperature', { precision: 3, scale: 2 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    status: text('status').notNull().default('published'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('status_check', sql`${t.status} IN ('draft', 'published', 'archived')`),
    index('agent_profiles_by_tenant_slug').on(t.tenantId, t.slug),
  ],
)

export const agentActions = agentSchema.table(
  'agent_actions',
  {
    actionId: uuid('action_id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    spec: jsonb('spec').$type<Record<string, unknown>>().notNull(),
    auth: jsonb('auth').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('agent_actions_by_agent').on(t.agentId, t.tenantId)],
)

export type AgentProfileRow = typeof agentProfiles.$inferSelect
export type NewAgentProfile = typeof agentProfiles.$inferInsert
export type AgentActionRow = typeof agentActions.$inferSelect
export type NewAgentAction = typeof agentActions.$inferInsert
```

- [ ] **Step 2: Generate DDL migration**

```bash
pnpm --filter @seta/agent-server exec drizzle-kit generate
```

Expected: new `.sql` in `migrations/` with `CREATE TABLE agent.agent_profiles ...` and `CREATE TABLE agent.agent_actions ...`.

- [ ] **Step 3: Generate RLS + unique-index custom migration**

```bash
pnpm --filter @seta/agent-server exec drizzle-kit generate --custom --name rls-and-unique-indexes
```

- [ ] **Step 4: Write RLS + partial unique indexes in the generated custom migration**

Open the generated empty `.sql` file and write:

```sql
-- Partial unique indexes (handle NULL tenant_id — PostgreSQL UNIQUE ignores NULLs)
CREATE UNIQUE INDEX agent_profiles_global_slug
  ON agent.agent_profiles (slug)
  WHERE tenant_id IS NULL AND slug IS NOT NULL;

CREATE UNIQUE INDEX agent_profiles_tenant_slug
  ON agent.agent_profiles (tenant_id, slug)
  WHERE tenant_id IS NOT NULL AND slug IS NOT NULL;

-- RLS
ALTER TABLE agent.agent_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_profiles_select ON agent.agent_profiles FOR SELECT
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.tenant_id', true)::uuid
  );

CREATE POLICY agent_profiles_insert ON agent.agent_profiles FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY agent_profiles_update ON agent.agent_profiles FOR UPDATE
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY agent_profiles_delete ON agent.agent_profiles FOR DELETE
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE agent.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_actions_rls ON agent.agent_actions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @seta/agent-server typecheck
```

- [ ] **Step 6: Commit**

```bash
git add platform/agent/server/src/schema.ts platform/agent/server/migrations/ platform/agent/server/drizzle.config.ts
git commit -m "feat(agent-server): agent_profiles + agent_actions schema with RLS"
```

---

## Task 3: Tool registry

**Files:**
- Create: `platform/agent/server/src/tool-registry.ts`
- Create: `platform/agent/server/src/tool-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// platform/agent/server/src/tool-registry.test.ts
import { describe, expect, it } from 'vitest'
import { createToolRegistry } from './tool-registry'

const fakeTool = (id: string) => ({ id } as never)

describe('createToolRegistry', () => {
  it('register + resolve returns registered tools', () => {
    const reg = createToolRegistry()
    const tool = fakeTool('list_tasks')
    reg.register('list_tasks', tool)
    const resolved = reg.resolve(['list_tasks'])
    expect(resolved).toHaveLength(1)
    expect(resolved[0]).toBe(tool)
  })

  it('resolve throws DomainError for unknown tool id', () => {
    const reg = createToolRegistry()
    expect(() => reg.resolve(['unknown_tool'])).toThrow()
  })

  it('resolve returns tools in the same order as the input ids', () => {
    const reg = createToolRegistry()
    const a = fakeTool('a')
    const b = fakeTool('b')
    reg.register('a', a)
    reg.register('b', b)
    expect(reg.resolve(['b', 'a'])).toEqual([b, a])
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/agent-server test:unit
```

Expected: FAIL "Cannot find module './tool-registry'".

- [ ] **Step 3: Implement**

```typescript
// platform/agent/server/src/tool-registry.ts
import type { Tool } from '@seta/agent-core'
import { DomainError } from '@seta/middleware'

export interface ToolRegistry {
  register(toolId: string, tool: Tool): void
  resolve(toolIds: string[]): Tool[]
}

export function createToolRegistry(): ToolRegistry {
  const map = new Map<string, Tool>()
  return {
    register(toolId, tool) {
      map.set(toolId, tool)
    },
    resolve(toolIds) {
      return toolIds.map((id) => {
        const tool = map.get(id)
        if (!tool) throw new DomainError('unknown_tool_id', { toolId: id })
        return tool
      })
    },
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @seta/agent-server test:unit
```

- [ ] **Step 5: Commit**

```bash
git add platform/agent/server/src/tool-registry.ts platform/agent/server/src/tool-registry.test.ts
git commit -m "feat(agent-server): injectable ToolRegistry"
```

---

## Task 4: Profile registry — resolver, LRU cache, hydrator

**Files:**
- Create: `platform/agent/server/src/profile-registry.ts`
- Create: `platform/agent/server/src/profile-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// platform/agent/server/src/profile-registry.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { resolveAgentProfile, interpolateInstructions, hydrateAgent } from './profile-registry'

type SqlFn = (strings: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>
const makeSql = (rows: unknown[]) => vi.fn<SqlFn>().mockResolvedValue(rows)

const PROFILE_ROW = {
  agentId: 'agt-1',
  tenantId: null,
  slug: 'planner',
  name: 'Planner Agent',
  instructions: 'Hello {{timezone}} {{convType}}',
  model: 'gpt-4o',
  toolIds: ['list_tasks'],
  workingMemoryTemplate: null,
  temperature: null,
  metadata: {},
  status: 'published',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('resolveAgentProfile', () => {
  it('returns a matching row', async () => {
    const sql = makeSql([PROFILE_ROW])
    const row = await resolveAgentProfile(sql as never, 'tenant-1', 'planner')
    expect(row.slug).toBe('planner')
  })

  it('throws when no row matches', async () => {
    const sql = makeSql([])
    await expect(resolveAgentProfile(sql as never, 'tenant-1', 'missing')).rejects.toThrow()
  })
})

describe('interpolateInstructions', () => {
  it('replaces {{timezone}} and {{convType}}', () => {
    const result = interpolateInstructions('Tz: {{timezone}} Conv: {{convType}}', {
      timezone: 'Asia/Ho_Chi_Minh',
      convType: 'personal',
    })
    expect(result).toBe('Tz: Asia/Ho_Chi_Minh Conv: personal')
  })

  it('leaves unknown placeholders intact', () => {
    const result = interpolateInstructions('{{unknown}}', { timezone: 'UTC', convType: 'personal' })
    expect(result).toBe('{{unknown}}')
  })
})

describe('hydrateAgent', () => {
  it('builds AgentConfig with resolved tools and interpolated instructions', () => {
    const mockTool = { id: 'list_tasks' } as never
    const registry = { resolve: vi.fn().mockReturnValue([mockTool]), register: vi.fn() }
    const config = hydrateAgent(PROFILE_ROW as never, [], { timezone: 'UTC', convType: 'groupChat' }, registry)
    expect(config.systemPrompt).toBe('Hello UTC groupChat')
    expect(config.tools).toEqual([mockTool])
    expect(config.model).toBe('gpt-4o')
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/agent-server test:unit
```

- [ ] **Step 3: Implement**

```typescript
// platform/agent/server/src/profile-registry.ts
import type { AgentConfig } from '@seta/agent-core'
import { DomainError } from '@seta/middleware'
import { LRUCache } from 'lru-cache'
import type { AgentActionRow, AgentProfileRow } from './schema.js'
import type { ToolRegistry } from './tool-registry.js'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface RunContext {
  timezone: string
  convType: 'personal' | 'groupChat' | 'channel' | 'direct'
}

const profileCache = new LRUCache<string, AgentProfileRow>({
  max: 500,
  ttl: 5 * 60 * 1000,
})

export function invalidateProfileCache(tenantId: string, slugOrId: string) {
  profileCache.delete(`profile:${tenantId}:${slugOrId}`)
}

export async function resolveAgentProfile(
  sql: DbSql,
  tenantId: string,
  slugOrId: string,
): Promise<AgentProfileRow> {
  const key = `profile:${tenantId}:${slugOrId}`
  const cached = profileCache.get(key)
  if (cached) return cached

  const rows = await sql`
    SELECT *
    FROM agent.agent_profiles
    WHERE status = 'published'
      AND (
        (slug = ${slugOrId} AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL))
        OR (agent_id = ${slugOrId}::uuid AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL))
      )
    ORDER BY tenant_id NULLS LAST
    LIMIT 1
  `
  if (!rows.length) {
    throw new DomainError('agent_profile_not_found', { slugOrId, tenantId })
  }
  const row = rows[0] as AgentProfileRow
  profileCache.set(key, row)
  return row
}

export async function loadAgentActions(sql: DbSql, tenantId: string, agentId: string): Promise<AgentActionRow[]> {
  const rows = await sql`
    SELECT * FROM agent.agent_actions
    WHERE tenant_id = ${tenantId}::uuid AND agent_id = ${agentId}::uuid
    ORDER BY created_at
  `
  return rows as AgentActionRow[]
}

export function interpolateInstructions(
  template: string,
  ctx: RunContext,
): string {
  return template
    .replaceAll('{{timezone}}', ctx.timezone)
    .replaceAll('{{convType}}', ctx.convType)
}

export function hydrateAgent(
  profile: AgentProfileRow,
  actions: AgentActionRow[],
  ctx: RunContext,
  toolRegistry: ToolRegistry,
): AgentConfig {
  return {
    model: profile.model,
    systemPrompt: interpolateInstructions(profile.instructions, ctx),
    tools: [
      ...toolRegistry.resolve(profile.toolIds),
    ],
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @seta/agent-server test:unit
```

- [ ] **Step 5: Commit**

```bash
git add platform/agent/server/src/profile-registry.ts platform/agent/server/src/profile-registry.test.ts
git commit -m "feat(agent-server): profile resolver with LRU cache and agent hydrator"
```

---

## Task 5: OpenAPI action builder

**Files:**
- Create: `platform/agent/server/src/actions/build-action-tool.ts`

The action builder turns an `AgentActionRow` (a stored OpenAPI operation spec + auth config) into a `Tool` that the agent can call at runtime. Network errors from actions surface as tool errors, not agent crashes.

- [ ] **Step 1: Implement (no TDD — pure transformation, exercised via integration)**

```typescript
// platform/agent/server/src/actions/build-action-tool.ts
import type { Tool, ToolResult } from '@seta/agent-core'
import { z } from 'zod'
import type { AgentActionRow } from '../schema.js'

type OpenApiOperation = {
  path: string
  method: string
  parameters?: Array<{ name: string; in: string; schema?: Record<string, unknown>; required?: boolean }>
  requestBody?: { content?: { 'application/json'?: { schema?: Record<string, unknown> } } }
  servers?: Array<{ url: string }>
}

function extractInputSchema(spec: Record<string, unknown>): Record<string, unknown> {
  const op = spec as OpenApiOperation
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of op.parameters ?? []) {
    if (param.in === 'query' || param.in === 'path') {
      properties[param.name] = param.schema ?? { type: 'string' }
      if (param.required) required.push(param.name)
    }
  }

  const bodySchema = op.requestBody?.content?.['application/json']?.schema as Record<string, unknown> | undefined
  if (bodySchema?.properties && typeof bodySchema.properties === 'object') {
    Object.assign(properties, bodySchema.properties)
    if (Array.isArray(bodySchema.required)) required.push(...(bodySchema.required as string[]))
  }

  return { type: 'object', properties, required, additionalProperties: false }
}

async function executeAction(action: AgentActionRow, args: Record<string, unknown>): Promise<ToolResult<unknown>> {
  const op = action.spec as OpenApiOperation
  const auth = action.auth as { type?: string; token?: string; header?: string } | null

  const serverUrl = op.servers?.[0]?.url ?? ''
  let path = op.path
  const queryParams = new URLSearchParams()

  for (const param of op.parameters ?? []) {
    const val = args[param.name]
    if (val === undefined) continue
    if (param.in === 'path') {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(val)))
    } else if (param.in === 'query') {
      queryParams.set(param.name, String(val))
    }
  }

  const url = `${serverUrl}${path}${queryParams.size > 0 ? `?${queryParams}` : ''}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (auth?.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  } else if (auth?.type === 'api_key' && auth.header && auth.token) {
    headers[auth.header] = auth.token
  }

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(op.method.toUpperCase())
  const bodyArgs: Record<string, unknown> = {}
  if (hasBody) {
    const bodySchema = op.requestBody?.content?.['application/json']?.schema as Record<string, unknown> | undefined
    const bodyProps = bodySchema?.properties ? Object.keys(bodySchema.properties as object) : []
    for (const key of bodyProps) {
      if (key in args) bodyArgs[key] = args[key]
    }
  }

  try {
    const resp = await fetch(url, {
      method: op.method.toUpperCase(),
      headers,
      ...(hasBody ? { body: JSON.stringify(bodyArgs) } : {}),
    })
    if (!resp.ok) {
      return { ok: false, error: { name: 'action_http_error', message: `HTTP ${resp.status}` } }
    }
    const data = resp.status === 204 ? null : await resp.json()
    return { ok: true, value: data }
  } catch (err) {
    return { ok: false, error: { name: 'action_network_error', message: String(err) } }
  }
}

export function buildActionTool(action: AgentActionRow): Tool {
  const jsonSchema = extractInputSchema(action.spec)
  const inputSchema = {
    '~standard': {
      version: 1 as const,
      vendor: 'zod' as const,
      validate: (data: unknown) => {
        const result = z.record(z.unknown()).safeParse(data)
        return result.success ? { value: result.data } : { issues: result.error.issues }
      },
    },
    _def: jsonSchema,
  } as never

  return {
    id: action.name,
    description: action.description,
    inputSchema,
    outputSchema: inputSchema,
    execute: async (input) => executeAction(action, input as Record<string, unknown>),
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/agent-server typecheck
```

- [ ] **Step 3: Commit**

```bash
git add platform/agent/server/src/actions/
git commit -m "feat(agent-server): OpenAPI action builder for custom agent tools"
```

---

## Task 6: Boot seeder

**Files:**
- Create: `platform/agent/server/src/agent-seeder.ts`
- Create: `platform/agent/server/src/agent-seeder.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// platform/agent/server/src/agent-seeder.test.ts
import { describe, expect, it, vi } from 'vitest'
import { seedAgentProfiles } from './agent-seeder'

const makeSql = () =>
  Object.assign(vi.fn().mockResolvedValue([]), {
    array: (a: unknown[]) => a,
  })

const SEED = {
  slug: 'planner',
  name: 'Planner Agent',
  description: 'Task management',
  instructions: 'You are a planner.',
  model: 'gpt-4o',
  toolIds: ['list_tasks'],
  workingMemoryTemplate: null,
}

describe('seedAgentProfiles', () => {
  it('inserts each seed with ON CONFLICT DO NOTHING', async () => {
    const sql = makeSql()
    await seedAgentProfiles(sql as never, [SEED])
    expect(sql).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — two calls produce 2 SQL executions total (one per seed per call)', async () => {
    const sql = makeSql()
    await seedAgentProfiles(sql as never, [SEED])
    await seedAgentProfiles(sql as never, [SEED])
    expect(sql).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run — verify fail**

```bash
pnpm --filter @seta/agent-server test:unit
```

- [ ] **Step 3: Implement**

```typescript
// platform/agent/server/src/agent-seeder.ts
type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
type SqlWithArray = DbSql & { array(arr: unknown[]): unknown[] }

export interface AgentProfileSeed {
  slug: string
  name: string
  description: string | null
  instructions: string
  model: string
  toolIds: string[]
  workingMemoryTemplate: string | null
}

export async function seedAgentProfiles(sql: SqlWithArray, seeds: AgentProfileSeed[]): Promise<void> {
  for (const p of seeds) {
    await sql`
      INSERT INTO agent.agent_profiles
        (slug, tenant_id, name, description, instructions, model, tool_ids,
         working_memory_template, status)
      VALUES
        (${p.slug}, NULL, ${p.name}, ${p.description ?? null}, ${p.instructions},
         ${p.model}, ${sql.array(p.toolIds)}, ${p.workingMemoryTemplate ?? null}, 'published')
      ON CONFLICT DO NOTHING
    `
  }
}
```

- [ ] **Step 4: Run — verify pass**

```bash
pnpm --filter @seta/agent-server test:unit
```

- [ ] **Step 5: Commit**

```bash
git add platform/agent/server/src/agent-seeder.ts platform/agent/server/src/agent-seeder.test.ts
git commit -m "feat(agent-server): seedAgentProfiles boot seeder"
```

---

## Task 7: HTTP route factory

**Files:**
- Create: `platform/agent/server/src/routes.ts`

The route factory returns a Hono app with all agent-related routes. It receives deps (toolRegistry, sql, memory, workflowEngine) via constructor injection — no module-level imports from products.

- [ ] **Step 1: Implement the route factory**

```typescript
// platform/agent/server/src/routes.ts
import type { Tool } from '@seta/agent-core'
import { run, streamKernelSSE } from '@seta/agent-core'
import type { MemoryProvider } from '@seta/agent-memory'
import type { WorkflowEngine } from '@seta/agent-workflows'
import { DomainError } from '@seta/middleware'
import { tenantContext } from '@seta/tenant'
import { Hono } from 'hono'
import { z } from 'zod'
import { loadAgentActions, resolveAgentProfile, invalidateProfileCache, interpolateInstructions, hydrateAgent } from './profile-registry.js'
import type { ToolRegistry } from './tool-registry.js'
import { buildActionTool } from './actions/build-action-tool.js'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface AgentRouterDeps {
  sql: DbSql
  toolRegistry: ToolRegistry
  memory: MemoryProvider
  workflowEngine: WorkflowEngine
}

const RunBody = z.object({
  message: z.string().min(1),
  threadId: z.string().optional(),
  timezone: z.string().default('UTC'),
})

const ProfileBody = z.object({
  slug: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
  model: z.string().min(1),
  toolIds: z.array(z.string()).default([]),
  workingMemoryTemplate: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
})

const ActionBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  spec: z.record(z.unknown()),
  auth: z.record(z.unknown()).optional(),
})

export function createAgentRouter(deps: AgentRouterDeps): Hono {
  const app = new Hono()
  const { sql, toolRegistry, memory, workflowEngine } = deps

  // ── Profile CRUD ──────────────────────────────────────────────────────────

  app.get('/agents', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const rows = await sql`
      SELECT *
      FROM agent.agent_profiles
      WHERE status = 'published'
        AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
      ORDER BY tenant_id NULLS LAST, name
    `
    return c.json({ agents: rows })
  })

  app.post('/agents', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const body = ProfileBody.parse(await c.req.json())
    const rows = await sql`
      INSERT INTO agent.agent_profiles
        (tenant_id, slug, name, description, instructions, model, tool_ids,
         working_memory_template, temperature, status)
      VALUES (
        ${tenantId}::uuid, ${body.slug ?? null}, ${body.name}, ${body.description ?? null},
        ${body.instructions}, ${body.model}, ${(sql as never as { array: (a: unknown[]) => unknown }).array(body.toolIds)},
        ${body.workingMemoryTemplate ?? null}, ${body.temperature ?? null}, 'published'
      )
      RETURNING *
    `
    return c.json(rows[0], 201)
  })

  app.get('/agents/:agentId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const row = await resolveAgentProfile(sql, tenantId, agentId)
    return c.json(row)
  })

  app.patch('/agents/:agentId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    // Reject patches on global profiles
    const existing = await sql`
      SELECT tenant_id FROM agent.agent_profiles WHERE agent_id = ${agentId}::uuid LIMIT 1
    `
    const row = existing[0] as { tenant_id: string | null } | undefined
    if (!row) throw new DomainError('agent_profile_not_found', { agentId })
    if (row.tenant_id === null) {
      return c.json({ error: 'Cannot modify global profiles' }, 403)
    }
    const body = ProfileBody.partial().parse(await c.req.json())
    await sql`
      UPDATE agent.agent_profiles SET
        name = COALESCE(${body.name ?? null}, name),
        description = COALESCE(${body.description ?? null}, description),
        instructions = COALESCE(${body.instructions ?? null}, instructions),
        model = COALESCE(${body.model ?? null}, model),
        updated_at = now()
      WHERE agent_id = ${agentId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    invalidateProfileCache(tenantId, agentId)
    return c.json({ ok: true })
  })

  app.delete('/agents/:agentId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const existing = await sql`
      SELECT tenant_id FROM agent.agent_profiles WHERE agent_id = ${agentId}::uuid LIMIT 1
    `
    const row = existing[0] as { tenant_id: string | null } | undefined
    if (!row) throw new DomainError('agent_profile_not_found', { agentId })
    if (row.tenant_id === null) return c.json({ error: 'Cannot delete global profiles' }, 403)
    await sql`
      DELETE FROM agent.agent_profiles WHERE agent_id = ${agentId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    return c.json({ ok: true })
  })

  // ── Action CRUD ───────────────────────────────────────────────────────────

  app.get('/agents/:agentId/actions', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const rows = await loadAgentActions(sql, tenantId, agentId)
    return c.json({ actions: rows })
  })

  app.post('/agents/:agentId/actions', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const body = ActionBody.parse(await c.req.json())
    const rows = await sql`
      INSERT INTO agent.agent_actions (agent_id, tenant_id, name, description, spec, auth)
      VALUES (${agentId}::uuid, ${tenantId}::uuid, ${body.name}, ${body.description},
              ${JSON.stringify(body.spec)}::jsonb, ${body.auth ? JSON.stringify(body.auth) : null}::jsonb)
      RETURNING *
    `
    return c.json(rows[0], 201)
  })

  app.patch('/agents/:agentId/actions/:actionId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { actionId } = c.req.param()
    const body = ActionBody.partial().parse(await c.req.json())
    await sql`
      UPDATE agent.agent_actions SET
        name = COALESCE(${body.name ?? null}, name),
        description = COALESCE(${body.description ?? null}, description),
        updated_at = now()
      WHERE action_id = ${actionId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    return c.json({ ok: true })
  })

  app.delete('/agents/:agentId/actions/:actionId', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { actionId } = c.req.param()
    await sql`
      DELETE FROM agent.agent_actions
      WHERE action_id = ${actionId}::uuid AND tenant_id = ${tenantId}::uuid
    `
    return c.json({ ok: true })
  })

  // ── Run (SSE) ─────────────────────────────────────────────────────────────

  app.post('/agents/:agentId/run', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const { agentId } = c.req.param()
    const body = RunBody.parse(await c.req.json())
    const profile = await resolveAgentProfile(sql, tenantId, agentId)
    const actions = await loadAgentActions(sql, tenantId, profile.agentId)
    const ctx = { timezone: body.timezone, convType: 'direct' as const }
    const agentConfig = hydrateAgent(profile, actions, ctx, toolRegistry)
    const threadId = body.threadId ?? `t:${tenantId}:direct:${Date.now()}`
    return streamKernelSSE(c, (onAbort) =>
      run({
        config: agentConfig,
        messages: [{ role: 'user', content: body.message }],
        threadId,
        memory,
        signal: onAbort,
        adapters: {} as never, // injected by apps/api
      }),
    )
  })

  // ── Threads ───────────────────────────────────────────────────────────────

  app.get('/threads', async (c) => {
    const tenantId = tenantContext.getTenantId()
    const userId = tenantContext.getUserId()
    const threads = await memory.listThreads?.({ tenantId, userId }) ?? []
    return c.json({ threads })
  })

  app.get('/threads/:threadId', async (c) => {
    const { threadId } = c.req.param()
    const messages = await memory.getThread?.(threadId) ?? []
    return c.json({ messages })
  })

  app.delete('/threads/:threadId', async (c) => {
    const { threadId } = c.req.param()
    await memory.deleteThread?.(threadId)
    return c.json({ ok: true })
  })

  // ── Workflows ─────────────────────────────────────────────────────────────

  app.get('/workflows/:runId/status', async (c) => {
    const { runId } = c.req.param()
    const status = await workflowEngine.getStatus(runId)
    return c.json({ status })
  })

  app.post('/workflows/:runId/resume', async (c) => {
    const { runId } = c.req.param()
    const body = z.object({
      action: z.enum(['confirm', 'cancel']),
      payload: z.record(z.unknown()).optional(),
    }).parse(await c.req.json())
    await workflowEngine.resume(runId, body)
    return c.json({ ok: true })
  })

  return app
}
```

> **Note:** The `adapters` passed to `run()` needs to be wired by `apps/api` (it contains the LLM adapter config). Update the `AgentRouterDeps` to include `adapters: AdapterRegistry` when wiring in Plan 5.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/agent-server typecheck
```

Fix any type errors before committing.

- [ ] **Step 3: Commit**

```bash
git add platform/agent/server/src/routes.ts
git commit -m "feat(agent-server): Hono route factory for agent CRUD, run SSE, threads, workflows"
```

---

## Task 8: Public exports + build

**Files:**
- Create: `platform/agent/server/src/index.ts`

- [ ] **Step 1: Write `index.ts`**

```typescript
// platform/agent/server/src/index.ts
export type { AgentProfileSeed } from './agent-seeder.js'
export { seedAgentProfiles } from './agent-seeder.js'
export { buildActionTool } from './actions/build-action-tool.js'
export {
  hydrateAgent,
  interpolateInstructions,
  invalidateProfileCache,
  loadAgentActions,
  resolveAgentProfile,
} from './profile-registry.js'
export type { RunContext } from './profile-registry.js'
export type { AgentActionRow, AgentProfileRow, NewAgentAction, NewAgentProfile } from './schema.js'
export { agentActions, agentProfiles, agentSchema } from './schema.js'
export type { AgentRouterDeps } from './routes.js'
export { createAgentRouter } from './routes.js'
export type { ToolRegistry } from './tool-registry.js'
export { createToolRegistry } from './tool-registry.js'
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @seta/agent-server build
```

Expected: `dist/index.js` + `dist/index.d.ts` with no errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm --filter @seta/agent-server test:unit
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add platform/agent/server/src/index.ts
git commit -m "feat(agent-server): public API exports"
```

---

*Plan 2 of 5. Next: Plans 3 + 4 — ERP modules (can be built in parallel after Plan 1 DB tables exist).*
