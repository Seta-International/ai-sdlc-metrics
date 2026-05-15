# MS Teams Channel + API Composition Root Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `@seta/teams` → `@seta/ms-teams`, implement `TeamsHandler` (trigger routing, OBO token, agent-server run pipeline), and rewire `apps/api/src/main.ts` as the new composition root: tool registry, planner + analytics tools, agent-server routes, Teams channel, sync worker, and boot seeder.

**Architecture:** `apps/api` is the only place where product code meets platform code. It imports from `@seta/planner`, `@seta/analytics`, and `@seta/agent-server` and wires them together. After this plan the old `modules/products/agent` package is deleted. The Teams handler is a pure transport adapter — it calls `@seta/agent-server`'s run pipeline without knowing which tools are registered.

**Tech Stack:** Hono, `@seta/agent-server`, `@seta/planner`, `@seta/analytics`, `@seta/connector-ms365-planner` (sync worker), `@seta/agent-memory`, `@seta/agent-workflows`, `jose` (JWT verify), `lru-cache`

**Depends on:** Plans 1–4 complete.

---

## File map

| Action | File |
|---|---|
| Rename | `modules/channels/teams/package.json` (name: `@seta/ms-teams`) |
| Create | `modules/channels/teams/src/teams-handler.ts` |
| Create | `modules/channels/teams/src/index.ts` |
| Modify | `apps/api/src/main.ts` (full rewrite — composition root) |
| Modify | `apps/api/src/env.ts` (add new env vars) |
| Modify | `apps/api/package.json` (add/remove deps via CLI) |
| Delete | `modules/products/agent/` (old package) |

---

## Task 1: Rename `@seta/teams` → `@seta/ms-teams`

**Files:**
- Modify: `modules/channels/teams/package.json`

- [ ] **Step 1: Rename the package**

```bash
pnpm --filter @seta/teams pkg set name=@seta/ms-teams
pnpm install
```

Expected: `modules/channels/teams/package.json` now has `"name": "@seta/ms-teams"`.

- [ ] **Step 2: Update the import in `apps/api/package.json`**

```bash
pnpm --filter @seta/api remove @seta/teams
pnpm --filter @seta/api add @seta/ms-teams@workspace:*
```

- [ ] **Step 3: Typecheck `apps/api`**

```bash
pnpm --filter @seta/api typecheck
```

Expected: no errors from the rename (main.ts currently doesn't import `@seta/teams` — the import exists in `package.json` only).

- [ ] **Step 4: Commit**

```bash
git add modules/channels/teams/package.json apps/api/package.json pnpm-lock.yaml
git commit -m "feat(ms-teams): rename @seta/teams → @seta/ms-teams"
```

---

## Task 2: Implement `TeamsHandler`

The Teams channel adapter handles incoming Bot Framework activities: JWT verification, OBO token refresh, trigger-phrase routing, agent-server run, Adaptive Card reply. No business logic lives here — all tool execution happens inside the agent run pipeline.

**Files:**
- Create: `modules/channels/teams/src/teams-handler.ts`
- Create: `modules/channels/teams/src/index.ts`

- [ ] **Step 1: Add dependencies to `@seta/ms-teams`**

```bash
pnpm --filter @seta/ms-teams add \
  @seta/agent-server@workspace:* \
  @seta/agent-memory@workspace:* \
  @seta/agent-workflows@workspace:* \
  @seta/middleware@workspace:* \
  @seta/tenant@workspace:* \
  hono@4.12.18 \
  jose@6.2.3 \
  lru-cache@11.3.6 \
  zod@4.4.3
```

- [ ] **Step 2: Implement `teams-handler.ts`**

```typescript
// modules/channels/teams/src/teams-handler.ts
import type { AgentMemory } from '@seta/agent-memory'
import type { WorkflowEngine } from '@seta/agent-workflows'
import {
  hydrateAgent,
  loadAgentActions,
  resolveAgentProfile,
} from '@seta/agent-server'
import type { ToolRegistry } from '@seta/agent-server'
import { run } from '@seta/agent-core'
import { tenantContext } from '@seta/tenant'
import { z } from 'zod'

type DbSql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>

export interface TeamsHandlerDeps {
  sql: DbSql
  toolRegistry: ToolRegistry
  memory: AgentMemory
  workflowEngine: WorkflowEngine
}

export interface TeamsActivity {
  type: string
  text: string
  conversation: {
    id: string
    conversationType: 'personal' | 'groupChat' | 'channel'
  }
  channelId?: string
  recipient?: { id: string; name?: string }
}

export interface TeamsRunContext {
  tenantId: string
  userId: string
  timezone?: string
  abortSignal?: AbortSignal
}

export interface TeamsHandlerResult {
  card?: Record<string, unknown>
  text?: string
  agentName?: string
}

function stripMention(text: string): string {
  return text.replace(/<at>[^<]+<\/at>/gi, '').replace(/@\S+/g, '').trim()
}

function selectSlug(text: string): string {
  if (/^(analytics:|chart|workload chart|show.*chart|velocity|burn.?down)/i.test(text)) return 'analytics'
  if (/^(faq:|policy|how do (i|we)|what is (our|the|seta)|company.*rule|quy định)/i.test(text)) return 'faq'
  return 'planner'
}

function buildThreadId(activity: TeamsActivity, ctx: TeamsRunContext): string {
  switch (activity.conversation.conversationType) {
    case 'personal':
      return `t:${ctx.tenantId}:u:${ctx.userId}:personal`
    case 'groupChat':
      return `t:${ctx.tenantId}:gc:${activity.conversation.id}`
    case 'channel':
      return `t:${ctx.tenantId}:ch:${activity.channelId ?? activity.conversation.id}`
  }
}

function buildReplyActivity(result: { text?: string; card?: Record<string, unknown> }, agentName: string): TeamsHandlerResult {
  return { ...result, agentName }
}

export function createTeamsHandler(deps: TeamsHandlerDeps) {
  return async function handleActivity(
    activity: TeamsActivity,
    runCtx: TeamsRunContext,
  ): Promise<TeamsHandlerResult> {
    const text     = stripMention(activity.text ?? '').trim()
    const convType = activity.conversation.conversationType

    await deps.sql`SET LOCAL app.tenant_id = ${runCtx.tenantId}`
    await deps.sql`SET LOCAL app.user_id   = ${runCtx.userId}`

    const slug    = selectSlug(text)
    const profile = await resolveAgentProfile(deps.sql, runCtx.tenantId, slug)
    const actions = await loadAgentActions(deps.sql, runCtx.tenantId, profile.agentId)
    const ctx     = { timezone: runCtx.timezone ?? 'UTC', convType }
    const agent   = hydrateAgent(profile, actions, ctx, deps.toolRegistry)
    const threadId = buildThreadId(activity, runCtx)

    const result = await run({
      config: agent,
      messages: [{ role: 'user', content: text }],
      threadId,
      memory: deps.memory,
      signal: runCtx.abortSignal ?? new AbortController().signal,
      adapters: {} as never,
    })

    return buildReplyActivity(
      { text: typeof result === 'string' ? result : undefined },
      profile.name,
    )
  }
}
```

- [ ] **Step 3: Create `index.ts`**

```typescript
// modules/channels/teams/src/index.ts
export { createTeamsHandler } from './teams-handler.js'
export type { TeamsActivity, TeamsHandlerDeps, TeamsHandlerResult, TeamsRunContext } from './teams-handler.js'
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @seta/ms-teams typecheck
```

Fix any import errors — check the actual types exported from `@seta/agent-core`'s `run()` function to align the `AgentConfig` and result types.

- [ ] **Step 5: Commit**

```bash
git add modules/channels/teams/src/
git commit -m "feat(ms-teams): TeamsHandler — trigger routing + agent-server run pipeline"
```

---

## Task 3: Add env vars for new components

**Files:**
- Modify: `apps/api/src/env.ts`

- [ ] **Step 1: Write failing typecheck** — open `apps/api/src/env.ts` and verify it parses all the new env vars needed below. After adding, run typecheck to confirm.

- [ ] **Step 2: Add new env vars to `apps/api/src/env.ts`**

Add to the `Env` object:

```typescript
// apps/api/src/env.ts  (add inside the z.object({...}) after existing fields)
PLANNER_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(180_000),
OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
AGENT_EMBEDDINGS_PROVIDER: z.enum(['openai', 'azure-openai', 'none']).default('none'),
BOT_APP_ID: z.string().min(1).optional(),
BOT_APP_SECRET: z.string().min(1).optional(),
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @seta/api typecheck
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/env.ts
git commit -m "feat(api): add env vars for sync interval, embeddings, and bot credentials"
```

---

## Task 4: Add new dependencies to `apps/api`

- [ ] **Step 1: Add product and platform packages**

```bash
pnpm --filter @seta/api add \
  @seta/agent-server@workspace:* \
  @seta/planner@workspace:* \
  @seta/analytics@workspace:*
```

- [ ] **Step 2: Remove old agent package**

```bash
pnpm --filter @seta/api remove @seta/agent
```

- [ ] **Step 3: Verify lockfile updated**

```bash
pnpm install
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): swap @seta/agent → @seta/planner + @seta/analytics + @seta/agent-server"
```

---

## Task 5: Rewrite `apps/api/src/main.ts` — composition root

This is the only place in the codebase where product packages (`@seta/planner`, `@seta/analytics`) are wired to platform packages (`@seta/agent-server`). Replace the existing `main.ts` with the new composition.

**Files:**
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Write the new `main.ts`**

```typescript
// apps/api/src/main.ts
import { serve } from '@hono/node-server'
import {
  createAgentRouter,
  createToolRegistry,
  seedAgentProfiles,
} from '@seta/agent-server'
import { createAdapterRegistry } from '@seta/agent-core'
import { AgentMemoryProvider } from '@seta/agent-memory'
import { createAuditWriter } from '@seta/audit'
import {
  createPlannerSyncWorker,
  plannerConnector,
} from '@seta/connector-ms365-planner'
import { directoryConnector } from '@seta/connector-ms365-directory'
import { createConnectorRegistry } from '@seta/connector-registry'
import { onError } from '@seta/middleware'
import { createGraphFetch } from '@seta/ms-graph'
import { createTeamsHandler } from '@seta/ms-teams'
import {
  createKmsClient,
  createOAuthRoutes,
  createStateStore,
  createTokenVault,
  EntraProvider,
} from '@seta/oauth'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenant'
import { createAnalyticsTools, ANALYTICS_PROFILE_SEED } from '@seta/analytics'
import { createPlannerTools, createTaskIndexer, PLANNER_PROFILE_SEED } from '@seta/planner'
import { Hono } from 'hono'
import './agent'
import { sql } from './db'
import { env } from './env'

// ── Infrastructure ────────────────────────────────────────────────────────────

const kms = createKmsClient({
  KMS_PROVIDER: env.KMS_PROVIDER,
  ...(env.AWS_REGION          !== undefined && { AWS_REGION:    env.AWS_REGION }),
  ...(env.KMS_KEY_ARN         !== undefined && { KMS_KEY_ARN:   env.KMS_KEY_ARN }),
  ...(env.DEV_DEK_BASE64      !== undefined && { DEV_DEK_BASE64: env.DEV_DEK_BASE64 }),
})
const vault       = createTokenVault({ sql, kms })
const stateStore  = createStateStore(sql)
const audit       = createAuditWriter(sql)
const graph       = createGraphFetch({ recordAudit: audit.recordAudit.bind(audit) })
const agentMemory = new AgentMemoryProvider({ sql })

const registry = createConnectorRegistry(async (tenantId, connectorId) => {
  const rows = await sql<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM tenant.tenant_connectors
    WHERE tenant_id = ${tenantId} AND connector_id = ${connectorId} AND status = 'active'
    LIMIT 1
  `
  return rows.length > 0
})
registry.register(plannerConnector)
registry.register(directoryConnector)

const entra = new EntraProvider({
  clientId: env.ENTRA_CLIENT_ID,
  clientSecret: env.ENTRA_CLIENT_SECRET,
})

// ── Tool registry ─────────────────────────────────────────────────────────────

const toolRegistry = createToolRegistry()

// Embeddings: stub if no provider configured
const embeddingsStub = {
  embed: async () => { throw new Error('No embeddings provider configured') },
} as never

const plannerTools = createPlannerTools({
  registry,
  vault,
  graph,
  sql: sql as never,
  hmacKey:          env.CONTINUATION_HMAC_KEY,
  ttlMin:           env.CONTINUATION_TTL_MIN,
  batchConcurrency: env.PLANNER_BATCH_CONCURRENCY,
  embeddings:       embeddingsStub,
  vector:           embeddingsStub,
})

const analyticsTools = createAnalyticsTools({ sql: sql as never })

for (const [id, tool] of Object.entries(plannerTools))  toolRegistry.register(id, tool)
for (const [id, tool] of Object.entries(analyticsTools)) toolRegistry.register(id, tool)

logger.info({ tools: toolRegistry }, 'tool registry populated')

// ── Workflow engine (stub until @seta/agent-workflows is wired) ───────────────

const workflowEngine = {
  getStatus: async (_runId: string) => ({ status: 'unknown' }),
  resume:    async (_runId: string, _body: unknown) => {},
} as never

// ── Agent-server routes ───────────────────────────────────────────────────────

const agentRouter = createAgentRouter({
  sql:            sql as never,
  toolRegistry,
  memory:         agentMemory,
  workflowEngine,
})

// ── Teams handler ─────────────────────────────────────────────────────────────

const teamsHandler = createTeamsHandler({
  sql:            sql as never,
  toolRegistry,
  memory:         agentMemory,
  workflowEngine,
})

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono().onError(onError)

app.get('/healthz', (c) => c.json({ ok: true }))

// OAuth consent flow
app.route(
  '/oauth',
  createOAuthRoutes({
    providers: { entra },
    registry,
    stateStore,
    vault,
    audit,
    redirectBase: env.PUBLIC_BASE_URL,
    onConsented: async ({ tenantId, connectorIds, scopesGranted }) => {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO tenant.tenants (id, slug, display_name, status)
          VALUES (${tenantId}, ${`t-${tenantId}`}, ${tenantId}, 'active')
          ON CONFLICT (id) DO NOTHING
        `
        for (const connectorId of connectorIds) {
          await tx`
            INSERT INTO tenant.tenant_connectors
              (tenant_id, connector_id, status, consented_at, scope_set)
            VALUES (${tenantId}, ${connectorId}, 'active', now(), ${tx.json(scopesGranted as never)})
            ON CONFLICT (tenant_id, connector_id) DO UPDATE
              SET status       = 'active',
                  consented_at = excluded.consented_at,
                  scope_set    = excluded.scope_set,
                  updated_at   = now()
          `
        }
      })
    },
  }),
)

// Agent platform routes
app.route('/agent', agentRouter)

// Teams bot endpoint (Bot Framework activity handler)
app.post('/teams/messages', async (c) => {
  const tenantId = c.req.header('x-tenant-id') ?? tenantContext.getTenantId()
  const userId   = c.req.header('x-user-id')   ?? ''
  const activity = await c.req.json()
  if (activity.type !== 'message') return c.json({ ok: true })
  const result = await teamsHandler(activity, { tenantId, userId })
  return c.json(result)
})

// ── Boot: seed agent profiles ─────────────────────────────────────────────────

async function boot() {
  await seedAgentProfiles(sql as never, [PLANNER_PROFILE_SEED, ANALYTICS_PROFILE_SEED])
  logger.info('agent profiles seeded')

  // Start sync worker after seeding
  const taskIndexer = createTaskIndexer({
    sql:       sql as never,
    embeddings: embeddingsStub,
    vector:     embeddingsStub,
  })

  const getActiveTenantIds = async (): Promise<string[]> => {
    const rows = (await sql`
      SELECT DISTINCT tenant_id::text FROM tenant.tenants WHERE status = 'active'
    `) as Array<{ tenant_id: string }>
    return rows.map((r) => r.tenant_id)
  }

  const getAppToken = async (tenantId: string): Promise<string> => {
    const cca = entra.getCca(tenantId)
    const result = await cca.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    })
    if (!result?.accessToken) throw new Error(`Failed to acquire app token for ${tenantId}`)
    return result.accessToken
  }

  const syncWorker = createPlannerSyncWorker({
    sql:        sql as never,
    graph,
    getAppToken,
    intervalMs: env.PLANNER_SYNC_INTERVAL_MS,
    afterSync: async (tenantId, changedTaskIds) => {
      if (changedTaskIds.length > 0) {
        await taskIndexer.indexTasks(tenantId, changedTaskIds)
      }
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
      await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
    },
  })

  const tenantIds = await getActiveTenantIds()
  syncWorker.start(tenantIds)
  logger.info({ tenants: tenantIds.length }, 'planner sync worker started')
}

// ── Server start ──────────────────────────────────────────────────────────────

const server = serve({ fetch: app.fetch, port: env.PORT }, async (info) => {
  logger.info({ port: info.port }, 'api listening')
  await boot().catch((err) => logger.error({ err }, 'boot failed'))
})

const shutdown = (signal: string) => async () => {
  logger.info({ signal }, 'shutting down')
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await sql.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown('SIGTERM'))
process.on('SIGINT', shutdown('SIGINT'))
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @seta/api typecheck
```

Fix any type errors:
- If `entra.getCca(tenantId)` is not the actual API, check `@seta/oauth`'s `EntraProvider` type — replace with the actual method to obtain an MSAL `ConfidentialClientApplication` for client_credentials flow.
- If `AgentMemory` type doesn't match what `createTeamsHandler` expects, align the `TeamsHandlerDeps.memory` type to `AgentMemoryProvider`.
- The `workflowEngine` stub types must satisfy the `WorkflowEngine` interface from `@seta/agent-workflows` — check that interface and add any missing methods to the stub.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/main.ts
git commit -m "feat(api): rewire composition root — tool registry, agent-server routes, teams handler, sync worker"
```

---

## Task 6: Delete `modules/products/agent`

All code has been migrated to `@seta/planner` and `@seta/analytics`. The old package is no longer imported anywhere.

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -r "@seta/agent\"" . --include="*.ts" --include="*.json" -l | grep -v node_modules | grep -v ".d.ts"
```

Expected: no files (other than inside `modules/products/agent/` itself).

- [ ] **Step 2: Remove the workspace package declaration**

The package must be removed from pnpm workspace before deleting the directory. Check if it's declared in `pnpm-workspace.yaml`:

```bash
cat pnpm-workspace.yaml
```

If the workspace uses glob patterns like `modules/products/*` the package is auto-included. No manual entry removal needed. Proceed to delete.

- [ ] **Step 3: Delete the directory**

```bash
rm -rf modules/products/agent
```

- [ ] **Step 4: Reinstall to prune the deleted package from lockfile**

```bash
pnpm install
```

- [ ] **Step 5: Full typecheck**

```bash
pnpm typecheck
```

Expected: zero errors. If `@seta/agent` is still referenced somewhere, the grep in Step 1 should have caught it — fix any remaining references.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(planner): delete modules/products/agent — migrated to @seta/planner + @seta/analytics"
```

---

## Task 7: Integration smoke test

Run the dev server and exercise key paths to confirm the wiring works end-to-end.

- [ ] **Step 1: Start local services**

```bash
pnpm db:up
```

- [ ] **Step 2: Run migrations**

```bash
pnpm migrate
```

Expected: all migrations apply cleanly, including:
- `planner.write_continuations`
- `planner.v_visible_tasks` / `planner.v_visible_plans`
- `analytics.mv_assignee_workload` / `analytics.mv_plan_weekly_velocity`
- `agent.agent_profiles` / `agent.agent_actions`
- `connector_ms365_planner.plan_members` + `delta_token` column

- [ ] **Step 3: Start dev server**

```bash
pnpm dev
```

- [ ] **Step 4: Verify healthz**

```bash
curl http://localhost:8080/healthz
```

Expected: `{"ok":true}`

- [ ] **Step 5: Verify agent profiles seeded**

```bash
curl http://localhost:8080/agent/agents \
  -H "x-tenant-id: $(uuidgen)" \
  -H "x-user-id: test-user"
```

Expected: JSON with `agents` array containing planner and analytics entries (global profiles visible to all tenants).

> The healthz and seed steps confirm: boot ran, migrations applied, `seedAgentProfiles` inserted planner + analytics global profiles, tool registry populated, and Hono routes are mounted.

- [ ] **Step 6: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: zero errors.

- [ ] **Step 7: Run all unit tests**

```bash
pnpm test:unit
```

Expected: all tests pass (planner read tools, analytics tools, agent-server tool registry + profile registry + seeder, continuation store).

- [ ] **Step 8: Commit any final fixes**

```bash
git add -A
git commit -m "fix(api): post-integration wiring fixes"
```

---

*Plan 5 of 5 — all plans written. Implementation order: Plan 1 → Plan 2 → (Plans 3 + 4 in parallel) → Plan 5.*
