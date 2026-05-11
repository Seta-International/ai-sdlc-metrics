# Design — MS365 Planner CRUD via Agent (Epic 2)

**Status**: Draft for review · approved-section-by-section in brainstorm
**Author**: Canh Ta (with Claude)
**Date**: 2026-05-11
**Source brainstorm**: `docs/plans/MS365 Epics Brainstorm.md` — Epic 2
**Depends on**: Epic 1 spec (`2026-05-11-ms365-auth-design.md`) — `TokenVault`, `ConnectorRegistry`, `OAuthProvider`, audit, `connector_ms365_planner` schema namespace
**Kernel assumption**: K-phase contracts exist as paper contracts (tool framework, A4 rich-response, RequestContext, tenantContext).

---

## 1. Goal

A user in Microsoft Teams can ask the agent to **read** Planner data ("show my open tasks", "who's overloaded?") and **write** Planner data ("create 3 follow-up tasks", "reassign John's overdue items to Mary") with one-tap confirmation for every write. The agent acts as the user via OBO, respects their MS365 permissions, audits every Graph call, and produces rich visual responses (text + tables + charts) that the Teams channel renders.

Reads are cache-first with a 60s TTL and a live-Graph fallback. Writes use a stateless **preview → commit** pattern with HMAC-signed continuation tokens that expire in 15 minutes.

This spec covers Planner specifically. The patterns (preview/commit, cache schema, Graph fetch wrapper, audit middleware) generalize to future connectors (Calendar, Trello, Jira).

## 2. Non-goals

- Background sync worker that populates the cache (Epic 3)
- Adaptive polling, sync-failure alerts, daily digest (Epic 3 / Epic 4)
- Teams channel install, `Action.Execute` dispatch, welcome card (Epic 4)
- A4 chart rendering itself — we produce the chart data shape; A4 renders (kernel)
- Daily digest tool (Epic 4)
- Free-form Q&A over Planner data via RAG (Epic 1's separate "Seta FAQ" path)

## 3. Tool surface

Following LLM-tool-use best practice: fine-grained, single-purpose, unambiguous names.

### Read tools (6 — no confirmation, cache-first 60s)

| Tool | Purpose | Graph endpoint |
|---|---|---|
| `planner.list_my_tasks` | Tasks assigned to the caller | `/me/planner/tasks` |
| `planner.list_plan_tasks` | All tasks in a plan | `/planner/plans/{id}/tasks` |
| `planner.get_task` | Full detail incl. description, checklist, references | `/planner/tasks/{id}` + `/details` |
| `planner.list_plans` | Plans the user can see | `/me/planner/plans` |
| `planner.list_buckets` | Buckets in a plan | `/planner/plans/{id}/buckets` |
| `planner.workload_analysis` | Aggregated tasks-per-assignee (returns chart-ready data) | client-side aggregation over cached `list_plan_tasks` |

### Write tools — preview/commit pairs (5 capabilities × 2 = 10)

| Capability | `.preview` | `.commit` |
|---|---|---|
| Create tasks (1..N) | `planner.create_tasks.preview` | `planner.create_tasks.commit` |
| Update tasks (assignees, due, title, priority, bucket, %) | `planner.update_tasks.preview` | `planner.update_tasks.commit` |
| Complete tasks | `planner.complete_tasks.preview` | `planner.complete_tasks.commit` |
| Add comments | `planner.add_comments.preview` | `planner.add_comments.commit` |
| Create plan | `planner.create_plan.preview` | `planner.create_plan.commit` |

The preview tool **is** the dry-run. AC-8 ("write tools support `--dry-run`") is satisfied by the preview being the default first call. The LLM is system-prompted to always call `.preview` before `.commit` and to never call `.commit` without a fresh continuation token from a `.preview` the same user accepted.

`planner.update_tasks` handles all field-level mutations via one shape:
```ts
update_tasks.preview({
  updates: [
    { taskId, assignees?, dueDateTime?, title?, priority?, percentComplete?, bucketId?, appliedCategories? }
  ]
})
```

**16 tools total.** Tight enough for an LLM context; coarse enough that the LLM doesn't get lost in micro-tools.

## 4. Package layout (additions on top of Epic 1)

```
platform/ms-graph/                       NEW BODY in Epic 2
  src/graph-fetch.ts                     graphFetch(...): 429-backoff, 5xx-retry, ETag,
                                         $batch, OTel spans
  src/errors.ts                          GraphError taxonomy
  src/audit-middleware.ts                Wraps fetch w/ audit.recordAudit per call

modules/connectors/ms365-planner/
  src/manifest.ts                        (from Epic 1)
  src/client.ts                  NEW     Typed Planner endpoints over graphFetch
  src/schema.ts                  NEW     Drizzle: planner_tasks_cache, planner_plans_cache,
                                         planner_buckets_cache, planner_task_details_cache,
                                         sync_watermarks
  src/cache.ts                   NEW     Cache-first read-through helper
  src/etag.ts                    NEW     ETag store + If-Match wiring

modules/products/agent/
  src/tools/planner/             NEW     The 16 tool definitions
    read/list_my_tasks.ts
    read/list_plan_tasks.ts
    read/get_task.ts
    read/list_plans.ts
    read/list_buckets.ts
    read/workload_analysis.ts
    write/create_tasks.preview.ts
    write/create_tasks.commit.ts
    write/update_tasks.preview.ts
    write/update_tasks.commit.ts
    write/complete_tasks.preview.ts
    write/complete_tasks.commit.ts
    write/add_comments.preview.ts
    write/add_comments.commit.ts
    write/create_plan.preview.ts
    write/create_plan.commit.ts
    write/_continuation.ts          Continuation-token mint + verify (HMAC-SHA256, 15-min TTL)
  src/schema.ts                  NEW     agent.write_continuations table

platform/db/
  + connector_ms365_planner schema migrations  (cache + watermarks)
  + agent schema (write_continuations)
```

### Continuation tokens belong in the agent schema, not the connector

Continuation tokens are a kernel-level pattern that any product's write tools could use (future Seta-Planner, Timesheet, etc.). They live in `agent.write_continuations`, not in `connector_ms365_planner` — the connector doesn't know about confirmation UX.

## 5. Cache schema + read-through

### 5.1 Tables (in `connector_ms365_planner` schema)

Hybrid: structured columns + JSONB.

**`planner_tasks_cache`**
```
tenant_id              uuid                  -- pk part 1, RLS key
graph_task_id          text                  -- pk part 2
plan_id                text                  -- denormalized for plan-level filter
bucket_id              text
title                  text
percent_complete       smallint              -- 0..100
priority               smallint
due_date               timestamptz
assignee_ids           text[]                -- Entra object IDs
created_by             text
created_at_graph       timestamptz
last_modified_by       text
last_modified_at_graph timestamptz
etag                   text                  -- @odata.etag last seen
raw                    jsonb                 -- full Graph plannerTask payload
synced_at              timestamptz           -- when WE pulled/wrote this row
soft_deleted_at        timestamptz NULL      -- soft-delete on 404 / delta-deleted
PRIMARY KEY (tenant_id, graph_task_id)
INDEX (tenant_id, plan_id)              WHERE soft_deleted_at IS NULL
INDEX (tenant_id, due_date)             WHERE soft_deleted_at IS NULL
INDEX (tenant_id, assignee_ids) USING GIN
```

**`planner_task_details_cache`** (separate Graph endpoint, separate row)
```
tenant_id, graph_task_id, description, checklist jsonb, references jsonb,
etag, raw, synced_at
PRIMARY KEY (tenant_id, graph_task_id)
```

**`planner_plans_cache`**
```
tenant_id, graph_plan_id, owner_group_id, title, container_url,
etag, raw, synced_at, soft_deleted_at
PRIMARY KEY (tenant_id, graph_plan_id)
```

**`planner_buckets_cache`**
```
tenant_id, graph_bucket_id, plan_id, name, order_hint,
etag, raw, synced_at, soft_deleted_at
PRIMARY KEY (tenant_id, graph_bucket_id)
INDEX (tenant_id, plan_id)
```

**`sync_watermarks`**
```
tenant_id, scope_kind ('plan'|'user'|'global'), scope_id text,
last_sync_at, status
PRIMARY KEY (tenant_id, scope_kind, scope_id)
```

All RLS-enforced on `tenant_id`.

### 5.2 Read-through interface

```ts
type ReadSource = 'cache:fresh' | 'cache:stale-fallback' | 'live'
type ReadResult<T> = { data: T; source: ReadSource; ageSeconds: number }

interface CachedRead<T> {
  one(key: { table: 'tasks' | 'task_details' | 'plans' | 'buckets'; id: string }): Promise<ReadResult<T> | null>
  list(query: ListQuery): Promise<ReadResult<T[]>>
}
```

### 5.3 Algorithm — single row

```
1. SELECT row by (tenant_id, graph_id) — RLS-protected.
2. If exists and (now() - synced_at) < TTL_SEC:
     return { data, source: 'cache:fresh', age }
3. liveFetch via Graph:
     200 → UPSERT (etag, raw, synced_at=now()); return source='live'
     404 → UPDATE soft_deleted_at=now(); return null
     5xx/network + row exists and (now() - synced_at) < STALE_FALLBACK_MAX:
            return source='cache:stale-fallback'
     5xx/network + no row: throw GraphUnavailable
```

### 5.4 Algorithm — list

P1 (Epic 2 standalone, no sync worker yet): lists always go live. Cache populated as a side effect of single-row reads. Without the sync worker we don't know set completeness — conservative choice is live-only for lists.

After Epic 3: list helper checks `sync_watermarks` for the query's partition; if `(now() - last_sync_at) < TTL`, list is served from cache. Otherwise live.

### 5.5 Write-through

After every successful Graph mutation, the connector immediately UPSERTs affected rows with the new etag + `synced_at=now()`. Guarantees AC-7 (read-after-write consistency for the same user).

### 5.6 Stale disclaimer (per Epic 3 Q-6)

`source: 'cache:stale-fallback'` is annotated on the response; tools surface a soft disclaimer ("data may be up to N min old; this can happen during transient Graph issues"). Not blocking.

### 5.7 TTL configuration

| Env var | Default |
|---|---|
| `PLANNER_CACHE_TTL_TASKS_SEC` | 60 |
| `PLANNER_CACHE_TTL_PLANS_SEC` | 600 |
| `PLANNER_CACHE_TTL_BUCKETS_SEC` | 300 |
| `PLANNER_CACHE_STALE_FALLBACK_MAX_SEC` | 3600 |

## 6. Graph fetch wrapper (`platform/ms-graph`)

### 6.1 Why raw fetch

Per Epic 1 research: `@microsoft/microsoft-graph-client` is dead; `@microsoft/msgraph-sdk` is pre-GA. Decision: raw fetch + thin typed wrapper. Revisit when Kiota GAs.

### 6.2 Interface

```ts
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'

interface GraphCall {
  token: string
  method: Method
  path: string                                 // '/me/planner/tasks'
  body?: unknown
  etag?: string                                // sets If-Match for PATCH/DELETE
  query?: Record<string, string | number>      // $select, $expand, $top, $skiptoken, $filter
  headers?: Record<string, string>             // e.g. Prefer: return=representation
  actor: AuditActor
  connectorId: string                          // 'ms365-planner'
}

interface GraphResponse<T> {
  data: T
  etag: string | null
  status: number
  rateLimit?: { remaining?: number; limit?: number; resetAfter?: number }
}

interface BatchRequest {
  id: string
  method: Method
  url: string
  body?: unknown
  etag?: string
  dependsOn?: string[]
  headers?: Record<string, string>
}

interface BatchResponseItem<T = unknown> {
  id: string
  status: number
  body?: T
  etag: string | null
  error?: { code: string; message: string }
}

interface GraphFetch {
  call<T>(input: GraphCall): Promise<GraphResponse<T>>
  batch(input: { token: string; actor: AuditActor; connectorId: string; requests: BatchRequest[] }): Promise<BatchResponseItem[]>
  paginate<T>(input: GraphCall): AsyncIterable<T>
}
```

### 6.3 Retry & rate-limit

| Response | Action |
|---|---|
| `200/201/204` | success; capture `etag` from `@odata.etag` body or `ETag` header |
| `404` | throw `GraphNotFound` |
| `412` | throw `GraphPreconditionFailed` |
| `403` | throw `GraphPermissionDenied` |
| `401` *(AADSTS revoked/expired)* | throw `GraphUnauthorized` — Epic 1 revocation path |
| `429` | sleep `Retry-After` (cap 60s); 3 retries; then `GraphRateLimited` |
| `5xx`/network/timeout | exponential backoff (1s, 2s, 4s ±25% jitter); 3 retries; then `GraphUnavailable` |

Retries are idempotency-safe: GETs always retry; POSTs retry only on 5xx; PATCH retries on 5xx with the same `If-Match`.

### 6.4 ETag flow

- GET → wrapper extracts `@odata.etag` → `GraphResponse.etag` → cache stores on row.
- PATCH/DELETE caller passes `etag` → wrapper sets `If-Match` → 412 → `GraphPreconditionFailed`.
- Commit PATCHes use `Prefer: return=representation` to get updated entity + new etag in one round-trip.

### 6.5 `$batch`

POST `/v1.0/$batch` with ≤ 20 inner requests. Each inner request runs independently; one failure doesn't fail the envelope. Per-request statuses returned.

### 6.6 Audit middleware

Wraps every `call`/`batch`. For each Graph request, writes one `audit.audit_log` row:
- `actor_type/id` from `input.actor`
- `provider_id='entra'`, `connector_id=input.connectorId`
- `operation = 'graph.<method>.<normalizedPath>'` (UUIDs → `:id`)
- `resource_ids` extracted from path or response
- `metadata = { status, latency_ms, retries, batch_size?, error_code? }`

For `$batch`: one audit row per inner request.

Synchronous INSERT (per Epic 1 §9). Performance impact: one extra Postgres INSERT per Graph call.

### 6.7 OTel spans

Per call: `graph.method`, `graph.path` (normalized), `graph.status`, `graph.batch_size`, `graph.retries`, `graph.etag_match`, `graph.cache_source`.

## 7. Write flow: preview → commit

### 7.1 Continuation token

**Format**: `<ulid>.<hmac>` (base64url, ~50 chars)
- `ulid` — PK of `agent.write_continuations`
- `hmac` — HMAC-SHA256 over `(ulid || tenant_id || user_id || tool_id || sha256(payload))` with `CONTINUATION_HMAC_KEY` (Secrets Manager)

**Verify**: parse → SELECT by ulid (RLS) → constant-time HMAC compare → `consumed_at IS NULL` → `expires_at > now()` → `user_id` matches caller.

### 7.2 Preview flow (canonical)

```
1. Zod-validate input.
2. registry.requireConsent(tenantId, 'ms365-planner').
3. PRE-FLIGHT PERMISSION CHECK (per AC-7 R-3):
     For every target id, cache-first read:
       404 → ResourceNotFound (abort, friendly)
       403 → GraphPermissionDenied (abort, "ask your admin")
       5xx → GraphUnavailable (abort, "try again")
       200 → capture { id, etag, current_state_of_changed_fields }
     No mutation has happened. ANY target failure aborts the entire op.
4. Build write plan: { graph_task_id, etag, patch_body }[]
5. Build Adaptive Card v1.5 (explicit row per target).
6. Mint continuation token; INSERT agent.write_continuations:
     payload          = write plan JSON
     etag_snapshot    = { graph_task_id → etag } from step 3
     expires_at       = now() + 15 min
7. audit.recordAudit(op='agent.write_preview', tool, resource_ids, result='ok')
8. Return { card, token }.
```

### 7.3 Commit flow

```
1. Verify token (§7.1).
     consumed_at != null → return cached result_card ("already submitted").
     expired              → ContinuationExpired (410).
     user_id mismatch     → ContinuationUserMismatch (403).
     bad hmac             → ContinuationBadHmac (400, audited).
2. Load write plan + etag_snapshot.
3. vault.get(tenantId, 'entra', 'user:<homeAccountId>') → OBO bundle (refresh if needed).
4. Execute:
     1 op:  single PATCH with If-Match + Prefer: return=representation.
     ≥2 ops: $batch of 20 per HTTP call; multiple batches with p-queue concurrency=3.
5. Classify each op:
     'ok' (200/201)       → write-through cache; capture new etag + raw.
     'conflict' (412)     → cache.invalidate(taskId); surface per-row "task changed".
     'forbidden' (403)    → surface per-row "no longer access".
     'missing' (404)      → surface per-row + soft-delete cache.
     'rate_limited' (429) → surface per-row "try again in N".
     'failed' (5xx)       → surface per-row generic failure.
6. UPDATE write_continuations SET consumed_at = now(), result_card = <rendered card>.
7. audit.recordAudit(op='agent.write_commit', resource_ids, metadata: { succeeded, failed }).
   (Plus per-inner-op audit rows from §6.6.)
8. Return response card.
```

### 7.4 Adaptive Card v1.5 — preview shape

```json
{
  "type": "AdaptiveCard",
  "version": "1.5",
  "body": [
    { "type": "TextBlock", "text": "Confirm reassignment", "size": "Large", "weight": "Bolder" },
    { "type": "TextBlock", "text": "Reassign 5 tasks from John to Mary", "wrap": true },
    { "type": "FactSet", "facts": [ /* one fact per target row */ ] },
    { "type": "TextBlock", "text": "Confirmation expires in 15 minutes", "size": "Small", "isSubtle": true }
  ],
  "actions": [
    { "type": "Action.Execute", "title": "Confirm", "style": "positive",
      "verb": "planner.update_tasks.commit", "data": { "token": "<continuation-token>" } },
    { "type": "Action.Execute", "title": "Cancel",
      "verb": "planner.update_tasks.cancel", "data": { "token": "<continuation-token>" } }
  ]
}
```

Channel adapter (Epic 4) maps `Action.Execute.verb` to a tool id and re-enters the agent run with `{ token }` as input.

### 7.5 Cancellation

`.cancel` companion: verifies token (unconsumed) → SET `consumed_at=now()` → audit `agent.write_cancelled` → return "Cancelled — nothing changed" card. Letting the token expire is also a valid cancellation path (no action needed).

### 7.6 Idempotency

- Double-click Confirm: `consumed_at != null` → friendly "already submitted" with cached `result_card`. No double-mutation possible.
- Channel-initiated retry: same — replays cached `result_card`.

### 7.7 Schema

```
agent.write_continuations
  token         text pk           -- '<ulid>.<hmac>'
  ulid          text unique
  tenant_id     uuid
  user_id       uuid
  tool_id       text              -- 'planner.update_tasks'
  payload       jsonb             -- validated write plan
  etag_snapshot jsonb             -- { graph_task_id → etag }
  result_card   jsonb             -- cached response card (filled at commit)
  created_at    timestamptz default now()
  expires_at    timestamptz       -- now() + 15 min
  consumed_at   timestamptz
INDEX (tenant_id, user_id, expires_at) WHERE consumed_at IS NULL
```

RLS: `tenant_id = current_setting('app.tenant_id')::uuid`. Commit/cancel additionally assert `user_id = current_user_id` (defense-in-depth on top of HMAC).

## 8. Bulk batching, partial-result, workload analysis

### 8.1 Chunking + concurrency

```
plan: [op1, …, opN]
  → chunks: [chunk1..20, chunk21..40, …]
  → p-queue with concurrency=3 dispatches batches in parallel
  → results aggregated in caller-correlated order
```

Cap configurable via `PLANNER_BATCH_CONCURRENCY` (default 3).

**No auto-retry at the orchestration layer** — the Graph wrapper (§6.3) already retries 429/5xx with backoff. Bulk orchestration sees post-retry failures and surfaces them as partial-result.

### 8.2 Per-op result taxonomy

```ts
type OpResult =
  | { status: 'ok';           taskId; newEtag; raw }
  | { status: 'conflict';     taskId; reason: 'task changed since you looked' }    // 412
  | { status: 'forbidden';    taskId; reason: 'you no longer have access' }       // 403
  | { status: 'missing';      taskId; reason: 'task no longer exists' }           // 404
  | { status: 'rate_limited'; taskId; reason: 'try again in N seconds' }          // 429 exhausted
  | { status: 'failed';       taskId; reason: string }                             // 5xx exhausted
```

### 8.3 Response card shapes

All-success / partial / all-failed cards as in §7.4 shape, with explicit per-row success or reason. "Retry?" buttons mint a fresh preview (not a re-commit), so the user re-confirms with up-to-date data.

### 8.4 `planner.workload_analysis`

**Input**:
```ts
{
  scope: { kind: 'plan'; planId: string }
       | { kind: 'group'; groupId: string }
       | { kind: 'my_team' }                  // members of any group user belongs to
  filters?: {
    dueBefore?: string                        // ISO date
    statusIn?: ('not_started' | 'in_progress' | 'completed')[]
  }
  limit?: number                              // default 20, max 100
}
```

**Output** (A4 chart-ready):
```ts
{
  rows: Array<{
    assigneeId: string
    displayName: string                       // resolved via directory.external_identities + ms365-directory cache
    taskCount: number
    overdueCount: number
    inProgressCount: number
  }>
  scope: { ... }
  generatedAt: ISO8601
  chart: {
    type: 'bar'
    xAxis: { label: 'Assignee'; values: string[] }
    series: [
      { label: 'Open tasks';    values: number[] },
      { label: 'Overdue tasks'; values: number[] }
    ]
  }
  stale?: { source: 'cache:stale-fallback'; ageMinutes: number }
}
```

**Execution**:
1. Resolve scope → list of plan IDs.
2. Cache-first list `planner_tasks_cache` filtered by `plan_id`.
3. Apply filters in SQL (`due_date < $1`, `percent_complete IN (...)`).
4. Aggregate: `SELECT unnest(assignee_ids), count(*), count(*) FILTER (WHERE due_date < now() AND percent_complete < 100) FROM ... GROUP BY 1`.
5. Resolve assignee IDs → display names via `connector_ms365_directory.directory_users`; fallback "(unknown)".
6. Sort by `taskCount DESC`; limit N.
7. Return.

**Performance**: against a freshly-bootstrapped tenant (empty cache), this will be slow until Epic 3's worker runs. P1 demo prerequisite: run an initial sync before M6.

The bar-chart rendering itself lives in A4 (kernel); this tool returns the data shape A4 consumes.

## 9. Error model (Epic 2 additions)

All extend `DomainError` from `@seta/middleware/errors`, mapped to RFC 7807.

| Class | HTTP | Trigger |
|---|---:|---|
| `ResourceNotFound` | 404 | Target task/plan/bucket doesn't exist |
| `GraphPreconditionFailed` | 412 | Optimistic concurrency conflict |
| `GraphPermissionDenied` | 403 | OBO token can't see/mutate resource |
| `GraphRateLimited` | 429 | Retry-exhausted 429 |
| `GraphUnavailable` | 503 | Retry-exhausted 5xx/network |
| `ContinuationExpired` | 410 | Token TTL passed |
| `ContinuationConsumed` | 409 | Already submitted (re-click); wraps cached `result_card` |
| `ContinuationBadHmac` | 400 | Token signature mismatch (audited) |
| `ContinuationUserMismatch` | 403 | Token belongs to different user |
| `BulkPartialFailure` | 207 *(internal)* | Surfaced by tool layer as partial-result card |

## 10. Observability

**Spans**:
- `tool.<id>` per invocation; attrs: `tool.preview_or_commit`, `tool.duration_ms`, `tool.bulk_size`, `tool.partial_failure_count`
- `graph.<op>` per Graph call (§6.7)

**Metrics**:
- `planner_tool_invocations_total{tool,preview_or_commit,result}`
- `planner_cache_reads_total{table,source}` — source ∈ {`cache:fresh`, `cache:stale-fallback`, `live`}
- `planner_bulk_ops_total{tool,result}` — result per §8.2
- `planner_continuation_lifecycle_total{phase}` — phase ∈ {minted, consumed, expired, cancelled, bad_hmac}
- `graph_batch_size_histogram`

**Logs**: `@seta/observability`; cache hit/miss at debug.

## 11. Testing strategy

TDD for `platform/*` and `modules/products/agent/src/tools/*`.

### 11.1 Unit

| Package | Tests |
|---|---|
| `platform/ms-graph` | 429 with Retry-After respected; 5xx backoff exhaustion; 412 → `GraphPreconditionFailed`; `$batch` payload shape; path normalization |
| `platform/ms-graph/audit-middleware` | Synchronous INSERT per request; per-batch fan-out |
| `modules/connectors/ms365-planner/cache` | Cache hit/miss/stale-fallback; soft-delete on 404; write-through round-trip |
| `modules/connectors/ms365-planner/client` | Each endpoint produces correct path + body + ETag |
| `modules/products/agent/tools/.../_continuation` | HMAC reject tampered/expired/consumed/cross-user |
| `tools/planner/write/*.preview` | Pre-flight 403/404 abort; happy path mints row + payload + etag_snapshot |
| `tools/planner/write/*.commit` | Bad token; idempotent re-commit replays `result_card`; partial-failure classification |
| `tools/planner/read/workload_analysis` | SQL aggregation correctness; directory-cache fallback to "(unknown)" |

### 11.2 Integration (`tests/integration/**`, requires `DATABASE_URL`)

- Real Postgres + RLS.
- **msw recordings** for Graph (CLAUDE.md: external HTTP via msw).
- Full preview → commit round-trip; assert PATCH `If-Match`, cache rows updated, audit rows present.
- Bulk batch partial-failure: 10 tasks with one pre-modified out-of-band → assert per-op classification.
- Idempotent re-commit: same token twice → cached `result_card` returned; no extra Graph calls.

### 11.3 E2E (`tests/e2e/**`)

- Full Q4.x suite (Q4.1–Q4.10): Planner CRUD round-trips, write confirmation flow, 412 surface, partial-result.
- Real Entra dev app + real Planner dev plan on staging.

## 12. Acceptance criteria — final mapping

| AC (from brainstorm Epic 2) | Where |
|---|---|
| AC-1: read p95 < 2s on staging | §5 cache-first (full effect after Epic 3 sync); §6 retry budget bounds live reads |
| AC-2: writes always confirm | §7 preview/commit pattern |
| AC-3: every Graph call audited | §6.6 audit middleware |
| AC-4: optimistic concurrency via If-Match | §6.4 ETag + §7 etag_snapshot |
| AC-5: writes use OBO | §7.3 step 3 vault lookup `user:<homeAccountId>` |
| AC-6: 403 friendly surface | §6 `GraphPermissionDenied` + §7.2 pre-flight abort |
| AC-7: bulk batching + partial-result | §8 chunk + p-queue + per-op classification |
| AC-8: dry-run support | §3 preview IS dry-run |

## 13. Dependencies & version pins

Kernel (paper contracts):
- Tool framework: `Tool<Input,Output>`, Zod validation, registration, SSE streaming, system-prompt that teaches `.preview` before `.commit`
- A4 rich response: card-builder consuming the chart/card shapes herein
- `RequestContext` / `tenantContext`: `current_user_id`, `current_tenant_id`
- RLS middleware (`SET LOCAL app.tenant_id`)

Third-party (additions over Epic 1):
- `p-queue` — concurrency cap on batch dispatch
- `nanoid` or `ulid` — token mint
- `node:crypto` — HMAC-SHA256 (built-in)

**Not used**: `@microsoft/microsoft-graph-client` (dead); `@microsoft/msgraph-sdk` (pre-GA).

## 14. Deferrals

To **Epic 3 (sync worker)**:
- Background `/users/delta`, `/groups/delta`, and Planner cache population.
- `sync_watermarks` rows populated by the worker.
- Adaptive polling, stale-tenant degraded handling, sync failure alerts to Teams ops channel.

To **Epic 4 (Teams install)**:
- `Action.Execute` → tool-call dispatch in the Teams channel adapter.
- First-mention welcome card.
- Daily digest using `planner.workload_analysis` + `planner.list_my_tasks`.

## 15. Open follow-ups

- **A4 chart-renderer contract** — confirm `chart` shape in §8.4 matches A4's input. Resolve when A-phase lands; adjust Zod output if needed.
- **`$batch` fallback for non-batch connectors** — Trello/Atlassian lack `$batch`. Generalize Section 8's chunker behind a connector-capability flag when those connectors land.
- **Cache invalidation broadcast** — multi-instance write-through is currently per-instance; the other API instance's cache may briefly be stale until its own next read. Acceptable in P1; Redis pub/sub or LISTEN/NOTIFY in P2 if needed.

## 16. CLAUDE.md changes implied by this spec

None beyond Epic 1's. This epic operates entirely within the boundaries Epic 1 established.

## 17. References

- Epic 1 design: `docs/superpowers/specs/2026-05-11-ms365-auth-design.md`
- Microsoft Learn — [Planner REST API overview (v1.0)](https://learn.microsoft.com/en-us/graph/api/resources/planner-overview?view=graph-rest-1.0)
- Microsoft Learn — [Update plannerTask (ETag / If-Match)](https://learn.microsoft.com/en-us/graph/api/plannertask-update?view=graph-rest-1.0)
- Microsoft Learn — [JSON batching with Microsoft Graph](https://learn.microsoft.com/en-us/graph/json-batching)
- Adaptive Cards — [Action.Execute spec](https://learn.microsoft.com/en-us/adaptive-cards/authoring-cards/universal-action-model)
