# Phase 1 Pre-Launch Completion — Design Spec

**Date:** 2026-05-06
**Demo checkpoint:** 2026-05-20
**Sprint go-live:** 2026-05-29
**SAD reference:** `docs/architecture/agents-sad.md` §3.2 NFRs, §5.3 data arch, §5.4 integration,
§8 RAID, §9.2 pre-launch backlog, Appendix C (memory), D (tool meta), E (spans), F (cost)
**Approach:** Parallel agent dispatch for quick items (B) + scoped KB MVP for demo (C)

---

## Context

R-05 (DB tenant isolation) and R-07 (approval audit events) are closed. The remaining
pre-launch backlog items are:

| RAID | Item                                           | Effort         | Status                      |
| ---- | ---------------------------------------------- | -------------- | --------------------------- |
| R-13 | Exponential backoff for provider retry         | 0.5 day        | Partial — single retry only |
| R-12 | Idempotency-key schema for write tools         | 2 days         | Not started                 |
| R-19 | KB ingestion pipeline + admin UI               | 5–6 days (MVP) | Not started                 |
| —    | Chat surface polish (exec-mode + KB citations) | 2 days         | Not started                 |
| —    | Golden trace fixtures                          | 2–3 days       | Not started                 |

Two production stubs remain wired in `agents.module.ts` (`StubMetricsQuery`,
`StubCiState`) — deferred to hardening week (May 20–29); non-blocking for demo.

---

## 1. Timeline & Parallel Execution Strategy

| Window        | Work                                                                    |
| ------------- | ----------------------------------------------------------------------- |
| **May 6–7**   | Subagent dispatch: R-13 + R-12 in parallel (zero file overlap)          |
| **May 7–12**  | KB pipeline exclusively: schema → worker → admin UI → retrieval tool    |
| **May 12–14** | Chat surface: execution-mode dropdown + KB citation rendering           |
| **May 14–19** | Golden trace fixtures, quality validation, security review prep         |
| **May 20–29** | Hardening: quota UI, deprecate/re-index, canary EI-11, stub replacement |

Parallel dispatch is safe for R-13 and R-12 because:

- R-13 touches only LLM client files under `infrastructure/`
- R-12 adds a new schema table + a guard in `ToolGateway` that no other open item touches

---

## 2. R-13: Exponential Backoff for Provider Retry

### Current state

`tool-gateway.ts` performs a single 200 ms + 0–100 ms jitter retry on transient errors.
`openai-vendor-error-extractor.ts` already extracts `retryAfterMs` from `Retry-After`
headers. No exponential curve exists and the attempt cap is not explicit.

### SAD NFR constraint (§3.2)

> "one retry with exponential backoff and jitter (i.e. up to **two total attempts**); **single
> layer only** (gateway-owned; SDK retry disabled)"

This means:

- Maximum **2 total attempts** (1 original + 1 retry). Do not allow more.
- Retry logic lives in the LLM client layer only. The OpenAI SDK's built-in retry must be
  **disabled** (`maxRetries: 0` on the SDK client constructor).
- The existing single-retry in `tool-gateway.ts` is already in the right layer — it just
  needs the exponential curve and `Retry-After` honoring added.

### Design

Extract a shared `withProviderRetry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T>`
utility in `apps/api/src/modules/agents/infrastructure/adapters/provider-retry.ts`.

```ts
interface RetryOpts {
  baseDelayMs?: number // default 500
  multiplier?: number // default 2
  jitterMs?: number // default 0–200 (random)
  maxAttempts?: number // default 2 — SAD NFR cap; do not raise without explicit approval
}
```

**Retry logic per attempt:**

1. Catch `VendorError` from `openai-vendor-error-extractor`
2. If attempt count has reached `maxAttempts` → re-throw immediately
3. If `error.retryAfterMs` is set → wait that duration (capped at 32 s)
4. Otherwise → wait `min(baseDelayMs × multiplier^attempt + jitter, 32_000)`
5. Retryable: `429` rate-limit, `500 / 502 / 503 / 504` transient
6. Non-retryable (throw immediately): `401` auth, context-length exceeded, model refusal

**Apply to:** `RouterLlmClient`, `SubAgentLlmClient`, `SynthesizerLlmClient`. Pass
`maxRetries: 0` to each SDK client constructor so the SDK never retries independently.

Remove the existing ad-hoc single-retry in the tool-invocation path of `tool-gateway.ts`
(tools call domain code, not the provider directly — provider retry belongs in LLM clients).

### Testing

Unit test `withProviderRetry`:

- Happy path on first attempt — no retry issued
- Retries once on 429, respects `retryAfterMs`, re-throws on second failure
- Does **not** issue a third attempt even if the second also fails (SAD cap = 2 total)
- Does not retry on 401

---

## 3. R-12: Idempotency Schema for Write Tools

### Current state

No dedup table exists. The runtime never auto-retries writes (correct per SAD §8),
but data invariant D-5 (SAD §5.3.3) requires the schema guard before agent-driven
writes can run unattended.

> **D-5 — Idempotency-key column on write-tool results.** The `(tenant_id, idempotency_key)`
> pair guarantees a retried write returns the original result, never produces a duplicate.
> Phase-1 readiness backlog (RAID R-12).

### Schema

New table `agents.agent_write_dedup` added to the squashed migration:

```sql
CREATE TABLE agents.agent_write_dedup (
  idempotency_key  TEXT PRIMARY KEY,
  tenant_id        UUID        NOT NULL,
  turn_id          UUID        NOT NULL,
  tool_name        TEXT        NOT NULL,
  result_json      JSONB       NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL
);
ALTER TABLE agents.agent_write_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.agent_write_dedup FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_write_dedup_tenant_isolation ON agents.agent_write_dedup
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

**Key construction** (in `ToolGateway` before write-tool execution):

```
idempotency_key = sha256(turn_id + ":" + tool_call_id + ":" + canonicalArgs)
```

`canonicalArgs` uses the existing `canonicalize()` from `infrastructure/cache/canonical-args`.

**Expiry:** 24 hours from creation. A new pg-boss sweeper
`SweepExpiredWriteDedupWorker` purges rows daily (mirrors the existing
`SweepExpiredDraftsWorker` pattern).

### ToolGateway integration

In the write-tool execution path:

1. Compute key
2. `SELECT` from `agent_write_dedup WHERE idempotency_key = $key`
3. If found and not expired → return cached `result_json` (log as dedup hit)
4. Execute tool → on success, `INSERT` dedup row with `expires_at = now() + interval '24 hours'`
5. On failure → do not insert (surface error normally)

### Tool meta field (`idempotencyKey` — Appendix D)

Once the dedup table is live, write tools activate retry-safety by declaring `idempotencyKey`
in their agent meta block (optional on `.mutation()`). The gateway reads this field to decide
whether to compute and look up the key. Tools that do not declare it are treated as non-idempotent
and are never auto-retried.

### Testing

- Unit: dedup hit returns cached result without calling domain handler
- Unit: dedup miss executes and inserts row
- Integration: two identical tool calls in same turn produce one DB write

---

## 4. R-19: KB Ingestion Pipeline (Demo-Critical MVP)

### What ships for demo (by May 12)

Upload → chunk → embed → store → retrieve → cite. No quota UI, no deprecate flow,
no role-restricted visibility, no canary extension. Server-side hard limits only.

### NFRs (SAD §3.2)

| Metric                               | Target                                            |
| ------------------------------------ | ------------------------------------------------- |
| Ingestion p95 (document ≤ 1 MB)      | ≤ 60 s end-to-end                                 |
| Ingestion p95 (document ≤ 5 MB cap)  | ≤ 5 min end-to-end                                |
| Retrieval p95 (`kb.retrieve`, K ≤ 8) | ≤ 250 ms                                          |
| Per-tenant quota (default)           | 1 000 documents / 50 MB total / 5 MB per document |

### Schema

Four new tables added to the squashed migration (SAD §5.3.1 "Tenant knowledge base" cluster).

**`agents.agent_kb_document`**

| Column             | Type                          | Notes                                |
| ------------------ | ----------------------------- | ------------------------------------ |
| `id`               | UUID PK                       |                                      |
| `tenant_id`        | UUID NOT NULL                 | RLS                                  |
| `title`            | TEXT NOT NULL                 |                                      |
| `description`      | TEXT                          |                                      |
| `s3_key`           | TEXT NOT NULL                 | Key in `@future/storage`             |
| `visibility_scope` | TEXT NOT NULL DEFAULT `'all'` | `'all'` only for demo                |
| `status`           | TEXT NOT NULL                 | `pending\|processing\|ready\|failed` |
| `file_size_bytes`  | INT                           |                                      |
| `chunk_count`      | INT                           | Populated after ingestion            |
| `error_message`    | TEXT                          | Set on `failed`                      |
| `created_by`       | UUID NOT NULL                 | Actor who uploaded                   |
| `created_at`       | TIMESTAMPTZ                   |                                      |

CHECK constraint: `status IN ('pending','processing','ready','failed')`
RLS + tenant isolation policy (same pattern as all agent tables).

**`agents.agent_kb_chunk`**

| Column        | Type          | Notes                         |
| ------------- | ------------- | ----------------------------- |
| `id`          | UUID PK       |                               |
| `document_id` | UUID NOT NULL | FK → `agent_kb_document.id`   |
| `tenant_id`   | UUID NOT NULL | RLS (denormalized for policy) |
| `content`     | TEXT NOT NULL | Raw chunk text                |
| `position`    | INT NOT NULL  | Chunk index within document   |
| `token_count` | INT NOT NULL  |                               |
| `created_at`  | TIMESTAMPTZ   |                               |

RLS + tenant isolation policy.

**`agents.agent_kb_embedding`** (SAD §5.3.1 — separate from chunk per entity diagram)

| Column      | Type          | Notes                           |
| ----------- | ------------- | ------------------------------- |
| `chunk_id`  | UUID PK       | FK → `agent_kb_chunk.id` (1:1)  |
| `tenant_id` | UUID NOT NULL | RLS (denormalized for policy)   |
| `embedding` | VECTOR(1536)  | `text-embedding-3-small` output |

Index: `agent_kb_embedding_hnsw_idx` using **HNSW** on `embedding vector_cosine_ops`
(SAD §5.3.1 explicitly specifies HNSW for the KB vector index).
RLS + tenant isolation policy.

**`agents.agent_kb_ingestion_run`** (SAD §5.3.1 — ingestion-run audit)

| Column           | Type          | Notes                        |
| ---------------- | ------------- | ---------------------------- |
| `id`             | UUID PK       |                              |
| `document_id`    | UUID NOT NULL | FK → `agent_kb_document.id`  |
| `tenant_id`      | UUID NOT NULL | RLS                          |
| `status`         | TEXT NOT NULL | `started\|completed\|failed` |
| `chunks_written` | INT           | Populated on completion      |
| `error_message`  | TEXT          | Set on `failed`              |
| `started_at`     | TIMESTAMPTZ   |                              |
| `finished_at`    | TIMESTAMPTZ   |                              |

RLS + tenant isolation policy.

All four tables must be added to `AGENTS_TABLES` in `@future/db/rls-tables` so the
existing `rls-all-tables.integration.spec.ts` gate covers them automatically.

### API (tRPC)

New `kb.router.ts` in `apps/api/src/modules/agents/interface/trpc/`:

**`agents.kb.requestUpload`** (mutation)

- Input: `{ title: string, description?: string, fileSizeBytes: number, contentType: string }`
- Server-side guard: reject if `fileSizeBytes > 5_242_880` (5 MB) or `contentType` not in
  `['text/plain', 'text/markdown', 'application/pdf']`
- Creates `agent_kb_document` with `status='pending'`
- Returns `{ documentId, presignedUrl }` (presigned S3 PUT via `@future/storage`)
- Dispatches pg-boss `kb-ingestion` job `{ documentId, tenantId }`

**`agents.kb.confirmUpload`** (mutation)

- Input: `{ documentId: string }`
- Called by admin UI after S3 PUT succeeds; updates `status='processing'`

**`agents.kb.listDocuments`** (query)

- Returns all `agent_kb_document` rows for current tenant, ordered `created_at DESC`

### `kb-ingestion` pg-boss Worker

File: `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.ts`

Job payload: `{ documentId: string, tenantId: string }`

Steps:

1. Fetch `agent_kb_document` — if `status` is not `pending` or `processing`, skip (idempotent)
2. Create `agent_kb_ingestion_run` row with `status='started'`
3. Set `agent_kb_document.status = 'processing'`
4. Download file bytes from S3 via `S3StorageClient`
5. Extract text:
   - `.txt` / `.md` → read as UTF-8
   - `.pdf` → `pdfjs-dist` server-side text extraction (no canvas dependency; text-only PDFs
     at Phase 1 — OCR for image-PDFs deferred per SAD FR-053)
6. Chunk text: split on sentence boundaries, hard-cut at 512 tokens (tiktoken cl100k_base),
   50-token overlap between consecutive chunks
7. Insert `agent_kb_chunk` rows (content only, no embedding yet)
8. For each batch of 25 chunks:
   - Call OpenAI `text-embedding-3-small` with `input: chunk[]`
   - Rate-limit at 100 req/s via the existing `RateLimiter` in agents module
   - Use `withProviderRetry` (R-13 helper, maxAttempts: 2)
   - Insert `agent_kb_embedding` rows
9. Update `agent_kb_document`: `status='ready'`, `chunk_count=N`
10. Update `agent_kb_ingestion_run`: `status='completed'`, `chunks_written=N`, `finished_at=now()`
11. On unrecoverable error: `agent_kb_document.status='failed'`,
    `agent_kb_ingestion_run.status='failed'`, `error_message=err.message`

**Observability:** emit `KB_INGEST` span (Appendix E, `entity_type: 'KB'`) wrapping steps 4–10
with attributes: `document_id`, `tenant_id`, `chunk_count`, `file_size_bytes`, `duration_ms`.
Embed each batch as a child span. Cost events for embedding calls tagged separately from
per-turn cost (SAD Appendix F: "Knowledge base ingestion cost — not part of the per-turn budget").

pg-boss config: `retryLimit: 3`, `retryDelay: 60`.

### `kb.retrieve` Tool (SAD §5.4.1, Appendix D)

> "A worker tool (`kb.retrieve`) — not a separate sub-agent. Returns top-K chunks with
> `(document_id, section, score)` provenance; tenant-keyed pgvector index."

**Intent declaration**
`apps/api/src/modules/agents/intents/kb-retrieve.ts`:

```ts
export const kbRetrieveIntent: IntentDescriptor = {
  slug: 'kb.retrieve',
  domain: 'agents',
  description:
    'User is asking a question answerable from the tenant knowledge base (policies, handbooks, FAQs, process guides).',
}
```

**Tool** registered in `ToolRegistry`:

```ts
{
  name: 'kb.retrieve',
  inputSchema: { query: z.string() },
  outputSchema: z.array(z.object({
    documentId: z.string().uuid(),
    documentTitle: z.string(),
    section: z.string(),          // chunk position as "chunk N of M"
    chunkContent: z.string(),
    score: z.number(),            // cosine similarity 0–1
  })),
  // Appendix D required fields:
  whenToUse: 'Use when the user asks about company policies, HR rules, onboarding procedures, internal FAQs, or any question whose answer is likely in a tenant-curated reference document.',
  whenNotToUse: 'Do not use for questions about live operational data (tasks, plans, timesheets) — those belong to the Planner or People sub-agents. Do not use when the question is answerable from structured domain data alone.',
  examples: [
    { input: 'What is our parental leave policy?', shouldUse: true },
    { input: 'How many days of annual leave do I have left?', shouldUse: false,
      reason: 'Live entitlement data — use People/Time sub-agent, not KB.' },
  ],
  cacheable: true,    // TTL ~5 min (semantic result cache)
  bypassable: undefined,  // read-only .query(); field omitted per Appendix D rules
  tenantAuthoredFreeText: undefined,  // KB content is admin-imported, not user-authored; no taint
}
```

**`KbRetriever` service** (`infrastructure/retrieval/kb-retriever.ts`):

```sql
SELECT c.id   AS chunk_id,
       c.content,
       c.position,
       c.token_count,
       d.id   AS document_id,
       d.title,
       1 - (e.embedding <=> $queryEmbedding) AS score
FROM   agents.agent_kb_chunk     c
JOIN   agents.agent_kb_document  d ON d.id = c.document_id
JOIN   agents.agent_kb_embedding e ON e.chunk_id = c.id
WHERE  d.tenant_id = current_setting('app.tenant_id', true)::uuid
  AND  d.status    = 'ready'
ORDER  BY e.embedding <=> $queryEmbedding
LIMIT  8   -- SAD NFR: K ≤ 8
```

Embed `query` via `text-embedding-3-small` at query time. Cache the embedding result in
`agent_tool_result_cache` (existing semantic cache) with a 5-minute TTL.

**Observability:** emit `KB_RETRIEVE` span (`entity_type: 'KB'`, `span_type: 'KB_RETRIEVE'`)
with attributes: `tenant_id`, `query_token_count`, `k_requested`, `k_returned`,
`top_score`, `cache_hit`.

### Cost accounting (SAD Appendix F)

Embedding calls during ingestion are **not** part of the per-turn budget. They are tagged
as a separate `pricing_id`-labelled `agent_cost_event` so admin dashboards show KB
ingestion cost as a distinct line item.

Per Appendix F estimates (illustrative, rebaseline on provider price change per RAID R-17):

- Embedding rate: $0.02 / 1M tokens (`text-embedding-3-small`, 2026-05)
- Average tokens/document: ~50 000
- Cost per document: ~$0.001
- Phase-1 SETA corpus (~200 documents): ~$0.20 one-off

### Admin UI

File: `apps/web-admin/src/app/agents/knowledge-base/page.tsx`

**Upload section:**

- `<Input>` for title (required), `<Textarea>` for description (optional)
- File picker (`<input type="file">` wrapped in a `<Button>` — file inputs are structural HTML)
  accepting `.txt`, `.md`, `.pdf`
- Submit: call `agents.kb.requestUpload` → PUT to presigned URL → call
  `agents.kb.confirmUpload` → show inline status badge

**Document list:**

- Columns: Title, Status (`<Badge>`), File size, Chunks, Created
- `refetchInterval: 5_000` while any row has `status='processing'`
- Uses `@future/ui` `<Table>`, `<Badge>`, `<Skeleton>` for loading state

### Hardening items deferred to May 20–29

- Per-tenant quota enforcement UI (server-side: reject upload if doc count > 1 000 or
  total size > 52 MB — no visible counter for demo)
- Deprecate / re-index flow
- Hard-delete with audit record
- Role-restricted visibility scope selector
- Cross-tenant leak canary extension (EI-11) — required before go-live, not demo

---

## 5. Chat Surface Integration

### Current state

`AppLayout` already renders `AgentPanel` (slide-in sidebar, width 400 px when open).
`togglePanel` is wired to nav `onAgentClick`. `AgentProvider` is present in all zone
layouts. `AgentPanel` → `AgentThread` + `AgentComposer` chain exists.

### Missing pieces

**Execution-mode dropdown** in `AgentComposer`:

- `<Select>` left of the send button; options: `Default approvals` / `Bypass approvals`
- Default: `'default'`; state in `useAgentState` as `executionMode: 'default' | 'bypass'`
- Passed as `execution_mode` on each turn POST body
- `SendMessageCommand` gains `executionMode` field; `TurnPipelineRunner` reads it to set
  `draftApprovalMode`

**Mode constraints (SAD §5.4.2):**

- Mode is read **once per turn** from the conversation row at turn start; it cannot change
  mid-turn even if the user updates the dropdown
- If tenant setting `bypass_disabled = true`, gateway forces `'default'` regardless of the
  user's dropdown value; the UI should reflect this by disabling the Bypass option and
  showing a "disabled by your organisation" tooltip
- Inline-preview confirmation (Default mode) is a **typed SSE event** on the existing
  turn channel — not a new HTTP round-trip. The Confirm button dispatches the event over
  the already-open SSE connection

**Memory — L2 write-turn entries (SAD Appendix C.5):**

| Write path                          | What enters L2                                              |
| ----------------------------------- | ----------------------------------------------------------- |
| Previewed intent (Default mode)     | Nothing until confirmed — intent is L1-only during the turn |
| Confirmed write (Default or Bypass) | `{ tool, idempotency_key, outcome_summary, draft_id? }`     |
| Drafted action (inbox path)         | `{ draft_ids[], count, target_module }`                     |
| Cancelled / declined                | Single line: outcome + timestamp                            |

**Memory surface budgets (SAD Appendix C.6):**

| Surface                | L2 token budget | Notes                                             |
| ---------------------- | --------------- | ------------------------------------------------- |
| Global chat panel      | 4 000           | Full conversation context expected                |
| Inline copilot         | 2 000           | On-screen entity already in prompt; halved budget |
| Scheduled run (Mode 3) | 0 — no L2       | Fresh per run; no live conversation history       |

**KB citation rendering** in `AgentThread`:

- When a message includes `sources: Array<{ documentTitle: string, excerpt: string }>`,
  render a collapsible `<details>` block below the answer labelled "Sources (N)"
- Each source: document title as bold label + excerpt in a blockquote
- Citation inline format in answer text: `[doc-title §section]` (SAD §5.4.1)
- Uses only `@future/ui` primitives

**Observability — spans required (SAD Appendix E):**

| Span            | Emitted by           | Required attributes                                    |
| --------------- | -------------------- | ------------------------------------------------------ |
| `WRITE_PREVIEW` | Synthesizer          | `tool_name`, `args_hash`, `bypassable`, `taint_state`  |
| `WRITE_CONFIRM` | HTTP turn controller | `tool_name`, `idempotency_key`, `confirmed_at`, `mode` |

**Smoke test** (Playwright, one spec):

- Open web-planner → click agent toggle → panel opens
- Type "What are my open tasks?" → streamed response appears in thread
- Switch execution mode to Bypass → verify `execution_mode: 'bypass'` in outgoing request
- Verify Default-mode inline preview fires a typed SSE confirm event (not a POST)

---

## 6. Golden Trace Fixtures

### New intent declarations required

`planner.list-my-tasks` and `planner.list-my-plans` already exist. FR-P2 and FR-P3
require two new intent files before golden traces can be seeded:

- `apps/api/src/modules/planner/agent/intents/get-plan-status.ts`
  → slug `planner.get-plan-status`, description: "User is asking about the current
  status, progress, or health of a specific plan or project."
- `apps/api/src/modules/planner/agent/intents/list-at-risk-plans.ts`
  → slug `planner.list-at-risk-plans`, description: "User is asking which plans or
  projects are at risk of missing their deadline or are blocked."

Both must be exported from `apps/api/src/modules/planner/agent/intents/index.ts`.

### Fixtures

Four rows seeded by
`apps/api/src/modules/agents/fixtures/seed-golden-traces.ts`
(standalone script, not a migration — run once against the SETA pilot tenant):

| Title                   | Utterance                             | Expected tool calls              | Shape          | Taint |
| ----------------------- | ------------------------------------- | -------------------------------- | -------------- | ----- |
| `planner.list-my-tasks` | "What are my open tasks this week?"   | `['planner.list-my-tasks']`      | `list`         | false |
| `planner.plan-status`   | "What's the status of Project Alpha?" | `['planner.get-plan-status']`    | `narrative`    | false |
| `planner.role-analysis` | "Which plans are at risk?"            | `['planner.list-at-risk-plans']` | `table`        | false |
| `kb.leave-policy`       | "What is our annual leave policy?"    | `['kb.retrieve']`                | `short-answer` | false |

`adversarialCategory: null` for all (clean happy-path flows).
`answerShapeContract` captures the top-level required fields for each shape.

CI gate: `GoldenTraceRunner` is already wired into `readiness.router.ts`. All four
rows must pass before demo prep closes (May 19).

---

## 7. Deferred to Hardening (May 20–29)

| Item                                       | RAID | Notes                                     |
| ------------------------------------------ | ---- | ----------------------------------------- |
| Per-tenant KB quota enforcement UI         | R-19 | Server rejects uploads; no UI counter     |
| Deprecate / re-index flow                  | R-19 | No deprecate action in demo UI            |
| Hard-delete KB document                    | R-19 | Omitted from demo UI                      |
| Role-restricted KB visibility scope        | R-19 | Only `'all'` supported for demo           |
| Cross-tenant leak canary extension (EI-11) | R-19 | Required before go-live                   |
| `StubMetricsQuery` → real metrics          | —    | GA readiness criterion; not demo-blocking |
| `StubCiState` → real CI state              | —    | GA readiness criterion; not demo-blocking |

---

## 8. Key Invariants & Constraints

### Schema

- **Squashed migration rule:** all schema changes go into `0000_initial.sql`. Delete
  existing `.sql` files + `meta/` snapshots, regenerate, re-migrate.
- **RLS on every new table:** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`,
  plus a `<table>_tenant_isolation` policy using `current_setting('app.tenant_id', true)::uuid`.
- **`AGENTS_TABLES` list:** add `agent_write_dedup`, `agent_kb_document`, `agent_kb_chunk`,
  `agent_kb_embedding`, `agent_kb_ingestion_run` to `@future/db/rls-tables` so
  `rls-all-tables.integration.spec.ts` covers them automatically.
- **D-5** (SAD §5.3.3): `(tenant_id, idempotency_key)` uniqueness on `agent_write_dedup`
  is a build-time asserted invariant — the integration spec must verify the unique
  constraint exists, mirroring the existing D-4 checks.

### Module boundaries

- **No `Promise.all` for DB queries** inside handlers (single pool client per request).
- **No `.js` extensions** in relative imports.
- **No cross-module domain imports** — KB retriever accesses only `agents.*` tables.

### Tool authoring (EXT-10, SAD Appendix A)

Every new agent-callable tool must pass the build-time meta drift suite:

- `whenToUse` and `whenNotToUse` present and non-empty
- `examples` present with ≥1 negative case
- `bypassable` declared on every `.mutation()` tool
- `approvalFreshness` declared on every `.mutation()` tool
- `compositionSensitive` with minimum group size on every aggregate-returning tool
- `kb.retrieve` declares `cacheable: true` with TTL ~5 min

### Tenant knowledge base (EXT-11, SAD Appendix A)

- All `agent_kb_*` tables are tenant-keyed and RLS-forced at schema level — EXT-11 is
  satisfied by construction if `AGENTS_TABLES` is kept current.
- Cross-tenant leak canary extension to KB chunk retrieval is a **hardening-week
  requirement** (required before go-live, not demo).

### UI components

- All interactive elements use `@future/ui`; no raw `<button>`, `<input>`, `<select>`
  for interactive use.
- `kb.retrieve` is read-only and must never set `taintTriggered`.
