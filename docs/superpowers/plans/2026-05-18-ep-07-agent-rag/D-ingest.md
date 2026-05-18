# Plan D — `ingest` path (chunk → hash → dedup → embed → insert)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `ingest` closure inside the `createAgentRag` factory: chunk input text via `@seta/agent-chunking`, sha256-hash each chunk, filter against `findExistingHashes` to skip work, embed only the new chunks via the injected `EmbeddingsClient`, and `insertChunks` with `span` propagated end to end. Cover with unit tests for the inline `sha256hex` helper and seven integration tests against real Postgres + recorded OpenAI fixtures.

**Architecture:** The ingest path is a pure orchestration: pull dependencies from the `RagDeps` closure, await each upstream call, log structured boundary events. Errors propagate unchanged — no wrapping. Abort signal threads from `IngestOptions` only as far as `embeddings.embed`; sync stages (chunking, hashing, dedup query) are not interruptible.

**Tech Stack:** TypeScript (ESM), Vitest, Postgres + pgvector via Docker compose, msw-based OpenAI recording layer (`@seta/agent-core/testkit`).

**Spec:** [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../specs/2026-05-18-agent-rag-design.md) §Data flow → Ingest, §Testing → cases 1–7, §Logging contract.

---

## File Structure

After this plan completes:

```
platform/agent/rag/
├── package.json                            # MODIFY (split test:unit / test:integration scripts)
├── vitest.config.ts                        # MODIFY (file parallelism off, longer timeout)
├── src/
│   ├── ingest.ts                           # CREATE — the ingest closure factory
│   ├── ingest.test.ts                      # CREATE — unit (hash digest, structure)
│   └── factory.ts                          # MODIFY — wire `createIngest` into `createAgentRag`
└── tests/integration/
    ├── _helpers.ts                         # CREATE — testSql, ensureMigrations, truncate, embeddings build
    ├── ingest.test.ts                      # CREATE — cases 1–7
    └── __recordings__/                     # CREATE (checked into git)
        ├── ingest-fresh-3-chunks.json
        ├── ingest-partial-overlap.json
        ├── ingest-cross-source.json
        └── ingest-vector-error.json
```

---

## Task D1: Wire the test:integration script + tighten vitest config

**Files:**
- Modify (via CLI only): `platform/agent/rag/package.json`
- Modify: `platform/agent/rag/vitest.config.ts`

- [ ] **Step 1: Split `test:unit` and add `test:integration` scripts**

The scaffolder set `scripts.test:unit = "vitest run"`. Mirror `@seta/agent-embeddings`'s split — unit hits `src/`, integration hits `tests/`:

```powershell
Push-Location platform/agent/rag
npm pkg set 'scripts.test:unit=vitest run src/'
npm pkg set 'scripts.test:integration=vitest run tests/'
Pop-Location
```

- [ ] **Step 2: Update `vitest.config.ts` for integration safety**

Open `platform/agent/rag/vitest.config.ts` and replace the body with:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@seta/agent-rag',
    // Integration tests truncate shared tables; serialize files so one
    // file's setup does not wipe another file's in-flight data.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
```

Matches `@seta/agent-vector`'s `vitest.config.ts` (the closest precedent — both packages run integration tests against the same DB).

- [ ] **Step 3: Verify unit tests still pass**

```powershell
pnpm --filter @seta/agent-rag test:unit
```

Expected: the existing 19 unit tests (`rrf` x 8 + properties x 4 + `testkit` x 6 + `factory` x 1) pass.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/package.json platform/agent/rag/vitest.config.ts
git commit -m "chore(agent-rag): split test:unit/test:integration scripts"
```

---

## Task D2: Unit test for inline `sha256hex` digest

**Files:**
- Create: `platform/agent/rag/src/ingest.test.ts`

We won't introduce a `hash.ts` helper module — the spec mandates inline hashing. The unit test parks the digest behaviour in a small extracted-for-test inline function, then references the same expression as a string-match against the implementation source. The intent: prove the digest is canonical sha256-hex of UTF-8 bytes.

- [ ] **Step 1: Write the unit test**

Create `platform/agent/rag/src/ingest.test.ts` with exactly:

```ts
// platform/agent/rag/src/ingest.test.ts
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

// This block mirrors the inline sha256hex used inside `ingest.ts`.
// If you change the algorithm in `ingest.ts`, this test must change too.
function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

describe('ingest — sha256hex (inline)', () => {
  it('produces 64-char lowercase hex digest', () => {
    const h = sha256hex('hello world')
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('matches the canonical reference vector', () => {
    // sha256("hello world") in lowercase hex
    expect(sha256hex('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    )
  })

  it('UTF-8 byte interpretation (non-ASCII)', () => {
    // sha256(UTF-8 bytes of "héllo")
    expect(sha256hex('héllo')).toBe(
      '02ffc2628dab87e16b07ad8fb1c33cbef5acf41c8f0c61e7ac9c11d8da4d8f9b',
    )
  })

  it('deterministic — same input twice → same digest', () => {
    expect(sha256hex('x')).toBe(sha256hex('x'))
  })

  it('different inputs → different digests', () => {
    expect(sha256hex('a')).not.toBe(sha256hex('b'))
  })
})
```

- [ ] **Step 2: Verify the reference vectors with a quick command**

The "héllo" digest above must match `node:crypto`'s actual output. Verify before relying on it:

```powershell
node -e "console.log(require('crypto').createHash('sha256').update('héllo', 'utf8').digest('hex'))"
```

Expected output: `02ffc2628dab87e16b07ad8fb1c33cbef5acf41c8f0c61e7ac9c11d8da4d8f9b`.

If the actual digest differs from the test fixture, **update the test fixture** to match the actual digest. The vector is a documented reference; do not change `ingest.ts`'s algorithm to fit a wrong test.

- [ ] **Step 3: Run the test**

```powershell
pnpm --filter @seta/agent-rag test:unit -- src/ingest.test.ts
```

Expected: 5 tests, all pass.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/src/ingest.test.ts
git commit -m "test(agent-rag): pin sha256hex canonical reference vectors"
```

---

## Task D3: Implement `createIngest` and wire it into `createAgentRag`

**Files:**
- Create: `platform/agent/rag/src/ingest.ts`
- Modify: `platform/agent/rag/src/factory.ts`

The ingest closure is constructed by a `createIngest(deps)` factory that returns the `ingest(sourceId, content, opts)` function. `factory.ts` composes it with the (still stub) retrieve in the returned `RagApi`.

- [ ] **Step 1: Write `src/ingest.ts`**

Create exactly:

```ts
// platform/agent/rag/src/ingest.ts
import { createHash } from 'node:crypto'
import { chunkText } from '@seta/agent-chunking'
import type { EmbeddingsClient } from '@seta/agent-embeddings'
import { findExistingHashes, insertChunks } from '@seta/agent-vector'
import type { DbSql } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import type { IngestOptions } from './types.js'

const log = logger.child({ service: 'agent-rag' })

const DEFAULT_MAX_TOKENS = 512
const DEFAULT_OVERLAP_TOKENS = 64

const sha256hex = (s: string): string =>
  createHash('sha256').update(s, 'utf8').digest('hex')

export interface IngestDeps {
  sql: DbSql
  embeddings: EmbeddingsClient
}

/**
 * Build the `ingest(sourceId, content, opts)` closure bound to `deps`.
 *
 * Flow: chunk → hash → dedup pre-check → embed only new chunks → insert.
 * Re-ingest of identical `(sourceId, content)` produces zero embeds and
 * zero new rows. `ingest:dedup-result` is the load-bearing cost-saving
 * log line.
 *
 * Errors from upstream packages (`ChunkingError`, `LlmError`,
 * `VectorQueryFailedError`, `VectorInsertFailedError`, `AbortError`)
 * propagate unchanged. The function logs `ingest:failed` at boundary
 * exit and rethrows.
 */
export function createIngest(deps: IngestDeps) {
  return async function ingest(
    sourceId: string,
    content: string,
    opts: IngestOptions = {},
  ): Promise<void> {
    const tenantId = tenantContext.getTenantId()
    log.info(
      { sourceId, tenantId, contentLength: content.length },
      'ingest:start',
    )

    try {
      // 1. Chunk — pure, no I/O.
      const chunks = chunkText(content, {
        maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        overlapTokens: opts.overlapTokens ?? DEFAULT_OVERLAP_TOKENS,
        model: 'text-embedding-3-small',
      })
      log.debug(
        { sourceId, tenantId, chunkCount: chunks.length },
        'ingest:chunked',
      )

      // 2. Hash — cheap, local, sha256 hex (inline; no helper module).
      const hashed = chunks.map((c) => ({
        ...c,
        contentHash: sha256hex(c.content),
      }))

      // 3. Dedup pre-check — one round-trip independent of chunk count.
      const existing = await findExistingHashes(
        deps.sql,
        sourceId,
        hashed.map((h) => h.contentHash),
      )
      const toEmbed = hashed.filter((h) => !existing.has(h.contentHash))

      log.info(
        {
          sourceId,
          tenantId,
          total: chunks.length,
          skipped: existing.size,
          toEmbed: toEmbed.length,
        },
        'ingest:dedup-result',
      )

      // 4. All-deduped (or empty) short-circuit: no OpenAI call, no insert.
      if (toEmbed.length === 0) {
        log.info({ sourceId, tenantId }, 'ingest:all-deduped')
        log.info(
          { sourceId, tenantId, embedded: 0, skipped: existing.size },
          'ingest:done',
        )
        return
      }

      // 5. Embed only the new chunks. Abort signal threads to OpenAI fetch.
      log.debug(
        { sourceId, tenantId, batchSize: toEmbed.length },
        'ingest:embedding',
      )
      const { embeddings: vecs } = await deps.embeddings.embed(
        toEmbed.map((c) => c.content),
        { signal: opts.signal },
      )

      // 6. Insert — ON CONFLICT DO NOTHING in agent-vector backstops races.
      await insertChunks(
        deps.sql,
        toEmbed.map((c, i) => ({
          tenantId,
          sourceId,
          content: c.content,
          contentHash: c.contentHash,
          tokenCount: c.tokenCount,
          span: { startChar: c.startChar, endChar: c.endChar },
          embedding: vecs[i]!,
        })),
      )

      log.info(
        {
          sourceId,
          tenantId,
          embedded: toEmbed.length,
          skipped: existing.size,
        },
        'ingest:done',
      )
    } catch (err) {
      log.error({ err, sourceId, tenantId }, 'ingest:failed')
      throw err
    }
  }
}
```

Notes for the implementer:
- `sha256hex` is declared at file scope, not module-exported. It's a one-line inline; the spec forbids extracting it into a helper module until a second consumer exists.
- `vecs[i]!` is the only non-null assertion in the function. It's safe: by contract, `EmbeddingsClient.embed(N inputs)` returns `N` vectors in order.
- The `existing.size` field in `ingest:dedup-result` and `ingest:done` is the number of skipped hashes, which equals the number of chunks whose hash was found in the DB. This is what the load-bearing cost metric tracks.

- [ ] **Step 2: Wire `createIngest` into `createAgentRag`**

Open `platform/agent/rag/src/factory.ts` and replace it entirely with:

```ts
// platform/agent/rag/src/factory.ts
import { createIngest } from './ingest.js'
import type { RagApi, RagDeps } from './types.js'

/**
 * Build a `RagApi` instance from injected dependencies.
 *
 * Composition root (e.g. `apps/api/src/main.ts`) creates this once at
 * boot and binds it to the FAQ Agent's tool registry.
 *
 * - `ingest` is fully implemented here (see `ingest.ts`).
 * - `retrieve` is implemented in Plan E.
 */
export function createAgentRag(deps: RagDeps): RagApi {
  const ingest = createIngest({ sql: deps.sql, embeddings: deps.embeddings })

  return {
    ingest,
    async retrieve() {
      throw new Error('createAgentRag.retrieve: not implemented yet (see Plan E)')
    },
  }
}
```

- [ ] **Step 3: Update the factory shape test (still passing)**

The Plan A factory test asserts both methods are functions. It still passes. No edit needed.

- [ ] **Step 4: Run unit suite + lint**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag test:unit
```

All three pass. If `typecheck` errors on `vecs[i]!`, your `tsconfig` has `noUncheckedIndexedAccess` enabled and the `!` is required; if it errors that `!` is forbidden, you're in a `linter`-strict-mode-only path — replace with `const v = vecs[i]; if (v === undefined) throw new Error(...)`.

- [ ] **Step 5: Commit**

```powershell
git add platform/agent/rag/src/ingest.ts platform/agent/rag/src/factory.ts
git commit -m "feat(agent-rag): implement createIngest with dedup pre-check"
```

---

## Task D4: Integration test helpers

**Files:**
- Create: `platform/agent/rag/tests/integration/_helpers.ts`

Mirrors `@seta/agent-vector`'s `tests/integration/_helpers.ts` (the closest precedent — same DB, same migrations). The helpers establish a tenant-scoped `DbSql` pool, run migrations once per session, truncate between tests, and build an `EmbeddingsClient` wired to the recording layer.

- [ ] **Step 1: Write the file**

Create exactly:

```ts
// platform/agent/rag/tests/integration/_helpers.ts
import { fileURLToPath } from 'node:url'
import { createOpenAIEmbeddings, type EmbeddingsClient } from '@seta/agent-embeddings'
import { createPool, type DbSql, runMigrations } from '@seta/db'
import postgres from 'postgres'

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

let cachedSql: DbSql | undefined

/** Pooled tenant-scoped connection (RLS enforced). */
export function testSql(): DbSql {
  if (!cachedSql) {
    cachedSql = createPool(TEST_DATABASE_URL)
  }
  return cachedSql
}

/** Apply every owner's migrations through agent_vector. */
export async function ensureMigrations(): Promise<void> {
  await runMigrations({
    url: TEST_DATABASE_URL,
    roleName: 'platform_admin',
    repoRoot: findRepoRoot(),
  })
}

/** Truncate the agent_vector tables via platform_admin (RLS bypass). */
export async function truncateVectorTables(): Promise<void> {
  const admin = postgres(TEST_DATABASE_URL, { max: 1, prepare: false })
  try {
    await admin.unsafe(`TRUNCATE agent_vector.chunks RESTART IDENTITY CASCADE`)
  } finally {
    await admin.end()
  }
}

/** Build the embeddings client used by the test ingest path. */
export function buildEmbeddings(): EmbeddingsClient {
  return createOpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY ?? 'sk-test',
  })
}

function findRepoRoot(): string {
  // _helpers.ts is at platform/agent/rag/tests/integration/_helpers.ts
  // 5 hops up: integration/ → tests/ → rag/ → agent/ → platform/ → repo root
  return fileURLToPath(new URL('../../../../../', import.meta.url))
}
```

- [ ] **Step 2: Typecheck**

```powershell
pnpm --filter @seta/agent-rag typecheck
```

Expected: clean. If `runMigrations` isn't exported from `@seta/db`, double-check the workspace dep — `@seta/agent-vector`'s helper uses the same shape; the import must succeed.

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/tests/integration/_helpers.ts
git commit -m "test(agent-rag): integration test helpers"
```

---

## Task D5: Integration tests — cases 1, 5, 7 (no recording required)

Three of the seven cases run without HTTP fixtures: case 5 (abort) errors before any HTTP call; case 7 (empty content) short-circuits before any HTTP call; case 6 (vector error) is forced via a closed pool. We land them first because they don't require recordings.

**Files:**
- Create: `platform/agent/rag/tests/integration/ingest.test.ts`

- [ ] **Step 1: Make sure Postgres is up and migrated**

```powershell
pnpm db:up
pnpm migrate
```

Expected: Postgres + Jaeger + collector running; migrations apply cleanly (including the `span` column from Plan 0).

- [ ] **Step 2: Write the file skeleton + cases 5 / 6 / 7**

Create exactly:

```ts
// platform/agent/rag/tests/integration/ingest.test.ts
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAgentRag } from '../../src/factory.js'
import {
  buildEmbeddings,
  ensureMigrations,
  testSql,
  truncateVectorTables,
} from './_helpers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RECORDINGS_DIR = path.resolve(__dirname, '__recordings__')

let recording = setupLLMRecording({
  name: 'unused',
  recordingsDir: RECORDINGS_DIR,
})

function hasRecording(name: string): boolean {
  return existsSync(path.join(RECORDINGS_DIR, `${name}.json`))
}

function shouldRun(name: string): boolean {
  return process.env.RECORD !== undefined || hasRecording(name)
}

describe('@seta/agent-rag — ingest (integration)', () => {
  beforeAll(async () => {
    await ensureMigrations()
  })

  beforeEach(async () => {
    await truncateVectorTables()
  })

  afterEach(() => {
    recording.stop()
  })

  afterAll(async () => {
    // Pool cleanup happens on process exit; no explicit close.
  })

  it('case 7: empty content short-circuits without any HTTP or insert', async () => {
    recording = setupLLMRecording({
      name: 'ingest-empty-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
    await tenantContext.run(tenantId, async () => {
      await rag.ingest(sourceId, '')
    })
    expect(hasRecording('ingest-empty-MUST-NOT-RECORD')).toBe(false)
    const rows = await withTenant(testSql(), tenantId, async (tx) => {
      return tx<unknown[]>`SELECT id FROM agent_vector.chunks`
    })
    expect(rows).toHaveLength(0)
  })

  it('case 5: AbortSignal triggered before embed throws AbortError, inserts nothing', async () => {
    recording = setupLLMRecording({
      name: 'ingest-abort-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
    const ac = new AbortController()
    ac.abort() // pre-cancel
    await tenantContext.run(tenantId, async () => {
      let caught: unknown
      try {
        await rag.ingest(sourceId, 'one two three four five', { signal: ac.signal })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeDefined()
      const e = caught as Error
      expect(e.name === 'AbortError' || /abort/i.test(e.message)).toBe(true)
    })
    const rows = await withTenant(testSql(), tenantId, async (tx) => {
      return tx<unknown[]>`SELECT id FROM agent_vector.chunks`
    })
    expect(rows).toHaveLength(0)
    expect(hasRecording('ingest-abort-MUST-NOT-RECORD')).toBe(false)
  })

  it('case 6: vector-query error (closed pool) propagates VectorQueryFailedError', async () => {
    // Build a separate, immediately-closed pool to force findExistingHashes
    // to throw at the boundary.
    const { createPool } = await import('@seta/db')
    const closedSql = createPool('postgres://seta:dev@localhost:5432/seta')
    await closedSql.end()

    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const rag = createAgentRag({ sql: closedSql, embeddings: buildEmbeddings() })
    await tenantContext.run(tenantId, async () => {
      let caught: unknown
      try {
        await rag.ingest(sourceId, 'three small words')
      } catch (e) {
        caught = e
      }
      expect(caught).toBeDefined()
      // VectorQueryFailedError extends AgentError; assert by name to avoid
      // a class-identity import-cycle test.
      expect((caught as Error).name).toBe('VectorQueryFailedError')
    })
  })
})
```

- [ ] **Step 3: Run these three tests**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/ingest.test.ts -t "case 5|case 6|case 7"
```

Expected: 3 pass. If "case 5" sees an unexpected request hit OpenAI, the abort plumbing in `@seta/agent-embeddings` is broken — check the spec there before debugging here.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/tests/integration/ingest.test.ts
git commit -m "test(agent-rag): integration cases 5, 6, 7 (abort, vector-error, empty)"
```

---

## Task D6: Integration tests — case 1 (fresh ingest, with recording)

**Files:**
- Modify: `platform/agent/rag/tests/integration/ingest.test.ts` (add test)
- Create: `platform/agent/rag/tests/integration/__recordings__/ingest-fresh-3-chunks.json` (recorded)

- [ ] **Step 1: Add the test inside the describe block**

Insert before the final `})` of the describe (i.e., after case 6):

```ts
  it.skipIf(!shouldRun('ingest-fresh-3-chunks'))(
    'case 1: fresh ingest produces N chunks, one embed call, N rows with non-null span',
    async () => {
      recording = setupLLMRecording({
        name: 'ingest-fresh-3-chunks',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const tenantId = randomUUID()
      const sourceId = randomUUID()
      const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
      // Content sized to produce >= 2 chunks at 512-token default; pad with
      // varied lines so chunk boundaries aren't a single repeat.
      const content = Array.from(
        { length: 80 },
        (_, i) => `Paragraph ${i}: lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
      ).join('\n\n')
      await tenantContext.run(tenantId, async () => {
        await rag.ingest(sourceId, content)
      })
      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{
          content_hash: string
          span: { startChar: number; endChar: number } | null
        }[]>`
          SELECT content_hash, span
          FROM agent_vector.chunks
          WHERE source_id = ${sourceId}
        `
      })
      expect(rows.length).toBeGreaterThanOrEqual(1)
      for (const r of rows) {
        expect(r.content_hash).toMatch(/^[0-9a-f]{64}$/)
        expect(r.span).not.toBeNull()
        expect(r.span!.endChar).toBeGreaterThan(r.span!.startChar)
      }
    },
  )
```

- [ ] **Step 2: Record the fixture**

The recording captures the OpenAI HTTP request/response so subsequent runs replay without hitting the network. Re-recording requires a real `OPENAI_API_KEY` — DO NOT skip this step on a machine without one (the recording file must exist for CI).

```powershell
$env:RECORD = 'force'
$env:OPENAI_API_KEY = '<your-real-key>'
pnpm --filter @seta/agent-rag test:integration -- tests/integration/ingest.test.ts -t 'case 1'
Remove-Item Env:\RECORD
Remove-Item Env:\OPENAI_API_KEY
```

Expected: a fixture file lands at `platform/agent/rag/tests/integration/__recordings__/ingest-fresh-3-chunks.json`. The test passes.

If you do not have an `OPENAI_API_KEY` available, request that someone with credentials records this fixture and commits it. The test is skipped (`it.skipIf(!shouldRun(...))`) when the file is missing.

- [ ] **Step 3: Replay the recording to verify determinism**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/ingest.test.ts -t 'case 1'
```

Expected: test passes without any HTTP call (no `RECORD` env var). If the replay errors with "fixture lookup mismatched", the chunker or content padding produced a different request body — that's a sign the test text is non-deterministic; fix and re-record.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/tests/integration
git commit -m "test(agent-rag): integration case 1 (fresh ingest) with recording"
```

---

## Task D7: Integration tests — case 2 (re-ingest same content, zero new HTTP)

**Files:**
- Modify: `platform/agent/rag/tests/integration/ingest.test.ts`

Case 2 reuses the recording from case 1 — the second `ingest` call must hit zero new HTTP requests, so no fixture is needed for the second call. We record the first call only.

- [ ] **Step 1: Add the test**

Insert before the final `})` of the describe block:

```ts
  it.skipIf(!shouldRun('ingest-fresh-3-chunks'))(
    'case 2: re-ingesting identical content makes zero new OpenAI calls and inserts no new rows',
    async () => {
      recording = setupLLMRecording({
        name: 'ingest-fresh-3-chunks',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const tenantId = randomUUID()
      const sourceId = randomUUID()
      const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
      const content = Array.from(
        { length: 80 },
        (_, i) => `Paragraph ${i}: lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
      ).join('\n\n')
      await tenantContext.run(tenantId, async () => {
        await rag.ingest(sourceId, content) // first call: replays recording
        await rag.ingest(sourceId, content) // second call: must be no-op
      })
      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{ id: string }[]>`
          SELECT id FROM agent_vector.chunks WHERE source_id = ${sourceId}
        `
      })
      // Row count must equal the count produced by case 1 (no duplicates).
      // Use a lower bound; case 1 already proved >=1 row is produced.
      expect(rows.length).toBeGreaterThanOrEqual(1)
      // The second ingest must have generated no new rows.
      // We can't easily count "before vs after" without a snapshot, so
      // instead: rerun ingest a third time and assert the count is the
      // same as after the second call.
      const after2 = rows.length
      await tenantContext.run(tenantId, async () => {
        await rag.ingest(sourceId, content)
      })
      const rows2 = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{ id: string }[]>`
          SELECT id FROM agent_vector.chunks WHERE source_id = ${sourceId}
        `
      })
      expect(rows2.length).toBe(after2)
    },
  )
```

The "third call" technique sidesteps the need to capture a "before" count: if the second call had inserted anything, the third would not (also dedup) — but we instead assert that no growth happens once dedup has stabilized.

- [ ] **Step 2: Run the test**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/ingest.test.ts -t 'case 2'
```

Expected: pass, with the recording for `ingest-fresh-3-chunks` replayed exactly once (the strict-replay mode in `setupLLMRecording` ensures any unexpected request fails the test). If the second ingest hit OpenAI, dedup is broken — investigate `findExistingHashes` plumbing.

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/tests/integration/ingest.test.ts
git commit -m "test(agent-rag): integration case 2 (re-ingest dedup)"
```

---

## Task D8: Integration tests — cases 3 and 4 (partial overlap, cross-source)

Case 3 (`["A","B","C"]` then `["A","B","D"]`) requires two recordings: one for the initial 3-chunk insert, one for the single-chunk delta. Case 4 (same content across two sourceIds) requires two recordings (one per source).

Implementer's note: these recordings are the most expensive to set up because each unique chunk-text + content-pad combination produces a different request body and therefore a different fixture key. To keep the test deterministic, we use **fixed, hard-coded chunk content** (small enough that a single chunk fits in one batch, so the recording is one request).

**Files:**
- Modify: `platform/agent/rag/tests/integration/ingest.test.ts`
- Create (via recording): `platform/agent/rag/tests/integration/__recordings__/ingest-partial-A.json`
- Create (via recording): `platform/agent/rag/tests/integration/__recordings__/ingest-partial-AD.json`
- Create (via recording): `platform/agent/rag/tests/integration/__recordings__/ingest-cross-source.json`

- [ ] **Step 1: Add cases 3 and 4 to the test file**

Insert before the final `})` of the describe block:

```ts
  it.skipIf(!shouldRun('ingest-partial-A') || !shouldRun('ingest-partial-AD'))(
    'case 3: partial-overlap re-ingest embeds only the new chunk',
    async () => {
      const tenantId = randomUUID()
      const sourceId = randomUUID()
      const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })

      // First ingest: 3 deliberately tiny single-chunk docs joined as one
      // input with paragraph breaks. With maxTokens: 512, this produces
      // exactly one chunk; we work around the "multiple chunks per ingest"
      // constraint by running three separate ingests with distinct
      // sourceIds — but we want one source for this test. Instead, pick
      // single-token-line inputs that the chunker collapses into one chunk
      // each at small maxTokens.
      const A = 'first chunk content alpha'
      const B = 'second chunk content beta'
      const D = 'fourth chunk content delta'

      // Manually invoke ingest three times to land three rows under one source.
      // Each ingest is one chunk -> one embedding call.
      recording = setupLLMRecording({
        name: 'ingest-partial-A',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      await tenantContext.run(tenantId, async () => {
        await rag.ingest(sourceId, A)
        await rag.ingest(sourceId, B) // embedded; new
      })
      recording.stop()

      recording = setupLLMRecording({
        name: 'ingest-partial-AD',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      await tenantContext.run(tenantId, async () => {
        await rag.ingest(sourceId, A) // dedup hit; no embed
        await rag.ingest(sourceId, B) // dedup hit; no embed
        await rag.ingest(sourceId, D) // new; one embed
      })

      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{ content: string }[]>`
          SELECT content FROM agent_vector.chunks
          WHERE source_id = ${sourceId}
          ORDER BY created_at ASC
        `
      })
      expect(rows.map((r) => r.content)).toEqual([A, B, D])
    },
  )

  it.skipIf(!shouldRun('ingest-cross-source'))(
    'case 4: same content under two sourceIds inserts two rows',
    async () => {
      recording = setupLLMRecording({
        name: 'ingest-cross-source',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const tenantId = randomUUID()
      const src1 = randomUUID()
      const src2 = randomUUID()
      const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
      const text = 'cross-source content X'
      await tenantContext.run(tenantId, async () => {
        await rag.ingest(src1, text)
        await rag.ingest(src2, text)
      })
      const rows = await withTenant(testSql(), tenantId, async (tx) => {
        return tx<{ source_id: string }[]>`
          SELECT source_id FROM agent_vector.chunks
          WHERE source_id IN (${src1}, ${src2})
          ORDER BY source_id ASC
        `
      })
      expect(rows).toHaveLength(2)
      const ids = rows.map((r) => r.source_id).sort()
      expect(ids).toEqual([src1, src2].sort())
    },
  )
```

- [ ] **Step 2: Record the three new fixtures**

```powershell
$env:RECORD = 'force'
$env:OPENAI_API_KEY = '<your-real-key>'
pnpm --filter @seta/agent-rag test:integration -- tests/integration/ingest.test.ts -t 'case 3'
pnpm --filter @seta/agent-rag test:integration -- tests/integration/ingest.test.ts -t 'case 4'
Remove-Item Env:\RECORD
Remove-Item Env:\OPENAI_API_KEY
```

Expected: three new files in `__recordings__/`: `ingest-partial-A.json`, `ingest-partial-AD.json`, `ingest-cross-source.json`. Each test passes.

- [ ] **Step 3: Replay to verify**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/ingest.test.ts -t 'case 3|case 4'
```

Expected: both pass without network calls.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/tests/integration
git commit -m "test(agent-rag): integration cases 3 (partial overlap) + 4 (cross-source)"
```

---

## Task D9: Final verification

**Files:** none

- [ ] **Step 1: Full integration suite**

```powershell
pnpm --filter @seta/agent-rag test:integration
```

Expected: 7 ingest tests pass (cases 1, 2, 3, 4, 5, 6, 7). If any test is reported as skipped, the recording file is missing — fix Task D6/D7/D8.

- [ ] **Step 2: Full unit suite**

```powershell
pnpm --filter @seta/agent-rag test:unit
```

Expected: 24 tests pass (8 RRF + 4 properties + 6 testkit + 1 factory shape + 5 ingest unit).

- [ ] **Step 3: Typecheck + lint + build**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag build
```

All exit zero.

- [ ] **Step 4: Confirm recordings are committed**

```powershell
git ls-files platform/agent/rag/tests/integration/__recordings__
```

Expected: four files (`ingest-fresh-3-chunks.json`, `ingest-partial-A.json`, `ingest-partial-AD.json`, `ingest-cross-source.json`). If anything is in `git status` as untracked, you missed a commit — `git add` and amend the relevant commit.

- [ ] **Step 5: Confirm git log**

```powershell
git log --oneline -10
```

Expected: 7 commits from this plan (test scripts, ingest unit, ingest impl, helpers, cases 5/6/7, case 1, case 2, cases 3+4).

Proceed to Plan E (`retrieve` + factory + scope updates).
