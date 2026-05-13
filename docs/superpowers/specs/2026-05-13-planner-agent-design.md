# Planner Agent — Design Spec

**Date:** 2026-05-13  
**Scope:** `modules/products/agent` (Planner Agent slice) + `modules/connectors/ms365-planner` sync extension  
**Status:** Approved for implementation

---

## 1. Goals & Scope

The Planner Agent is a Teams-native specialist that lets SETA employees query and manage Microsoft Planner tasks through natural language. It is one of three agents in `modules/products/agent`; this spec covers the Planner Agent exclusively.

**In scope:**
- DB-first task reads (delta-poll sync, no per-request Graph calls on reads)
- Intra-tenant permission filtering: plan membership + manager hierarchy
- T1 tools — individual task CRUD (list, get, create, update, complete, comment, plan)
- T2 tools — structured analytics DSL, project status report, 1:1 prep
- Semantic task search via `@seta/agent-vector`
- Three workflows: bulk update, create with capacity check, client report with review
- Bilingual system prompt (EN / VN / EN-VN mix)
- Adaptive Cards for task lists, task detail, write preview, workload, scope denial
- HTTP routes mounted at `/agent`
- Teams handler with trigger-phrase routing across Planner / Analytics / FAQ agents

**Out of scope (P2):**
- Full RBAC (client-confidentiality flags, PM-level cross-project rules, CEO elevate mode)
- Scheduled proactive digests
- SharePoint RAG corpus sync
- MCP server exposure
- Chart rendering (that is the Analytics Agent)

---

## 2. Architecture Overview

```
Teams activity
     │
     ▼
@seta/teams (JWT verify, OBO refresh)
     │ TeamsActivity
     ▼
modules/products/agent
  ├── src/teams-handler.ts        trigger-phrase router
  ├── src/agents/planner.ts       agent definition
  ├── src/tools/planner/          T1 + T2 tools
  ├── src/tools/analytics/        query_analytics DSL tool
  ├── src/workflows/              bulk-update, capacity-check, report
  ├── src/cards/                  Adaptive Card builders
  └── src/routes.ts               Hono routes at /agent
     │
     ├── @seta/agent-core         kernel, streamKernelSSE, testkit
     ├── @seta/agent-memory       thread + working memory persistence
     ├── @seta/agent-workflows    suspend/resume engine
     ├── @seta/agent-embeddings   text-embedding-3-small
     ├── @seta/agent-vector       pgvector HNSW store (agent_vector.chunks)
     ├── @seta/connector-ms365-planner   synced task/plan/member data
     └── @seta/connector-ms365-directory  manager hierarchy
          │
          ▼
     Postgres (RLS + permission views)
```

**Key principle — DB-first reads:** The agent reads all task/plan/member data from local Postgres. Graph is only called on write commits and during the delta-sync background worker. This eliminates per-user Graph rate-limit risk at query time.

---

## 3. Data Sync Layer

### 3.1 Responsibility boundary

The `ms365-planner` connector owns its sync. The agent product never calls Graph for reads.

### 3.2 New schema in `connector_ms365_planner`

```sql
-- Plan membership — who belongs to each plan
CREATE TABLE connector_ms365_planner.plan_members (
  tenant_id   uuid        NOT NULL,
  plan_id     text        NOT NULL,
  user_id     text        NOT NULL,   -- entra_object_id; no FK to directory
  synced_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, plan_id, user_id)
);
ALTER TABLE connector_ms365_planner.plan_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON connector_ms365_planner.plan_members
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Delta sync cursors — Graph delta token per resource per tenant
CREATE TABLE connector_ms365_planner.sync_cursors (
  tenant_id    uuid   NOT NULL,
  resource     text   NOT NULL,  -- 'plans' | 'tasks:{planId}' | 'members:{planId}'
  delta_token  text,
  last_synced  timestamptz,
  PRIMARY KEY (tenant_id, resource)
);
ALTER TABLE connector_ms365_planner.sync_cursors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON connector_ms365_planner.sync_cursors
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Migrations generated via `drizzle-kit generate` in `modules/connectors/ms365-planner`.

### 3.3 `createPlannerSyncWorker` export

New export from `modules/connectors/ms365-planner/src/sync.ts`:

```typescript
export interface PlannerSyncWorkerDeps {
  sql: DbSql
  graph: GraphFetch
  getAppToken: (tenantId: string) => Promise<string>  // client_credentials flow
  intervalMs?: number   // default 3 * 60 * 1000
  onTasksChanged?: (tenantId: string, taskIds: string[]) => void  // hook for indexer
}

export function createPlannerSyncWorker(deps: PlannerSyncWorkerDeps): {
  start(tenantIds: string[]): void
  stop(): void
  syncTenant(tenantId: string): Promise<void>   // callable for manual trigger / tests
}
```

**Sync cycle per tenant (sequential, one tenant at a time to respect Graph rate limits):**

1. Fetch `GET /planner/plans` (no delta for plans — full list, ~small). Upsert into `connector_ms365_planner.plans`.
2. For each plan: fetch `GET /planner/plans/{id}/tasks/delta` using stored `delta_token`. Upsert changed tasks into `connector_ms365_planner.tasks`. Store new `delta_token` in `sync_cursors`.
3. For each plan: fetch `GET /groups/{planGroupId}/members`. Upsert into `plan_members` (delete removed members).
4. Call `deps.onTasksChanged(tenantId, changedTaskIds)` with IDs of tasks that were inserted or updated.

**Auth:** `getAppToken` uses `client_credentials` flow (app-level, not user OBO). This means the sync reads all plans/tasks in the tenant — the permission view (§4) is what scopes individual user reads. The sync token is fetched via `@seta/oauth` using the tenant's stored client_credentials grant.

**Registration:** `apps/api/src/main.ts` calls `worker.start(activeTenantIds)` after boot. `activeTenantIds` is queried from `oauth.tenants` on startup.

---

## 4. Permission Model

### 4.1 Boundary

- **Cross-tenant isolation:** enforced by RLS on all `connector_ms365_planner.*` tables. `app.tenant_id` set per-request via `withTenant` middleware. Backstop: zero cross-tenant leak.
- **Intra-tenant access:** enforced by permission views in the `agent` schema (product-owned). Two rules: plan membership + manager hierarchy.

### 4.2 Session variables

Set once per agent run, before any tool executes. Wired in the Teams handler and in the direct REST run endpoint:

```typescript
await sql`SET LOCAL app.tenant_id = ${tenantId}`;
await sql`SET LOCAL app.user_id   = ${userId}`;   // entra_object_id from Teams JWT
```

`userId` is `entra_object_id` — the same key used in `plan_members.user_id` and `directory_users.entra_object_id`.

### 4.3 Permission views — `agent` schema

These views live in `modules/products/agent/src/schema.ts` (product-owned). They join across connector schemas by ID only — no foreign-key constraints.

```sql
-- Visible tasks: user is a plan member OR user manages an assignee
CREATE VIEW agent.v_visible_tasks AS
SELECT t.*
FROM connector_ms365_planner.tasks t
WHERE t.tenant_id = current_setting('app.tenant_id')::uuid
  AND (
    -- Rule 1: user is a plan member
    EXISTS (
      SELECT 1 FROM connector_ms365_planner.plan_members pm
      WHERE pm.tenant_id = t.tenant_id
        AND pm.plan_id   = t.plan_id
        AND pm.user_id   = current_setting('app.user_id')
    )
    OR
    -- Rule 2: user is the manager of any assignee (manager hierarchy)
    EXISTS (
      SELECT 1 FROM connector_ms365_directory.directory_users du
      WHERE du.tenant_id        = t.tenant_id
        AND du.entra_object_id  = ANY(
              SELECT jsonb_array_elements_text(t.assignee_ids)
            )
        AND du.manager_id       = current_setting('app.user_id')
    )
  );

-- Visible plans: user is a member of the plan
CREATE VIEW agent.v_visible_plans AS
SELECT p.*
FROM connector_ms365_planner.plans p
WHERE p.tenant_id = current_setting('app.tenant_id')::uuid
  AND EXISTS (
    SELECT 1 FROM connector_ms365_planner.plan_members pm
    WHERE pm.tenant_id = p.tenant_id
      AND pm.plan_id   = p.id
      AND pm.user_id   = current_setting('app.user_id')
  );
```

Views are not Drizzle-queryable objects. They are registered as raw SQL in a custom migration:
```
drizzle-kit generate --custom --name add-permission-views
```

### 4.4 Denial behaviour

When a user queries a plan or task not in their visible set:
- Tool returns an empty result (the view simply returns no rows)
- Agent detects empty + plan name present → calls `scope-decline` card path
- Decline message never confirms/denies whether the plan exists
- Agent offers `list_plans` to show what the user CAN see

---

## 5. Agent Definition

### 5.1 `src/agents/planner.ts`

```typescript
export const plannerAgent: AgentDefinition = {
  name: 'planner',
  instructions: buildPlannerPrompt,   // RunContext → string
  model: modelRegistry.get('default'),
  tools: plannerToolSet,              // see §6
  memory: {
    workingMemoryTemplate: `
Active context:
- Last referenced plan: {{activePlan}}
- Last referenced task: {{lastTaskId}}
- Pending clarification: {{pendingQuestion}}
- User timezone: {{timezone}}
    `.trim(),
  },
}
```

### 5.2 System prompt (`buildPlannerPrompt`)

A function over `RunContext` so live values (timezone, conversation scope, elevation) embed directly.

#### Role block
```
You are the Planner Agent for SETA International — an IT services company with 
offices in Vietnam, the US, Ireland, and Japan. You help employees read and manage 
Microsoft Planner tasks through Microsoft Teams.

Capabilities:
- Read: list tasks, get task details, search tasks by meaning, analyse workload,
  get project status, prepare 1:1 meeting briefs
- Write: create tasks, update tasks, mark tasks complete, add comments, create plans
  (all writes require a preview confirmation before executing)

You cannot access plans or tasks the user is not authorised to see. Decline politely 
and offer the user their visible plans via list_plans.
```

#### Language block
```
Detect the dominant language in the user's message — English, Vietnamese, or 
English-Vietnamese mix. Respond in that same dominant language. SETA's Hanoi office 
uses EN-VN code-switching constantly; match their style. Never switch languages 
mid-response.
```

#### Tool selection hints
```
Tool selection:
- "my tasks", "what do I have", "on my plate" → list_my_tasks
- "tasks in plan X", "show [plan name] tasks" → list_plan_tasks
- "find tasks about X", "similar to Y", "have we done Z" → search_tasks_semantic
- "who's overloaded", "team capacity", "workload", "velocity", "completion rate",
  "overdue by plan" → query_analytics
- "project status", "what shipped", "what's blocked on [plan]" → get_project_status
- "1:1 prep for [person]", "[name]'s snapshot" → get_one_on_one_prep
- creating / updating / completing / commenting → use the preview tool first,
  commit only after explicit user confirmation
- "create a plan" → create_plan_preview → create_plan_commit

For ambiguous write requests, ask ONE focused clarifying question before calling 
any preview tool. Never guess plan names or assignee names — confirm with list_plans 
or query_analytics first.
```

#### Write / HITL block
```
Write flow — always follow this order:
1. If any required field is missing or ambiguous, ask one question.
2. Once you have enough information, call the preview tool.
3. Present the preview result as a confirmation card. Explain the proposed change clearly.
4. Wait. Do NOT call the commit tool until the user explicitly says yes / confirms.
5. On confirm: call the commit tool with the continuation_id from the preview.
6. On cancel or silence: do nothing. Do not re-attempt.

Never re-supply the write payload at commit — the continuation_id contains it securely.
```

#### Scope denial block
```
If a task or plan query returns empty because the user lacks access:
- Do not confirm or deny whether the plan exists
- Say: "I don't have visibility into that for your account."
- Follow with: "Here are the plans you have access to:" → call list_plans
```

#### Conversation scope block
```
Current conversation type: {{convType}}
{{#if personal}}
This is a 1:1 chat. Personal task queries ("my tasks", "my workload") are the norm.
{{else}}
This is a shared conversation. Multiple people see your responses. Avoid surfacing
private details about specific individuals unless directly asked.
{{/if}}
```

#### Time zone block
```
User timezone: {{timezone}}
Resolve "today", "this week", "end of day", "before US comes online" relative to 
this timezone. The Hanoi-California gap is ~15 hours — "handoff before end of day" 
means before ~17:00 ICT.
```

---

## 6. Tool Catalog

### 6.1 T1 — Read tools (DB-first)

All read tools query `agent.v_visible_tasks` or `agent.v_visible_plans` via the `sql` dep. Session variables `app.tenant_id` and `app.user_id` are already set before tool execution.

#### `list_my_tasks`
```typescript
inputSchema: z.object({
  timeRange: z.enum(['today', 'this_week', 'overdue', 'all']).default('today'),
  planId:    z.string().optional(),
  status:    z.enum(['notStarted', 'inProgress', 'completed']).optional(),
  limit:     z.number().min(1).max(50).default(20),
})
outputSchema: z.object({
  tasks: z.array(TaskRow),
  summary: z.object({ total: z.number(), overdue: z.number(), dueToday: z.number() }),
})
```
Query: `SELECT * FROM agent.v_visible_tasks WHERE assignee_ids @> $userId AND <time predicate> ORDER BY due_date NULLS LAST, priority DESC`

`today` predicate = `due_date <= today_end OR (status = 'inProgress' AND due_date IS NULL) OR (due_date < today_start AND status != 'completed')`.

#### `list_plan_tasks`
```typescript
inputSchema: z.object({
  planId:  z.string(),
  bucket:  z.string().optional(),
  status:  z.enum(['notStarted', 'inProgress', 'completed']).optional(),
  assigneeId: z.string().optional(),
  limit:   z.number().min(1).max(100).default(50),
})
```
Query: `SELECT * FROM agent.v_visible_tasks WHERE plan_id = $planId AND <filters>`

#### `get_task`
```typescript
inputSchema: z.object({ taskId: z.string() })
outputSchema: TaskDetailRow   // includes description, checklist, comments count
```
Query: `SELECT * FROM agent.v_visible_tasks WHERE id = $taskId LIMIT 1`

#### `list_plans`
```typescript
inputSchema: z.object({ limit: z.number().default(20) })
outputSchema: z.object({ plans: z.array(PlanRow) })
```
Query: `SELECT * FROM agent.v_visible_plans ORDER BY title`

#### `list_buckets`
```typescript
inputSchema: z.object({ planId: z.string() })
```
Query: `SELECT * FROM connector_ms365_planner.buckets WHERE plan_id = $planId AND tenant_id = $tenantId`
Bucket visibility equals plan membership — no extra filter needed beyond tenant RLS.

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
1. `embedding = await embeddings.embed(query)` — `@seta/agent-embeddings`, `text-embedding-3-small`
2. Query `agent_vector.chunks` with `SET LOCAL hnsw.iterative_scan = strict_order` (correctness gate per `setup.md §6`):
```sql
SELECT c.source_id, 1 - (c.embedding <=> $vec) AS score, c.content
FROM agent_vector.chunks c
WHERE c.tenant_id = $tenantId
  AND c.metadata->>'type' = 'planner_task'
  AND ($planId IS NULL OR c.metadata->>'plan_id' = $planId)
ORDER BY c.embedding <=> $vec
LIMIT $topK
```
3. JOIN result `source_id` back to `agent.v_visible_tasks` — permission filter. Discard any chunk whose task ID does not appear in `v_visible_tasks`.
4. Return ranked list with `snippet = content[:200]`.

### 6.2 T2 — Analytics tools

#### `query_analytics`
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
  timeRange: z.object({
    from: z.string(),  // ISO date or relative string
    to:   z.string(),
  }).optional(),
  groupBy: z.enum(['assignee', 'plan', 'week', 'status']).optional(),
  limit:   z.number().min(1).max(100).default(20),
})
annotations: { readOnlyHint: true }
```

**Permission gate before compile:**
- `scope.type = 'direct_reports'` → verify `directory_users WHERE manager_id = $userId` is non-empty; else error "You have no direct reports in the directory."
- `scope.type = 'org'` → verify all plans are visible (count `v_visible_plans` == count `plans`); else error with count of visible vs total.
- `scope.type = 'plan'` → verify `planId` exists in `v_visible_plans`.

**DSL → SQL compilation:** each `metric` maps to a parameterized SQL template against `agent.mv_assignee_workload` or `agent.mv_plan_weekly_velocity`. Templates use `$tenantId` + `$visiblePlanIds` array filter (never raw user input in SQL).

**Result caching:** 5-minute Redis-shaped LRU cache (keyed by `hash(tenantId + userId + input)`). Backed by LRU in-process cache for P1 (Redis-ready shape per CLAUDE.md).

#### `get_project_status`
```typescript
inputSchema: z.object({
  planId: z.string(),
  since:  z.string().default('7 days ago'),
})
outputSchema: z.object({
  planName:    z.string(),
  completed:   z.array(TaskRow),    // completed since `since`
  inProgress:  z.array(TaskRow),    // currently in-progress
  blocked:     z.array(TaskRow),    // in-progress + no update > 3 days
  upcoming:    z.array(TaskRow),    // not started, due in next 7 days
  unassigned:  z.array(TaskRow),    // not started, no assignee
})
annotations: { readOnlyHint: true }
```

Runs 4 queries in parallel via `p-queue` (all against `agent.v_visible_tasks`). The agent synthesises the structured sections into a prose status summary or passes to a card.

#### `get_one_on_one_prep`
```typescript
inputSchema: z.object({
  targetUserId: z.string(),       // entra_object_id; resolve from name via org_lookup first
  lookbackDays: z.number().int().min(1).max(30).default(14),
})
outputSchema: z.object({
  targetName:      z.string(),
  completed:       z.array(TaskRow),
  inProgress:      z.array(TaskRow),
  blocked:         z.array(TaskRow),
  workloadPercent: z.number(),         // open / (open + completed in window) * 100
  talkingPoints:   z.array(z.string()), // auto-derived: stale tasks, overload, blockers
})
annotations: { readOnlyHint: true }
```

**Permission gate:** `SELECT manager_id FROM connector_ms365_directory.directory_users WHERE entra_object_id = $targetUserId AND tenant_id = $tenantId` must equal `current_setting('app.user_id')`. If not, return error: "You can only request 1:1 prep for your direct reports."

### 6.3 T1 — Write tools (preview/commit pairs)

Architecture unchanged from current implementation. Each pair:
- **Preview tool:** reads current etag from Graph (OBO token), stores HMAC-signed continuation in `agent.write_continuations`, returns `{ continuation_id, summary, etag_snapshot, expiresAt }`.
- **Commit tool:** validates HMAC, checks `consumed_at` is null (idempotency), calls Graph with `If-Match: etag`, on success upserts changed task into `connector_ms365_planner.tasks` (immediate local DB update without waiting for next sync), marks continuation consumed, writes audit row.

Tools: `update_tasks_preview/commit`, `create_tasks_preview/commit`, `complete_tasks_preview/commit`, `add_comments_preview/commit`, `create_plan_preview/commit`.

All annotated: preview → `{ readOnlyHint: true, idempotentHint: true }`, commit → `{ destructiveHint: true }`.

### 6.4 Embedding pipeline — `TaskIndexer`

Exported from `modules/products/agent` (product concern — the product decides tasks are embedded).

```typescript
// src/indexer.ts
export interface TaskIndexerDeps {
  sql:        DbSql
  embeddings: EmbeddingProvider    // @seta/agent-embeddings
  vector:     VectorStore          // @seta/agent-vector
  concurrency?: number             // p-queue concurrency, default 5
}

export function createTaskIndexer(deps: TaskIndexerDeps): {
  indexTasks(tenantId: string, taskIds: string[]): Promise<void>
}
```

Called by `apps/api/src/main.ts` via the `onTasksChanged` hook of `createPlannerSyncWorker`. For each task ID:
1. Fetch task from `connector_ms365_planner.tasks` (no permission filter — indexer is a background process running as `platform_admin`)
2. `content = \`${task.title}\n${task.description ?? ''}\`.slice(0, 2000)`
3. `embedding = await deps.embeddings.embed(content)`
4. Upsert into `agent_vector.chunks`:
   - `source_id = task.id`
   - `tenant_id = task.tenant_id`
   - `content = content`
   - `char_range = { start: 0, end: content.length }`
   - `metadata = { type: 'planner_task', plan_id: task.plan_id, plan_name: task.plan_name }`
   - `embedding = embedding`

---

## 7. Materialized Views

Owned by `agent` schema. Refreshed after each sync cycle via `REFRESH MATERIALIZED VIEW CONCURRENTLY`. The `CONCURRENTLY` option ensures reads are never blocked during refresh.

**Refresh trigger:** `apps/api/src/main.ts` registers an `afterSync` hook on `createPlannerSyncWorker`. The hook runs two things in sequence: (1) `taskIndexer.indexTasks(tenantId, changedTaskIds)` for embeddings, (2) `REFRESH MATERIALIZED VIEW CONCURRENTLY agent.mv_assignee_workload` and `agent.mv_plan_weekly_velocity` (using `platform_admin` role, which bypasses RLS). Both run after every sync cycle regardless of whether tasks changed — view refresh is cheap relative to the sync itself.

### `agent.mv_assignee_workload`
```sql
CREATE MATERIALIZED VIEW agent.mv_assignee_workload AS
SELECT
  t.tenant_id,
  assignee_id.value                                                          AS user_id,
  t.plan_id,
  COUNT(*) FILTER (WHERE t.status != 'completed')                            AS open_tasks,
  COUNT(*) FILTER (WHERE t.due_date < now()
                     AND t.status != 'completed')                            AS overdue_tasks,
  COUNT(*) FILTER (WHERE t.due_date BETWEEN now()
                              AND now() + INTERVAL '7 days'
                     AND t.status != 'completed')                            AS due_this_week,
  COUNT(*) FILTER (WHERE t.status = 'completed'
                     AND t.completed_at > now() - INTERVAL '7 days')        AS completed_this_week
FROM connector_ms365_planner.tasks t
CROSS JOIN LATERAL jsonb_array_elements_text(t.assignee_ids) AS assignee_id(value)
GROUP BY t.tenant_id, assignee_id.value, t.plan_id;

CREATE UNIQUE INDEX ON agent.mv_assignee_workload (tenant_id, user_id, plan_id);
```

### `agent.mv_plan_weekly_velocity`
```sql
CREATE MATERIALIZED VIEW agent.mv_plan_weekly_velocity AS
SELECT
  tenant_id,
  plan_id,
  date_trunc('week', completed_at)  AS week,
  COUNT(*)                          AS tasks_completed
FROM connector_ms365_planner.tasks
WHERE status = 'completed'
  AND completed_at IS NOT NULL
GROUP BY tenant_id, plan_id, date_trunc('week', completed_at);

CREATE UNIQUE INDEX ON agent.mv_plan_weekly_velocity (tenant_id, plan_id, week);
```

**Permission enforcement for materialized views:** `query_analytics` tool applies `AND plan_id = ANY($visiblePlanIds)` where `$visiblePlanIds` is fetched from `agent.v_visible_plans` for the current user before executing any aggregation query. Materialized views snapshot at refresh time and cannot use session-level RLS directly.

**Health status thresholds** (computed by agent from `query_analytics` output, defined in system prompt not in code):
- 🟢 Green: 0 overdue tasks across all plans
- 🟡 Yellow: 1–3 overdue OR any task with no activity > 5 days
- 🔴 Red: > 3 overdue OR any task with no activity > 10 days

---

## 8. Workflows

Uses `@seta/agent-workflows` `.then()` / `.parallel()` DSL. Workflow state persisted in `agent_workflows.runs` + `agent_workflows.steps`. `run_id` is the cross-audit correlation key.

### 8.1 `bulkUpdateWorkflow`

Triggered when the agent detects > 1 task affected by a single write intent (e.g. "reassign all of Hoa's overdue Atlas tasks to Phong", "mark all Sprint 14 tasks complete").

```
bulkUpdateWorkflow
  .then(resolveTasks)      → query v_visible_tasks with the filter; return matched list + count
  .then(previewBulk)       → render write-preview card with task checklist
                             ctx.suspend({ reason: 'bulk_confirm', resumeLabel: 'Confirm all' })
  .then(executeBulk)       → resumed with user choice (confirm/deselect/cancel)
                             fan-out writes via p-queue(concurrency=5) → Graph → DB upsert
  .then(auditBulk)         → write one audit row per completed write, link to run_id
  .then(summaryCard)       → return "N tasks updated, M failed" card
```

`resolveTasks` input: `{ filter: { planId?, assigneeId?, status?, buckets? }, writeIntent: { type, payload } }`
`executeBulk` input: `{ selectedTaskIds: string[], writeIntent }` — user can deselect individual tasks from the preview checklist.

### 8.2 Capacity check — inside `create_tasks_preview` (no separate workflow)

Single-task creation does not need a workflow — the existing preview/commit pattern already provides the HITL gate. Capacity enforcement is added directly inside `create_tasks_preview`'s `execute` body:

1. Validate actor is in `plan_members` for the target plan.
2. Validate each assignee is in `plan_members` for the target plan.
3. For each assignee: query `agent.mv_assignee_workload`. If `open_tasks / (open_tasks + completed_this_week) > 0.9`, attach a `capacityWarning` field to the preview response.
4. The preview tool still stores the HMAC continuation and returns the preview card as normal — the warning is an additional field the card builder renders as a yellow notice block.
5. The user confirms or cancels the preview card as usual. No extra suspend/resume step.

The `write-preview.ts` card builder accepts an optional `capacityWarning?: { assigneeName: string; openTasks: number }` and renders it as a `TextBlock` with `color: Warning` above the Confirm button.

### 8.3 `generateReportWorkflow`

Triggered when the user requests a **client-facing** status report (e.g. "Generate the client status report for Atlas"). Internal status queries (`get_project_status`) do not go through this workflow.

```
generateReportWorkflow
  .then(gatherReportData)   → calls get_project_status internally; also pulls plan metadata
  .then(draftReport)        → kernel synthesises draft:
                               - strips tasks tagged 'internal' in metadata
                               - format: shipped this week · in-flight · risks · next milestone
                               - no engineer names unless relevant to the context
  .then(previewDraft)       → renders draft as write-preview card with editable Input.Text area
                              ctx.suspend({ reason: 'report_review', resumeLabel: 'Approve' })
  .then(finaliseReport)     → resumed with user edits (if any) applied
                              renders final card with copy-to-clipboard action + "Send to client" hint
  .then(auditReport)        → logs: actor, plan_id, timestamp, was_edited (bool)
```

Client-safe filter in `draftReport` step: tasks whose `metadata.labels` array contains `'internal'`, `'team-process'`, or `'internal-blocker'` are excluded from the report body. Individual engineer names in blocker descriptions are replaced with "team member" unless the actor is a PM on that plan.

---

## 9. Teams Handler + Routing

### 9.1 `src/teams-handler.ts`

```typescript
export function createTeamsHandler(deps: TeamsHandlerDeps): TeamsHandler {
  return async (activity, runCtx) => {
    const text    = stripMention(activity.text).trim();
    const convType = activity.conversation.conversationType;

    // Set DB session vars once — all tools read from these
    await deps.sql`SET LOCAL app.tenant_id = ${runCtx.tenantId}`;
    await deps.sql`SET LOCAL app.user_id   = ${runCtx.userId}`;

    const agent    = selectAgent(text, deps.agents);
    const threadId = buildThreadId(activity, runCtx);

    const result = await runKernel({
      agent,
      input:          text,
      threadId,
      memory:         deps.memory,
      workflowEngine: deps.workflowEngine,
      abortSignal:    runCtx.abortSignal,
    });

    return buildReplyActivity(result, agent.name, convType);
  };
}
```

### 9.2 Trigger-phrase routing

```typescript
function selectAgent(text: string, agents: AgentMap): AgentDefinition {
  const t = text.toLowerCase();

  if (/^(analytics:|chart|workload chart|show.*chart|velocity|burn.?down)/i.test(t))
    return agents.analytics;

  if (/^(faq:|policy|how do (i|we)|what is (our|the|seta)|company.*rule|quy định)/i.test(t))
    return agents.faq;

  return agents.planner;  // default
}
```

The Planner Agent is the default — any message that does not match the analytics or FAQ prefix routes to Planner. Planner itself routes internally to `query_analytics` for aggregation questions.

### 9.3 Thread ID strategy

| Conversation type | Thread ID | Memory privacy |
|---|---|---|
| `personal` (1:1) | `t:{tenant}:u:{user}:personal` | Private to user |
| `groupChat` | `t:{tenant}:gc:{conversationId}` | Shared in group |
| `channel` | `t:{tenant}:ch:{channelId}` | Shared in channel |

Cross-scope memory carry-over is disabled: `personal` threads never share working memory with `groupChat` / `channel` threads for the same user.

### 9.4 Conversation scope behaviour

- **`personal`:** All queries allowed. Personal context ("my tasks", "my workload", "1:1 prep for my report") is the primary use case.
- **`groupChat`:** @mention required. Shared memory — agent is aware multiple people may read responses. Avoids surfacing private individual task details unless directly asked.
- **`channel`:** @mention required. If channel has a configured `planId` binding (stored in `agent.channel_plan_bindings`, future), `list_plan_tasks` auto-scopes to that plan. P1: no binding; user must specify plan.

---

## 10. Adaptive Cards

All card builders in `src/cards/`. Cards are plain objects (not class instances). Card schema validated against Adaptive Card v1.5 spec.

### `task-list.ts`
- Header: task count + filter badge (Overdue / Today / This Week / All)
- Rows: title · plan name · due date · status badge (colour-coded: Attention=overdue, Good=completed, Default=in-progress) · inline "Mark Done" `Action.Submit`
- Overdue tasks displayed first, colour `Attention`
- Footer: "Open in Planner" `Action.OpenUrl` per task URL

### `task-detail.ts`
- Title block + collapsible description (collapsed if > 200 chars)
- Metadata `FactSet`: plan · bucket · due date · assignees (display names from `directory_users`) · status · priority
- Action row: "Mark Complete" · "Add Comment" · "Update" — each sends a new message back through the agent

### `write-preview.ts`
Shared across all preview tools.
- Header: tool-specific subtitle ("Create task" / "Update task" / "Mark complete" / "Add comment" / "Create plan")
- `FactSet` of proposed changes (field → new value, or before → after for updates)
- Expiry notice: "This confirmation expires in {{ttlMinutes}} minutes"
- Two `Action.Submit` buttons: **Confirm** (`{ action: 'commit', continuation_id }`) · **Cancel** (`{ action: 'cancel' }`)
- For `generateReportWorkflow` draft: includes `Input.Text` field for inline edit + **Approve** / **Request changes** buttons

### `workload.ts`
- Header: "Team workload — {{planName or 'all plans'}}"
- `ColumnSet` table: person · open tasks · overdue · due this week · completed this week
- Rows sorted by open_tasks DESC
- Row colour: `Attention` if open_tasks > 10 or overdue > 3 (configurable via system prompt thresholds)

### `scope-decline.ts`
- Single `TextBlock`: "I don't have visibility into that plan for your account."
- `FactSet` of visible plans (from `list_plans` inline call, limited to 5)
- `Action.Submit`: "Show my plans" → triggers `list_plans` tool call

---

## 11. HTTP Routes

Exported from `routes(registry: ConnectorRegistry): Hono` in `modules/products/agent/src/index.ts`. Mounted at `/agent` in `apps/api/src/main.ts`.

```
POST   /agent/run                       Stream planner agent run (default) via streamKernelSSE
POST   /agent/planner/run               Explicit planner agent stream
POST   /agent/analytics/run             Analytics agent stream
POST   /agent/faq/run                   FAQ agent stream

GET    /agent/threads                    List threads for current user
GET    /agent/threads/:threadId          Get thread turn history
DELETE /agent/threads/:threadId          Delete thread

POST   /agent/workflows/:runId/resume   Resume suspended workflow (Adaptive Card confirm)
GET    /agent/workflows/:runId/status   Workflow run status
```

**Run request body:**
```typescript
{ message: string; threadId?: string }
```
`tenantId` and `userId` always come from `tenantContext` / auth middleware — never from the request body.

**`/agent/workflows/:runId/resume` body:**
```typescript
{ action: 'confirm' | 'cancel'; payload?: Record<string, unknown> }
```
`payload` carries user edits from the Adaptive Card (e.g. selected task IDs for bulk, edited report text).

---

## 12. Test Strategy

### 12.1 Unit tests (`src/**/*.test.ts`)

- **Permission view SQL:** two-tenant fixture (Tenant A / Tenant B). Assert Tenant A actor sees only Tenant A tasks. Assert plan-member rule: user sees tasks only on plans where `plan_members` entry exists. Assert manager rule: manager sees reports' tasks across plans manager is not a member of. Assert no cross-tenant bleed.
- **Tool schema validation:** every tool's `inputSchema` rejects invalid input; `outputSchema` catches malformed responses.
- **Routing logic:** 20 sample queries (EN, VN, mix, analytics triggers, FAQ triggers) → assert correct agent selection.
- **Card builders:** snapshot tests against canonical Planner API shape fixtures.
- **Continuation HMAC:** preview → HMAC valid → commit succeeds; replay blocked by `consumed_at`; expired continuation rejected.
- **DSL compiler:** each `metric` + `scope` combination compiles to expected parameterized SQL (no raw user input in SQL string).
- **Capacity check threshold:** `workload_percent > 90` triggers warning; `<= 90` does not.

### 12.2 Integration tests (`tests/integration/**`, requires `DATABASE_URL`)

- **Sync worker round-trip:** Graph fixtures via msw → `syncTenant()` → assert tasks/plans/members in connector tables → assert `v_visible_tasks` returns correct rows for plan-member actor.
- **Manager visibility:** seed `directory_users` with manager relationship; assert manager sees assignee's tasks in plans manager is not a member of.
- **Task indexer:** `indexTasks()` → `agent_vector.chunks` populated with correct `source_id` and `metadata` → `search_tasks_semantic` returns expected task at top-1 for matching query.
- **Materialized view refresh:** sync → refresh → `query_analytics(workload_by_assignee)` returns correct counts.
- **`bulkUpdateWorkflow`:** seed 3 tasks → run workflow → suspend → resume with confirm → assert Graph write called 3 times (msw) → assert DB updated.
- **`generateReportWorkflow`:** run → suspend at draft preview → resume with edits → assert final card body contains edit.
- **Cross-tenant isolation:** two tenants seeded; actor from Tenant A cannot see Tenant B tasks via any tool.
- **`write_continuations` RLS:** two tenants; continuation created for Tenant A cannot be committed by Tenant B actor.

### 12.3 LLM tests (via `@seta/agent-core/testkit`)

Recorded with `RECORD=1 pnpm vitest run -t <name>`. Recordings under `modules/products/agent/__recordings__/planner/`.

| Recording name | Scenario |
|---|---|
| `list-my-tasks-en` | Q01 in English → `list_my_tasks(today)` → task-list card |
| `list-my-tasks-vn-mix` | Q03 in VN-EN mix → `list_my_tasks` + handoff filter |
| `create-task-clarify` | MT-01: ambiguous create → clarify → preview → commit |
| `create-with-capacity` | MT-03: create → capacity warning workflow → suspend → confirm |
| `project-status` | Q21: project status → `get_project_status` → prose summary |
| `one-on-one-prep` | Q15 in VN-EN → `get_one_on_one_prep` → prep card |
| `query-analytics-workload` | Q12: who's overloaded → `query_analytics(workload_by_assignee)` |
| `scope-deny` | DEN-01: access denied → scope-decline card |
| `bulk-update` | "reassign all Hoa's tasks to Phong" → `bulkUpdateWorkflow` |
| `generate-report` | Q22: client status report → `generateReportWorkflow` → suspend → confirm |

### 12.4 E2E (`tests/e2e/**`)

- Teams personal activity → `teamsHandler` → plannerAgent → `list_my_tasks` → task-list card rendered (msw Graph fixtures + dockerized pg)
- Teams personal activity → `create_tasks_preview` → Adaptive Card confirm action → `create_tasks_commit` → Graph write confirmed (msw)
- Teams group chat activity without @mention → agent does NOT respond
- Teams channel activity with @mention → agent responds with channel-scoped context

---

## 13. Package Dependency Changes

All changes via `pnpm --filter @seta/<pkg> add`:

| Package | New deps |
|---|---|
| `@seta/connector-ms365-planner` | (no new external deps; `plan_members` + `sync_cursors` are schema additions only) |
| `@seta/agent` | `@seta/agent-embeddings@workspace:*`, `@seta/agent-vector@workspace:*`, `@seta/agent-rag@workspace:*`, `@seta/agent-workflows@workspace:*`, `@seta/agent-memory@workspace:*`, `@seta/connector-ms365-directory@workspace:*`, `@seta/connector-registry@workspace:*`, `@seta/audit@workspace:*` |

Missing from current `package.json` per SCOPE.md open questions — all added before tool implementation begins.

---

## 14. Open Questions (to resolve before implementation)

| # | Question | Default if unresolved |
|---|---|---|
| OQ-1 | Does `connector_ms365_planner.tasks.assignee_ids` exist as `jsonb`? Current schema may store assignments differently. Confirm before writing permission view. | Assume `jsonb` array of `entra_object_id` strings. |
| OQ-2 | `app.user_id` Postgres session variable — is it already set by existing middleware, or does only `app.tenant_id` exist? | Add `app.user_id` as a new session variable set in the Teams handler and run endpoints. |
| OQ-3 | `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index. Confirm unique indexes on both materialized views before running refresh. | Spec includes unique index definitions — follow as written. |
| OQ-4 | Proactive Teams notification in `createTaskWithCapacityCheckWorkflow` step 5 (`notifyAssignee`) requires a cached conversation reference. Confirm `@seta/teams` exposes `sendProactive(userId, card)` or equivalent. | If not available in P1, drop `notifyAssignee` step and log instead. |
| OQ-5 | `generateReportWorkflow` client-safe filter uses `metadata.labels` to detect internal tasks. Confirm the Planner connector syncs task labels/categories from Graph. | If labels are not synced, use task bucket name as the filter proxy (bucket named 'Internal' → exclude). |

---

*End of spec.*
