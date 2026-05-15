# PR-10: Workflow-Run Viewer Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the workflow-run viewer end-to-end: extend KernelChunk with workflow_step_* variants, createWorkflowAdminRoutes (5 routes), WorkflowGraph SVG DAG component in @seta/ui, SDK additions, Studio /workflows + /workflows/:id + /workflows/:id/runs/:runId pages with live SSE colorization.

**Architecture:** Workflow chunks flow through the same SSE pipeline as agent runs. WorkflowGraph uses dagre.js to compute SVG node positions client-side. Status per node is colored by node-state from the latest chunk for that step. Live runs update node colors as SSE chunks arrive.

**Tech Stack:** Hono, @hono/zod-openapi, Zod 4.4.3, dagre (new pinned dep in @seta/ui), @seta/agent-workflows, @seta/agent-sdk (extended chunk schemas + new methods), @seta/ui (Tabs from PR-8, WorkflowGraph new, Timeline, KeyValueList from PR-8, Code, StatusBadge).

---

## Phase 1 — Extend KernelChunk in @seta/agent-sdk

### 1.1 Workflow-step chunk Zod schemas (TDD)

- [ ] **1.1.1** Create failing test `platform/agent/sdk/src/schemas/chunk.workflow.test.ts`. Cases:
  - `workflow_step_started` parses `{ type: 'workflow_step_started', runId, stepId, label, startedAt }`.
  - `workflow_step_completed` parses with `{ ..., output, finishedAt, durationMs }`.
  - `workflow_step_failed` parses with `{ ..., error: KernelErrorPayload, finishedAt }`.
  - `workflow_run_end` parses with `{ type: 'workflow_run_end', runId, status: 'completed'|'failed'|'bailed', finishedAt }`.
  - All four reject malformed inputs (missing `runId`, missing `stepId`, wrong `type` literal).
  - Run `pnpm --filter @seta/agent-sdk test:unit -t chunk.workflow` — expect import error.

- [ ] **1.1.2** Extend `platform/agent/sdk/src/schemas/chunk.ts`. Append (do not edit existing variants):

```ts
export const WorkflowStepStartedChunk = z.object({
  type: z.literal('workflow_step_started'),
  runId: z.string(),
  stepId: z.string(),
  label: z.string(),
  startedAt: z.string(),
})

export const WorkflowStepCompletedChunk = z.object({
  type: z.literal('workflow_step_completed'),
  runId: z.string(),
  stepId: z.string(),
  output: z.unknown(),
  finishedAt: z.string(),
  durationMs: z.number(),
})

export const WorkflowStepFailedChunk = z.object({
  type: z.literal('workflow_step_failed'),
  runId: z.string(),
  stepId: z.string(),
  error: KernelErrorPayload,
  finishedAt: z.string(),
})

export const WorkflowRunEndChunk = z.object({
  type: z.literal('workflow_run_end'),
  runId: z.string(),
  status: z.enum(['completed', 'failed', 'bailed']),
  finishedAt: z.string(),
})
```

Update the `KernelChunk` discriminated union to include the four new variants alongside existing ones. Re-run test — green.

- [ ] **1.1.3** Update `platform/agent/sdk/src/index.ts` to export `WorkflowStepStartedChunk`, `WorkflowStepCompletedChunk`, `WorkflowStepFailedChunk`, `WorkflowRunEndChunk`.

- [ ] **1.1.4** Add a `parseSseStream` round-trip test in `platform/agent/sdk/src/sse/parseSseStream.workflow.test.ts` feeding a synthetic SSE byte stream with `data: <json>\n\n` frames for each new variant. Assert all four chunks emitted in order. Run — green.

- [ ] **1.1.5** Commit: `feat(agent-sdk): extend KernelChunk with workflow_step_* + workflow_run_end variants`.

---

## Phase 2 — @seta/agent-workflows: Zod schemas + DB readers

### 2.1 Public Zod schemas

- [ ] **2.1.1** Create `platform/agent/workflows/src/admin/schemas.ts` exporting (import `z` from `'zod'`, the package already pins `zod@4.4.3`):

```ts
import { z } from 'zod'

export const WorkflowStep = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['single', 'parallel']),
  schema: z.unknown().optional(),
})
export type WorkflowStep = z.infer<typeof WorkflowStep>

export const WorkflowEdge = z.object({
  from: z.string(),
  to: z.string(),
})
export type WorkflowEdge = z.infer<typeof WorkflowEdge>

export const WorkflowDefinition = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  steps: z.array(WorkflowStep),
  edges: z.array(WorkflowEdge),
  lastRunAt: z.string().nullable(),
})
export type WorkflowDefinition = z.infer<typeof WorkflowDefinition>

export const WorkflowRunSummary = z.object({
  id: z.string(),
  workflowId: z.string(),
  status: z.enum(['running', 'suspended', 'completed', 'failed', 'bailed']),
  startedAt: z.string(),
  durationMs: z.number().nullable(),
})
export type WorkflowRunSummary = z.infer<typeof WorkflowRunSummary>

export const WorkflowRunStepDetail = z.object({
  stepId: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'suspended']),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.unknown().nullable(),
})
export type WorkflowRunStepDetail = z.infer<typeof WorkflowRunStepDetail>

export const WorkflowRunDetail = WorkflowRunSummary.extend({
  steps: z.array(WorkflowRunStepDetail),
})
export type WorkflowRunDetail = z.infer<typeof WorkflowRunDetail>
```

- [ ] **2.1.2** Co-located unit test `platform/agent/workflows/src/admin/schemas.test.ts`: round-trip parse of a representative `WorkflowDefinition` and `WorkflowRunDetail` (success + reject-bad). Green.

### 2.2 `listWorkflows(sql, { tenantId })`

- [ ] **2.2.1** Failing integration test `platform/agent/workflows/tests/integration/list-workflows.int.test.ts`. Seed two snapshots with different `workflow_id`s for one tenant, one for another tenant. Assert: returns rows only for the requested tenant; one entry per distinct `workflow_id`; `lastRunAt` reflects the latest snapshot `updated_at`; reads from registry to fill `name`/`version`/`steps`/`edges` (use `workflowRegistry.get(id)`); for unregistered workflows return `name = id`, `version = 'unknown'`, empty `steps`/`edges`.

- [ ] **2.2.2** Implement `platform/agent/workflows/src/admin/list-workflows.ts` exporting `listWorkflows(sql, opts: { tenantId: string }): Promise<WorkflowDefinition[]>`. Use `withTenant(sql, tenantId, async (tx) => …)` (already used elsewhere in the package). Single SQL: `SELECT workflow_id, max(updated_at) AS last_run_at FROM agent_workflows.workflow_snapshots GROUP BY workflow_id`. Join with `workflowRegistry` lookup to build step/edge arrays. Validate output via `WorkflowDefinition.array().parse(...)` before returning.

- [ ] **2.2.3** Run integration test (`pnpm --filter @seta/agent-workflows test:integration -t list-workflows`). Green.

### 2.3 `getWorkflow(sql, workflowId, tenantId)`

- [ ] **2.3.1** Failing integration test `platform/agent/workflows/tests/integration/get-workflow.int.test.ts`. Seed: registered workflow with three steps + two edges; one snapshot row to drive `lastRunAt`. Assert returns full `WorkflowDefinition`. Also assert 404-equivalent (`WorkflowNotRegistered`) is thrown when workflow is not registered AND has no snapshot rows.

- [ ] **2.3.2** Implement `platform/agent/workflows/src/admin/get-workflow.ts` exporting `getWorkflow(sql, workflowId: string, tenantId: string): Promise<WorkflowDefinition>`. Reuses graph extractor in `graph.ts` (`extractEdges(workflow)` helper — add if absent) to derive `edges` from registered `BuiltWorkflow`. Throw `WorkflowNotRegistered` if missing.

- [ ] **2.3.3** Run test. Green.

### 2.4 `listWorkflowRuns(sql, workflowId, { tenantId, cursor })`

- [ ] **2.4.1** Failing integration test `platform/agent/workflows/tests/integration/list-workflow-runs.int.test.ts`. Seed 75 snapshots across two workflows. Assert:
  - Default page returns 50 ordered by `created_at desc`.
  - Cursor (last row's `created_at|run_id`) advances page; `nextCursor` is null on last page.
  - Tenant isolation: a third tenant's snapshots are excluded.
  - `durationMs` derives from `updated_at - created_at` only when `status in ('completed','failed','bailed')`; null otherwise.

- [ ] **2.4.2** Implement `platform/agent/workflows/src/admin/list-workflow-runs.ts`:

```ts
export interface ListWorkflowRunsOpts {
  tenantId: string
  cursor?: string | null
  limit?: number
}
export interface ListWorkflowRunsPage {
  rows: WorkflowRunSummary[]
  nextCursor: string | null
}
export async function listWorkflowRuns(
  sql: Sql,
  workflowId: string,
  opts: ListWorkflowRunsOpts,
): Promise<ListWorkflowRunsPage>
```

Cursor format: `${iso}|${runId}` base64-encoded. Default limit 50, hard cap 200.

- [ ] **2.4.3** Run integration. Green.

### 2.5 `getWorkflowRun(sql, runId, tenantId)`

- [ ] **2.5.1** Failing integration test `platform/agent/workflows/tests/integration/get-workflow-run.int.test.ts`. Seed a snapshot + three step rows (one running, one completed, one failed). Assert merged `WorkflowRunDetail` shape; cross-tenant fetch returns null (or throws — choose throw `WorkflowSnapshotNotFound` for consistency with existing errors).

- [ ] **2.5.2** Implement `platform/agent/workflows/src/admin/get-workflow-run.ts`. Joins `workflow_snapshots` + `workflow_steps` under `withTenant`. Map `WorkflowStepRow` -> `WorkflowRunStepDetail`; pull `input` from the snapshot's `step_results` when present.

- [ ] **2.5.3** Run integration. Green.

### 2.6 `streamWorkflowRun(runId, signal)` — emits new KernelChunk variants

- [ ] **2.6.1** Failing unit test `platform/agent/workflows/src/admin/stream-workflow-run.test.ts`. Uses an in-memory fake runner that exposes a `workflowEvents` async iterator emitting started/completed/failed/end events for a fake workflow id. Assert: `streamWorkflowRun(runId, signal)` yields a `workflow_step_started`, then `workflow_step_completed`, then `workflow_run_end` (or `workflow_step_failed` variant for the failure case). Aborting the signal stops iteration cleanly without throwing.

- [ ] **2.6.2** Implement `platform/agent/workflows/src/admin/stream-workflow-run.ts`:

```ts
export async function* streamWorkflowRun(
  runId: string,
  opts: { tenantId: string; signal: AbortSignal },
): AsyncGenerator<KernelChunk>
```

For runs in `running`/`suspended` state, subscribe to the runner's event bus (add `subscribeRun(runId)` helper to `runner/durable.ts` if absent — emits `'step.started' | 'step.completed' | 'step.failed' | 'run.end'`). For terminal runs, replay step rows in order then a synthetic `workflow_run_end`. Honor `signal` via `for await` early-break.

- [ ] **2.6.3** Run unit test. Green.

### 2.7 `createWorkflowAdminRoutes` factory

- [ ] **2.7.1** Failing integration test `platform/agent/workflows/tests/integration/admin-routes.int.test.ts`:
  - `GET /workflows?tenantId=…` → 200 with array shape.
  - `GET /workflows/:id` → 200, body matches `WorkflowDefinition`.
  - `GET /workflows/:id/runs` → 200, paginated.
  - `GET /workflow-runs/:runId` → 200, shape matches `WorkflowRunDetail`; 404 for unknown.
  - `GET /workflow-runs/:runId/stream` → 200 `Content-Type: text/event-stream`; emits the recorded chunks; closes on end-of-stream.
  - All routes 401 without session; 403 without membership; 403 when crossing tenant.

- [ ] **2.7.2** Implement `platform/agent/workflows/src/admin/routes.ts`:

```ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { requireSession, csrfMiddleware } from '@seta/sso'
import { tenantMiddleware, tenantContext, requireTenantMembership } from '@seta/tenant'
import { streamKernelSSE } from '@seta/agent-core'
import type { Sql } from 'postgres'
import { listWorkflows } from './list-workflows'
import { getWorkflow } from './get-workflow'
import { listWorkflowRuns } from './list-workflow-runs'
import { getWorkflowRun } from './get-workflow-run'
import { streamWorkflowRun } from './stream-workflow-run'
import { WorkflowDefinition, WorkflowRunDetail, WorkflowRunSummary } from './schemas'

export function createWorkflowAdminRoutes(opts: { sql: Sql }): OpenAPIHono {
  const app = new OpenAPIHono()
  app.use('*', requireSession, csrfMiddleware)
  app.use('/workflows/*', tenantMiddleware)
  app.use('/workflow-runs/*', tenantMiddleware)

  // GET /workflows
  app.openapi(
    createRoute({
      method: 'get', path: '/workflows',
      request: { query: z.object({ tenantId: z.string() }) },
      responses: { 200: { content: { 'application/json': { schema: z.array(WorkflowDefinition) } }, description: '' } },
    }),
    async (c) => {
      const { tenantId } = c.req.valid('query')
      await requireTenantMembership(opts.sql, tenantId, c.get('user').id)
      const rows = await listWorkflows(opts.sql, { tenantId })
      return c.json(rows)
    },
  )
  // …analogous for the four remaining routes; stream route uses streamKernelSSE(c, streamWorkflowRun(runId, { tenantId, signal: c.req.raw.signal })).
  return app
}
```

- [ ] **2.7.3** Run integration. Green.

- [ ] **2.7.4** Export from `platform/agent/workflows/src/index.ts`:
  - `createWorkflowAdminRoutes`
  - `listWorkflows`, `getWorkflow`, `listWorkflowRuns`, `getWorkflowRun`, `streamWorkflowRun`
  - schemas: `WorkflowDefinition`, `WorkflowStep`, `WorkflowEdge`, `WorkflowRunSummary`, `WorkflowRunDetail`, `WorkflowRunStepDetail`

- [ ] **2.7.5** Commit: `feat(agent-workflows): add admin schemas + readers + createWorkflowAdminRoutes`.

---

## Phase 3 — Mount in apps/api

### 3.1 Composition diff in `apps/api/src/main.ts`

- [ ] **3.1.1** Add the workspace dep (CLI only): `pnpm --filter @seta/api add @seta/agent-workflows@workspace:*` (skip if already present — verify with `pnpm --filter @seta/api list @seta/agent-workflows`).

- [ ] **3.1.2** Edit `apps/api/src/main.ts`. Show diff:

```diff
 import { createRunAdminRoutes } from '@seta/agent-server'
+import { createWorkflowAdminRoutes } from '@seta/agent-workflows'
 …
 app.route('/', createRunAdminRoutes({ sql }))
+app.route('/', createWorkflowAdminRoutes({ sql }))
```

- [ ] **3.1.3** Smoke integration test `apps/api/tests/integration/workflow-admin.smoke.int.test.ts` — boot the app with `runtimeApp`, hit `GET /workflows?tenantId=…` with a recorded session cookie, assert 200 + JSON array. Green.

- [ ] **3.1.4** Commit: `feat(api): mount createWorkflowAdminRoutes`.

---

## Phase 4 — @seta/agent-sdk: workflow methods

### 4.1 SDK method signatures + schemas

- [ ] **4.1.1** Failing test `platform/agent/sdk/src/client/AgentClient.workflows.test.ts` using MSW. Records expected request URLs/methods + canned JSON responses for:
  - `listWorkflows(tenantId)` → `GET /workflows?tenantId=…`
  - `getWorkflow(workflowId)` → `GET /workflows/:workflowId`
  - `listWorkflowRuns(workflowId, { cursor?, limit? })` → `GET /workflows/:workflowId/runs`
  - `getWorkflowRun(runId)` → `GET /workflow-runs/:runId`
  - `streamWorkflowRun(runId, { signal })` → `GET /workflow-runs/:runId/stream` returning `Response` whose body is parsed by `parseSseStream`.

  Each non-stream method validates the response via Zod and returns the parsed shape. Run — fails on missing methods.

- [ ] **4.1.2** Add Zod response schemas to `platform/agent/sdk/src/schemas/workflows.ts`:

```ts
import { z } from 'zod'

export const SdkWorkflowStep = z.object({ id: z.string(), label: z.string(), kind: z.enum(['single', 'parallel']), schema: z.unknown().optional() })
export const SdkWorkflowEdge = z.object({ from: z.string(), to: z.string() })
export const SdkWorkflowDefinition = z.object({
  id: z.string(), name: z.string(), version: z.string(),
  steps: z.array(SdkWorkflowStep), edges: z.array(SdkWorkflowEdge),
  lastRunAt: z.string().nullable(),
})
export type SdkWorkflowDefinition = z.infer<typeof SdkWorkflowDefinition>

export const SdkWorkflowRunSummary = z.object({
  id: z.string(), workflowId: z.string(),
  status: z.enum(['running', 'suspended', 'completed', 'failed', 'bailed']),
  startedAt: z.string(), durationMs: z.number().nullable(),
})
export type SdkWorkflowRunSummary = z.infer<typeof SdkWorkflowRunSummary>

export const SdkWorkflowRunsPage = z.object({
  rows: z.array(SdkWorkflowRunSummary),
  nextCursor: z.string().nullable(),
})
export type SdkWorkflowRunsPage = z.infer<typeof SdkWorkflowRunsPage>

export const SdkWorkflowRunStep = z.object({
  stepId: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'suspended']),
  startedAt: z.string(), finishedAt: z.string().nullable(),
  input: z.unknown().optional(), output: z.unknown().optional(),
  error: z.unknown().nullable(),
})
export const SdkWorkflowRunDetail = SdkWorkflowRunSummary.extend({
  steps: z.array(SdkWorkflowRunStep),
})
export type SdkWorkflowRunDetail = z.infer<typeof SdkWorkflowRunDetail>
```

- [ ] **4.1.3** Implement methods on `AgentClient` in `platform/agent/sdk/src/client/AgentClient.ts`:

```ts
listWorkflows(tenantId: string, init: { signal?: AbortSignal } = {}): Promise<SdkWorkflowDefinition[]> {
  return request(this.opts, `/workflows?tenantId=${encodeURIComponent(tenantId)}`, {
    schema: z.array(SdkWorkflowDefinition), ...(init.signal ? { signal: init.signal } : {}),
  })
}
getWorkflow(workflowId: string, init: { signal?: AbortSignal } = {}): Promise<SdkWorkflowDefinition> { /* … */ }
listWorkflowRuns(workflowId: string, filters: { cursor?: string; limit?: number } = {}, init: { signal?: AbortSignal } = {}): Promise<SdkWorkflowRunsPage> { /* … */ }
getWorkflowRun(runId: string, init: { signal?: AbortSignal } = {}): Promise<SdkWorkflowRunDetail> { /* … */ }
streamWorkflowRun(runId: string, init: { signal?: AbortSignal } = {}): Promise<Response> {
  const reqInit: { expect: 'stream'; headers: Record<string,string>; signal?: AbortSignal } = {
    expect: 'stream', headers: { accept: 'text/event-stream' },
  }
  if (init.signal) reqInit.signal = init.signal
  return request(this.opts, `/workflow-runs/${encodeURIComponent(runId)}/stream`, reqInit)
}
```

Export all schemas + types from `platform/agent/sdk/src/index.ts`.

- [ ] **4.1.4** Run MSW test. Green.

- [ ] **4.1.5** Add a recorded SSE fixture file `platform/agent/sdk/src/sse/__fixtures__/workflow-success.sse` containing realistic frames:

```
data: {"type":"workflow_step_started","runId":"r1","stepId":"fetch","label":"Fetch","startedAt":"2026-05-15T10:00:00.000Z"}

data: {"type":"workflow_step_completed","runId":"r1","stepId":"fetch","output":{"rows":3},"finishedAt":"2026-05-15T10:00:00.500Z","durationMs":500}

data: {"type":"workflow_step_started","runId":"r1","stepId":"transform","label":"Transform","startedAt":"2026-05-15T10:00:00.500Z"}

data: {"type":"workflow_step_completed","runId":"r1","stepId":"transform","output":{"ok":true},"finishedAt":"2026-05-15T10:00:01.100Z","durationMs":600}

data: {"type":"workflow_run_end","runId":"r1","status":"completed","finishedAt":"2026-05-15T10:00:01.100Z"}

```

Reference this fixture from a new test `platform/agent/sdk/src/sse/parseSseStream.workflow-fixture.test.ts` that loads the bytes and asserts 5 chunks emitted in order. Green.

- [ ] **4.1.6** Commit: `feat(agent-sdk): add workflow admin methods + SSE workflow-success fixture`.

---

## Phase 5 — @seta/ui: dagre dep + WorkflowGraph component

### 5.1 Pin dagre

- [ ] **5.1.1** Run `pnpm view dagre version` → record the pin (e.g. `0.8.5`). Run `pnpm view @types/dagre version` → record (e.g. `0.7.52`).

- [ ] **5.1.2** Install: `pnpm --filter @seta/ui add dagre@<pin> @types/dagre@<pin>` using the exact pins from 5.1.1.

### 5.2 WorkflowGraph (TDD, deterministic layout)

- [ ] **5.2.1** Failing test `platform/ui/src/components/data/WorkflowGraph.test.tsx`:
  - Renders 3 nodes + 2 edges → SVG has `data-node-id` attrs for each id, `data-edge` attr for each edge, and node colors match `StatusBadge` palette per status (snapshot of `<svg>` `<g>` structure).
  - Layout determinism: rendering twice with the same input yields identical SVG transform attributes (deterministic dagre seed).
  - `activeNodeId` prop adds `data-active="true"` on the matching node group.
  - Above 200 nodes: component renders a vertical list fallback (`role="list"` with one item per node) and `console.warn` is called once with `'WorkflowGraph: > 200 nodes, falling back to list mode'`.
  - Run — fails (file missing).

- [ ] **5.2.2** Implement `platform/ui/src/components/data/WorkflowGraph.tsx`:

```tsx
import dagre from 'dagre'
import { useMemo } from 'react'
import type { Variant } from '../../types'

export interface WorkflowGraphNode {
  id: string
  label: string
  status: 'idle' | 'running' | 'completed' | 'failed'
}
export interface WorkflowGraphEdge { from: string; to: string }
export interface WorkflowGraphProps {
  nodes: WorkflowGraphNode[]
  edges: WorkflowGraphEdge[]
  activeNodeId?: string
}

const MAX_NODES = 200

function variantFor(status: WorkflowGraphNode['status']): Variant {
  if (status === 'running') return 'info'
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'error'
  return 'neutral'
}

export function WorkflowGraph({ nodes, edges, activeNodeId }: WorkflowGraphProps) {
  if (nodes.length > MAX_NODES) {
    console.warn('WorkflowGraph: > 200 nodes, falling back to list mode')
    return (
      <ul role="list" className="space-y-1">
        {nodes.map((n) => (
          <li key={n.id} data-node-id={n.id} data-variant={variantFor(n.status)}>{n.label}</li>
        ))}
      </ul>
    )
  }

  const layout = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', nodesep: 32, ranksep: 48, marginx: 12, marginy: 12 })
    g.setDefaultEdgeLabel(() => ({}))
    for (const n of nodes) g.setNode(n.id, { width: 160, height: 40, label: n.label })
    for (const e of edges) g.setEdge(e.from, e.to)
    dagre.layout(g)
    return g
  }, [nodes, edges])

  const w = layout.graph().width ?? 0
  const h = layout.graph().height ?? 0

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="workflow graph">
      {edges.map((e) => {
        const pts = layout.edge(e.from, e.to)?.points ?? []
        const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
        return <path key={`${e.from}-${e.to}`} data-edge={`${e.from}->${e.to}`} d={d} className="stroke-hairline" fill="none" />
      })}
      {nodes.map((n) => {
        const node = layout.node(n.id)
        if (!node) return null
        const variant = variantFor(n.status)
        return (
          <g
            key={n.id}
            data-node-id={n.id}
            data-variant={variant}
            data-active={activeNodeId === n.id ? 'true' : undefined}
            transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
          >
            <rect width={node.width} height={node.height} rx={6} className={`fill-surface stroke-${variant}`} />
            <text x={node.width / 2} y={node.height / 2} dominantBaseline="middle" textAnchor="middle" className="text-xs">{n.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
```

Note: the early-return for `> MAX_NODES` precedes the `useMemo` — make sure conditional hooks are not introduced (move the size check to a `useMemo`-aware pattern: compute layout always, then render fallback when too many; or call `useMemo` with `nodes.length > MAX_NODES ? null : …`). Adjust the implementation accordingly so React rules of hooks are satisfied.

- [ ] **5.2.3** Run test. Green.

- [ ] **5.2.4** Export from `platform/ui/src/index.ts`:

```ts
export type { WorkflowGraphEdge, WorkflowGraphNode, WorkflowGraphProps } from './components/data/WorkflowGraph'
export { WorkflowGraph } from './components/data/WorkflowGraph'
```

- [ ] **5.2.5** Commit: `feat(ui): add WorkflowGraph SVG DAG component (dagre)`.

### 5.3 useWorkflowRun hook

- [ ] **5.3.1** Failing test `platform/ui/src/hooks/useWorkflowRun.test.tsx`. Renders a test component using `useWorkflowRun(runId)` against the SSE fixture from 4.1.5 (via MSW). Asserts:
  - Initial status `'idle'` → `'running'` after `start()`.
  - `chunks` length grows to 5.
  - `stepStates` map after stream end equals `{ fetch: 'completed', transform: 'completed' }`.
  - `status` ends as `'completed'`.
  - For the `workflow_step_failed` fixture variant (also in this test), `stepStates[stepId] === 'failed'`, overall `status === 'failed'`.
  - `abort()` flips status to `'aborted'`.
  - Run — fails (hook missing).

- [ ] **5.3.2** Implement `platform/ui/src/hooks/useWorkflowRun.ts`:

```ts
import { type KernelChunk, parseSseStream, type RunStatus } from '@seta/agent-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAgentClient } from '../provider/useAgentClient'

export type WorkflowNodeStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface UseWorkflowRunResult {
  chunks: KernelChunk[]
  status: RunStatus
  stepStates: Record<string, WorkflowNodeStatus>
  activeStepId: string | null
  start: () => void
  abort: () => void
}

export function useWorkflowRun(runId: string): UseWorkflowRunResult {
  const client = useAgentClient()
  const [chunks, setChunks] = useState<KernelChunk[]>([])
  const [status, setStatus] = useState<RunStatus>('idle')
  const ctrlRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false; ctrlRef.current?.abort() }, [])

  const start = useCallback(() => {
    if (ctrlRef.current) return
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    setChunks([])
    setStatus('running')
    void client.streamWorkflowRun(runId, { signal: ctrl.signal })
      .then((res) => {
        if (!res.body) throw new Error('streamWorkflowRun returned a response with no body')
        return parseSseStream(res.body, (chunk) => {
          if (!mountedRef.current) return
          setChunks((prev) => [...prev, chunk])
          if (chunk.type === 'workflow_run_end' && chunk.status === 'failed') setStatus('failed')
          if (chunk.type === 'error') setStatus('failed')
          if (chunk.type === 'abort') setStatus('aborted')
        }, { signal: ctrl.signal })
      })
      .then(() => { if (mountedRef.current) setStatus((p) => (p === 'running' ? 'completed' : p)) })
      .catch((err: unknown) => {
        if (!mountedRef.current) return
        setStatus((err as { name?: string }).name === 'AbortError' ? 'aborted' : 'failed')
      })
      .finally(() => { ctrlRef.current = null })
  }, [client, runId])

  const abort = useCallback(() => { ctrlRef.current?.abort(); setStatus('aborted') }, [])

  const { stepStates, activeStepId } = useMemo(() => {
    const map: Record<string, WorkflowNodeStatus> = {}
    let active: string | null = null
    for (const c of chunks) {
      if (c.type === 'workflow_step_started') { map[c.stepId] = 'running'; active = c.stepId }
      else if (c.type === 'workflow_step_completed') { map[c.stepId] = 'completed'; if (active === c.stepId) active = null }
      else if (c.type === 'workflow_step_failed') { map[c.stepId] = 'failed'; if (active === c.stepId) active = null }
    }
    return { stepStates: map, activeStepId: active }
  }, [chunks])

  return { chunks, status, stepStates, activeStepId, start, abort }
}
```

- [ ] **5.3.3** Run test. Green.

- [ ] **5.3.4** Export from `platform/ui/src/index.ts`:

```ts
export type { UseWorkflowRunResult, WorkflowNodeStatus } from './hooks/useWorkflowRun'
export { useWorkflowRun } from './hooks/useWorkflowRun'
```

- [ ] **5.3.5** Commit: `feat(ui): add useWorkflowRun hook`.

---

## Phase 6 — apps/studio: workflows surfaces

### 6.1 Query options

- [ ] **6.1.1** Edit `apps/studio/src/api/queries.ts`. Append:

```ts
export const workflowsQuery = (tenantId: string) => queryOptions({
  queryKey: ['workflows', tenantId],
  queryFn: ({ signal }) => client.listWorkflows(tenantId, { signal }),
})

export const workflowQuery = (workflowId: string) => queryOptions({
  queryKey: ['workflow', workflowId],
  queryFn: ({ signal }) => client.getWorkflow(workflowId, { signal }),
})

export const workflowRunsQuery = (workflowId: string, cursor: string | null) => queryOptions({
  queryKey: ['workflow-runs', workflowId, cursor],
  queryFn: ({ signal }) => client.listWorkflowRuns(workflowId, cursor ? { cursor } : {}, { signal }),
})

export const workflowRunQuery = (runId: string) => queryOptions({
  queryKey: ['workflow-run', runId],
  queryFn: ({ signal }) => client.getWorkflowRun(runId, { signal }),
})
```

### 6.2 `/tenants/:id/workflows` list page

- [ ] **6.2.1** Implement `apps/studio/src/features/workflows/WorkflowsPage.tsx`:
  - `DataTable` with columns: name, version, step count (`def.steps.length`), last-run (`lastRunAt` formatted relative).
  - Row click → `router.navigate({ to: '/tenants/$id/workflows/$workflowId', params })`.
  - `EmptyState` when zero workflows.

- [ ] **6.2.2** Wire route file `apps/studio/src/routes/_authed/tenants.$id.workflows.tsx` to mount `WorkflowsPage`, prefetching `workflowsQuery(tenantId)` in `loader`.

### 6.3 `/tenants/:id/workflows/:workflowId` detail page

- [ ] **6.3.1** Implement `apps/studio/src/features/workflows/WorkflowDetailPage.tsx`:
  - `Tabs`: `Definition` | `Runs`.
  - **Definition tab**:
    - `SectionCard` "Metadata" with name/version/lastRunAt via `KeyValueList`.
    - `SectionCard` "Graph": `<WorkflowGraph nodes={def.steps.map(s => ({ id: s.id, label: s.label, status: 'idle' }))} edges={def.edges} />`.
    - `SectionCard` "Definition JSON": `<Code lang="json">{JSON.stringify(def, null, 2)}</Code>`.
  - **Runs tab**:
    - `DataTable` columns: started-at, status (`StatusBadge`), duration (ms → human), runId.
    - `refetchInterval: 5000` while any row status is `'running'` or `'suspended'`.
    - Row click → `/tenants/:id/workflows/:workflowId/runs/:runId`.

- [ ] **6.3.2** Wire route `apps/studio/src/routes/_authed/tenants.$id.workflows.$workflowId.tsx`. Loader prefetches `workflowQuery` + `workflowRunsQuery(workflowId, null)`.

### 6.4 `/tenants/:id/workflows/:workflowId/runs/:runId` live page

- [ ] **6.4.1** Implement `apps/studio/src/features/workflows/WorkflowRunPage.tsx`:
  - `const { data: def } = useSuspenseQuery(workflowQuery(workflowId))`.
  - `const { data: run } = useSuspenseQuery(workflowRunQuery(runId))`.
  - `const { chunks, status, stepStates, activeStepId, start, abort } = useWorkflowRun(runId)`.
  - `useEffect(() => { if (run.status === 'running') start() }, [run.status])`.
  - Merge `run.steps` initial statuses with live `stepStates` (live wins). Pass merged statuses into `<WorkflowGraph nodes={…} edges={def.edges} activeNodeId={activeStepId ?? undefined} />`.
  - Below the graph: `Timeline` of workflow events (custom label/variant adapter for the four new chunk variants — extend `labelFor` / `variantFor` in a local helper).
  - Per-step expandable section: each step row from `run.steps` rendered as a `SectionCard` with `KeyValueList` `[{key:'input',value:Code(json)},{key:'output',value:Code(json)},{key:'error',value:Code(json)}]`.
  - "Abort" button visible when `status === 'running'`.

- [ ] **6.4.2** Wire route `apps/studio/src/routes/_authed/tenants.$id.workflows.$workflowId.runs.$runId.tsx`.

### 6.5 Agent panel context — N/A in Studio

> Studio is admin-only and does NOT mount the right-side `AgentPanel` (master plan §0). There is no `apps/studio/src/nav/agentContext.ts` to extend for `/workflows`, `/workflows/:workflowId`, or `/workflows/:workflowId/runs/:runId`. The corresponding `AgentContext['page']` values remain reserved in `@seta/ui` for OTHER Workspace modules.

- [ ] **6.5.1** Commit: `feat(studio): add /workflows list + detail + run pages with live SSE`.

---

## Phase 7 — Component tests, E2E, SCOPE updates

### 7.1 Studio component tests (MSW + recorded SSE fixture)

- [ ] **7.1.1** `apps/studio/src/features/workflows/WorkflowsPage.test.tsx`: MSW returns 3 workflow definitions; assert table rows render with name/version/step-count.

- [ ] **7.1.2** `apps/studio/src/features/workflows/WorkflowDetailPage.test.tsx`: Definition tab renders `data-node-id` for each step; Runs tab renders one row per recorded run.

- [ ] **7.1.3** `apps/studio/src/features/workflows/WorkflowRunPage.test.tsx`: Loads the SSE fixture from `platform/agent/sdk/src/sse/__fixtures__/workflow-success.sse` via MSW, mounts the page with a `running` run, asserts graph nodes change `data-variant` from `info` → `success` as chunks stream, and final `status === 'completed'`.

### 7.2 E2E

- [ ] **7.2.1** Create `tests/e2e/studio/workflows.spec.ts`. Steps:
  - Log in (recorded session).
  - Navigate `/tenants/<seeded>/workflows`. Assert the list renders.
  - Click a workflow row → assert Definition tab graph visible (`svg[role="img"][aria-label="workflow graph"]`).
  - Click Runs tab → click first run → assert URL matches `/runs/:runId`.
  - Wait for SSE → assert at least one graph node has `data-variant="success"` after stream completes.
  - `@axe-core/playwright` scan on each route.

### 7.3 SCOPE updates

- [ ] **7.3.1** Update `apps/api/SCOPE.md` to list mounted routes: `GET /workflows`, `GET /workflows/:id`, `GET /workflows/:id/runs`, `GET /workflow-runs/:runId`, `GET /workflow-runs/:runId/stream` under the agent-workflows section.

- [ ] **7.3.2** Update `apps/studio/SCOPE.md` to list new routes: `/tenants/:id/workflows`, `/tenants/:id/workflows/:workflowId`, `/tenants/:id/workflows/:workflowId/runs/:runId`.

- [ ] **7.3.3** Update `platform/agent/sdk/SCOPE.md`: KernelChunk now includes `workflow_step_started`, `workflow_step_completed`, `workflow_step_failed`, `workflow_run_end`; AgentClient adds `listWorkflows`, `getWorkflow`, `listWorkflowRuns`, `getWorkflowRun`, `streamWorkflowRun`.

- [ ] **7.3.4** Update `platform/agent/workflows/SCOPE.md`: factory `createWorkflowAdminRoutes` exposed; readers `listWorkflows`, `getWorkflow`, `listWorkflowRuns`, `getWorkflowRun`, `streamWorkflowRun`.

- [ ] **7.3.5** Update `platform/ui/SCOPE.md`: new `WorkflowGraph` component + `useWorkflowRun` hook; `dagre` pinned dep.

- [ ] **7.3.6** Changesets — workspaces with `"private": false` changing in this PR. Run `pnpm changeset` once per such package (the SDK is published; UI is published; check each `package.json`). Skip if `"private": true`.

- [ ] **7.3.7** Commit: `docs: update SCOPE.md for workflow-run viewer slice`.

---

## Phase 8 — Verification

- [ ] **8.1** Run `pnpm lint && pnpm typecheck`. Fix until clean.

- [ ] **8.2** Run `pnpm test:unit` across the touched workspaces:
  - `pnpm --filter @seta/agent-sdk test:unit`
  - `pnpm --filter @seta/agent-workflows test:unit`
  - `pnpm --filter @seta/ui test:unit`
  - `pnpm --filter @seta/studio test:unit`

- [ ] **8.3** Run integration: `pnpm --filter @seta/agent-workflows test:integration` and the API smoke test.

- [ ] **8.4** Run E2E (when dockerized stack available): `pnpm test:e2e -- workflows.spec.ts`.

- [ ] **8.5** Demo-state check: `pnpm --filter @seta/studio dev`. Open `/tenants/<id>/workflows`. Click into a workflow → Definition tab shows the graph. Click Runs → click a run → WorkflowGraph node colors stream in via SSE; Timeline shows each `workflow_step_started`/`workflow_step_completed`/`workflow_run_end`. Hit Abort during a long run → status flips to `aborted`. Open an expandable step row → inputs/outputs JSON visible. No console errors. Bundle gate green.

- [ ] **8.6** Open PR via `gh pr create` with summary tying back to spec §14.
