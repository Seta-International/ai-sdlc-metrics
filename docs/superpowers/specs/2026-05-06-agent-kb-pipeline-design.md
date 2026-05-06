# Agent KB Pipeline — Design Spec

**Date:** 2026-05-06
**Branch:** `feat/agent-kb-pipeline`
**SAD refs:** FR-C9, FR-C10, R-19, §5.3.1, §5.4.6
**Status:** Approved — ready for implementation planning

---

## 1. Overview

The KB pipeline turns admin-uploaded reference documents (HR handbooks, policies, FAQs, onboarding guides) into a retrievable, tenant-isolated knowledge base that the agent answers questions from. Four integrated components:

1. **Schema** — four Postgres tables in the `agents` schema, all RLS-enforced, with pgvector for embeddings.
2. **Ingestion pipeline** — multipart HTTP upload endpoint + pg-boss `kb-ingestion` worker + in-house markdown-aware chunker + OpenAI embedding batches.
3. **`kb.retrieve` tool** — agent-callable tRPC query that sub-agents invoke through the standard 6-step tool gateway. Returns top-K chunks with section-path citations.
4. **`web-admin` UI** — document list, drag-and-drop upload card, status polling, per-document actions (re-index, deprecate, delete), ingestion run history.

### Non-goals (Phase 1)

- OCR for image-based PDFs (deferred per FR-C10).
- Cross-conversation KB memory (out of scope per ADR-007).
- Admin-browsable chunk viewer.
- Role-restricted visibility scope enforcement beyond the UI placeholder — the column is designed and persisted; only `all_tenant_employees` is selectable at Phase 1.
- S3 object storage — raw file content stored in Postgres (`bytea`) given the 5 MB per-document cap.

---

## 2. Schema

All four tables live in the `agents` Postgres schema and are RLS-enforced:

```sql
ALTER TABLE agents.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.<table> FORCE ROW LEVEL SECURITY;
-- Policy on every table:
USING (tenant_id = current_setting('app.tenant_id')::uuid)
WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid)
```

### 2.1 `agent_kb_document`

One row per uploaded document. Single source of truth for admin-visible document state.

| Column             | Type                                                       | Notes                                                 |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| `id`               | `uuid PK`                                                  | `defaultRandom()`                                     |
| `tenant_id`        | `uuid NOT NULL`                                            | RLS partition key                                     |
| `uploader_id`      | `uuid NOT NULL`                                            | actor who uploaded                                    |
| `title`            | `text NOT NULL`                                            | from filename or user-provided                        |
| `mime_type`        | `text NOT NULL`                                            | `text/markdown` \| `text/plain` \| `application/pdf`  |
| `byte_size`        | `integer NOT NULL`                                         | checked pre-quota                                     |
| `raw_content`      | `bytea NOT NULL`                                           | raw file bytes; read by the worker                    |
| `status`           | `text NOT NULL DEFAULT 'pending'`                          | `pending`→`ingesting`→`ready`\|`failed`\|`deprecated` |
| `visibility_scope` | `jsonb NOT NULL DEFAULT '{"type":"all_tenant_employees"}'` | see §4.2                                              |
| `version`          | `integer NOT NULL DEFAULT 1`                               | bumped on re-index                                    |
| `content_hash`     | `text NOT NULL`                                            | SHA-256 hex of raw bytes; dedup key                   |
| `error_detail`     | `text`                                                     | populated on `status=failed`                          |
| `deprecated_at`    | `timestamptz`                                              | set on deprecation                                    |
| `created_at`       | `timestamptz NOT NULL`                                     | `defaultNow()`                                        |
| `updated_at`       | `timestamptz NOT NULL`                                     | `defaultNow()`                                        |

Indexes:

- `(tenant_id, status)` — admin list queries
- `UNIQUE (tenant_id, content_hash)` — dedup on re-upload

### 2.2 `agent_kb_ingestion_run`

Audit trail for each ingestion attempt. One document can have multiple runs (initial + re-indexes).

| Column         | Type                              | Notes                                                 |
| -------------- | --------------------------------- | ----------------------------------------------------- |
| `id`           | `uuid PK`                         |                                                       |
| `tenant_id`    | `uuid NOT NULL`                   | RLS                                                   |
| `document_id`  | `uuid NOT NULL`                   | logical FK → `agent_kb_document` (no cross-schema FK) |
| `job_id`       | `text`                            | pg-boss job ID for traceability                       |
| `status`       | `text NOT NULL DEFAULT 'running'` | `running`→`completed`\|`failed`                       |
| `chunk_count`  | `integer`                         | populated on completion                               |
| `error_detail` | `text`                            | on failure                                            |
| `started_at`   | `timestamptz NOT NULL`            | `defaultNow()`                                        |
| `completed_at` | `timestamptz`                     |                                                       |

Index: `(tenant_id, document_id)` — per-document run history queries.

### 2.3 `agent_kb_chunk`

One row per text chunk. Append-only; never mutated after insert.

| Column          | Type                   | Notes                                                      |
| --------------- | ---------------------- | ---------------------------------------------------------- |
| `id`            | `uuid PK`              |                                                            |
| `tenant_id`     | `uuid NOT NULL`        | RLS                                                        |
| `document_id`   | `uuid NOT NULL`        | logical FK → `agent_kb_document`                           |
| `chunk_index`   | `integer NOT NULL`     | ordering within document                                   |
| `section_path`  | `text NOT NULL`        | e.g. `"Onboarding > Week 1 Checklist"` — used in citations |
| `section_level` | `integer`              | heading depth: 1=H1, 2=H2, …, `null`=plain text            |
| `chunk_text`    | `text NOT NULL`        | raw text; returned in `kb.retrieve` results                |
| `token_count`   | `integer NOT NULL`     | `Math.ceil(text.length / 4)`                               |
| `created_at`    | `timestamptz NOT NULL` | `defaultNow()`                                             |

Index: `(tenant_id, document_id)` — fast chunk sweep on deprecation/re-index.

### 2.4 `agent_kb_embedding`

1:1 with `agent_kb_chunk`. Separated so re-embedding (model upgrade) only touches this table.

| Column            | Type                    | Notes                                    |
| ----------------- | ----------------------- | ---------------------------------------- |
| `chunk_id`        | `uuid PK`               | also logical FK → `agent_kb_chunk` (1:1) |
| `tenant_id`       | `uuid NOT NULL`         | denormalized for RLS + HNSW index        |
| `document_id`     | `uuid NOT NULL`         | denormalized for fast deprecation sweeps |
| `embedding`       | `vector(1536) NOT NULL` | pgvector; `text-embedding-3-small`       |
| `embedding_model` | `text NOT NULL`         | e.g. `'text-embedding-3-small'`          |
| `embedded_at`     | `timestamptz NOT NULL`  | `defaultNow()`                           |

**HNSW index:** `USING hnsw (embedding vector_cosine_ops)` — RLS enforces tenant isolation before index traversal.

### 2.5 Quota invariant

Enforced in the HTTP controller via a sequential DB read before insert:

```sql
SELECT COUNT(*) AS doc_count, COALESCE(SUM(byte_size), 0) AS total_bytes
FROM agents.agent_kb_document
WHERE tenant_id = $1 AND status != 'deprecated'
```

Defaults: **1,000 documents / 50 MB total / 5 MB per document**. All three limits are configurable per tenant.

---

## 3. Ingestion Pipeline

### 3.1 HTTP upload endpoint

**File:** `apps/api/src/modules/agents/interface/http/kb-upload.controller.ts`

Pattern: NestJS `@Controller`, mirrors `agent-turn-controller.ts`. Registered in `agents.module.ts`.

**Route:** `POST /agents/kb/documents` — `multipart/form-data`

| Field   | Type   | Notes                                    |
| ------- | ------ | ---------------------------------------- |
| `file`  | binary | required; ≤ 5 MB                         |
| `title` | string | optional; defaults to original filename  |
| `scope` | string | `"all_tenant_employees"` only at Phase 1 |

**Request flow (all DB operations sequential):**

1. Extract `tenant_id` + `uploader_id` from session via `SessionTokenExtractor`.
2. Read file buffer; reject `413` if `> 5 MB`.
3. Validate mime type against allowlist; reject `415` otherwise.
4. Read quota: `COUNT(*) + SUM(byte_size)`. Reject `413` with structured code if over limit.
5. Compute `SHA-256(buffer)`. If `(tenant_id, content_hash)` row already exists with `status=ready`, return `200 { document_id, status: "ready", duplicate: true }`.
6. Insert `agent_kb_document` with `status='pending'`, `raw_content=buffer`.
7. Update document `status='ingesting'`.
8. Enqueue `agents.kb-ingestion` pg-boss job `{ tenant_id, document_id }`.
9. Return `202 Accepted { document_id, status: "ingesting" }`.

**Error codes:**

| Condition        | HTTP | `code`                     |
| ---------------- | ---- | -------------------------- |
| File > 5 MB      | 413  | `FILE_TOO_LARGE`           |
| Unsupported mime | 415  | `UNSUPPORTED_FORMAT`       |
| Doc count quota  | 413  | `QUOTA_DOC_COUNT_EXCEEDED` |
| Storage quota    | 413  | `QUOTA_STORAGE_EXCEEDED`   |

### 3.2 `kb-ingestion` pg-boss worker

**File:** `apps/api/src/modules/agents/infrastructure/workers/kb-ingestion-worker.ts`

Pattern: `@Injectable()`, follows `scheduled-turn-worker.ts`. Uses `runWithTenantContext`. Registered in `agents.module.ts` on module init.

**Steps (strictly sequential — single `pg.PoolClient`):**

```
1.  Load agent_kb_document row (raw_content, mime_type, title)
2.  Insert agent_kb_ingestion_run { status: 'running', job_id }
3.  Extract text:
      .md / .txt  → Buffer.toString('utf-8')
      .pdf        → pdf-parse(buffer) → r.text
4.  Chunk:  KbChunker.chunk(text, mimeType) → KbChunk[]
5.  Delete existing chunks + embeddings for this document_id (clean re-index)
6.  Batch-insert agent_kb_chunk rows
7.  For each batch of ≤ 96 chunks:
      a. Call OpenAI text-embedding-3-small (batch)
      b. On 429: wait Retry-After / exponential backoff, retry ≤ 3×
      c. Upsert agent_kb_embedding rows
      d. Pause 200 ms between batches
8.  Update agent_kb_document: status='ready', updated_at=now()
9.  Update agent_kb_ingestion_run: status='completed', chunk_count=N, completed_at=now()
10. NotificationsWriteFacade.emit('kb.ingestion_completed', { tenantId, documentId })
```

**Error handling:** top-level catch sets both `agent_kb_document.status='failed'` and `agent_kb_ingestion_run.status='failed'` with `error_detail`, then emits `kb.ingestion_failed`. pg-boss retries up to 3× with exponential backoff; step 5 ensures a clean slate on each retry.

### 3.3 `KbChunker` — pure TypeScript service

**File:** `apps/api/src/modules/agents/application/services/kb-chunker.ts`

No external dependencies. Pure function; fully unit-tested in `kb-chunker.spec.ts`.

```ts
interface KbChunk {
  sectionPath: string // "Onboarding > Week 1 Checklist"
  sectionLevel: number | null // 1=H1, 2=H2, …, null=plain text
  chunkText: string
  tokenCount: number // Math.ceil(text.length / 4)
}

const TARGET_TOKENS = 400
const OVERLAP_TOKENS = 50
```

**Algorithm:**

```
Markdown (text/markdown):
  1. Walk lines; heading lines (^#{1,6} ) open new sections.
  2. Build section tree: { level, title, text, children[] }
  3. For each leaf section:
     a. tokenCount ≤ TARGET → emit one chunk; sectionPath = ancestor titles joined " > "
     b. tokenCount > TARGET → split on \n\n (paragraphs); emit each ≤ TARGET
     c. Any paragraph still > TARGET → fixed-size window (TARGET tokens, OVERLAP overlap)
  4. Sections with no heading → sectionPath = document title, sectionLevel = null

Plain text (text/plain):
  Treat as one unnamed section; apply paragraph-split → fixed-window fallback.

PDF (after pdf-parse text extraction):
  Split on \f (page breaks). Each page = "Page N" section (sectionLevel=1).
  Apply plain-text algorithm within each page.
```

**Spec cases** (`kb-chunker.spec.ts`): empty input, single heading with short body, nested H1>H2>H3 path, oversized section → paragraph split, oversized paragraph → fixed window, PDF page-break input, document with no headings.

---

## 4. `kb.retrieve` Tool

**File:** `apps/api/src/modules/agents/interface/trpc/kb.router.ts`

### 4.1 tRPC procedure

```ts
.meta({
  permission: 'agents:kb:read',
  agent: {
    whenToUse:    'Use when the user asks about company policies, handbook content, ' +
                  'internal FAQs, onboarding guides, or any question answerable by ' +
                  'tenant reference material.',
    whenNotToUse: 'Do not use for structured data questions (tasks, plans, people). ' +
                  'Do not use if the tenant has no ready KB documents.',
    examples: [
      { input: 'What is the annual leave policy?',
        callArgs: { query: 'annual leave policy', top_k: 5 } },
      { input: 'How do I onboard a new hire?',
        callArgs: { query: 'new hire onboarding process checklist', top_k: 5 } },
      { input: 'What are the expense reimbursement rules?',
        callArgs: { query: 'expense reimbursement policy rules', top_k: 5 } },
    ],
    tenantAuthoredFreeText: ['chunks'],  // triggers taint flip on every result
  },
})
.input(z.object({
  query: z.string().min(1).max(500),
  top_k: z.number().int().min(1).max(8).default(5),
}))
.output(z.object({
  chunks: z.array(z.object({
    document_id:    z.string().uuid(),
    document_title: z.string(),
    section_path:   z.string(),
    chunk_text:     z.string(),
    score:          z.number(),
  })),
}))
```

`tenantAuthoredFreeText: ['chunks']` is mandatory — KB content is tenant-authored, so any result flips the turn-taint flag, forcing all subsequent write tool calls onto the inbox path.

### 4.2 `KbRetrievalService`

**File:** `apps/api/src/modules/agents/application/services/kb-retrieval.service.ts`

```
1. Embed query string via OpenAI text-embedding-3-small (one call)
2. Load all ready, non-deprecated chunks + embeddings for this tenant:
     JOIN agent_kb_chunk, agent_kb_embedding, agent_kb_document
     WHERE status='ready' AND deprecated_at IS NULL
     AND visibility_scope allows caller's permissions
3. Score: cosineSimilarity(queryEmbedding, chunkEmbedding) per chunk
4. Filter: score ≥ 0.3
5. Sort descending; take top_k
6. Return { chunks } — empty array (never error) when nothing passes threshold
```

**Visibility scope filter:**

```ts
// all_tenant_employees → no filter
// role_restricted → skip chunk if caller's permissions don't include any required permission
if (scope.type === 'role_restricted') {
  if (!scope.permissions.some((p) => callerPermissions.has(p))) skip
}
```

### 4.3 Permission grant

`agents:kb:read` added to default role grants in the kernel module so all authenticated tenant users receive it automatically.

---

## 5. tRPC Document Management

All in `kb.router.ts` alongside `agentsKbRetrieve`. Admin procedures check `tenant_admin` permission.

| Procedure                     | Type     | Notes                                                                                                                                               |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agents.kb.listDocuments`     | query    | Paginated; sorted `created_at DESC`. Returns id, title, mime_type, byte_size, status, version, chunk_count, uploader_id, created_at, deprecated_at. |
| `agents.kb.getDocument`       | query    | Single document + ingestion runs sorted `started_at DESC`.                                                                                          |
| `agents.kb.deprecateDocument` | mutation | Sets `status='deprecated'`, `deprecated_at=now()`. Excluded from retrieval immediately. Emits kernel audit event.                                   |
| `agents.kb.reindexDocument`   | mutation | Requires `status='ready'\|'failed'`. Resets `status='pending'`, bumps `version`, enqueues new job. Emits audit event.                               |
| `agents.kb.deleteDocument`    | mutation | Hard-deletes document + chunks + embeddings. Admin-initiated only. Emits audit event.                                                               |

---

## 6. `web-admin` UI

### 6.1 Routes

```
apps/web-admin/src/app/agents/
  knowledge-base/
    page.tsx       ← document list + upload card
    [id]/
      page.tsx     ← document detail + ingestion run history
```

Add `{ label: 'Knowledge Base', href: '/agents/knowledge-base' }` to the agents sidebar nav group.

### 6.2 Document list page

**Quota bar:** `X of 1,000 documents · Y MB of 50 MB used`

**Upload card:**

- Drag-and-drop zone + `<input type="file" accept=".md,.txt,.pdf">`.
- Optional `<Input>` for title (placeholder: filename).
- `<Select>` for visibility scope — Phase 1: "All employees" (locked).
- `<Button>` disabled until file selected; `<Spinner />` during upload.
- Submit: `fetch('/agents/kb/documents', { method: 'POST', body: FormData })`.
- On `202`: invalidate `listDocuments` query cache.
- On duplicate `200`: toast "This document is already in the knowledge base."

**Document table:**

- Columns: Title, Type, Size, Status, Uploaded, Actions.
- Status `<Badge>`: `pending/ingesting` → secondary + spinner, `ready` → default, `failed` → destructive, `deprecated` → outline muted.
- Polling: `refetchInterval: 5000` while any row has `status` in `['pending','ingesting']`.
- Row actions: **View**, **Re-index** (on `ready`/`failed`), **Deprecate** (on `ready`, confirmation dialog), **Delete** (destructive confirmation dialog).

**Client-side error alerts:**

- `FILE_TOO_LARGE`: "File exceeds the 5 MB limit."
- `UNSUPPORTED_FORMAT`: "Only .md, .txt, and .pdf files are supported."
- `QUOTA_DOC_COUNT_EXCEEDED`: "Document quota reached (1,000 docs). Deprecate older documents to free space."
- `QUOTA_STORAGE_EXCEEDED`: "Storage quota reached (50 MB). Deprecate older documents to free space."
- Network error: "Upload failed. Please try again."

### 6.3 Document detail page

**Document info:** title, status badge, mime type, size, uploader, visibility scope, version, content hash (truncated to 12 chars).

**Ingestion run history table:** columns: Run #, Started, Completed, Chunks, Status, Error (expandable on failed rows).

**Page actions:** Re-index / Deprecate / Delete with confirmation dialogs. Back link to list.

---

## 7. Implementation Plans

The feature decomposes into five independently mergeable plans, ordered by dependency.

### Plan KB-1 — Schema + pgvector (1 day)

**Scope:**

- Enable `CREATE EXTENSION IF NOT EXISTS vector` in the migration.
- Add all four tables to `0000_initial.sql` with RLS policies.
- Define a `vector(1536)` custom Drizzle type for the embedding column.
- Add HNSW index on `agent_kb_embedding(embedding vector_cosine_ops)`.
- Extend `AGENTS_TABLES` export in `@future/db` with the four new table names.
- Add assertions for all four tables to `rls-all-tables.integration.spec.ts`.

**Done when:** `bun run db:migrate` succeeds; integration spec passes asserting `relrowsecurity=true` and `relforcerowsecurity=true` on all four tables.

**Can run in parallel with:** KB-2.

---

### Plan KB-2 — `KbChunker` pure service (0.5 day)

**Scope:**

- `apps/api/src/modules/agents/application/services/kb-chunker.ts` — pure TypeScript, no DB, no HTTP.
- `apps/api/src/modules/agents/application/services/kb-chunker.spec.ts` — all spec cases from §3.3.

**Done when:** all spec cases pass; `bun run test:unit` green; zero external dependencies added.

**Can run in parallel with:** KB-1.

---

### Plan KB-3 — Upload endpoint + ingestion worker (2 days)

**Scope:**

- `kb-upload.controller.ts` — multipart HTTP endpoint with quota check, dedup, pg-boss enqueue.
- Drizzle repository implementations for all four KB tables (`drizzle-kb-document.repository.ts`, `drizzle-kb-chunk.repository.ts`, `drizzle-kb-embedding.repository.ts`, `drizzle-kb-ingestion-run.repository.ts`).
- Domain repository interfaces in `domain/repositories/`.
- `kb-ingestion-worker.ts` — full ingestion pipeline (text extract → chunk → embed → upsert).
- `pdf-parse` added as a production dependency (`bun add pdf-parse`).
- Worker registered in `agents.module.ts`.
- Integration spec: happy-path `.md` upload → job runs → `status='ready'` → chunks + embeddings inserted.
- Unit spec for the controller (mocked quota, dedup, enqueue paths).

**Depends on:** KB-1 (tables exist), KB-2 (chunker service).

**Done when:** `POST /agents/kb/documents` with a real `.md` file results in `agent_kb_document.status='ready'` and populated `agent_kb_chunk` + `agent_kb_embedding` rows.

---

### Plan KB-4 — `kb.retrieve` tRPC tool (1 day)

**Scope:**

- `KbRetrievalService.retrieve()` — embed query, load candidates, score, filter, return top-K.
- `kb.router.ts` — `agentsKbRetrieve` query procedure with full tool meta block.
- All five document-management tRPC procedures (`listDocuments`, `getDocument`, `deprecateDocument`, `reindexDocument`, `deleteDocument`).
- Kernel permission grant: add `agents:kb:read` to default role grants.
- `agentsRouter` updated to include `kb: kbRouter`.
- Unit spec for `KbRetrievalService`: correct top-K ranking, threshold filter, empty result on no match, deprecated-document exclusion, visibility scope filter.
- Integration spec: retrieve returns ranked chunks from a real ingested document.

**Depends on:** KB-3 (embeddings exist in DB).

**Done when:** a sub-agent call to `agents.kb.agentsKbRetrieve` returns correctly ranked chunks from a seeded document; deprecated documents are excluded.

---

### Plan KB-5 — `web-admin` upload UI (1.5 days)

**Scope:**

- `apps/web-admin/src/app/agents/knowledge-base/page.tsx` — list + upload card.
- `apps/web-admin/src/app/agents/knowledge-base/[id]/page.tsx` — detail + run history.
- Sidebar nav entry added.
- All error states from §6.2.
- Component specs for the upload card (file validation, duplicate toast, quota error display) and the document table (status badge variants, polling behavior, action mutations).

**Depends on:** KB-3 (upload endpoint), KB-4 (tRPC management procedures).

**Done when:** full admin flow works in browser — upload `.md` → status polling → `ready` badge → re-index → deprecate → delete — with all error states covered by specs.

---

## 8. Cross-cutting Invariants

These apply across all five plans and must be verified before each plan's PR merges.

| Invariant                                                                              | Verified by                                             |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| All four KB tables have RLS enabled + forced                                           | `rls-all-tables.integration.spec.ts` (KB-1)             |
| `kb.retrieve` declares `tenantAuthoredFreeText`                                        | Tool registry boot validation (KB-4)                    |
| Worker never silently swallows an error — all paths set `status=failed` + notify admin | Worker integration spec (KB-3)                          |
| Quota check fires before any DB write                                                  | Controller unit spec with mocked over-quota repo (KB-3) |
| Duplicate content hash returns existing document, no re-ingestion                      | Controller integration spec (KB-3)                      |
| `kb.retrieve` returns empty array (not error) when no chunks pass threshold            | `KbRetrievalService` unit spec (KB-4)                   |
| Deprecated documents excluded from retrieval immediately                               | `KbRetrievalService` unit spec (KB-4)                   |
| pgvector extension enabled before HNSW index creation                                  | Migration order in `0000_initial.sql` (KB-1)            |
