# PR-11: Tools Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the tools page + try-tool slice end-to-end: extend ToolDefinition with optional dryRun, createToolAdminRoutes (list + detail + try), JsonSchemaForm component, SDK methods, Studio /tools + /tools/:toolId pages with Try-it form.

**Architecture:** Tools opt into try-mode via `dryRun?: (input) => Promise<unknown>` on ToolDefinition. POST /tools/:id/try invokes it; tools without it return 405. JsonSchemaForm converts a JSON schema to a Zod parser via json-schema-to-zod, renders fields via existing Input/Select/DateRangePicker, validates inline.

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, json-schema-to-zod (new pinned dep), @seta/agent-server (extended ToolDefinition), @seta/agent-sdk (new methods), @seta/ui (Tabs from PR-8, JsonSchemaForm new, KeyValueList from PR-8, Code, Searchbar from PR-8, DataTable, StatusBadge).

---

## Phase 0 — Pin resolution

Resolve pins via `pnpm view <pkg> version` before any `pnpm add` call. CLAUDE.md "CLI-only — Unknown pin → `pnpm view <pkg> version`, propose pin first." Record each `<latest>` value as the pin used by later steps.

- [ ] **Step 0.1** — Resolve runtime pin for the new JSON-schema → Zod adapter.

  ```sh
  pnpm view json-schema-to-zod version
  ```

  Record output. Reference below as `<jsts-pin>`.

- [ ] **Step 0.2** — Re-confirm in-place pins already in workspace (no install needed; sanity only).

  ```sh
  pnpm view zod version
  pnpm view hono version
  pnpm view @hono/zod-openapi version
  ```

  Expected: zod `4.4.3`, hono `4.12.18`, `@hono/zod-openapi` `1.4.0` (matches `platform/agent/server/package.json`). If divergence: stop and ask.

---

## Phase 1 — `@seta/agent-server`: extend `ToolDefinition` with optional `dryRun`

The `Tool` type lives in `@seta/agent-core` (`platform/agent/core/src/types/tool.ts`). Per CLAUDE.md "Pre-1.0. Change all callers + delete old shape in same PR. No shims." We add an optional field — non-breaking — but we still update every call site that materially uses the type alongside.

- [ ] **Step 1.1** — Write a failing type-level + runtime test for `Tool.dryRun?` opt-in.

  Create `platform/agent/core/src/types/tool.test.ts`:

  ```ts
  import { describe, expect, expectTypeOf, it } from 'vitest'
  import type { Tool } from './tool'

  describe('Tool.dryRun', () => {
    it('is optional and accepts input → Promise<unknown>', () => {
      const t = {
        id: 'echo',
        description: 'echo',
        inputSchema: {} as never,
        outputSchema: {} as never,
        execute: async () => ({ ok: true, value: null }),
        dryRun: async (input: unknown) => ({ echoed: input }),
      } satisfies Tool
      expectTypeOf(t.dryRun).toEqualTypeOf<((input: unknown) => Promise<unknown>) | undefined>()
    })

    it('is omittable', () => {
      const t = {
        id: 'noop',
        description: 'no-op',
        inputSchema: {} as never,
        outputSchema: {} as never,
        execute: async () => ({ ok: true, value: null }),
      } satisfies Tool
      expect(t.dryRun).toBeUndefined()
    })
  })
  ```

  Run `pnpm --filter @seta/agent-core test:unit` — must fail (field does not exist yet).

- [ ] **Step 1.2** — Add the field to `Tool` in `platform/agent/core/src/types/tool.ts`.

  ```ts
  export interface Tool<TInput = unknown, TOutput = unknown> {
    id: string
    description: string
    inputSchema: StandardSchemaV1<TInput>
    outputSchema: StandardSchemaV1<TOutput>
    execute: (input: TInput, ctx: ToolExecutionContext) => Promise<ToolResult<TOutput>>
    annotations?: ToolAnnotations
    toModelOutput?: (out: TOutput) => unknown
    /**
     * Optional dry-run handler exposed via /tools/:id/try.
     * Side-effect-free: reads OK; writes return the would-be result without persisting.
     * Tools without dryRun return 405 from the try endpoint.
     */
    dryRun?: (input: TInput) => Promise<unknown>
  }
  ```

  Run `pnpm --filter @seta/agent-core test:unit` — passes.

- [ ] **Step 1.3** — Verify the surface compiles for one existing tool: `buildActionTool`.

  No code change required — `dryRun` is optional and `buildActionTool` (in `platform/agent/server/src/actions/build-action-tool.ts`) does not set it. Run:

  ```sh
  pnpm --filter @seta/agent-server typecheck
  ```

  Must succeed.

---

## Phase 2 — `@seta/agent-server`: tool admin schemas (Zod)

- [ ] **Step 2.1** — Failing test for `ToolSummary` / `ToolDetail` schema shape.

  Create `platform/agent/server/src/tools/schemas.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { ToolDetailSchema, ToolSummarySchema } from './schemas'

  describe('ToolSummarySchema', () => {
    it('parses a minimal summary', () => {
      const parsed = ToolSummarySchema.parse({
        id: 'list_tasks',
        name: 'list_tasks',
        description: 'List tasks',
        connectorId: 'ms365-planner',
        scopes: ['Tasks.Read'],
        hasDryRun: true,
      })
      expect(parsed.hasDryRun).toBe(true)
    })
  })

  describe('ToolDetailSchema', () => {
    it('requires jsonSchema and extends summary', () => {
      const parsed = ToolDetailSchema.parse({
        id: 'list_tasks',
        name: 'list_tasks',
        description: 'List tasks',
        connectorId: 'ms365-planner',
        scopes: ['Tasks.Read'],
        hasDryRun: false,
        jsonSchema: { type: 'object', properties: {}, required: [] },
        recentRunCount: 0,
      })
      expect(parsed.recentRunCount).toBe(0)
    })
  })
  ```

  Run `pnpm --filter @seta/agent-server test:unit` — fails.

- [ ] **Step 2.2** — Create `platform/agent/server/src/tools/schemas.ts`.

  ```ts
  import { z } from '@hono/zod-openapi'

  export const ToolSummarySchema = z
    .object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      connectorId: z.string().nullable(),
      scopes: z.array(z.string()),
      hasDryRun: z.boolean(),
      lastUsedAt: z.string().datetime().optional(),
    })
    .openapi('ToolSummary')

  export const ToolDetailSchema = ToolSummarySchema.extend({
    jsonSchema: z.record(z.string(), z.unknown()),
    recentRunCount: z.number().int().nonnegative(),
  }).openapi('ToolDetail')

  export const ToolListSchema = z.object({ tools: z.array(ToolSummarySchema) }).openapi('ToolList')

  export const TryToolResultSchema = z
    .object({ ok: z.boolean(), result: z.unknown() })
    .openapi('TryToolResult')

  export type ToolSummary = z.infer<typeof ToolSummarySchema>
  export type ToolDetail = z.infer<typeof ToolDetailSchema>
  export type TryToolResult = z.infer<typeof TryToolResultSchema>
  ```

  Tests pass.

---

## Phase 3 — `@seta/agent-server`: registry adapter for tool admin

The current `ToolRegistry` (`platform/agent/server/src/tool-registry.ts`) exposes only `register` / `resolve`. Admin endpoints need iteration + metadata. We extend the registry — same PR per CLAUDE.md "Change all callers + delete old shape in same PR."

- [ ] **Step 3.1** — Failing test for new `ToolRegistry.list()` and per-tool metadata fields.

  Update `platform/agent/server/src/tool-registry.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { createToolRegistry, type ToolEntry } from './tool-registry'

  const makeTool = (id: string, dryRun?: (i: unknown) => Promise<unknown>) =>
    ({
      id,
      description: `${id} desc`,
      inputSchema: { type: 'object', properties: {}, required: [] } as never,
      outputSchema: {} as never,
      execute: async () => ({ ok: true, value: null }),
      ...(dryRun ? { dryRun } : {}),
    }) as never

  describe('createToolRegistry', () => {
    it('register + resolve returns registered tools', () => {
      const reg = createToolRegistry()
      const tool = makeTool('list_tasks')
      reg.register('list_tasks', tool, { connectorId: 'ms365-planner', scopes: ['Tasks.Read'] })
      expect(reg.resolve(['list_tasks'])[0]).toBe(tool)
    })

    it('list returns metadata for every registered tool', () => {
      const reg = createToolRegistry()
      reg.register('a', makeTool('a', async (i) => i), { connectorId: 'c1', scopes: ['s1'] })
      reg.register('b', makeTool('b'), { connectorId: null, scopes: [] })
      const list = reg.list()
      expect(list.map((e: ToolEntry) => e.id).sort()).toEqual(['a', 'b'])
      expect(list.find((e) => e.id === 'a')?.hasDryRun).toBe(true)
      expect(list.find((e) => e.id === 'b')?.hasDryRun).toBe(false)
    })

    it('get returns the entry or undefined', () => {
      const reg = createToolRegistry()
      reg.register('a', makeTool('a'), { connectorId: null, scopes: [] })
      expect(reg.get('a')?.id).toBe('a')
      expect(reg.get('missing')).toBeUndefined()
    })

    it('resolve throws DomainError for unknown tool id', () => {
      const reg = createToolRegistry()
      expect(() => reg.resolve(['unknown_tool'])).toThrow()
    })
  })
  ```

  Run — fails.

- [ ] **Step 3.2** — Replace `platform/agent/server/src/tool-registry.ts`.

  ```ts
  import type { Tool } from '@seta/agent-core'
  import { DomainError } from '@seta/middleware'

  export interface ToolMetadata {
    connectorId: string | null
    scopes: string[]
  }

  export interface ToolEntry {
    id: string
    tool: Tool
    connectorId: string | null
    scopes: string[]
    hasDryRun: boolean
  }

  export interface ToolRegistry {
    register(toolId: string, tool: Tool, meta?: Partial<ToolMetadata>): void
    resolve(toolIds: string[]): Tool[]
    get(toolId: string): ToolEntry | undefined
    list(): ToolEntry[]
  }

  export function createToolRegistry(): ToolRegistry {
    const map = new Map<string, ToolEntry>()
    return {
      register(toolId, tool, meta) {
        map.set(toolId, {
          id: toolId,
          tool,
          connectorId: meta?.connectorId ?? null,
          scopes: meta?.scopes ?? [],
          hasDryRun: typeof tool.dryRun === 'function',
        })
      },
      resolve(toolIds) {
        return toolIds.map((id) => {
          const entry = map.get(id)
          if (!entry) throw new DomainError(404, `Unknown tool id: ${id}`, { detail: id })
          return entry.tool
        })
      },
      get(toolId) {
        return map.get(toolId)
      },
      list() {
        return [...map.values()]
      },
    }
  }
  ```

  Run `pnpm --filter @seta/agent-server test:unit` — passes.

- [ ] **Step 3.3** — Update callers of `register` in `apps/api/src/main.ts` that previously passed only `(id, tool)`.

  Search for `toolRegistry.register(` occurrences. The two-arg call still compiles (meta is optional) — no diff required unless the caller wants to surface scopes/connector. As a minimum confirm:

  ```sh
  grep -n "toolRegistry.register" apps/api/src/main.ts
  ```

  No code change in this step; confirms ABI compat. Typecheck:

  ```sh
  pnpm --filter @seta/api typecheck
  ```

- [ ] **Step 3.4** — Enrich at least one existing registration with metadata to exercise the new field.

  In `apps/api/src/main.ts`, after `toolRegistry` is created and planner tools are registered, locate the planner registration block. Pass connector + scopes for one tool, for example:

  ```ts
  for (const tool of plannerTools) {
    toolRegistry.register(tool.id, tool, {
      connectorId: 'ms365-planner',
      scopes: plannerConnector.requiredScopes,
    })
  }
  ```

  (Use the existing loop shape; do not duplicate registrations.) Typecheck.

---

## Phase 4 — `@seta/agent-server`: service functions `listTools` / `getTool` / `tryTool`

- [ ] **Step 4.1** — Failing test for `listTools`.

  Create `platform/agent/server/src/tools/service.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { createToolRegistry } from '../tool-registry'
  import { getTool, listTools, tryTool } from './service'

  const tool = (id: string, dryRun?: (i: unknown) => Promise<unknown>) =>
    ({
      id,
      description: `${id} desc`,
      inputSchema: { type: 'object', properties: {}, required: [] } as never,
      outputSchema: {} as never,
      execute: async () => ({ ok: true, value: null }),
      ...(dryRun ? { dryRun } : {}),
    }) as never

  describe('listTools', () => {
    it('returns ToolSummary[] sorted by name', async () => {
      const reg = createToolRegistry()
      reg.register('b', tool('b'), { connectorId: null, scopes: [] })
      reg.register('a', tool('a', async () => 1), { connectorId: 'c', scopes: ['s'] })
      const out = await listTools(reg, { tenantId: 't1' })
      expect(out.map((t) => t.id)).toEqual(['a', 'b'])
      expect(out[0].hasDryRun).toBe(true)
    })
  })

  describe('getTool', () => {
    it('returns ToolDetail with jsonSchema for known tool', async () => {
      const reg = createToolRegistry()
      reg.register('a', tool('a'), { connectorId: 'c', scopes: ['s'] })
      const detail = await getTool(reg, 'a', 't1')
      expect(detail.id).toBe('a')
      expect(detail.jsonSchema).toEqual({ type: 'object', properties: {}, required: [] })
      expect(detail.recentRunCount).toBe(0)
    })

    it('throws DomainError(404) for unknown tool', async () => {
      const reg = createToolRegistry()
      await expect(getTool(reg, 'missing', 't1')).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('tryTool', () => {
    it('invokes dryRun and returns the value', async () => {
      const reg = createToolRegistry()
      reg.register('echo', tool('echo', async (i) => ({ echoed: i })), {
        connectorId: null,
        scopes: [],
      })
      const result = await tryTool(reg, 'echo', { x: 1 }, 't1')
      expect(result).toEqual({ ok: true, result: { echoed: { x: 1 } } })
    })

    it('throws DomainError(405) when tool has no dryRun', async () => {
      const reg = createToolRegistry()
      reg.register('no_dry', tool('no_dry'), { connectorId: null, scopes: [] })
      await expect(tryTool(reg, 'no_dry', {}, 't1')).rejects.toMatchObject({ status: 405 })
    })

    it('throws DomainError(404) for unknown tool', async () => {
      const reg = createToolRegistry()
      await expect(tryTool(reg, 'missing', {}, 't1')).rejects.toMatchObject({ status: 404 })
    })
  })
  ```

  Run — fails.

- [ ] **Step 4.2** — Create `platform/agent/server/src/tools/service.ts`.

  ```ts
  import { DomainError } from '@seta/middleware'
  import type { ToolRegistry } from '../tool-registry'
  import type { ToolDetail, ToolSummary, TryToolResult } from './schemas'

  function entryToSummary(entry: ReturnType<ToolRegistry['list']>[number]): ToolSummary {
    return {
      id: entry.id,
      name: entry.tool.id,
      description: entry.tool.description,
      connectorId: entry.connectorId,
      scopes: entry.scopes,
      hasDryRun: entry.hasDryRun,
    }
  }

  function inputJsonSchema(tool: ReturnType<ToolRegistry['get']>): Record<string, unknown> {
    if (!tool) return { type: 'object', properties: {}, required: [] }
    const schema = tool.tool.inputSchema as unknown as { _def?: Record<string, unknown> }
    if (schema && typeof schema === 'object' && '_def' in schema && schema._def) return schema._def
    return { type: 'object', properties: {}, required: [] }
  }

  export async function listTools(
    registry: ToolRegistry,
    _opts: { tenantId: string },
  ): Promise<ToolSummary[]> {
    return registry
      .list()
      .map(entryToSummary)
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  export async function getTool(
    registry: ToolRegistry,
    toolId: string,
    _tenantId: string,
  ): Promise<ToolDetail> {
    const entry = registry.get(toolId)
    if (!entry) throw new DomainError(404, `Unknown tool id: ${toolId}`, { detail: toolId })
    return {
      ...entryToSummary(entry),
      jsonSchema: inputJsonSchema(entry),
      recentRunCount: 0,
    }
  }

  export async function tryTool(
    registry: ToolRegistry,
    toolId: string,
    input: unknown,
    _tenantId: string,
  ): Promise<TryToolResult> {
    const entry = registry.get(toolId)
    if (!entry) throw new DomainError(404, `Unknown tool id: ${toolId}`, { detail: toolId })
    if (typeof entry.tool.dryRun !== 'function') {
      throw new DomainError(405, `Tool ${toolId} does not support try-mode`, {
        detail: toolId,
        headers: { Allow: 'GET' },
      })
    }
    const result = await entry.tool.dryRun(input)
    return { ok: true, result }
  }
  ```

  Tests pass.

- [ ] **Step 4.3** — Confirm `DomainError` accepts a `headers` detail field.

  If `DomainError` does not currently surface `headers`, instead set the header in the route handler (Phase 5). Quick grep:

  ```sh
  grep -n "headers" platform/middleware/src/errors.ts
  ```

  If unsupported, drop the `headers` argument and rely on the route to set `Allow: GET` (Phase 5.3).

---

## Phase 5 — `@seta/agent-server`: `createToolAdminRoutes` factory

- [ ] **Step 5.1** — Failing integration-style unit test using the Hono `app.request` API.

  Create `platform/agent/server/src/tools/routes.test.ts`:

  ```ts
  import { tenantContext } from '@seta/tenant'
  import { Hono } from 'hono'
  import { describe, expect, it } from 'vitest'
  import { createToolRegistry } from '../tool-registry'
  import { createToolAdminRoutes } from './routes'

  const withTenant = async <T>(fn: () => Promise<T>) =>
    tenantContext.run({ tenantId: 't1', userId: 'u1' }, fn)

  const mountedApp = (reg = createToolRegistry()) => {
    const app = new Hono()
    app.use('*', async (c, next) => withTenant(() => next()))
    app.route('/', createToolAdminRoutes({ toolRegistry: reg }))
    return { app, reg }
  }

  const tool = (id: string, dryRun?: (i: unknown) => Promise<unknown>) =>
    ({
      id,
      description: `${id} desc`,
      inputSchema: { _def: { type: 'object', properties: {}, required: [] } } as never,
      outputSchema: {} as never,
      execute: async () => ({ ok: true, value: null }),
      ...(dryRun ? { dryRun } : {}),
    }) as never

  describe('createToolAdminRoutes', () => {
    it('GET /tools returns the registry list', async () => {
      const { app, reg } = mountedApp()
      reg.register('a', tool('a'), { connectorId: null, scopes: [] })
      const res = await app.request('/tools')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.tools).toHaveLength(1)
      expect(body.tools[0].id).toBe('a')
    })

    it('GET /tools/:id returns detail', async () => {
      const { app, reg } = mountedApp()
      reg.register('a', tool('a'), { connectorId: null, scopes: [] })
      const res = await app.request('/tools/a')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.jsonSchema).toEqual({ type: 'object', properties: {}, required: [] })
    })

    it('POST /tools/:id/try invokes dryRun', async () => {
      const { app, reg } = mountedApp()
      reg.register('echo', tool('echo', async (i) => ({ echoed: i })), {
        connectorId: null,
        scopes: [],
      })
      const res = await app.request('/tools/echo/try', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ x: 1 }),
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.result).toEqual({ echoed: { x: 1 } })
    })

    it('POST /tools/:id/try returns 405 with Allow: GET when no dryRun', async () => {
      const { app, reg } = mountedApp()
      reg.register('no_dry', tool('no_dry'), { connectorId: null, scopes: [] })
      const res = await app.request('/tools/no_dry/try', { method: 'POST', body: '{}' })
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toBe('GET')
    })
  })
  ```

  Run — fails.

- [ ] **Step 5.2** — Create `platform/agent/server/src/tools/routes.ts`.

  ```ts
  import { DomainError } from '@seta/middleware'
  import { tenantContext } from '@seta/tenant'
  import { Hono } from 'hono'
  import { z } from 'zod'
  import type { ToolRegistry } from '../tool-registry'
  import { getTool, listTools, tryTool } from './service'

  export interface ToolAdminRouterDeps {
    toolRegistry: ToolRegistry
  }

  export function createToolAdminRoutes(deps: ToolAdminRouterDeps): Hono {
    const { toolRegistry } = deps
    const app = new Hono()

    app.get('/tools', async (c) => {
      const tenantId = tenantContext.getTenantId()
      const tools = await listTools(toolRegistry, { tenantId })
      return c.json({ tools })
    })

    app.get('/tools/:id', async (c) => {
      const tenantId = tenantContext.getTenantId()
      const { id } = c.req.param()
      const detail = await getTool(toolRegistry, id, tenantId)
      return c.json(detail)
    })

    app.post('/tools/:id/try', async (c) => {
      const tenantId = tenantContext.getTenantId()
      const { id } = c.req.param()
      const entry = toolRegistry.get(id)
      if (!entry) throw new DomainError(404, `Unknown tool id: ${id}`, { detail: id })
      if (!entry.hasDryRun) {
        c.header('Allow', 'GET')
        return c.json(
          {
            type: 'about:blank',
            title: 'Method Not Allowed',
            status: 405,
            detail: `Tool ${id} does not support try-mode`,
          },
          405,
        )
      }
      const input = z.unknown().parse(await c.req.json())
      const result = await tryTool(toolRegistry, id, input, tenantId)
      return c.json(result)
    })

    return app
  }
  ```

  Tests pass.

- [ ] **Step 5.3** — Export the factory from `platform/agent/server/src/index.ts`.

  Add lines (alphabetical with existing exports):

  ```ts
  export type { ToolAdminRouterDeps } from './tools/routes'
  export { createToolAdminRoutes } from './tools/routes'
  export type { ToolDetail, ToolSummary, TryToolResult } from './tools/schemas'
  export { ToolDetailSchema, ToolListSchema, ToolSummarySchema, TryToolResultSchema } from './tools/schemas'
  export { getTool, listTools, tryTool } from './tools/service'
  ```

  Run `pnpm --filter @seta/agent-server build` — succeeds.

---

## Phase 6 — `apps/api`: mount the tool admin routes

`createToolAdminRoutes` must run inside the SSO session + tenant middleware stack (per `2026-05-15-studio-p2-master-plan.md` §7). PR-2 established the pattern; we reuse it.

- [ ] **Step 6.1** — Add the import + composition in `apps/api/src/main.ts`. Diff:

  ```diff
   import {
     createAgentRouter,
  +  createToolAdminRoutes,
     createToolRegistry,
     seedAgentProfiles,
     type ThreadStore,
   } from '@seta/agent-server'
  ```

  ```diff
   app.route('/agent', agentRouter)
  +
  +app.route(
  +  '/api',
  +  new Hono()
  +    .use('*', requireSession())
  +    .use('*', tenantMiddleware(resolveTenantFromHeader))
  +    .use('*', requireTenantMembership())
  +    .route('/', createToolAdminRoutes({ toolRegistry })),
  +)
  ```

  Use the same `requireSession` / `tenantMiddleware(resolveTenantFromHeader)` / `requireTenantMembership` chain as the other slice mounts (PR-2, PR-4..). If those helpers are not yet wired in `apps/api`, defer the mount to PR-2's already-landed scaffolding — `createToolAdminRoutes` is exported either way.

- [ ] **Step 6.2** — Smoke integration test.

  Create `apps/api/tests/integration/tools.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest'
  import { app } from '../../src/main'

  describe('GET /api/tools (smoke)', () => {
    it('responds 200 with tools array when authed + tenant resolved', async () => {
      const res = await app.request('/api/tools', {
        headers: { authorization: 'Bearer test', 'x-tenant-id': 'tenant-fixture' },
      })
      expect([200, 401, 403]).toContain(res.status)
      if (res.status === 200) {
        const body = await res.json()
        expect(Array.isArray(body.tools)).toBe(true)
      }
    })
  })
  ```

  Run `pnpm --filter @seta/api test:integration`.

- [ ] **Step 6.3** — Typecheck the app.

  ```sh
  pnpm --filter @seta/api typecheck
  ```

---

## Phase 7 — `@seta/agent-sdk`: client methods + schemas + MSW recordings

- [ ] **Step 7.1** — Add the SDK schema file.

  Create `platform/agent/sdk/src/schemas/tools.ts`:

  ```ts
  import { z } from 'zod'

  export const ToolSummarySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    connectorId: z.string().nullable(),
    scopes: z.array(z.string()),
    hasDryRun: z.boolean(),
    lastUsedAt: z.string().datetime().optional(),
  })
  export type ToolSummary = z.infer<typeof ToolSummarySchema>

  export const ToolDetailSchema = ToolSummarySchema.extend({
    jsonSchema: z.record(z.string(), z.unknown()),
    recentRunCount: z.number().int().nonnegative(),
  })
  export type ToolDetail = z.infer<typeof ToolDetailSchema>

  export const ToolListSchema = z.object({ tools: z.array(ToolSummarySchema) })
  export const TryToolResultSchema = z.object({ ok: z.boolean(), result: z.unknown() })
  export type TryToolResult = z.infer<typeof TryToolResultSchema>
  ```

- [ ] **Step 7.2** — Failing client tests.

  Append to `platform/agent/sdk/src/client/AgentClient.test.ts`:

  ```ts
  describe('AgentClient tools', () => {
    it('listTools returns parsed ToolSummary[]', async () => {
      server.use(
        http.get('https://api.test/api/tools', () =>
          HttpResponse.json({
            tools: [
              {
                id: 'list_tasks',
                name: 'list_tasks',
                description: 'List tasks',
                connectorId: 'ms365-planner',
                scopes: ['Tasks.Read'],
                hasDryRun: true,
              },
            ],
          }),
        ),
      )
      const c = new AgentClient({ baseUrl })
      const out = await c.listTools('t1')
      expect(out).toHaveLength(1)
      expect(out[0].id).toBe('list_tasks')
    })

    it('getTool returns ToolDetail', async () => {
      server.use(
        http.get('https://api.test/api/tools/list_tasks', () =>
          HttpResponse.json({
            id: 'list_tasks',
            name: 'list_tasks',
            description: 'List tasks',
            connectorId: 'ms365-planner',
            scopes: ['Tasks.Read'],
            hasDryRun: true,
            jsonSchema: { type: 'object', properties: { planId: { type: 'string' } }, required: ['planId'] },
            recentRunCount: 3,
          }),
        ),
      )
      const c = new AgentClient({ baseUrl })
      const detail = await c.getTool('list_tasks')
      expect(detail.jsonSchema).toMatchObject({ type: 'object' })
    })

    it('tryTool POSTs the input and returns the result', async () => {
      server.use(
        http.post('https://api.test/api/tools/echo/try', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ok: true, result: { echoed: body } })
        }),
      )
      const c = new AgentClient({ baseUrl })
      const out = await c.tryTool('echo', { x: 1 })
      expect(out).toEqual({ ok: true, result: { echoed: { x: 1 } } })
    })

    it('tryTool surfaces 405 as AgentClientError kind=http status=405', async () => {
      server.use(
        http.post('https://api.test/api/tools/no_dry/try', () =>
          HttpResponse.json(
            { type: 'about:blank', title: 'Method Not Allowed', status: 405 },
            { status: 405, headers: { allow: 'GET' } },
          ),
        ),
      )
      const c = new AgentClient({ baseUrl })
      await expect(c.tryTool('no_dry', {})).rejects.toMatchObject({ kind: 'http', status: 405 })
    })
  })
  ```

  Run — fails.

- [ ] **Step 7.3** — Implement the methods in `platform/agent/sdk/src/client/AgentClient.ts`.

  Add imports + methods:

  ```ts
  import {
    ToolDetailSchema,
    ToolListSchema,
    TryToolResultSchema,
    type ToolDetail,
    type ToolSummary,
    type TryToolResult,
  } from '../schemas/tools'
  ```

  Methods on `AgentClient`:

  ```ts
  async listTools(tenantId: string, init: { signal?: AbortSignal } = {}): Promise<ToolSummary[]> {
    const reqInit: { schema: typeof ToolListSchema; signal?: AbortSignal } = { schema: ToolListSchema }
    if (init.signal) reqInit.signal = init.signal
    const url = `/api/tools?tenantId=${encodeURIComponent(tenantId)}`
    const out = await request(this.opts, url, reqInit)
    return out.tools
  }

  getTool(toolId: string, init: { signal?: AbortSignal } = {}): Promise<ToolDetail> {
    const reqInit: { schema: typeof ToolDetailSchema; signal?: AbortSignal } = { schema: ToolDetailSchema }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, `/api/tools/${encodeURIComponent(toolId)}`, reqInit)
  }

  tryTool(toolId: string, input: unknown, init: { signal?: AbortSignal } = {}): Promise<TryToolResult> {
    const reqInit: {
      schema: typeof TryToolResultSchema
      method: 'POST'
      headers: Record<string, string>
      body: string
      signal?: AbortSignal
    } = {
      schema: TryToolResultSchema,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }
    if (init.signal) reqInit.signal = init.signal
    return request(this.opts, `/api/tools/${encodeURIComponent(toolId)}/try`, reqInit)
  }
  ```

  If `request` does not yet accept `method` / `body` / `headers` (only GET so far), extend its signature in the same step:

  ```sh
  cat platform/agent/sdk/src/transport/request.ts
  ```

  Add support for `method`, `body`, `headers` and forward to `fetch`. Update its tests if any.

  Run `pnpm --filter @seta/agent-sdk test:unit` — passes.

- [ ] **Step 7.4** — Re-export new types from `platform/agent/sdk/src/index.ts`.

  ```ts
  export {
    ToolDetailSchema,
    ToolListSchema,
    ToolSummarySchema,
    TryToolResultSchema,
    type ToolDetail,
    type ToolSummary,
    type TryToolResult,
  } from './schemas/tools'
  ```

  Build:

  ```sh
  pnpm --filter @seta/agent-sdk build
  ```

---

## Phase 8 — `@seta/ui`: add `json-schema-to-zod` dep

- [ ] **Step 8.1** — Add the pinned dep.

  ```sh
  pnpm --filter @seta/ui add json-schema-to-zod@<jsts-pin>
  ```

  Verify `platform/ui/package.json` shows the new line in `dependencies` (no other hand-edits — CLI only).

---

## Phase 9 — `@seta/ui`: `JsonSchemaForm` component

Reference Mastra's `playground/src/domains/tools/components/ToolExecutor.tsx` for UX shape (form on left, result panel on right). The form itself is the only thing we add to `@seta/ui`; result rendering lives in Studio.

- [ ] **Step 9.1** — Co-located failing test for primitive field rendering + Zod validation.

  Create `platform/ui/src/components/forms/JsonSchemaForm.test.tsx`:

  ```tsx
  import { fireEvent, render, screen } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { describe, expect, it, vi } from 'vitest'
  import { JsonSchemaForm } from './JsonSchemaForm'

  describe('JsonSchemaForm', () => {
    it('renders a text input for type=string', () => {
      render(
        <JsonSchemaForm
          schema={{ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }}
          onSubmit={vi.fn()}
        />,
      )
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    })

    it('renders a number input for type=number', () => {
      render(
        <JsonSchemaForm
          schema={{ type: 'object', properties: { age: { type: 'number' } } }}
          onSubmit={vi.fn()}
        />,
      )
      expect(screen.getByLabelText(/age/i)).toHaveAttribute('type', 'number')
    })

    it('renders a Select for enum', () => {
      render(
        <JsonSchemaForm
          schema={{
            type: 'object',
            properties: { color: { type: 'string', enum: ['red', 'green', 'blue'] } },
            required: ['color'],
          }}
          onSubmit={vi.fn()}
        />,
      )
      expect(screen.getByText(/color/i)).toBeInTheDocument()
    })

    it('calls onSubmit with parsed values on valid submit', async () => {
      const onSubmit = vi.fn()
      render(
        <JsonSchemaForm
          schema={{
            type: 'object',
            properties: { name: { type: 'string' }, age: { type: 'number' } },
            required: ['name', 'age'],
          }}
          onSubmit={onSubmit}
        />,
      )
      await userEvent.type(screen.getByLabelText(/name/i), 'Ada')
      await userEvent.type(screen.getByLabelText(/age/i), '36')
      fireEvent.click(screen.getByRole('button', { name: /run/i }))
      await new Promise((r) => setTimeout(r, 0))
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', age: 36 })
    })

    it('renders inline error for invalid input', async () => {
      const onSubmit = vi.fn()
      render(
        <JsonSchemaForm
          schema={{
            type: 'object',
            properties: { name: { type: 'string', minLength: 3 } },
            required: ['name'],
          }}
          onSubmit={onSubmit}
        />,
      )
      await userEvent.type(screen.getByLabelText(/name/i), 'A')
      fireEvent.click(screen.getByRole('button', { name: /run/i }))
      await new Promise((r) => setTimeout(r, 0))
      expect(onSubmit).not.toHaveBeenCalled()
      expect(screen.getByRole('alert')).toHaveTextContent(/at least 3/i)
    })

    it('round-trips a nested-object schema', async () => {
      const onSubmit = vi.fn()
      render(
        <JsonSchemaForm
          schema={{
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: { id: { type: 'string' }, age: { type: 'integer' } },
                required: ['id'],
              },
            },
            required: ['user'],
          }}
          onSubmit={onSubmit}
        />,
      )
      await userEvent.type(screen.getByLabelText(/user → id/i), 'u1')
      await userEvent.type(screen.getByLabelText(/user → age/i), '30')
      fireEvent.click(screen.getByRole('button', { name: /run/i }))
      await new Promise((r) => setTimeout(r, 0))
      expect(onSubmit).toHaveBeenCalledWith({ user: { id: 'u1', age: 30 } })
    })

    it('round-trips an array-of-primitives schema with add/remove', async () => {
      const onSubmit = vi.fn()
      render(
        <JsonSchemaForm
          schema={{
            type: 'object',
            properties: { tags: { type: 'array', items: { type: 'string' } } },
            required: ['tags'],
          }}
          onSubmit={onSubmit}
        />,
      )
      fireEvent.click(screen.getByRole('button', { name: /add tags/i }))
      await userEvent.type(screen.getByLabelText(/tags\[0\]/i), 'alpha')
      fireEvent.click(screen.getByRole('button', { name: /run/i }))
      await new Promise((r) => setTimeout(r, 0))
      expect(onSubmit).toHaveBeenCalledWith({ tags: ['alpha'] })
    })
  })
  ```

  Run `pnpm --filter @seta/ui test:unit` — fails.

- [ ] **Step 9.2** — Create `platform/ui/src/components/forms/JsonSchemaForm.tsx`.

  ```tsx
  import { jsonSchemaToZod } from 'json-schema-to-zod'
  import { Plus, Trash2 } from 'lucide-react'
  import {
    type FormEvent,
    type ReactNode,
    useMemo,
    useState,
    useCallback,
  } from 'react'
  import { z, type ZodTypeAny } from 'zod'
  import { cn } from '../../lib/cn'
  import { Button } from './Button'
  import { Input } from './Input'
  import { Select } from './Select'

  export type JsonSchema = Record<string, unknown>

  export interface JsonSchemaFormProps {
    schema: JsonSchema
    onSubmit: (value: unknown) => void
    defaultValues?: unknown
    submitLabel?: string
    disabled?: boolean
  }

  function compileZod(schema: JsonSchema): ZodTypeAny {
    const src = jsonSchemaToZod(schema, { module: 'none' })
    const factory = new Function('z', `return (${src})`) as (z: unknown) => ZodTypeAny
    return factory(z)
  }

  function get(obj: unknown, path: (string | number)[]): unknown {
    return path.reduce<unknown>((acc, k) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[String(k)]
      return undefined
    }, obj)
  }

  function set(obj: unknown, path: (string | number)[], value: unknown): unknown {
    if (path.length === 0) return value
    const [head, ...rest] = path
    const isIndex = typeof head === 'number'
    const current = (obj ?? (isIndex ? [] : {})) as Record<string, unknown> | unknown[]
    const clone: Record<string, unknown> | unknown[] = Array.isArray(current)
      ? [...current]
      : { ...current }
    ;(clone as Record<string | number, unknown>)[head as string | number] = set(
      (current as Record<string | number, unknown>)[head as string | number],
      rest,
      value,
    )
    return clone
  }

  function labelFor(path: (string | number)[]): string {
    return path.map((p) => String(p)).join(' → ')
  }

  interface FieldProps {
    schema: JsonSchema
    path: (string | number)[]
    value: unknown
    setValue: (v: unknown) => void
    required?: boolean
    error?: string
  }

  function Field({ schema, path, value, setValue, required, error }: FieldProps): ReactNode {
    const type = schema.type as string | undefined
    const id = path.join('.')
    const label = labelFor(path)
    const enumVals = schema.enum as unknown[] | undefined

    if (Array.isArray(enumVals)) {
      return (
        <FieldShell id={id} label={label} required={required} error={error}>
          <Select.Root value={(value as string) ?? ''} onValueChange={(v) => setValue(v)}>
            <Select.Trigger placeholder="Choose…" />
            <Select.Content>
              {enumVals.map((v) => (
                <Select.Item key={String(v)} value={String(v)}>
                  {String(v)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </FieldShell>
      )
    }

    if (type === 'object') {
      const props = (schema.properties as Record<string, JsonSchema>) ?? {}
      const req = new Set((schema.required as string[]) ?? [])
      return (
        <fieldset className="grid gap-3 rounded-md border border-hairline p-3">
          <legend className="text-[12px] font-medium text-ink-subtle">{label || 'root'}</legend>
          {Object.entries(props).map(([key, sub]) => (
            <Field
              key={key}
              schema={sub}
              path={[...path, key]}
              value={(value as Record<string, unknown> | undefined)?.[key]}
              setValue={(v) => setValue(set(value, [key], v))}
              required={req.has(key)}
              error={undefined}
            />
          ))}
        </fieldset>
      )
    }

    if (type === 'array') {
      const items = (schema.items as JsonSchema | undefined) ?? { type: 'string' }
      const list = (value as unknown[] | undefined) ?? []
      return (
        <div className="grid gap-2">
          <span className="text-[12px] font-medium text-ink-subtle">{label}</span>
          {list.map((entry, idx) => (
            <div key={idx} className="flex items-end gap-2">
              <div className="flex-1">
                <Field
                  schema={items}
                  path={[...path, idx]}
                  value={entry}
                  setValue={(v) => setValue(set(value, [idx], v))}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove ${label}[${idx}]`}
                onClick={() => setValue(list.filter((_, i) => i !== idx))}
              >
                <Trash2 className="size-4 stroke-[1.5]" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setValue([...list, items.type === 'object' ? {} : items.type === 'number' || items.type === 'integer' ? 0 : ''])}
          >
            <Plus className="size-4 stroke-[1.5]" /> Add {label || 'item'}
          </Button>
        </div>
      )
    }

    if (type === 'boolean') {
      return (
        <FieldShell id={id} label={label} required={required} error={error}>
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setValue(e.target.checked)}
          />
        </FieldShell>
      )
    }

    if (type === 'number' || type === 'integer') {
      return (
        <FieldShell id={id} label={label} required={required} error={error}>
          <Input
            id={id}
            type="number"
            step={type === 'integer' ? 1 : 'any'}
            value={value === undefined ? '' : (value as number)}
            onChange={(e) =>
              setValue(e.target.value === '' ? undefined : Number(e.target.value))
            }
          />
        </FieldShell>
      )
    }

    // string + formats
    const format = schema.format as string | undefined
    const inputType =
      format === 'date-time' ? 'datetime-local' : format === 'email' ? 'email' : format === 'uri' ? 'url' : 'text'
    return (
      <FieldShell id={id} label={label} required={required} error={error} hint={format}>
        <Input
          id={id}
          type={inputType}
          value={(value as string) ?? ''}
          onChange={(e) => setValue(e.target.value)}
          invalid={Boolean(error)}
        />
      </FieldShell>
    )
  }

  function FieldShell({
    id,
    label,
    required,
    error,
    hint,
    children,
  }: {
    id: string
    label: string
    required?: boolean
    error?: string
    hint?: string
    children: ReactNode
  }) {
    return (
      <label htmlFor={id} className="grid gap-1">
        <span className="text-[12px] font-medium text-ink-subtle">
          {label}
          {required ? <span className="text-error"> *</span> : null}
          {hint ? <span className="ml-2 text-ink-subtler">[{hint}]</span> : null}
        </span>
        {children}
        {error ? (
          <span role="alert" className="text-[12px] text-error">
            {error}
          </span>
        ) : null}
      </label>
    )
  }

  export function JsonSchemaForm({
    schema,
    onSubmit,
    defaultValues,
    submitLabel = 'Run',
    disabled = false,
  }: JsonSchemaFormProps) {
    const zodSchema = useMemo(() => compileZod(schema), [schema])
    const [value, setValue] = useState<unknown>(defaultValues ?? (schema.type === 'object' ? {} : undefined))
    const [errors, setErrors] = useState<Record<string, string>>({})

    const handleSubmit = useCallback(
      (e: FormEvent) => {
        e.preventDefault()
        const result = zodSchema.safeParse(value)
        if (!result.success) {
          const next: Record<string, string> = {}
          for (const issue of result.error.issues) {
            next[issue.path.join('.') || '_'] = issue.message
          }
          setErrors(next)
          return
        }
        setErrors({})
        onSubmit(result.data)
      },
      [zodSchema, value, onSubmit],
    )

    const rootError = errors._
    return (
      <form onSubmit={handleSubmit} className={cn('grid gap-4')} aria-disabled={disabled || undefined}>
        <Field
          schema={schema}
          path={[]}
          value={value}
          setValue={setValue}
          error={rootError}
        />
        {Object.entries(errors)
          .filter(([k]) => k !== '_')
          .map(([k, m]) => (
            <span key={k} role="alert" className="text-[12px] text-error">
              {k}: {m}
            </span>
          ))}
        <div>
          <Button type="submit" disabled={disabled}>
            {submitLabel}
          </Button>
        </div>
      </form>
    )
  }
  ```

  Run `pnpm --filter @seta/ui test:unit` — passes.

- [ ] **Step 9.3** — Export `JsonSchemaForm` from `platform/ui/src/index.ts`.

  Add (alphabetical):

  ```ts
  export type { JsonSchema, JsonSchemaFormProps } from './components/forms/JsonSchemaForm'
  export { JsonSchemaForm } from './components/forms/JsonSchemaForm'
  ```

  Build:

  ```sh
  pnpm --filter @seta/ui build
  ```

---

## Phase 10 — `apps/studio`: query options + mutation

PR-3 created `apps/studio/src/api/queries.ts` (TanStack Query factories). PR-8 added `Tabs`, `KeyValueList`, `Searchbar`, `SectionCard`. We assume both have landed (PR-11 declares `depends-on: PR-3, PR-8` in its description).

- [ ] **Step 10.1** — Add query factories.

  Append to `apps/studio/src/api/queries.ts`:

  ```ts
  import type { ToolDetail, ToolSummary, TryToolResult } from '@seta/agent-sdk'
  import { queryOptions } from '@tanstack/react-query'
  import { client } from './client'

  export const toolsQueryOptions = (tenantId: string) =>
    queryOptions({
      queryKey: ['tools', tenantId] as const,
      queryFn: ({ signal }): Promise<ToolSummary[]> => client.listTools(tenantId, { signal }),
    })

  export const toolQueryOptions = (toolId: string) =>
    queryOptions({
      queryKey: ['tool', toolId] as const,
      queryFn: ({ signal }): Promise<ToolDetail> => client.getTool(toolId, { signal }),
    })

  export const tryToolMutation = (toolId: string) => ({
    mutationKey: ['tool', toolId, 'try'] as const,
    mutationFn: (input: unknown): Promise<TryToolResult> => client.tryTool(toolId, input),
  })
  ```

  Typecheck:

  ```sh
  pnpm --filter @seta/studio typecheck
  ```

---

## Phase 11 — `apps/studio`: tools list page

- [ ] **Step 11.1** — Failing component test for filter + columns.

  Create `apps/studio/src/features/tools/ToolsListPage.test.tsx`:

  ```tsx
  import { HttpResponse, http } from 'msw'
  import { describe, expect, it } from 'vitest'
  import { renderWithProviders, screen, server, userEvent } from '../../test/utils'
  import { ToolsListPage } from './ToolsListPage'

  describe('ToolsListPage', () => {
    it('renders rows from the API and filters via Searchbar', async () => {
      server.use(
        http.get('*/api/tools', () =>
          HttpResponse.json({
            tools: [
              {
                id: 'list_tasks',
                name: 'list_tasks',
                description: 'List tasks',
                connectorId: 'ms365-planner',
                scopes: ['Tasks.Read'],
                hasDryRun: true,
              },
              {
                id: 'create_event',
                name: 'create_event',
                description: 'Create calendar event',
                connectorId: 'ms365-directory',
                scopes: ['Calendars.ReadWrite'],
                hasDryRun: false,
              },
            ],
          }),
        ),
      )
      renderWithProviders(<ToolsListPage tenantId="t1" />)
      expect(await screen.findByText('list_tasks')).toBeInTheDocument()
      expect(screen.getByText('create_event')).toBeInTheDocument()

      await userEvent.type(screen.getByPlaceholderText(/search tools/i), 'list')
      expect(screen.getByText('list_tasks')).toBeInTheDocument()
      expect(screen.queryByText('create_event')).not.toBeInTheDocument()
    })
  })
  ```

  Run — fails.

- [ ] **Step 11.2** — Create `apps/studio/src/features/tools/ToolsListPage.tsx`.

  ```tsx
  import type { ToolSummary } from '@seta/agent-sdk'
  import { DataTable, Searchbar, StatusBadge, type Column } from '@seta/ui'
  import { useSuspenseQuery } from '@tanstack/react-query'
  import { Link } from '@tanstack/react-router'
  import { useMemo, useState } from 'react'
  import { toolsQueryOptions } from '../../api/queries'

  export interface ToolsListPageProps {
    tenantId: string
  }

  export function ToolsListPage({ tenantId }: ToolsListPageProps) {
    const [filter, setFilter] = useState('')
    const { data: tools } = useSuspenseQuery(toolsQueryOptions(tenantId))

    const rows = useMemo(
      () =>
        tools.filter((t) =>
          filter.trim() === '' ? true : t.name.toLowerCase().includes(filter.toLowerCase()),
        ),
      [tools, filter],
    )

    const columns: Column<ToolSummary>[] = [
      {
        key: 'name',
        header: 'Name',
        render: (row) => (
          <Link
            to="/tenants/$id/tools/$toolId"
            params={{ id: tenantId, toolId: row.id }}
            className="font-medium text-ink hover:underline"
          >
            {row.name}
          </Link>
        ),
      },
      { key: 'connectorId', header: 'Connector', render: (row) => row.connectorId ?? '—' },
      {
        key: 'scopes',
        header: 'Scopes',
        render: (row) => row.scopes.length,
      },
      {
        key: 'hasDryRun',
        header: 'Try mode',
        render: (row) => (
          <StatusBadge variant={row.hasDryRun ? 'success' : 'neutral'}>
            {row.hasDryRun ? 'Available' : 'N/A'}
          </StatusBadge>
        ),
      },
    ]

    return (
      <div className="grid gap-4">
        <Searchbar value={filter} onChange={setFilter} placeholder="Search tools…" />
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </div>
    )
  }
  ```

  Tests pass.

- [ ] **Step 11.3** — Register route.

  Create `apps/studio/src/routes/_authed/tenants/$id/tools/index.tsx`:

  ```tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { ToolsListPage } from '../../../../../features/tools/ToolsListPage'
  import { toolsQueryOptions } from '../../../../../api/queries'

  export const Route = createFileRoute('/_authed/tenants/$id/tools/')({
    loader: ({ context, params }) =>
      context.queryClient.ensureQueryData(toolsQueryOptions(params.id)),
    component: function ToolsRoute() {
      const { id } = Route.useParams()
      return <ToolsListPage tenantId={id} />
    },
  })
  ```

---

## Phase 12 — `apps/studio`: tool detail page (Overview / Try it)

- [ ] **Step 12.1** — Failing tests covering both tabs + 405 disabled path.

  Create `apps/studio/src/features/tools/ToolDetailPage.test.tsx`:

  ```tsx
  import { HttpResponse, http } from 'msw'
  import { describe, expect, it } from 'vitest'
  import { renderWithProviders, screen, server, userEvent } from '../../test/utils'
  import { ToolDetailPage } from './ToolDetailPage'

  const baseDetail = {
    id: 'echo',
    name: 'echo',
    description: 'Echo back the input',
    connectorId: 'ms365-planner',
    scopes: ['Tasks.Read'],
    hasDryRun: true,
    jsonSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
    recentRunCount: 0,
  }

  describe('ToolDetailPage', () => {
    it('Overview tab renders KeyValueList + Code of jsonSchema + scope badges', async () => {
      server.use(http.get('*/api/tools/echo', () => HttpResponse.json(baseDetail)))
      renderWithProviders(<ToolDetailPage tenantId="t1" toolId="echo" />)
      expect(await screen.findByText(/Echo back the input/)).toBeInTheDocument()
      expect(screen.getByText('Tasks.Read')).toBeInTheDocument()
    })

    it('Try it tab posts to the API and renders the JSON result', async () => {
      server.use(
        http.get('*/api/tools/echo', () => HttpResponse.json(baseDetail)),
        http.post('*/api/tools/echo/try', async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json({ ok: true, result: { echoed: body } })
        }),
      )
      renderWithProviders(<ToolDetailPage tenantId="t1" toolId="echo" />)
      await userEvent.click(await screen.findByRole('tab', { name: /try it/i }))
      await userEvent.type(screen.getByLabelText(/msg/i), 'hi')
      await userEvent.click(screen.getByRole('button', { name: /run/i }))
      expect(await screen.findByText(/"echoed"/)).toBeInTheDocument()
    })

    it('Try it tab is disabled with EmptyState when hasDryRun=false', async () => {
      server.use(
        http.get('*/api/tools/echo', () =>
          HttpResponse.json({ ...baseDetail, hasDryRun: false }),
        ),
      )
      renderWithProviders(<ToolDetailPage tenantId="t1" toolId="echo" />)
      await userEvent.click(await screen.findByRole('tab', { name: /try it/i }))
      expect(screen.getByText(/no try-mode available/i)).toBeInTheDocument()
    })
  })
  ```

  Run — fails.

- [ ] **Step 12.2** — Create `apps/studio/src/features/tools/ToolDetailPage.tsx`.

  ```tsx
  import {
    Code,
    EmptyState,
    JsonSchemaForm,
    KeyValueList,
    SectionCard,
    StatusBadge,
    Tabs,
  } from '@seta/ui'
  import { useMutation, useSuspenseQuery } from '@tanstack/react-query'
  import { useState } from 'react'
  import { toolQueryOptions, tryToolMutation } from '../../api/queries'

  export interface ToolDetailPageProps {
    tenantId: string
    toolId: string
  }

  export function ToolDetailPage({ toolId }: ToolDetailPageProps) {
    const { data: tool } = useSuspenseQuery(toolQueryOptions(toolId))
    const [result, setResult] = useState<unknown>(null)
    const mut = useMutation({
      ...tryToolMutation(toolId),
      onSuccess: (res) => setResult(res.result),
    })

    return (
      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
          <Tabs.Trigger value="try">Try it</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="overview">
          <div className="grid gap-4">
            <SectionCard title="Metadata">
              <KeyValueList
                entries={[
                  { key: 'id', value: tool.id, copyable: true },
                  { key: 'name', value: tool.name },
                  { key: 'description', value: tool.description },
                  { key: 'connector', value: tool.connectorId ?? '—' },
                  { key: 'try-mode', value: tool.hasDryRun ? 'available' : 'unavailable' },
                  { key: 'recent runs', value: String(tool.recentRunCount) },
                ]}
              />
            </SectionCard>
            <SectionCard title="Required scopes">
              <ul className="flex flex-wrap gap-2">
                {tool.scopes.map((s) => (
                  <li key={s}>
                    <StatusBadge variant="info">{s}</StatusBadge>
                  </li>
                ))}
                {tool.scopes.length === 0 ? (
                  <li className="text-ink-subtle">No scopes declared.</li>
                ) : null}
              </ul>
            </SectionCard>
            <SectionCard title="Input JSON schema">
              <Code lang="json">{JSON.stringify(tool.jsonSchema, null, 2)}</Code>
            </SectionCard>
          </div>
        </Tabs.Content>

        <Tabs.Content value="try">
          {tool.hasDryRun ? (
            <div className="grid gap-4">
              <JsonSchemaForm
                schema={tool.jsonSchema}
                submitLabel="Run"
                disabled={mut.isPending}
                onSubmit={(input) => mut.mutate(input)}
              />
              {result !== null ? (
                <SectionCard title="Result">
                  <Code lang="json">{JSON.stringify(result, null, 2)}</Code>
                </SectionCard>
              ) : null}
              {mut.error ? (
                <SectionCard title="Error">
                  <Code lang="json">{JSON.stringify(mut.error, null, 2)}</Code>
                </SectionCard>
              ) : null}
            </div>
          ) : (
            <EmptyState
              title="No try-mode available"
              description="This tool has not opted in to dry-run. Add a dryRun handler to its ToolDefinition to enable it."
            />
          )}
        </Tabs.Content>
      </Tabs>
    )
  }
  ```

  Run tests — pass.

- [ ] **Step 12.3** — Register the route.

  Create `apps/studio/src/routes/_authed/tenants/$id/tools/$toolId.tsx`:

  ```tsx
  import { createFileRoute } from '@tanstack/react-router'
  import { ToolDetailPage } from '../../../../../features/tools/ToolDetailPage'
  import { toolQueryOptions } from '../../../../../api/queries'

  export const Route = createFileRoute('/_authed/tenants/$id/tools/$toolId')({
    loader: ({ context, params }) =>
      context.queryClient.ensureQueryData(toolQueryOptions(params.toolId)),
    component: function ToolDetailRoute() {
      const { id, toolId } = Route.useParams()
      return <ToolDetailPage tenantId={id} toolId={toolId} />
    },
  })
  ```

---

## Phase 13 — AgentPanel context — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel` (master plan §0). There is no `apps/studio/src/agentContext.ts` or `apps/studio/src/nav/agentContext.ts` to extend for `/tools` or `/tools/:toolId`. The `'tools' | 'tool-detail'` `AgentContext['page']` union values remain reserved in `@seta/ui` for OTHER Workspace modules.

---

## Phase 14 — E2E

- [ ] **Step 14.1** — Add `/tests/e2e/studio/tools.spec.ts`.

  ```ts
  import { expect, test } from '@playwright/test'

  test('studio /tools → pick a dry-run tool → Try it → see JSON result', async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name=email]', 'admin@seta.test')
    await page.click('button[type=submit]')
    await page.waitForURL('**/tenants')

    await page.getByRole('link', { name: /acme/i }).click()
    await page.getByRole('link', { name: /^tools$/i }).click()
    await expect(page.getByRole('heading', { name: /tools/i })).toBeVisible()

    const row = page.getByRole('row').filter({ hasText: /Available/ }).first()
    await row.getByRole('link').click()

    await page.getByRole('tab', { name: /try it/i }).click()
    const firstField = page.locator('form input').first()
    await firstField.fill('test-input')
    await page.getByRole('button', { name: /run/i }).click()

    await expect(page.getByText(/"ok": true/)).toBeVisible()
  })
  ```

  Run:

  ```sh
  pnpm test:e2e --grep "tools"
  ```

---

## Phase 15 — SCOPE docs

- [ ] **Step 15.1** — Update `platform/agent/server/SCOPE.md`.

  Append a section noting:

  - `createToolAdminRoutes` exposes `GET /tools`, `GET /tools/:id`, `POST /tools/:id/try`.
  - `Tool.dryRun?: (input) => Promise<unknown>` is opt-in. Absent ⇒ POST `/tools/:id/try` returns HTTP 405 with `Allow: GET`.
  - `ToolRegistry.register(id, tool, { connectorId, scopes })` is the new shape; the two-arg form remains compatible.

- [ ] **Step 15.2** — Update `apps/api/SCOPE.md`.

  Document the new `/api/tools*` mount: requires session + tenant membership; returns RFC 7807 problems on 401/403/404/405.

- [ ] **Step 15.3** — Update `apps/studio/SCOPE.md`.

  Document the `/tenants/:id/tools` and `/tenants/:id/tools/:toolId` routes and the `Try it` flow.

---

## Phase 16 — Demo + verification

- [ ] **Step 16.1** — Verify package builds + types + tests.

  ```sh
  pnpm --filter @seta/agent-core test:unit
  pnpm --filter @seta/agent-server test:unit
  pnpm --filter @seta/agent-sdk test:unit
  pnpm --filter @seta/ui test:unit
  pnpm --filter @seta/studio test:unit
  pnpm --filter @seta/api test:integration
  pnpm typecheck
  pnpm lint
  ```

  All green.

- [ ] **Step 16.2** — Manual demo: confirm end-to-end.

  ```sh
  pnpm db:up
  pnpm --filter @seta/api dev &
  pnpm --filter @seta/studio dev
  ```

  Visit `http://localhost:5173`, log in, pick a tenant, navigate to **Tools**, click any row whose **Try mode** badge is `Available`, switch to the **Try it** tab, fill the form, click **Run**, and confirm the JSON result panel renders the dryRun output.

  Then pick a tool whose badge is `N/A`, switch to **Try it**, and confirm the `EmptyState` with explainer is shown (no form, no Run button).

- [ ] **Step 16.3** — Pre-merge verification (per CLAUDE.md `superpowers:verification-before-completion`).

  - All test commands above pass.
  - `pnpm lint` clean.
  - `pnpm typecheck` clean.
  - Manual demo exercised once for both dryRun-enabled and dryRun-absent tools.
  - No process metadata in source comments (no PR / plan / ticket IDs leaked into `.ts` / `.tsx`).
  - Changeset added per CLAUDE.md "Changeset required for every change to a published (`private: false`) package." `@seta/agent-core`, `@seta/agent-server`, `@seta/agent-sdk`, `@seta/ui` are all `private: true` today (see their `package.json`); no changeset needed unless that changes. Studio and api are private apps — no changeset.

---
