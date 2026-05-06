# Phase 1 Pre-Launch Completion — Design Spec

**Date:** 2026-05-06
**Demo checkpoint:** 2026-05-20
**Sprint go-live:** 2026-05-29
**SAD reference:** `docs/architecture/agents-sad.md` §8 RAID, §9.2 pre-launch backlog
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
headers. No attempt cap or exponential curve exists.

### Design

Extract a shared `withProviderRetry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T>`
utility in `apps/api/src/modules/agents/infrastructure/adapters/provider-retry.ts`.

```ts
interface RetryOpts {
  baseDelayMs?: number // default 500
  multiplier?: number // default 2
  jitterMs?: number // default 0–200 (random)
  maxAttempts?: number // default 4
}
```

**Retry logic per attempt:**

1. Catch `VendorError` from `openai-vendor-error-extractor`
2. If `error.retryAfterMs` is set → wait that duration (capped at 32 s)
3. Otherwise → wait `min(baseDelayMs × multiplier^attempt + jitter, 32_000)`
4. Retryable: `429` rate-limit, `500 / 502 / 503 / 504` transient
5. Non-retryable (throw immediately): `401` auth, context-length exceeded, model refusal

**Apply to:** `RouterLlmClient`, `SubAgentLlmClient`, `SynthesizerLlmClient`.
Remove the existing single-retry logic in the tool-invocation path of `tool-gateway.ts`
(tools call domain code, not the provider directly — provider retry belongs in LLM clients).

### Testing

Unit test `withProviderRetry`:

- Happy path on first attempt
- Retries on 429 and respects `retryAfterMs`
- Gives up after `maxAttempts` and re-throws
- Does not retry on 401

---

## 3. R-12: Idempotency Schema for Write Tools

### Current state

No dedup table exists. The runtime never auto-retries writes (correct per SAD §8),
but there is no schema guard to make retry-safety auditable or enforceable.

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

### Testing

- Unit: dedup hit returns cached result without calling domain handler
- Unit: dedup miss executes and inserts row
- Integration: two identical tool calls in same turn produce one DB write

---

## 4. R-19: KB Ingestion Pipeline (Demo-Critical MVP)

### What ships for demo (by May 12)

Upload → chunk → embed → store → retrieve → cite. No quota UI, no deprecate flow,
no role-restricted visibility, no canary extension. Server-side hard limits only.

### Schema

Two new tables added to the squashed migration.

**`agents.kb_document`**

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

**`agents.kb_chunk`**

| Column        | Type          | Notes                           |
| ------------- | ------------- | ------------------------------- |
| `id`          | UUID PK       |                                 |
| `document_id` | UUID NOT NULL | FK → `kb_document.id`           |
| `tenant_id`   | UUID NOT NULL | RLS (denormalized for policy)   |
| `content`     | TEXT NOT NULL | Raw chunk text                  |
| `embedding`   | VECTOR(1536)  | `text-embedding-3-small` output |
| `position`    | INT NOT NULL  | Chunk index within document     |
| `token_count` | INT NOT NULL  |                                 |
| `created_at`  | TIMESTAMPTZ   |                                 |

Index: `kb_chunk_embedding_idx` using `ivfflat` on `embedding vector_cosine_ops`.
RLS + tenant isolation policy.

Both tables must be added to `AGENTS_TABLES` in `@future/db/rls-tables` so the
existing `rls-all-tables.integration.spec.ts` gate covers them automatically.

### API (tRPC)

New `kb.router.ts` in `apps/api/src/modules/agents/interface/trpc/`:

**`agents.kb.requestUpload`** (mutation)

- Input: `{ title: string, description?: string, fileSizeBytes: number, contentType: string }`
- Server-side guard: reject if `fileSizeBytes > 5_242_880` (5 MB) or `contentType` not in
  `['text/plain', 'text/markdown', 'application/pdf']`
- Creates `kb_document` with `status='pending'`
- Returns `{ documentId, presignedUrl }` (presigned S3 PUT via `@future/storage`)
- Dispatches pg-boss `kb-ingestion` job `{ documentId, tenantId }`

**`agents.kb.confirmUpload`** (mutation)

- Input: `{ documentId: string }`
- Called by admin UI after S3 PUT succeeds; updates `status='processing'`

**`agents.kb.listDocuments`** (query)

- Returns all `kb_document` rows for current tenant, ordered `created_at DESC`

### `kb-ingestion` pg-boss Worker

File: `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion.worker.ts`

Job payload: `{ documentId: string, tenantId: string }`

Steps:

1. Fetch `kb_document` row — if `status` is not `pending` or `processing`, skip (idempotent)
2. Set `status = 'processing'`
3. Download file bytes from S3 via `S3StorageClient`
4. Extract text:
   - `.txt` / `.md` → read as UTF-8
   - `.pdf` → `pdfjs-dist` server-side text extraction (no canvas dependency)
5. Chunk text: split on sentence boundaries, hard-cut at 512 tokens (tiktoken cl100k_base),
   50-token overlap between consecutive chunks
6. For each batch of 25 chunks:
   - Call OpenAI `text-embedding-3-small` with `input: chunk[]`
   - Rate-limit at 100 req/s via the existing `RateLimiter` in agents module
   - Use `withProviderRetry` (R-13 helper)
   - Insert `kb_chunk` rows with embeddings
7. Update `kb_document`: `status='ready'`, `chunk_count=N`
8. On unrecoverable error: `status='failed'`, `error_message=err.message`

pg-boss config: `retryLimit: 3`, `retryDelay: 60`.

### `knowledge_base.search` Tool

**Intent declaration**
`apps/api/src/modules/agents/intents/knowledge-base-search.ts`:

```ts
export const knowledgeBaseSearchIntent: IntentDescriptor = {
  slug: 'knowledge-base.search',
  domain: 'agents',
  description:
    'User is asking a question answerable from the tenant knowledge base (policies, handbooks, FAQs).',
}
```

**Tool** registered in `ToolRegistry`:

- Name: `knowledge_base.search`
- Input schema: `{ query: string }`
- Output: `Array<{ chunkContent: string, documentTitle: string, documentId: string, similarity: number }>`
- Taint: false (read-only, tenant-scoped, no user-authored free-text trigger)
- Permission key: `agents:kb:search`

**`KbRetriever` service** (`infrastructure/retrieval/kb-retriever.ts`):

```sql
SELECT c.content, d.title, d.id,
       1 - (c.embedding <=> $queryEmbedding) AS similarity
FROM agents.kb_chunk c
JOIN agents.kb_document d ON d.id = c.document_id
WHERE d.tenant_id = current_setting('app.tenant_id', true)::uuid
  AND d.status = 'ready'
ORDER BY c.embedding <=> $queryEmbedding
LIMIT 5
```

Embed `query` via `text-embedding-3-small` at query time (cached in
`agent_tool_result_cache` using existing semantic cache infrastructure).

### Admin UI

File: `apps/web-admin/src/app/agents/knowledge-base/page.tsx`

**Upload section:**

- `<Input>` for title (required), `<Textarea>` for description (optional)
- File picker (`<input type="file">` wrapped in a `<Button>` — file inputs are structural)
  accepting `.txt`, `.md`, `.pdf`
- Submit calls `agents.kb.requestUpload` → PUT to presigned URL → calls
  `agents.kb.confirmUpload` → shows inline status

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

**KB citation rendering** in `AgentThread`:

- When a message includes `sources: Array<{ documentTitle: string, excerpt: string }>`,
  render a collapsible `<details>` block below the answer labelled "Sources (N)"
- Each source: document title as bold label + excerpt in a blockquote
- Uses only `@future/ui` primitives

**Smoke test** (Playwright, one spec):

- Open web-planner → click agent toggle → panel opens
- Type "What are my open tasks?" → streamed response appears in thread
- Switch execution mode to Bypass → verify `execution_mode: 'bypass'` in outgoing request

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
| `kb.leave-policy`       | "What is our annual leave policy?"    | `['knowledge_base.search']`      | `short-answer` | false |

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

- **Squashed migration rule:** all schema changes go into `0000_initial.sql`. Delete
  existing `.sql` files + `meta/` snapshots, regenerate, re-migrate.
- **RLS on every new table:** `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`,
  plus a `<table>_tenant_isolation` policy using `current_setting('app.tenant_id', true)::uuid`.
- **`AGENTS_TABLES` list:** add `agent_write_dedup`, `kb_document`, `kb_chunk` to
  `@future/db/rls-tables` so `rls-all-tables.integration.spec.ts` covers them automatically.
- **No `Promise.all` for DB queries** inside handlers (single pool client per request).
- **No `.js` extensions** in relative imports.
- **UI components:** all interactive elements use `@future/ui`; no raw `<button>`,
  `<input>`, `<select>` for interactive use.
- **`knowledge_base.search` is read-only** and must never set `taintTriggered`.
