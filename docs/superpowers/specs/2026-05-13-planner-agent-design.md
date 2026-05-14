# Planner Agent + Analytics Agent — Design Spec

**Date:** 2026-05-13  
**Revised:** 2026-05-14 — DB-driven agent profiles + Agent CRUD API + ERP-module architecture  
**Scope:** `platform/agent/server` (new) · `modules/products/planner` (ERP Module #1) · `modules/products/analytics` (ERP Module #2) · `modules/channels/teams` (Channel #1) · `modules/connectors/ms365-planner` (sync extension)  
**Status:** Approved for implementation  
**WBS coverage:** EP-09 (partial), EP-10, EP-11, EP-13.5, EP-13.6, EP-14.3

---

## 1. Goals & Scope

The Planner Agent and Analytics Agent are the first two agents in the SETA ERP system. Each lives in its own product module (`@seta/planner`, `@seta/analytics`). The shared agent platform infrastructure lives in `platform/agent/server` (`@seta/agent-server`). Teams is the first user-facing channel (`@seta/teams`). The FAQ Agent is covered in a separate spec.

**In scope:**
- DB-first task reads — delta-poll sync, no per-request Graph calls on reads
- Intra-tenant permission filtering: plan membership + manager hierarchy
- **Planner Agent** — T1 tools (task CRUD, plan management), T2 tools (project status, 1:1 prep, analytics DSL), semantic search, write workflows, Adaptive Cards for task list / detail / write preview / workload / scope denial
- **Analytics Agent** — three aggregation tools (`workload_by_assignee`, `tasks_by_status`, `tasks_by_plan`), chart-card Adaptive Card rendering (`chart-ybar.ts`), Vega-Lite bar chart embedded in Teams card
- Three workflows: bulk update, client report with review; capacity check inside preview tool
- Bilingual system prompts (EN / VN / EN-VN mix, LLM-native)
- Teams handler with trigger-phrase routing across Planner / Analytics / FAQ
- HTTP routes mounted at `/agent`
- Materialized views for analytics performance
- Task embedding pipeline for semantic search
- **DB-driven agent profiles** — `agent.agent_profiles` table stores instructions, model, tool IDs, and working memory template; boot seeder inserts global defaults; per-tenant overrides shadow globals
- **OpenAPI Actions** — `agent.agent_actions` table lets tenants attach custom OpenAPI-spec tools to their agents
- **Agent CRUD API** — REST endpoints for managing agent profiles and actions

**Out of scope (P2):**
- Full RBAC (client-confidentiality flags, PM cross-project rules, CEO elevate mode)
- Scheduled proactive digests
- SharePoint RAG corpus sync
- MCP server exposure
- FAQ Agent (separate spec)
- Agent studio / visual builder (later phase — see Mastra playground reference)
- Versioned profile history (future addition once studio ships)

---

## 2. Architecture Overview

### 2.1 Package layout

```
platform/agent/
  core/     @seta/agent-core         run loop, kernel, streamKernelSSE, testkit
  memory/   @seta/agent-memory       thread + working memory persistence
  server/   @seta/agent-server       ← NEW  (mirrors @mastra/server)
              DB schema: agent.agent_profiles, agent.agent_actions
              Profile resolver + LRU cache + agent hydrator
              Tool registry interface (injectable by apps/api)
              Boot seeder runner
              Hono route factory: agent CRUD, run (SSE), threads, workflows

modules/
  channels/
    teams/  @seta/teams              Channel #1 — first user interface
              TeamsHandler: trigger routing, OBO token, Adaptive Card reply
              Calls @seta/agent-server run pipeline; no business logic here

  connectors/
    ms365-planner/   @seta/connector-ms365-planner   synced task/plan/member data
    ms365-directory/ @seta/connector-ms365-directory  manager hierarchy

  products/
    planner/   @seta/planner          ERP Module #1
                 src/tools/           T1 read tools, write preview/commit, semantic search
                                      T2 tools: project status, 1:1 prep
                 src/schema/          planner.write_continuations, planner.v_visible_tasks/plans
                 src/cards/           task-list, task-detail, write-preview, workload, scope-decline
                 src/workflows/       bulkUpdateWorkflow, generateReportWorkflow
                 src/indexer.ts       TaskIndexer (embedding pipeline)
                 src/seeds/planner.ts PLANNER_PROFILE_SEED

    analytics/ @seta/analytics        ERP Module #2
                 src/tools/           workload_by_assignee, tasks_by_status, tasks_by_plan,
                                      query_analytics DSL
                 src/schema/          analytics.mv_assignee_workload, analytics.mv_plan_weekly_velocity
                 src/cards/           chart-ybar
                 src/seeds/analytics.ts ANALYTICS_PROFILE_SEED

apps/api  (composition root — no business logic)
  Registers @seta/planner tools + @seta/analytics tools into the tool registry
  Mounts @seta/agent-server routes at /agent
  Mounts @seta/teams routes
  Starts planner sync worker + task indexer afterSync hook
  Calls seedSystemAgentProfiles() on boot
```

### 2.2 Request flow

```
Teams activity
     │
     ▼
modules/channels/teams  (@seta/teams)
  JWT verify, OBO refresh
  TeamsHandler: strip @mention → selectSlug → resolve thread ID
     │ calls agent-server run pipeline
     ▼
platform/agent/server  (@seta/agent-server)
  resolveAgentProfile(tenantId, slug)   ← agent.agent_profiles (LRU 5 min)
  loadActions(tenantId, agentId)        ← agent.agent_actions
  resolvePlatformTools(toolIds)         ← tool registry (injected at startup)
  hydrateAgent(profile, actions, ctx)   → AgentConfig
     │
     ▼
platform/agent/core  (@seta/agent-core)
  runKernel → streamKernelSSE
     │ tools execute against
     ├── planner.v_visible_tasks / planner.v_visible_plans (permission-filtered views)
     ├── analytics.mv_assignee_workload / analytics.mv_plan_weekly_velocity
     └── connector_ms365_planner.* (writes only, via Graph OBO)
          │
          ▼
     Postgres (RLS + planner permission views + analytics materialized views)
```

**Key principle — DB-first reads:** The agent reads all task/plan/member data from local Postgres. Graph is only called during write commits and the delta-sync background worker. This eliminates per-user Graph rate-limit risk at inference time.

**Key principle — DB-driven profiles:** Agent configuration (instructions, model, tool IDs) lives in `agent.agent_profiles` owned by `@seta/agent-server`. The TypeScript seed files are data exporters only — no runtime `AgentDefinition` objects. The profile resolver hydrates an `AgentConfig` from a DB row at request time, with a 5-minute LRU cache keyed `profile:{tenantId}:{slugOrId}`.

**Key principle — ERP module pattern:** Each ERP module (`@seta/planner`, `@seta/analytics`, future `@seta/timesheet`, `@seta/finance`) owns its own tools, schema, cards, and agent seed profile. Modules never import from each other. They are registered into the shared tool registry by `apps/api` at startup. Teams is the first channel; future channels (web chat, Slack, mobile) follow the same pattern — they call into `@seta/agent-server` without knowing which ERP module's tools are registered.

---

## 3. Data Sync Layer

### 3.1 Responsibility boundary

`modules/connectors/ms365-planner` owns its sync — it exports the worker; `apps/api/src/main.ts` starts it. The agent product never calls Graph for reads.

### 3.2 Schema changes in `connector_ms365_planner`

**Existing tables** (confirmed from `src/schema.ts`):
- `planner_tasks_cache` — PK `(tenant_id, graph_task_id)`, `assignee_ids text[]` with GIN index, `percent_complete smallint` (0=not started, 50=in-progress, 100=complete), `soft_deleted_at`
- `planner_plans_cache` — PK `(tenant_id, graph_plan_id)`, `owner_group_id text`
- `planner_buckets_cache` — PK `(tenant_id, graph_bucket_id)`
- `planner_task_details_cache` — PK `(tenant_id, graph_task_id)`, `description`, `checklist`
- `sync_watermarks` — PK `(tenant_id, scope_kind, scope_id)`, `last_sync_at`, `status`

**New column on `sync_watermarks`** — add `delta_token text` via a schema migration (do not create a new table):

```sql
ALTER TABLE connector_ms365_planner.sync_watermarks
  ADD COLUMN IF NOT EXISTS delta_token text;
```

Generated via: `drizzle-kit generate` after updating `syncWatermarks` table definition in `src/schema.ts`.

Usage: `scope_kind = 'tasks'`, `scope_id = '{planId}'` stores the Graph delta token and `last_sync_at` per plan per tenant.

**New table — `plan_members`:**

```sql
CREATE TABLE connector_ms365_planner.plan_members (
  tenant_id  uuid        NOT NULL,
  plan_id    text        NOT NULL,   -- graph_plan_id
  user_id    text        NOT NULL,   -- entra_object_id; no FK to directory
  synced_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, plan_id, user_id)
);
ALTER TABLE connector_ms365_planner.plan_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON connector_ms365_planner.plan_members
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Generated via `drizzle-kit generate` after adding the Drizzle table definition to `src/schema.ts`.

### 3.3 `createPlannerSyncWorker` export

New export from `modules/connectors/ms365-planner/src/sync.ts`:

```typescript
export interface PlannerSyncWorkerDeps {
  sql:          DbSql
  graph:        GraphFetch
  getAppToken:  (tenantId: string) => Promise<string>  // client_credentials flow
  intervalMs?:  number    // default: 3 * 60 * 1000 (3 min)
  afterSync?:   (tenantId: string, changedTaskIds: string[]) => Promise<void>
}

export function createPlannerSyncWorker(deps: PlannerSyncWorkerDeps): {
  start(tenantIds: string[]): void
  stop():                      void
  syncTenant(tenantId: string): Promise<void>  // for tests + manual trigger
}
```

**Sync cycle per tenant** (run sequentially per tenant to respect Graph rate limits):

1. `GET /planner/plans` (full list — no delta API for plans). Upsert into `planner_plans_cache`. Soft-delete plans no longer returned by setting `soft_deleted_at = now()`.
2. For each plan: `GET /planner/plans/{id}/tasks/delta` using `delta_token` from `sync_watermarks`. Upsert changed tasks into `planner_tasks_cache`. Store new delta token back to `sync_watermarks.delta_token`.
3. For each plan: `GET /groups/{owner_group_id}/members`. Upsert into `plan_members`. Delete rows for members no longer in the group.
4. Collect inserted or updated `graph_task_id` values → call `deps.afterSync(tenantId, changedTaskIds)`.

**Auth:** `getAppToken` uses `client_credentials` flow (one sync per tenant, not per user). The permission view (§4) is what constrains individual user reads from the synced data.

**Registration:** `apps/api/src/main.ts` wires:
```typescript
const worker = createPlannerSyncWorker({
  sql, graph, getAppToken,
  afterSync: async (tenantId, taskIds) => {
    await taskIndexer.indexTasks(tenantId, taskIds)           // embed changed tasks
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_assignee_workload`
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_plan_weekly_velocity`
  },
})
worker.start(await getActiveTenantIds(sql))  // from oauth.tenants
```

---

## 4. Permission Model

### 4.1 Boundaries

- **Cross-tenant:** RLS on all `connector_ms365_planner.*` tables enforced by `app.tenant_id`. Backstop — zero cross-tenant leak.
- **Intra-tenant:** permission views in the `agent` schema (product-owned). Two rules: plan membership + manager hierarchy.

### 4.2 Session variables

Set once per agent run before any tool executes — in the Teams handler and in each REST run endpoint:

```typescript
await sql`SET LOCAL app.tenant_id = ${tenantId}`
await sql`SET LOCAL app.user_id   = ${userId}`  // entra_object_id from Teams JWT
```

`userId` is the bare `entra_object_id` (not the MSAL composite `<objectId>.<tenantId>` stored in `write_continuations.user_id` — those are different identifiers for different purposes).

### 4.3 Permission views — `planner` schema

Views are owned by `@seta/planner` (live in `modules/products/planner/src/schema.ts`). They reference connector tables by ID only — no foreign-key constraints across schemas.

```sql
-- Visible tasks: actor is a plan member OR actor manages any assignee
CREATE VIEW planner.v_visible_tasks AS
SELECT t.*
FROM connector_ms365_planner.planner_tasks_cache t
WHERE t.tenant_id       = current_setting('app.tenant_id')::uuid
  AND t.soft_deleted_at IS NULL
  AND (
    -- Rule 1: actor is a plan member
    EXISTS (
      SELECT 1
      FROM connector_ms365_planner.plan_members pm
      WHERE pm.tenant_id = t.tenant_id
        AND pm.plan_id   = t.plan_id
        AND pm.user_id   = current_setting('app.user_id')
    )
    OR
    -- Rule 2: actor manages any assignee (text[] — use = ANY())
    EXISTS (
      SELECT 1
      FROM connector_ms365_directory.directory_users du
      WHERE du.tenant_id       = t.tenant_id
        AND du.entra_object_id = ANY(t.assignee_ids)
        AND du.manager_id      = current_setting('app.user_id')
    )
  );

-- Visible plans: actor is a plan member
CREATE VIEW planner.v_visible_plans AS
SELECT p.*
FROM connector_ms365_planner.planner_plans_cache p
WHERE p.tenant_id       = current_setting('app.tenant_id')::uuid
  AND p.soft_deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM connector_ms365_planner.plan_members pm
    WHERE pm.tenant_id = p.tenant_id
      AND pm.plan_id   = p.graph_plan_id
      AND pm.user_id   = current_setting('app.user_id')
  );
```

Views are raw SQL — registered via a custom migration in `@seta/planner`:
```
drizzle-kit generate --custom --name add-planner-permission-views
```

### 4.4 Denial behaviour

When a user queries a plan or task outside their visible set the view returns zero rows. The agent:
- Detects empty result + named plan/project in the query → renders `scope-decline.ts` card
- Never confirms or denies whether the named plan exists
- Offers `list_plans` to show what the actor can see

---

## 5. Agent Profiles & Actions

### 5.1 `agent.agent_profiles` table

Stores all agent configuration. `tenant_id = NULL` means a global platform default visible to all tenants. A tenant row with the same `slug` shadows the global default for that tenant.

```sql
CREATE TABLE agent.agent_profiles (
  agent_id                 uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id                uuid        NULL,
  slug                     text        NULL,     -- 'planner' | 'analytics' | 'faq' for system agents
  name                     text        NOT NULL,
  description              text,
  instructions             text        NOT NULL, -- system prompt; {{timezone}} {{convType}} etc.
  model                    text        NOT NULL, -- model registry key e.g. 'default', 'gpt-4o'
  tool_ids                 text[]      NOT NULL DEFAULT '{}',
  working_memory_template  text,
  temperature              numeric(3,2),
  metadata                 jsonb       NOT NULL DEFAULT '{}',
  status                   text        NOT NULL DEFAULT 'published'
                             CHECK (status IN ('draft', 'published', 'archived')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- One global profile per slug
CREATE UNIQUE INDEX agent_profiles_global_slug
  ON agent.agent_profiles (slug)
  WHERE tenant_id IS NULL AND slug IS NOT NULL;

-- One tenant-scoped profile per slug
CREATE UNIQUE INDEX agent_profiles_tenant_slug
  ON agent.agent_profiles (tenant_id, slug)
  WHERE tenant_id IS NOT NULL AND slug IS NOT NULL;

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
```

Generated via `drizzle-kit generate` after adding the Drizzle table definition in `platform/agent/server/src/schema.ts`.

### 5.2 `agent.agent_actions` table

OpenAPI-spec-based custom tools. Always tenant-scoped — no global actions.

```sql
CREATE TABLE agent.agent_actions (
  action_id    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id     uuid        NOT NULL REFERENCES agent.agent_profiles(agent_id) ON DELETE CASCADE,
  tenant_id    uuid        NOT NULL,
  name         text        NOT NULL,
  description  text        NOT NULL,
  spec         jsonb       NOT NULL,  -- single OpenAPI operation: path, method, parameters, requestBody
  auth         jsonb,                 -- { type: 'bearer'|'api_key'|'oauth2', ... }
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent.agent_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_actions_rls ON agent.agent_actions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

### 5.3 Profile resolution

```typescript
// platform/agent/server/src/profile-registry.ts
export async function resolveAgentProfile(
  sql: DbSql,
  tenantId: string,
  slugOrId: string,
): Promise<AgentProfileRow> {
  const rows = await sql<AgentProfileRow[]>`
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
  if (!rows.length) throw new DomainError('agent_profile_not_found', { slugOrId, tenantId })
  return rows[0]
}
```

Results cached in a per-process LRU with a 5-minute TTL, key `profile:{tenantId}:{slugOrId}`. Cache is invalidated when a `PATCH /agent/agents/:agentId` response commits.

### 5.4 Agent hydration

```typescript
// platform/agent/server/src/profile-registry.ts
export function hydrateAgent(
  profile: AgentProfileRow,
  actions: AgentActionRow[],
  ctx: RunContext,
): AgentConfig {
  return {
    name:         profile.slug ?? profile.agentId,
    instructions: interpolateInstructions(profile.instructions, ctx),
    model:        modelRegistry.get(profile.model),
    tools:        [
      ...resolvePlatformTools(profile.toolIds),
      ...actions.map(buildActionTool),
    ],
    memory: profile.workingMemoryTemplate
      ? { workingMemoryTemplate: profile.workingMemoryTemplate }
      : undefined,
  }
}

function interpolateInstructions(template: string, ctx: RunContext): string {
  return template
    .replaceAll('{{timezone}}', ctx.timezone)
    .replaceAll('{{convType}}', ctx.convType)
}
```

### 5.5 Tool registry

```typescript
// platform/agent/server/src/tool-registry.ts
const TOOL_REGISTRY: Record<string, Tool> = {
  list_my_tasks:          listMyTasksTool,
  list_plan_tasks:        listPlanTasksTool,
  get_task:               getTaskTool,
  list_plans:             listPlansTool,
  list_buckets:           listBucketsTool,
  search_tasks_semantic:  searchTasksSemanticTool,
  workload_by_assignee:   workloadByAssigneeTool,
  tasks_by_status:        tasksByStatusTool,
  tasks_by_plan:          tasksByPlanTool,
  query_analytics:        queryAnalyticsTool,
  get_project_status:     getProjectStatusTool,
  get_one_on_one_prep:    getOneOnOnePrepTool,
  update_tasks_preview:   updateTasksPreviewTool,
  update_tasks_commit:    updateTasksCommitTool,
  create_tasks_preview:   createTasksPreviewTool,
  create_tasks_commit:    createTasksCommitTool,
  complete_tasks_preview: completeTasksPreviewTool,
  complete_tasks_commit:  completeTasksCommitTool,
  add_comments_preview:   addCommentsPreviewTool,
  add_comments_commit:    addCommentsCommitTool,
  create_plan_preview:    createPlanPreviewTool,
  create_plan_commit:     createPlanCommitTool,
}

export function resolvePlatformTools(toolIds: string[]): Tool[] {
  return toolIds.map(id => {
    const tool = TOOL_REGISTRY[id]
    if (!tool) throw new DomainError('unknown_tool_id', { toolId: id })
    return tool
  })
}
```

### 5.6 OpenAPI Action builder

```typescript
// platform/agent/server/src/actions/build-action-tool.ts
export function buildActionTool(action: AgentActionRow): Tool {
  return {
    name:        action.name,
    description: action.description,
    inputSchema: extractInputSchema(action.spec),   // parse OpenAPI operation → Zod schema
    execute:     async (args) => executeOpenApiAction(action, args),
  }
}
```

`executeOpenApiAction` resolves auth from `action.auth`, builds the HTTP request from the OpenAPI operation + `args`, and returns the response body. Network errors surface as tool errors (not agent crashes).

### 5.7 Boot seeder

```typescript
// platform/agent/server/src/agent-seeder.ts
export async function seedSystemAgentProfiles(sql: DbSql): Promise<void> {
  const profiles = [PLANNER_PROFILE_SEED, ANALYTICS_PROFILE_SEED, FAQ_PROFILE_SEED]
  for (const p of profiles) {
    await sql`
      INSERT INTO agent.agent_profiles
        (slug, tenant_id, name, description, instructions, model, tool_ids,
         working_memory_template, status)
      VALUES
        (${p.slug}, NULL, ${p.name}, ${p.description}, ${p.instructions},
         ${p.model}, ${sql.array(p.toolIds)}, ${p.workingMemoryTemplate ?? null}, 'published')
      ON CONFLICT DO NOTHING
    `
  }
}
```

`ON CONFLICT DO NOTHING` is safe because the partial unique index on `(slug) WHERE tenant_id IS NULL` prevents duplicate global slugs. Called once from `apps/api/src/main.ts` at startup before `worker.start()`.

---

## 6. Planner Agent Definition

### 6.1 `modules/products/planner/src/seeds/planner.ts`

This file exports seed constants used only by `platform/agent/server/src/agent-seeder.ts`. There is no static `AgentDefinition` object — the runtime profile is loaded from `agent.agent_profiles` via `resolveAgentProfile`.

```typescript
export const PLANNER_SLUG = 'planner'

export const PLANNER_TOOL_IDS = [
  'list_my_tasks', 'list_plan_tasks', 'get_task', 'list_plans', 'list_buckets',
  'search_tasks_semantic', 'query_analytics', 'get_project_status', 'get_one_on_one_prep',
  'update_tasks_preview', 'update_tasks_commit',
  'create_tasks_preview', 'create_tasks_commit',
  'complete_tasks_preview', 'complete_tasks_commit',
  'add_comments_preview', 'add_comments_commit',
  'create_plan_preview', 'create_plan_commit',
]

export const PLANNER_WORKING_MEMORY_TEMPLATE = `
Active context:
- Last referenced plan: {{activePlan}}
- Last referenced task: {{lastTaskId}}
- Pending clarification: {{pendingQuestion}}
- User timezone: {{timezone}}
`.trim()

export const PLANNER_INSTRUCTIONS = `
You are the Planner Agent for SETA International — an IT services company with
offices in Vietnam, the US, Ireland, and Japan. You help employees read and manage
Microsoft Planner tasks through Microsoft Teams.

Capabilities:
- Read: list tasks, get task details, search tasks by meaning, analyse workload,
  get project status, prepare 1:1 meeting briefs
- Write: create tasks, update tasks, mark tasks complete, add comments, create plans
  (all writes require a preview confirmation before executing)

You cannot access plans or tasks the user is not authorised to see. Decline politely
and show the user their visible plans via list_plans.

Detect the dominant language in the user's message — English, Vietnamese, or
EN-VN mix. Respond in that same dominant language. SETA's Hanoi office uses
EN-VN code-switching constantly; match their style. Never switch languages
mid-response.

Tool selection:
- "my tasks", "what do I have", "on my plate"          → list_my_tasks
- "tasks in plan X", "show [plan name] tasks"           → list_plan_tasks
- "find tasks about X", "similar to Y", "have we done Z" → search_tasks_semantic
- "who's overloaded", "team capacity", "workload",
  "velocity", "completion rate", "overdue by plan"      → query_analytics
- "project status", "what shipped", "blocked on [plan]" → get_project_status
- "1:1 prep for [person]", "[name]'s snapshot"          → get_one_on_one_prep
- creating / updating / completing / commenting         → preview tool first,
  commit only after explicit user confirmation
- "create a plan"                                       → create_plan_preview → commit

For ambiguous write requests ask ONE focused clarifying question before calling
any preview tool. Never guess plan names or assignee names — confirm with
list_plans first.

Write flow — always follow this order:
1. If any required field is missing or ambiguous, ask one question.
2. Call the preview tool once you have enough information.
3. Present the preview card. Explain the proposed change clearly.
4. Wait. Do NOT call the commit tool until the user explicitly confirms.
5. On confirm: call the commit tool with the continuation_id from the preview.
6. On cancel or silence: do nothing.

Never re-supply the write payload at commit — the continuation_id contains it.

If a plan or task query returns empty because the user lacks access:
- Do not confirm or deny whether the plan exists.
- Say: "I don't have visibility into that for your account."
- Follow with the user's visible plans: call list_plans.

Conversation type: {{convType}}
{{personal}} → 1:1 chat. Personal queries ("my tasks", "my workload") are primary.
{{other}}    → Shared conversation. Avoid surfacing private individual details
               unless directly asked.

User timezone: {{timezone}}
Resolve "today", "this week", "end of day", "before US comes online" relative to
this timezone. Hanoi–California gap ≈ 15 h — "handoff before EOD" means before
~17:00 ICT.
`.trim()

export const PLANNER_PROFILE_SEED = {
  slug:                   PLANNER_SLUG,
  name:                   'Planner Agent',
  description:            'Task and plan management for Microsoft Planner',
  instructions:           PLANNER_INSTRUCTIONS,
  model:                  'default',
  toolIds:                PLANNER_TOOL_IDS,
  workingMemoryTemplate:  PLANNER_WORKING_MEMORY_TEMPLATE,
}
```

---

## 7. Analytics Agent Definition

### 7.1 `modules/products/analytics/src/seeds/analytics.ts`

Same pattern as Planner — seed constants only, no static `AgentDefinition`.

```typescript
export const ANALYTICS_SLUG = 'analytics'

export const ANALYTICS_TOOL_IDS = [
  'workload_by_assignee', 'tasks_by_status', 'tasks_by_plan', 'query_analytics',
]

export const ANALYTICS_WORKING_MEMORY_TEMPLATE = `
Active context:
- Last queried plan: {{activePlan}}
- Last metric: {{lastMetric}}
`.trim()

export const ANALYTICS_INSTRUCTIONS = `
You are the Analytics Agent for SETA International. You answer workload,
distribution, velocity, and completion queries about Microsoft Planner tasks.

You always respond with a chart card — never with a plain text table or prose
summary for data that can be visualised. Use workload_by_assignee,
tasks_by_status, or tasks_by_plan to get the data, then render a chart-ybar
card from the result.

You are read-only. You do not create, update, or complete tasks.

Detect the dominant language in the user's message — English, Vietnamese, or
EN-VN mix. Respond in that same dominant language.

Tool selection:
- "who's overloaded", "workload by person", "assignee distribution" → workload_by_assignee
- "task breakdown by status", "how many in progress vs done"        → tasks_by_status
- "tasks per project", "which plan has the most open tasks"         → tasks_by_plan
- trend queries ("velocity last N weeks", "completion rate")        → query_analytics

Always render the result using the chart-ybar card template.
`.trim()

export const ANALYTICS_PROFILE_SEED = {
  slug:                   ANALYTICS_SLUG,
  name:                   'Analytics Agent',
  description:            'Workload, velocity, and task distribution analytics',
  instructions:           ANALYTICS_INSTRUCTIONS,
  model:                  'default',
  toolIds:                ANALYTICS_TOOL_IDS,
  workingMemoryTemplate:  ANALYTICS_WORKING_MEMORY_TEMPLATE,
}
```

---

## 8. Tool Catalog

### 8.1 T1 Read tools — Planner Agent (DB-first)

All read tools query `planner.v_visible_tasks` or `planner.v_visible_plans` via the `sql` dep. `app.tenant_id` and `app.user_id` session variables are set before tool execution by the handler.

Status is derived from `percent_complete`: `0` = not started, `50` = in progress, `100` = complete. "Overdue" = `due_date < now() AND percent_complete < 100`.

#### `list_my_tasks`

```typescript
inputSchema: z.object({
  timeRange: z.enum(['today', 'this_week', 'overdue', 'all']).default('today'),
  planId:    z.string().optional(),
  status:    z.enum(['not_started', 'in_progress', 'completed']).optional(),
  limit:     z.number().min(1).max(50).default(20),
})
outputSchema: z.object({
  tasks:   z.array(PlannerTaskRow),
  summary: z.object({ total: z.number(), overdue: z.number(), dueToday: z.number() }),
})
annotations: { readOnlyHint: true }
```

```sql
SELECT * FROM planner.v_visible_tasks
WHERE  $userId = ANY(assignee_ids)
  AND  <time_predicate>
  AND  ($planId IS NULL OR plan_id = $planId)
ORDER BY due_date NULLS LAST, priority DESC
LIMIT  $limit
```

`today` predicate: `(due_date <= $todayEnd AND percent_complete < 100) OR (percent_complete BETWEEN 1 AND 99 AND due_date IS NULL) OR (due_date < $todayStart AND percent_complete < 100)`.

#### `list_plan_tasks`

```typescript
inputSchema: z.object({
  planId:     z.string(),
  bucketId:   z.string().optional(),
  status:     z.enum(['not_started', 'in_progress', 'completed']).optional(),
  assigneeId: z.string().optional(),
  limit:      z.number().min(1).max(100).default(50),
})
```

```sql
SELECT * FROM planner.v_visible_tasks
WHERE  plan_id = $planId
  AND  ($bucketId   IS NULL OR bucket_id = $bucketId)
  AND  ($assigneeId IS NULL OR $assigneeId = ANY(assignee_ids))
  AND  ($status     IS NULL OR <percent_complete_predicate>)
ORDER BY due_date NULLS LAST, priority DESC
LIMIT  $limit
```

#### `get_task`

```typescript
inputSchema:  z.object({ taskId: z.string() })
outputSchema: PlannerTaskDetailRow   -- joins planner_tasks_cache + planner_task_details_cache
annotations:  { readOnlyHint: true }
```

```sql
SELECT t.*, d.description, d.checklist
FROM   planner.v_visible_tasks t
LEFT JOIN connector_ms365_planner.planner_task_details_cache d
       ON d.graph_task_id = t.graph_task_id AND d.tenant_id = t.tenant_id
WHERE  t.graph_task_id = $taskId
LIMIT  1
```

#### `list_plans`

```typescript
inputSchema:  z.object({ limit: z.number().default(20) })
outputSchema: z.object({ plans: z.array(PlannerPlanRow) })
annotations:  { readOnlyHint: true }
```

```sql
SELECT * FROM planner.v_visible_plans ORDER BY title LIMIT $limit
```

#### `list_buckets`

```typescript
inputSchema: z.object({ planId: z.string() })
annotations: { readOnlyHint: true }
```

Bucket visibility equals plan membership — no extra user filter beyond RLS:

```sql
SELECT * FROM connector_ms365_planner.planner_buckets_cache
WHERE  plan_id = $planId AND tenant_id = current_setting('app.tenant_id')::uuid
  AND  soft_deleted_at IS NULL
ORDER BY order_hint
```

#### `search_tasks_semantic`

```typescript
inputSchema: z.object({
  query:  z.string().min(2),
  planId: z.string().optional(),
  topK:   z.number().min(1).max(20).default(8),
})
outputSchema: z.object({
  results: z.array(z.object({
    taskId:   z.string(),
    title:    z.string(),
    planName: z.string(),
    score:    z.number(),
    snippet:  z.string(),
    url:      z.string().nullable(),
  })),
})
annotations: { readOnlyHint: true }
```

Execute:
1. `vec = await embeddings.embed(query)` — `@seta/agent-embeddings`, model `text-embedding-3-small`
2. Vector search with `SET LOCAL hnsw.iterative_scan = strict_order` (correctness requirement per `setup.md §6`):
```sql
SELECT c.source_id, 1 - (c.embedding <=> $vec) AS score, c.content
FROM   agent_vector.chunks c
WHERE  c.tenant_id          = current_setting('app.tenant_id')::uuid
  AND  c.metadata->>'type'  = 'planner_task'
  AND  ($planId IS NULL OR c.metadata->>'plan_id' = $planId)
ORDER  BY c.embedding <=> $vec
LIMIT  $topK
```
3. Filter `source_id` values through `planner.v_visible_tasks` — discard any chunk whose `graph_task_id` is not visible to the actor.
4. Return ranked list; `snippet = content[:200]`.

### 8.2 T2 Analytics tools — shared by Planner + Analytics Agents

#### `workload_by_assignee`  *(EP-11.2)*

Primary tool of the Analytics Agent. Planner Agent also uses it for text workload summaries.

```typescript
inputSchema: z.object({
  planId:    z.string().optional(),    // scope to one plan; omit for all visible plans
  lookbackDays: z.number().default(7), // for completed_this_week window
  limit:     z.number().min(1).max(50).default(20),
})
outputSchema: z.object({
  rows: z.array(z.object({
    userId:             z.string(),
    displayName:        z.string(),
    openTasks:          z.number(),
    overdueTasks:       z.number(),
    dueThisWeek:        z.number(),
    completedThisWeek:  z.number(),
  })),
  planName: z.string().nullable(),
})
annotations: { readOnlyHint: true }
```

Query: join `analytics.mv_assignee_workload` filtered by `$visiblePlanIds` + left-join `connector_ms365_directory.directory_users` for `display_name`. Display name falls back to `user_id` if not in directory.

#### `tasks_by_status`  *(EP-11.2)*

```typescript
inputSchema: z.object({
  planId: z.string().optional(),
})
outputSchema: z.object({
  rows: z.array(z.object({
    status: z.enum(['not_started', 'in_progress', 'completed']),
    count:  z.number(),
  })),
  planName: z.string().nullable(),
})
annotations: { readOnlyHint: true }
```

```sql
SELECT
  CASE percent_complete
    WHEN 0   THEN 'not_started'
    WHEN 100 THEN 'completed'
    ELSE          'in_progress'
  END                      AS status,
  COUNT(*)                 AS count
FROM planner.v_visible_tasks
WHERE ($planId IS NULL OR plan_id = $planId)
GROUP BY 1
ORDER BY 1
```

#### `tasks_by_plan`  *(EP-11.2)*

```typescript
inputSchema: z.object({
  metric: z.enum(['open', 'overdue', 'completed_this_week']).default('open'),
  limit:  z.number().min(1).max(20).default(10),
})
outputSchema: z.object({
  rows: z.array(z.object({
    planId:   z.string(),
    planName: z.string(),
    count:    z.number(),
  })),
})
annotations: { readOnlyHint: true }
```

Queries `analytics.mv_assignee_workload` grouped by `plan_id`, joined to `planner_plans_cache` for title. Applies `$visiblePlanIds` filter before aggregating.

#### `query_analytics` *(T2 DSL — Planner Agent)*

```typescript
inputSchema: z.object({
  metric: z.enum([
    'workload_by_assignee',
    'blocked_tasks',
    'completion_rate',
    'due_soon',
    'velocity',
    'capacity_forecast',
    'overdue_by_plan',
    'unassigned_tasks',
  ]),
  scope: z.object({
    type:   z.enum(['self', 'direct_reports', 'plan', 'org']),
    planId: z.string().optional(),
    userId: z.string().optional(),
  }),
  timeRange: z.object({ from: z.string(), to: z.string() }).optional(),
  groupBy:   z.enum(['assignee', 'plan', 'week', 'status']).optional(),
  limit:     z.number().min(1).max(100).default(20),
})
annotations: { readOnlyHint: true }
```

Permission gates before compile:
- `scope.type = 'direct_reports'` → `directory_users WHERE manager_id = $userId` must be non-empty
- `scope.type = 'org'` → count of `v_visible_plans` must equal count of `planner_plans_cache` (all plans visible)
- `scope.type = 'plan'` → `planId` must exist in `v_visible_plans`

DSL compiles to parameterized SQL against `mv_assignee_workload` or `mv_plan_weekly_velocity`. No raw user input in SQL strings. Result cached 5 min in LRU (Redis-ready key shape: `analytics:{tenantId}:{userId}:{hash(input)}`).

#### `get_project_status`

```typescript
inputSchema: z.object({
  planId: z.string(),
  since:  z.string().default('7 days ago'),
})
outputSchema: z.object({
  planName:   z.string(),
  completed:  z.array(PlannerTaskRow),   // percent_complete = 100 AND last_modified > since
  inProgress: z.array(PlannerTaskRow),   // percent_complete = 50
  blocked:    z.array(PlannerTaskRow),   // in_progress AND last_modified_at_graph < now()-3d
  upcoming:   z.array(PlannerTaskRow),   // percent_complete = 0 AND due < now()+7d
  unassigned: z.array(PlannerTaskRow),   // array_length(assignee_ids,1) IS NULL AND percent_complete<100
})
annotations: { readOnlyHint: true }
```

Runs 5 queries in parallel via `p-queue(concurrency=5)` against `planner.v_visible_tasks`. Agent synthesises into prose or passes to a status card.

#### `get_one_on_one_prep`

```typescript
inputSchema: z.object({
  targetUserId: z.string(),        // entra_object_id; resolve name → ID via list_plans/directory first
  lookbackDays: z.number().int().min(1).max(30).default(14),
})
outputSchema: z.object({
  targetName:      z.string(),
  completed:       z.array(PlannerTaskRow),
  inProgress:      z.array(PlannerTaskRow),
  blocked:         z.array(PlannerTaskRow),
  workloadPercent: z.number(),
  talkingPoints:   z.array(z.string()),   // agent-derived: stale tasks, overload, blockers
})
annotations: { readOnlyHint: true }
```

Permission gate: `SELECT manager_id FROM connector_ms365_directory.directory_users WHERE entra_object_id = $targetUserId AND tenant_id = $tenantId` must equal `current_setting('app.user_id')`. Returns typed error otherwise.

### 8.3 T1 Write tools — Planner Agent (preview/commit pairs)

Architecture unchanged from current implementation. Each write pair:

**Preview tool:**
1. Validate `plan_members` membership for actor and any named assignees (DB check, no Graph call).
2. For create/assign tools: query `mv_assignee_workload` for each assignee. If `open_tasks / (open_tasks + completed_this_week) > 0.9`, attach `capacityWarning` to the preview response. The `write-preview.ts` card renders this as a yellow notice above the Confirm button.
3. Fetch current `@odata.etag` from Graph via OBO token.
4. Store HMAC-signed continuation in `planner.write_continuations`.
5. Return `{ continuation_id, summary, etag_snapshot, expiresAt, capacityWarning? }`.

**Commit tool:**
1. Validate HMAC.
2. Assert `consumed_at IS NULL` (idempotency).
3. Call Graph with `If-Match: etag`.
4. On success: upsert changed task into `planner_tasks_cache` immediately (no waiting for next sync cycle).
5. Mark continuation consumed. Write audit row.

Tools: `update_tasks_preview/commit`, `create_tasks_preview/commit`, `complete_tasks_preview/commit`, `add_comments_preview/commit`, `create_plan_preview/commit`.

Annotations: preview → `{ readOnlyHint: true, idempotentHint: true }`, commit → `{ destructiveHint: true }`.

### 8.4 Embedding pipeline — `TaskIndexer`

Exported from `modules/products/planner/src/indexer.ts` (product concern — `@seta/planner` decides Planner tasks are embedded).

```typescript
export interface TaskIndexerDeps {
  sql:          DbSql
  embeddings:   EmbeddingProvider    // @seta/agent-embeddings
  vector:       VectorStore          // @seta/agent-vector
  concurrency?: number               // p-queue, default 5
}

export function createTaskIndexer(deps: TaskIndexerDeps): {
  indexTasks(tenantId: string, taskIds: string[]): Promise<void>
}
```

For each task ID (bounded by `p-queue`):
1. Fetch from `planner_tasks_cache` + `planner_task_details_cache` using `platform_admin` role (bypasses RLS — indexer is a privileged background process).
2. `content = [task.title, task.description ?? ''].join('\n').slice(0, 2000)`
3. `embedding = await deps.embeddings.embed(content)`
4. Upsert into `agent_vector.chunks`:
   - `source_id  = task.graph_task_id`
   - `tenant_id  = task.tenant_id`
   - `content    = content`
   - `char_range = { start: 0, end: content.length }`
   - `metadata   = { type: 'planner_task', plan_id: task.plan_id, plan_name: task.title }`
   - `embedding  = embedding`

---

## 9. Materialized Views

Owned by `@seta/analytics` (`analytics` schema). Defined in `modules/products/analytics/src/schema.ts`. Refreshed by `apps/api`'s `afterSync` hook via `REFRESH MATERIALIZED VIEW CONCURRENTLY` (reads are never blocked during refresh — requires unique index, defined below). The views query `connector_ms365_planner` tables directly — no cross-product import from `@seta/planner`.

### `analytics.mv_assignee_workload`

```sql
CREATE MATERIALIZED VIEW analytics.mv_assignee_workload AS
SELECT
  t.tenant_id,
  user_id.value                                                                  AS user_id,
  t.plan_id,
  COUNT(*) FILTER (WHERE t.percent_complete < 100)                               AS open_tasks,
  COUNT(*) FILTER (WHERE t.due_date < now()
                     AND t.percent_complete < 100)                               AS overdue_tasks,
  COUNT(*) FILTER (WHERE t.due_date BETWEEN now() AND now() + INTERVAL '7 days'
                     AND t.percent_complete < 100)                               AS due_this_week,
  COUNT(*) FILTER (WHERE t.percent_complete = 100
                     AND t.last_modified_at_graph > now() - INTERVAL '7 days')  AS completed_this_week
FROM connector_ms365_planner.planner_tasks_cache t
CROSS JOIN LATERAL UNNEST(t.assignee_ids) AS user_id(value)
WHERE t.soft_deleted_at IS NULL
GROUP BY t.tenant_id, user_id.value, t.plan_id;

CREATE UNIQUE INDEX ON analytics.mv_assignee_workload (tenant_id, user_id, plan_id);
```

### `analytics.mv_plan_weekly_velocity`

```sql
CREATE MATERIALIZED VIEW analytics.mv_plan_weekly_velocity AS
SELECT
  tenant_id,
  plan_id,
  date_trunc('week', last_modified_at_graph)  AS week,
  COUNT(*)                                    AS tasks_completed
FROM connector_ms365_planner.planner_tasks_cache
WHERE percent_complete   = 100
  AND last_modified_at_graph IS NOT NULL
  AND soft_deleted_at    IS NULL
GROUP BY tenant_id, plan_id, date_trunc('week', last_modified_at_graph);

CREATE UNIQUE INDEX ON analytics.mv_plan_weekly_velocity (tenant_id, plan_id, week);
```

**Permission enforcement:** `query_analytics`, `workload_by_assignee`, `tasks_by_plan` apply `AND plan_id = ANY($visiblePlanIds)` before querying materialized views. `$visiblePlanIds` is fetched by querying `connector_ms365_planner.plan_members` directly (not via `planner.v_visible_plans` — no cross-product import). Materialized views cannot use session-level RLS.

**Health thresholds** (in system prompt, not in code — so the LLM can explain them):
- 🟢 Green: 0 overdue tasks
- 🟡 Yellow: 1–3 overdue OR any task with no update > 5 days
- 🔴 Red: > 3 overdue OR any task with no update > 10 days

---

## 10. Workflows

Uses `@seta/agent-workflows` `.then()` / `.parallel()` DSL. State persisted in `agent_workflows.runs` + `agent_workflows.steps`. `run_id` is the cross-audit correlation key.

### 10.1 `bulkUpdateWorkflow`

Triggered when the agent detects > 1 task matched by a single write intent ("reassign all overdue Atlas tasks to Phong", "mark all Sprint 14 tasks complete").

```
bulkUpdateWorkflow
  .then(resolveTasks)    → query v_visible_tasks with filter; return matched list + count
  .then(previewBulk)     → render write-preview card with task checklist (select all / deselect)
                           ctx.suspend({ reason: 'bulk_confirm', resumeLabel: 'Confirm all' })
  .then(executeBulk)     ← resumed: { selectedTaskIds, writeIntent }
                           fan-out via p-queue(concurrency=5) → Graph writes → DB upserts
  .then(auditBulk)       → one audit row per completed write, linked to run_id
  .then(summaryCard)     → "N updated, M failed" result card
```

`executeBulk` receives `selectedTaskIds` from the card's checklist — the user can deselect individual tasks before confirming.

### 10.2 `generateReportWorkflow`

Triggered when the user requests a **client-facing** status report ("generate the client status report for Atlas"). Internal `get_project_status` calls bypass this workflow.

```
generateReportWorkflow
  .then(gatherData)       → get_project_status internally; fetch plan metadata
  .then(draftReport)      → kernel synthesises draft:
                             - exclude tasks with label 'internal', 'team-process', 'internal-blocker'
                             - format: shipped · in-flight · risks · next milestone
                             - replace engineer names with "team member" (PM-only exception)
  .then(previewDraft)     → write-preview card with editable Input.Text area
                            ctx.suspend({ reason: 'report_review', resumeLabel: 'Approve' })
  .then(finaliseReport)   ← resumed: apply user edits (if any)
                            render final card with copy-to-clipboard + "Send to client" hint
  .then(auditReport)      → log: actor, plan_id, timestamp, was_edited (bool)
```

---

## 11. Teams Handler + Routing

### 11.1 `modules/channels/teams/src/teams-handler.ts`

```typescript
export function createTeamsHandler(deps: TeamsHandlerDeps): TeamsHandler {
  return async (activity, runCtx) => {
    const text     = stripMention(activity.text).trim()
    const convType = activity.conversation.conversationType

    await deps.sql`SET LOCAL app.tenant_id = ${runCtx.tenantId}`
    await deps.sql`SET LOCAL app.user_id   = ${runCtx.userId}`

    const slug    = selectSlug(text)
    const ctx     = buildRunContext(runCtx, convType)
    const profile = await deps.profileRegistry.resolve(runCtx.tenantId, slug)
    const actions = await deps.profileRegistry.loadActions(runCtx.tenantId, profile.agentId)
    const agent   = hydrateAgent(profile, actions, ctx)
    const threadId = buildThreadId(activity, runCtx)

    const result = await runKernel({
      agent, input: text, threadId,
      memory: deps.memory, workflowEngine: deps.workflowEngine,
      abortSignal: runCtx.abortSignal,
    })

    return buildReplyActivity(result, profile.name, convType)
  }
}
```

### 11.2 Trigger-phrase routing

```typescript
function selectSlug(text: string): string {
  if (/^(analytics:|chart|workload chart|show.*chart|velocity|burn.?down)/i.test(text))
    return 'analytics'

  if (/^(faq:|policy|how do (i|we)|what is (our|the|seta)|company.*rule|quy định)/i.test(text))
    return 'faq'

  return 'planner'   // default
}
```

Analytics and FAQ have explicit prefixes. Planner is the default — it handles any message that does not match the other prefixes. `selectSlug` returns a slug string; the profile is then loaded from DB (with LRU cache). This replaces the old static `AgentMap`.

### 11.3 Thread ID strategy

| Conversation type | Thread ID | Memory privacy |
|---|---|---|
| `personal` (1:1) | `t:{tenant}:u:{user}:personal` | Private to user |
| `groupChat` | `t:{tenant}:gc:{conversationId}` | Shared in group |
| `channel` | `t:{tenant}:ch:{channelId}` | Shared in channel |

`personal` threads never share working memory with `groupChat`/`channel` threads for the same user.

### 11.4 Conversation scope behaviour

- **`personal`:** All queries allowed. Personal context is primary.
- **`groupChat`:** @mention required. Avoid surfacing private individual task details unless directly asked.
- **`channel`:** @mention required. P1: user must specify plan. (Future: auto-scope to plan bound to channel.)

---

## 12. Adaptive Cards

All card builders in `src/cards/`. Cards are plain objects validated against Adaptive Card v1.5 spec. `adaptivecards-templating@2.3.1` used for the chart card only.

### `task-list.ts` — `list_my_tasks`, `list_plan_tasks`
- Header: task count + active filter badge (Overdue / Today / All)
- Rows: title · plan name · due date · `percent_complete` status badge (Attention=overdue, Warning=in-progress, Good=complete) · inline "Mark Done" `Action.Submit`
- Overdue tasks rendered first with `color: Attention`
- Footer: "Open in Planner" `Action.OpenUrl`

### `task-detail.ts` — `get_task`
- Title + collapsible description (collapsed if > 200 chars)
- `FactSet`: plan · bucket · due date · assignees (display names from `directory_users`) · `percent_complete` · priority
- Actions: "Mark Complete" · "Add Comment" · "Update" — each sends a new message through the agent

### `write-preview.ts` — all preview tools
- Subtitle: tool-specific ("Create task" / "Update task" / "Mark complete" / "Add comment" / "Create plan")
- `FactSet` of proposed changes (field → new value, or before → after for updates)
- Optional `capacityWarning` block: `TextBlock` with `color: Warning` above Confirm button
- Expiry notice: "Confirmation expires in {{ttlMinutes}} min"
- `Action.Submit` **Confirm** (`{ action: 'commit', continuation_id }`) · **Cancel** (`{ action: 'cancel' }`)
- `generateReportWorkflow` variant: adds `Input.Text` for inline edits + **Approve** / **Request changes** buttons

### `workload.ts` — `workload_by_assignee` text output (Planner Agent)
- Header: "Team workload — {{planName or 'all visible plans'}}"
- `ColumnSet` table: person · open · overdue · due this week · completed this week
- Sorted by `open_tasks DESC`
- Rows with `overdue_tasks > 3` highlighted `color: Attention`

### `chart-ybar.ts` — `workload_by_assignee`, `tasks_by_status`, `tasks_by_plan` (Analytics Agent) *(EP-11.3)*

Uses Adaptive Cards 1.5 `Chart.VerticalBar` element (Teams-native renderer) templated via `adaptivecards-templating@2.3.1`.

```typescript
// src/cards/chart-ybar.ts
export interface ChartYBarData {
  title:  string
  series: Array<{ label: string; value: number; color?: string }>
}

export function chartYBarCard(data: ChartYBarData): AdaptiveCard {
  return {
    type: 'AdaptiveCard',
    version: '1.5',
    body: [
      {
        type: 'TextBlock',
        text: data.title,
        weight: 'Bolder',
        size: 'Medium',
      },
      {
        type: 'Chart.VerticalBar',
        data: data.series.map(s => ({ x: s.label, y: s.value })),
      },
    ],
  }
}
```

Analytics Agent system prompt instructs it to always call `chartYBarCard` with tool output — never render a text table. Bar/grouped-bar only in P1; grouped-bar (multiple series) is future.

**Render path:**
1. User: "Who is overloaded this week?" → routes to Analytics Agent
2. Agent calls `workload_by_assignee({ planId? })`
3. Tool returns `{ rows: [{ displayName, openTasks, ... }] }`
4. Agent calls `chartYBarCard({ title: 'Workload by assignee', series: rows.map(r => ({ label: r.displayName, value: r.openTasks })) })`
5. Card sent to Teams

### `scope-decline.ts`
- `TextBlock`: "I don't have visibility into that plan for your account."
- `FactSet` of up to 5 visible plans (inline `list_plans` call)
- `Action.Submit`: "Show my plans"

---

## 13. HTTP Routes

Exported from `createAgentRouter(deps): Hono` in `platform/agent/server/src/routes.ts`. Mounted at `/agent` in `apps/api/src/main.ts` *(EP-14.3)*. `apps/api` injects the tool registry (with registered planner + analytics tools), connector registry, memory provider, and workflow engine into `createAgentRouter`.

### 13.1 Run endpoints

```
POST   /agent/run                      Planner agent stream (slug='planner') — streamKernelSSE
POST   /agent/planner/run              Explicit Planner agent stream
POST   /agent/analytics/run            Analytics agent stream
POST   /agent/faq/run                  FAQ agent stream
POST   /agent/:agentId/run             Custom agent by UUID — resolves profile from DB
```

Run body: `{ message: string; threadId?: string }`

### 13.2 Thread management

```
GET    /agent/threads                  List threads for current user
GET    /agent/threads/:threadId        Thread turn history
DELETE /agent/threads/:threadId        Delete thread
```

### 13.3 Workflow management

```
POST   /agent/workflows/:runId/resume  Resume suspended workflow
GET    /agent/workflows/:runId/status  Workflow run status
```

Resume body: `{ action: 'confirm' | 'cancel'; payload?: Record<string, unknown> }`

### 13.4 Agent profile CRUD

```
GET    /agent/agents                           List published profiles (tenant + global defaults)
POST   /agent/agents                           Create tenant-scoped profile
GET    /agent/agents/:agentId                  Get profile
PATCH  /agent/agents/:agentId                  Update profile (tenant-owned only)
DELETE /agent/agents/:agentId                  Delete profile (tenant-owned only)
```

`tenantId` and `userId` always from `tenantContext` / auth middleware — never from the request body. `PATCH` and `DELETE` reject requests targeting global profiles (`tenant_id IS NULL`) with `403 Forbidden`. The LRU cache entry for the profile is invalidated on successful `PATCH`.

List response includes both the tenant's own profiles and global defaults, with a `isGlobal: boolean` flag on each item. Tenant-created profiles that shadow a global slug (same `slug` value) appear once — the tenant row wins.

### 13.5 Agent action CRUD

```
GET    /agent/agents/:agentId/actions            List actions for agent
POST   /agent/agents/:agentId/actions            Create action (tenant-owned agents only)
PATCH  /agent/agents/:agentId/actions/:actionId  Update action
DELETE /agent/agents/:agentId/actions/:actionId  Delete action
```

Action `spec` field must be a valid single-operation OpenAPI fragment. The route validates the spec shape before persisting and rejects malformed specs with `400`.

---

## 14. Test Strategy

### 14.1 Unit tests (`src/**/*.test.ts`)

- **Permission view SQL:** two-tenant fixture. Assert cross-tenant isolation. Assert plan-member rule. Assert manager rule (manager sees reports' tasks in plans the manager is not a member of). Assert `soft_deleted_at IS NOT NULL` tasks are excluded.
- **`assignee_ids` GIN query:** `= ANY(text[])` syntax round-trips correctly.
- **Status predicate mapping:** `percent_complete` 0/50/100 maps to correct `not_started`/`in_progress`/`completed` filter.
- **Tool schema validation:** `inputSchema` rejects invalid input; `outputSchema` catches malformed returns.
- **Agent routing:** 20 sample queries (EN, VN, mix, analytics/faq prefix triggers) → correct slug selected.
- **Card builders:** snapshot tests for `task-list`, `task-detail`, `write-preview`, `workload`, `chart-ybar` against canonical input shapes.
- **Chart card:** `chartYBarCard` with 0-length series renders without error; correct `Chart.VerticalBar` type field.
- **Continuation HMAC:** replay blocked by `consumed_at`; expired continuation rejected.
- **Capacity warning:** tool returns `capacityWarning` when assignee `open_tasks / (open_tasks + completed_this_week) > 0.9`.
- **DSL compiler:** each `metric` + `scope` combination produces parameterized SQL with no raw user input in the SQL string.
- **Profile resolver:** tenant row takes precedence over global default when both exist for same slug; `DomainError('agent_profile_not_found')` thrown when no row exists.
- **`interpolateInstructions`:** all placeholder strings replaced; unknown placeholders left as-is (no throw).
- **Tool registry:** `resolvePlatformTools` throws `DomainError('unknown_tool_id')` for unregistered IDs.
- **Action builder:** `buildActionTool` produces a `Tool` with correct name/description/schema from a valid OpenAPI operation spec.

### 14.2 Integration tests (`tests/integration/**`, requires `DATABASE_URL`)

- **Sync worker:** msw Graph fixtures → `syncTenant()` → assert `planner_tasks_cache`, `planner_plans_cache`, `plan_members` populated → assert `v_visible_tasks` returns correct rows for a plan-member actor.
- **Manager visibility:** seed `directory_users` with `manager_id` relationship → assert manager actor sees assignee's tasks in plans the manager is not a member of.
- **Soft-delete:** task with `soft_deleted_at` set does not appear in `v_visible_tasks`.
- **Task indexer:** `indexTasks()` → `agent_vector.chunks` has correct `source_id`, `metadata` → `search_tasks_semantic` returns correct task at rank 1 for a matching query.
- **Materialized view refresh:** sync → refresh → `workload_by_assignee` returns correct open/overdue counts.
- **Analytics tools:** `tasks_by_status` grouping matches seeded `percent_complete` distribution; `tasks_by_plan` counts match per plan.
- **`bulkUpdateWorkflow`:** 3 seeded tasks → run → suspend → resume with confirm → assert 3 Graph writes (msw) → assert DB updated.
- **`generateReportWorkflow`:** run → suspend at draft → resume with edits → final card body contains edit text.
- **Cross-tenant isolation:** actor from Tenant A cannot see Tenant B tasks through any tool.
- **`write_continuations` RLS:** continuation created under Tenant A cannot be committed by Tenant B actor.
- **Agent profiles seeder:** `seedSystemAgentProfiles()` on empty DB → 3 rows in `agent_profiles` with `tenant_id IS NULL`; re-run is idempotent.
- **Profile resolution:** global profile returned when no tenant override exists; tenant override returned when it exists for same slug; `status = 'archived'` profiles not returned.
- **Profile RLS:** Tenant A cannot read or write Tenant B's tenant-scoped profiles; both tenants can read global profiles.
- **Agent CRUD API:** `POST /agent/agents` creates profile → `GET` returns it → `PATCH` updates instructions → `DELETE` removes it; `PATCH` on global profile returns 403.
- **Action CRUD API:** create → list → update → delete cycle; `spec` validation rejects malformed OpenAPI fragments.
- **Custom agent run:** create tenant profile via API → `POST /agent/:agentId/run` → kernel executes with correct instructions and tools.

### 14.3 LLM tests (via `@seta/agent-core/testkit`)

`RECORD=1 pnpm vitest run -t <name>`. Recordings under `modules/products/planner/__recordings__/` and `modules/products/analytics/__recordings__/`.

| Recording | Scenario |
|---|---|
| `planner/list-my-tasks-en` | Q01 English → `list_my_tasks(today)` → task-list card |
| `planner/list-my-tasks-vn-mix` | Q03 VN-EN mix → `list_my_tasks` + handoff filter |
| `planner/create-task-clarify` | MT-01: ambiguous create → clarify → preview (with capacity check) → commit |
| `planner/project-status` | Q21: project status → `get_project_status` → prose summary |
| `planner/one-on-one-prep` | Q15 VN-EN → `get_one_on_one_prep` → prep card |
| `planner/query-analytics-text` | Q12: "who's overloaded" → `query_analytics` → workload text card |
| `planner/scope-deny` | DEN-01: access denied → `scope-decline` card |
| `planner/bulk-update` | "reassign all Hoa's tasks" → `bulkUpdateWorkflow` suspend → confirm |
| `planner/generate-report` | Q22: client report → `generateReportWorkflow` → suspend → edit → confirm |
| `analytics/workload-chart` | "who is overloaded this week?" → `workload_by_assignee` → `chart-ybar` card |
| `analytics/tasks-by-status` | "breakdown by status on Atlas" → `tasks_by_status` → chart |
| `analytics/tasks-by-plan` | "which plan has most overdue?" → `tasks_by_plan` → chart |

### 14.4 E2E (`tests/e2e/**`)

- Teams personal activity → `teamsHandler` → plannerAgent (loaded from DB) → `list_my_tasks` → task-list card *(EP-13.6)*
- Teams personal activity → `create_tasks_preview` → Adaptive Card confirm → `create_tasks_commit` → Graph write confirmed *(EP-13.6)*
- Teams personal activity → "who is overloaded?" → analyticsAgent → `workload_by_assignee` → chart-ybar card *(EP-11.4)*
- Teams group chat activity without @mention → agent does NOT respond
- Teams channel activity with @mention → agent responds
- Custom agent profile created via API → run via `POST /agent/:agentId/run` → correct system prompt observed in LLM recording

---

## 15. Package Dependency Changes

All via `pnpm --filter @seta/<pkg> add`. New packages created via `pnpm new:package`.

### New packages

| Package | Location | Description |
|---|---|---|
| `@seta/agent-server` | `platform/agent/server/` | HTTP route factory, profile DB, resolver, hydrator, seeder, tool registry, action builder |
| `@seta/planner` | `modules/products/planner/` | ERP Module #1: all planner tools, schema, cards, workflows, indexer, seed |
| `@seta/analytics` | `modules/products/analytics/` | ERP Module #2: analytics tools, materialized views, chart cards, seed |

### Package dependencies (via `pnpm --filter @seta/<pkg> add`)

| Package | Dependencies |
|---|---|
| `@seta/agent-server` | `@seta/agent-core@workspace:*` `@seta/agent-memory@workspace:*` `@seta/agent-workflows@workspace:*` `@seta/connector-registry@workspace:*` `@hono/zod-openapi@workspace:*` |
| `@seta/planner` | `@seta/agent-core@workspace:*` `@seta/agent-embeddings@workspace:*` `@seta/agent-vector@workspace:*` `@seta/agent-workflows@workspace:*` `@seta/agent-memory@workspace:*` `@seta/connector-ms365-planner@workspace:*` `@seta/connector-ms365-directory@workspace:*` `@seta/connector-registry@workspace:*` `@seta/audit@workspace:*` |
| `@seta/analytics` | `@seta/agent-core@workspace:*` `@seta/connector-ms365-planner@workspace:*` `@seta/connector-ms365-directory@workspace:*` `adaptivecards-templating@2.3.1` |
| `@seta/connector-ms365-planner` | No new external deps — schema additions only (`plan_members`, `sync_watermarks.delta_token`) |
| `@seta/teams` | `@seta/agent-server@workspace:*` (to call run pipeline) |

### Deleted package

`modules/products/agent` (`@seta/agent`) is dissolved. Its contents are redistributed:
- Planner tools + write_continuations schema + permission views → `@seta/planner`
- Analytics tools + materialized views → `@seta/analytics`
- Profile management + HTTP routes + seeder → `@seta/agent-server`
- TeamsHandler → `@seta/teams` (already the right package)

---

## 16. WBS Mapping to Project Plan

Maps every WBS task from `docs/plans/Project Plan.md` to the spec section that covers it. "New" items are design additions not originally in the WBS — they represent scope that the DB-first architecture requires.

### EP-09 · MS Graph + Planner connector

| WBS | Task | Spec section | Notes |
|---|---|---|---|
| 9.1 | Graph HTTP client, OBO token cache | Existing `platform/ms-graph` | No change in this spec |
| 9.2 | `connector_ms365_planner_*` schema + migration + `ConnectorDefinition` | §3.2 | Extends with `plan_members` table + `delta_token` column on `sync_watermarks` |
| 9.3 | READ endpoints (`listPlans`, `listTasks`, `getTask`, `searchTasks`) | §8.1 | **Changed:** tools now query `v_visible_tasks` / `v_visible_plans` directly; connector exposes tables via Drizzle schema, not Graph-calling methods |
| 9.4 | WRITE endpoints (`createTask`, `updateTask`, `closeTask`) with etag | §8.3 | Unchanged — commit path still calls Graph |
| 9.5 | Etag cache (per-tenant LRU, Redis-ready shape) | §8.3 | Unchanged — used by write preview to snapshot etag |
| 9.6 | msw fixtures + recorded scenarios | §14.2, §14.3 | Integration test fixtures for sync worker + LLM recordings |

**New items under EP-09 scope (design additions):**
| Item | Spec section |
|---|---|
| `createPlannerSyncWorker` (delta-poll background worker) | §3.3 |
| `plan_members` table | §3.2 |
| `delta_token` column on `sync_watermarks` | §3.2 |

### EP-10 · Planner ERP Module (`@seta/planner`)

| WBS | Task | Spec section |
|---|---|---|
| 10.1 | Planner seed profile + planner schema (write_continuations, permission views) | §6, §4.3 |
| 10.2 | READ tools: `list_tasks`, `get_task`, `list_plans`, `list_buckets` | §8.1 |
| 10.3 | WRITE tools: `preview_create_task` + `commit_create_task` with HMAC | §8.3 |
| 10.4 | Safety review of WRITE path: prompt-injection, scope check, RLS, idempotency | §14 (test strategy covers all four axes) |
| 10.5 | Adaptive Card — task-list card for READ | §12 `task-list.ts` |
| 10.6 | Adaptive Card — preview card with Confirm/Cancel for WRITE | §12 `write-preview.ts` |

**New items under EP-10 scope:**
| Item | Package | Spec section |
|---|---|---|
| `agent.agent_profiles` table + RLS | `@seta/agent-server` | §5.1 |
| `agent.agent_actions` table + RLS | `@seta/agent-server` | §5.2 |
| Profile resolver + agent hydrator | `@seta/agent-server` | §5.3, §5.4 |
| Tool registry (`tool_id` → implementation) | `@seta/agent-server` | §5.5 |
| OpenAPI Action builder | `@seta/agent-server` | §5.6 |
| Boot seeder (`seedSystemAgentProfiles`) | `@seta/agent-server` | §5.7 |
| Agent profile + action CRUD API | `@seta/agent-server` | §13.4, §13.5 |
| `planner.v_visible_tasks` + `planner.v_visible_plans` permission views | `@seta/planner` | §4.3 |
| `planner.write_continuations` schema | `@seta/planner` | §8.3 |
| `search_tasks_semantic` tool | `@seta/planner` | §8.1 |
| `query_analytics` DSL tool | `@seta/planner` | §8.2 |
| `get_project_status` tool | `@seta/planner` | §8.2 |
| `get_one_on_one_prep` tool | `@seta/planner` | §8.2 |
| `TaskIndexer` (embedding pipeline) | `@seta/planner` | §8.4 |
| `bulkUpdateWorkflow` | `@seta/planner` | §10.1 |
| `generateReportWorkflow` | `@seta/planner` | §10.2 |
| `task-detail.ts`, `workload.ts`, `scope-decline.ts` cards | `@seta/planner` | §12 |
| Capacity warning inside `create_tasks_preview` | `@seta/planner` | §8.3 |

### EP-11 · Analytics ERP Module (`@seta/analytics`)

| WBS | Task | Package | Spec section |
|---|---|---|---|
| 11.1 | Analytics seed profile + analytics schema (materialized views) | `@seta/analytics` | §5, §7 |
| 11.2 | Aggregation tools: `workload_by_assignee`, `tasks_by_status`, `tasks_by_plan` | `@seta/analytics` | §8.2 |
| 11.3 | Chart-card Adaptive Card (`Chart.VerticalBar`) | `@seta/analytics` | §12 `chart-ybar.ts` |
| 11.4 | AG-S review + integration smoke (Teams query → chart card) | — | §14.4 E2E |

### EP-13 · Teams channel (`@seta/teams`)

| WBS | Task | Spec section |
|---|---|---|
| 13.5 | TeamsHandler calls `@seta/agent-server` run pipeline; trigger-phrase routing | §11 |
| 13.6 | Live smoke: round-trip in dev tunnel (SSE → card render) | §14.4 E2E |

### EP-14 · `apps/api` composition (referenced items)

| WBS | Task | Spec section |
|---|---|---|
| 14.3 | `main.ts` creates tool registry, registers planner + analytics tools, mounts `@seta/agent-server` + `@seta/teams` routes, starts sync worker, calls seeder | §13 HTTP routes + §3.3 sync worker + §5.7 seeder |

---

## 17. Open Questions

| # | Question | Default if unresolved |
|---|---|---|
| OQ-1 | ~~`assignee_ids` shape~~ **Resolved:** `text[]` native Postgres array with GIN index. Permission view uses `= ANY(t.assignee_ids)`. | — |
| OQ-2 | `app.user_id` session variable — confirm it is not already set by existing middleware (only `app.tenant_id` is currently set). | Treat as new — set in Teams handler and REST run endpoints alongside `app.tenant_id`. |
| OQ-3 | `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index. | Unique indexes included in §9 DDL — follow as written. |
| OQ-4 | Proactive Teams notification (notifying an assignee after task creation) — confirm `@seta/teams` exposes `sendProactive(userId, card)` or equivalent. | If not available in P1, log the intent and skip the notification step. |
| OQ-5 | `generateReportWorkflow` client-safe filter uses `metadata.labels` to detect internal tasks. Confirm `planner_tasks_cache.raw` contains Planner task categories/labels from Graph. | If not present in `raw`, use bucket name as proxy: bucket named 'Internal' → exclude from report. |
| OQ-6 | `Chart.VerticalBar` element — confirm Teams desktop renders this element in Adaptive Card v1.5. If not supported in dev tunnel during E2E, fall back to `ColumnSet` table rendering and file a Teams compatibility note. | Fall back to `workload.ts` text card if chart element is unsupported in dev environment. |
| OQ-7 | Agent profile LRU cache invalidation — confirm a single-instance cache is acceptable for P1 (multi-instance would need Redis pub/sub for invalidation). | Single-instance LRU acceptable for P1 (`profile:{tenantId}:{slugOrId}`, 5 min TTL). Redis invalidation deferred. |
| OQ-8 | OpenAPI Action auth — `oauth2` flow requires storing client credentials per action. Confirm whether `agent.agent_actions.auth` should store encrypted secrets directly or reference the existing `oauth.oauth_tokens` table. | Store reference to `oauth.oauth_tokens` by `tenant_id` + provider key. Do not store raw secrets in `agent_actions`. |

---

*End of spec.*
