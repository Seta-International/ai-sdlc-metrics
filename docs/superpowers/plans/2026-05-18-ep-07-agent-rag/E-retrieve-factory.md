# Plan E — `retrieve` path, real factory composition, SCOPE updates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `retrieve` closure (embed query → searchChunks → fuseByRRF → shape `RagHit[]`). Replace the `retrieve` stub inside `createAgentRag` with the real implementation. Cover with six integration tests against real pgvector + recorded OpenAI fixtures (cases 8–13). Update `platform/agent/rag/SCOPE.md` to reflect the implemented surface and put a `Superseded by …` header on the previous dedup-ingest spec.

**Architecture:** The retrieve closure is single-tenant, single-leg (vector-only) in P1. `fuseByRRF` runs always — even with one leg — to keep the output shape uniform with future hybrid retrieve. Abort signal threads into the query embedding call only; `searchChunks` is fast and not interruptible. Failures propagate unchanged; abort surfaces as `info`-level `retrieve:aborted`, not an error.

**Tech Stack:** TypeScript (ESM), Vitest, Postgres + pgvector via Docker compose, msw-based OpenAI recording layer.

**Spec:** [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../specs/2026-05-18-agent-rag-design.md) §Data flow → Retrieve, §Testing → cases 8–13, §Logging contract → retrieve events.

---

## File Structure

After this plan completes:

```
platform/agent/rag/
├── src/
│   ├── retrieve.ts                          # CREATE
│   └── factory.ts                           # MODIFY — wire createRetrieve
├── tests/integration/
│   ├── retrieve.test.ts                     # CREATE
│   └── __recordings__/                      # APPEND fixtures
│       ├── retrieve-end-to-end.json
│       ├── retrieve-recall-floor.json
│       ├── retrieve-rank-stability.json
│       └── retrieve-no-match.json
└── SCOPE.md                                 # MODIFY — supersede note, FTS-deferred, patterns

docs/superpowers/specs/
└── 2026-05-15-agent-rag-dedup-ingest-design.md   # MODIFY — Superseded by header
```

The `_helpers.ts` from Plan D is reused.

---

## Task E1: Implement `createRetrieve`

**Files:**
- Create: `platform/agent/rag/src/retrieve.ts`

- [ ] **Step 1: Write the file**

Create exactly:

```ts
// platform/agent/rag/src/retrieve.ts
import type { EmbeddingsClient } from '@seta/agent-embeddings'
import { searchChunks } from '@seta/agent-vector'
import type { DbSql } from '@seta/db'
import { logger } from '@seta/observability'
import { tenantContext } from '@seta/tenancy'
import { fuseByRRF } from './rrf.js'
import type { RagHit, RetrieveOptions } from './types.js'

const log = logger.child({ service: 'agent-rag' })

const DEFAULT_K = 8
const DEFAULT_MIN_SIM = 0.3
const DEFAULT_RRF_K = 60

export interface RetrieveDeps {
  sql: DbSql
  embeddings: EmbeddingsClient
}

/**
 * Build the `retrieve(query, opts)` closure bound to `deps`.
 *
 * P1 is vector-only: a single ranked list runs through `fuseByRRF` so the
 * output shape (`rrfScore`, `vectorRank`, `ranks`) is uniform with the
 * P2 hybrid path. Single-leg passthrough is mathematically identity in
 * rank order.
 *
 * Errors propagate unchanged. `AbortError` is logged at `info` not
 * `error` — abort is normal control flow, not a failure.
 */
export function createRetrieve(deps: RetrieveDeps) {
  return async function retrieve(
    query: string,
    opts: RetrieveOptions = {},
  ): Promise<RagHit[]> {
    const tenantId = tenantContext.getTenantId()
    const k = opts.k ?? DEFAULT_K
    const minSim = opts.minSim ?? DEFAULT_MIN_SIM
    const rrfK = opts.rrfK ?? DEFAULT_RRF_K

    log.info({ tenantId, queryLength: query.length, k, minSim }, 'retrieve:start')

    try {
      const { embeddings: vecs } = await deps.embeddings.embed([query], {
        signal: opts.signal,
      })
      const vec = vecs[0]!
      log.debug({ tenantId }, 'retrieve:embedded')

      const hits = await searchChunks(deps.sql, vec, { k, minSim })
      log.debug({ tenantId, k, returned: hits.length }, 'retrieve:searched')

      // Build the vector-leg ranked list and run fusion (single-leg → identity).
      const ranked = hits.map((h) => ({ id: h.id }))
      const fused = fuseByRRF([ranked], rrfK)

      // Map fused output back to RagHit by joining on chunkId.
      const byId = new Map(hits.map((h) => [h.id, h]))
      const result: RagHit[] = fused.map((f) => {
        const h = byId.get(f.id)!
        return {
          chunkId: h.id,
          sourceId: h.sourceId,
          content: h.content,
          rrfScore: f.rrfScore,
          vectorRank: f.ranks[0],
          ftsRank: undefined,
          vectorSimilarity: h.similarity,
          citation: { sourceId: h.sourceId, span: h.span },
        }
      })

      log.info({ tenantId, k, returned: result.length }, 'retrieve:done')
      return result
    } catch (err) {
      if (isAbortError(err)) {
        log.info({ tenantId }, 'retrieve:aborted')
        throw err
      }
      log.error({ err, tenantId }, 'retrieve:failed')
      throw err
    }
  }
}

function isAbortError(e: unknown): boolean {
  if (e instanceof Error) {
    if (e.name === 'AbortError') return true
    // DOMException-style AbortError surfaces from undici/openai fetch.
    if (typeof (e as { code?: unknown }).code === 'string' && (e as { code: string }).code === 'ABORT_ERR') {
      return true
    }
  }
  return false
}
```

Notes:
- `vecs[0]!` is safe by contract: `embed(['query'])` returns one vector.
- `byId.get(f.id)!` is safe because `fuseByRRF`'s output ids are exactly the union of input ids — every fused id has a corresponding hit.
- `isAbortError` covers both `AbortError` name (older fetch implementations) and `code === 'ABORT_ERR'` (DOMException flavour). Don't add `instanceof DOMException` — DOMException is not available globally in all Node versions.

- [ ] **Step 2: Wire `createRetrieve` into `createAgentRag`**

Open `platform/agent/rag/src/factory.ts` and replace it entirely with:

```ts
// platform/agent/rag/src/factory.ts
import { createIngest } from './ingest.js'
import { createRetrieve } from './retrieve.js'
import type { RagApi, RagDeps } from './types.js'

/**
 * Build a `RagApi` instance from injected dependencies.
 *
 * Composition root (e.g. `apps/api/src/main.ts`) creates this once at
 * boot and binds it to the FAQ Agent's tool registry.
 */
export function createAgentRag(deps: RagDeps): RagApi {
  return {
    ingest: createIngest({ sql: deps.sql, embeddings: deps.embeddings }),
    retrieve: createRetrieve({ sql: deps.sql, embeddings: deps.embeddings }),
  }
}
```

- [ ] **Step 3: Run typecheck + lint + unit tests**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag test:unit
```

All three exit zero. Unit suite count unchanged at 24 tests.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/src/retrieve.ts platform/agent/rag/src/factory.ts
git commit -m "feat(agent-rag): implement createRetrieve (vector-only with RRF passthrough)"
```

---

## Task E2: Integration test scaffold + case 12 (abort)

**Files:**
- Create: `platform/agent/rag/tests/integration/retrieve.test.ts`

Case 12 needs no recording — `AbortSignal` is pre-cancelled before `embed` is called.

- [ ] **Step 1: Write the file skeleton + case 12**

Create exactly:

```ts
// platform/agent/rag/tests/integration/retrieve.test.ts
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupLLMRecording } from '@seta/agent-core/testkit'
import { withTenant } from '@seta/db'
import { tenantContext } from '@seta/tenancy'
import { insertChunks } from '@seta/agent-vector'
import { createHash } from 'node:crypto'
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

function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

/**
 * Deterministic 1536-d unit vector derived from a text seed.
 * Used to seed chunks without paying an OpenAI call.
 */
function seedEmbedding(seed: string): number[] {
  const dims = 1536
  const out = new Array<number>(dims)
  const digest = createHash('sha256').update(seed).digest()
  let state = digest.readUInt32BE(0) || 1
  for (let i = 0; i < dims; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state = state >>> 0
    out[i] = (state / 0xffffffff) * 2 - 1
  }
  let mag = 0
  for (const v of out) mag += v * v
  mag = Math.sqrt(mag) || 1
  for (let i = 0; i < dims; i++) out[i] = out[i]! / mag
  return out
}

describe('@seta/agent-rag — retrieve (integration)', () => {
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
    // Pool cleanup happens on process exit.
  })

  it('case 12: AbortSignal pre-cancelled throws AbortError, logs retrieve:aborted', async () => {
    recording = setupLLMRecording({
      name: 'retrieve-abort-MUST-NOT-RECORD',
      recordingsDir: RECORDINGS_DIR,
    })
    recording.start()
    const tenantId = randomUUID()
    const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })
    const ac = new AbortController()
    ac.abort()
    await tenantContext.run(tenantId, async () => {
      let caught: unknown
      try {
        await rag.retrieve('any query', { signal: ac.signal })
      } catch (e) {
        caught = e
      }
      expect(caught).toBeDefined()
      const e = caught as Error
      expect(e.name === 'AbortError' || /abort/i.test(e.message)).toBe(true)
    })
    expect(hasRecording('retrieve-abort-MUST-NOT-RECORD')).toBe(false)
  })
})
```

- [ ] **Step 2: Run case 12**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/retrieve.test.ts -t 'case 12'
```

Expected: pass. If the test errors with "no embedding called" or similar, the abort fired too late — recheck Plan D's `@seta/agent-embeddings` abort plumbing.

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/tests/integration/retrieve.test.ts
git commit -m "test(agent-rag): integration scaffold + case 12 (abort)"
```

---

## Task E3: Integration test — case 13 (below-minSim filter; no recording)

We seed two chunks with `seedEmbedding(...)` and call `retrieve` with a query that the embeddings client will return a separate fixed vector for. Because the test bypasses OpenAI for the *chunks* (`insertChunks` directly with seeded vectors) but still goes through OpenAI for the *query* embedding, we still need a recording — except: we can short-circuit by stubbing the embeddings client at the factory level. We do this via a tiny inline fake so case 13 doesn't need an HTTP recording.

**Files:**
- Modify: `platform/agent/rag/tests/integration/retrieve.test.ts`

- [ ] **Step 1: Add the test**

Insert before the final `})` of the describe block:

```ts
  it('case 13: corpus with only low-similarity hits returns [] under default minSim', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    // Seed two chunks with deterministic embeddings.
    await tenantContext.run(tenantId, async () => {
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: 'apples and oranges',
          contentHash: sha256hex('apples and oranges'),
          tokenCount: 3,
          span: { startChar: 0, endChar: 18 },
          embedding: seedEmbedding('apples and oranges'),
        },
        {
          tenantId,
          sourceId,
          content: 'bananas and grapes',
          contentHash: sha256hex('bananas and grapes'),
          tokenCount: 3,
          span: { startChar: 0, endChar: 18 },
          embedding: seedEmbedding('bananas and grapes'),
        },
      ])
    })

    // Build a fake embeddings client that returns an orthogonal-ish vector.
    // The seed-based embeddings are deterministic, so a different seed
    // makes a query vector whose cosine similarity to either stored vector
    // is very low — almost certainly below the default minSim of 0.3.
    const rag = createAgentRag({
      sql: testSql(),
      embeddings: {
        async embed(_texts) {
          return {
            embeddings: [seedEmbedding('orthogonal-distant-string-xyz')],
            usage: { promptTokens: 1, totalTokens: 1 },
          }
        },
      },
    })

    const hits = await tenantContext.run(tenantId, async () =>
      rag.retrieve('something unrelated'),
    )
    expect(hits).toEqual([])
  })
```

The seed-based embeddings are deterministic but pseudo-random, so two unrelated seed strings have cosine similarity close to zero, well below `minSim = 0.3`. If a particular seed combination happens to be near the threshold and this test flakes, lower `minSim` is **not** the fix — pick a different seed for the query.

- [ ] **Step 2: Run case 13**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/retrieve.test.ts -t 'case 13'
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/tests/integration/retrieve.test.ts
git commit -m "test(agent-rag): integration case 13 (below-minSim filter)"
```

---

## Task E4: Integration test — case 9 (cross-tenant RLS isolation; no recording)

Same fake-embeddings trick as case 13 — no OpenAI fixture needed.

**Files:**
- Modify: `platform/agent/rag/tests/integration/retrieve.test.ts`

- [ ] **Step 1: Add the test**

Insert before the final `})`:

```ts
  it('case 9: retrieve under tenant B returns [] for chunks inserted under tenant A (RLS)', async () => {
    const tenantA = randomUUID()
    const tenantB = randomUUID()
    const sourceId = randomUUID()

    // Insert under tenant A.
    await tenantContext.run(tenantA, async () => {
      await insertChunks(testSql(), [
        {
          tenantId: tenantA,
          sourceId,
          content: 'tenant A secret content',
          contentHash: sha256hex('tenant A secret content'),
          tokenCount: 4,
          span: { startChar: 0, endChar: 23 },
          embedding: seedEmbedding('tenant A secret content'),
        },
      ])
    })

    // Build a rag that always returns the same query vector as the inserted
    // chunk — so without RLS, tenant B would see the row easily.
    const rag = createAgentRag({
      sql: testSql(),
      embeddings: {
        async embed() {
          return {
            embeddings: [seedEmbedding('tenant A secret content')],
            usage: { promptTokens: 1, totalTokens: 1 },
          }
        },
      },
    })

    // Verify tenant A can retrieve.
    const hitsA = await tenantContext.run(tenantA, async () =>
      rag.retrieve('whatever'),
    )
    expect(hitsA.length).toBeGreaterThanOrEqual(1)
    expect(hitsA[0]!.content).toBe('tenant A secret content')

    // Verify tenant B cannot.
    const hitsB = await tenantContext.run(tenantB, async () =>
      rag.retrieve('whatever'),
    )
    expect(hitsB).toEqual([])
  })
```

- [ ] **Step 2: Run case 9**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/retrieve.test.ts -t 'case 9'
```

Expected: pass. If tenant B sees the row, RLS is broken — investigate the `tenant_isolation_chunks` policy in `agent_vector.chunks` schema (Plan 0 should not have touched it).

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/tests/integration/retrieve.test.ts
git commit -m "test(agent-rag): integration case 9 (cross-tenant RLS isolation)"
```

---

## Task E5: Integration test — case 10 (recall floor; no recording)

Insert three chunks under one tenant with known seed embeddings. Use a fake embeddings client that returns the seed embedding of the "known answer" chunk verbatim. Assert the known-answer chunk is the top-1 hit.

**Files:**
- Modify: `platform/agent/rag/tests/integration/retrieve.test.ts`

- [ ] **Step 1: Add the test**

Insert before the final `})`:

```ts
  it('case 10: known-answer chunk appears as top-1 hit', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const known = 'how to reset my password — the recovery flow goes via email'
    const filler1 = 'unrelated content one about cooking pasta'
    const filler2 = 'unrelated content two about hiking boots'

    await tenantContext.run(tenantId, async () => {
      await insertChunks(testSql(), [
        {
          tenantId,
          sourceId,
          content: known,
          contentHash: sha256hex(known),
          tokenCount: 12,
          span: { startChar: 0, endChar: known.length },
          embedding: seedEmbedding(known),
        },
        {
          tenantId,
          sourceId,
          content: filler1,
          contentHash: sha256hex(filler1),
          tokenCount: 7,
          span: { startChar: 0, endChar: filler1.length },
          embedding: seedEmbedding(filler1),
        },
        {
          tenantId,
          sourceId,
          content: filler2,
          contentHash: sha256hex(filler2),
          tokenCount: 7,
          span: { startChar: 0, endChar: filler2.length },
          embedding: seedEmbedding(filler2),
        },
      ])
    })

    const rag = createAgentRag({
      sql: testSql(),
      embeddings: {
        async embed() {
          // Return the known-answer's vector verbatim — cosine sim == 1.
          return {
            embeddings: [seedEmbedding(known)],
            usage: { promptTokens: 1, totalTokens: 1 },
          }
        },
      },
    })

    const hits = await tenantContext.run(tenantId, async () => rag.retrieve('q'))
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0]!.content).toBe(known)
    expect(hits[0]!.vectorRank).toBe(1)
    expect(hits[0]!.vectorSimilarity).toBeCloseTo(1, 5)
    expect(hits[0]!.citation.span).toEqual({ startChar: 0, endChar: known.length })
  })
```

- [ ] **Step 2: Run case 10**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/retrieve.test.ts -t 'case 10'
```

Expected: pass. `vectorSimilarity` should be ~1 because the query vector equals the stored vector; if it's < 0.99, pgvector applied an unexpected transformation (HNSW quantization?) — investigate but don't lower the threshold.

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/tests/integration/retrieve.test.ts
git commit -m "test(agent-rag): integration case 10 (recall floor)"
```

---

## Task E6: Integration test — case 11 (rank stability; no recording)

Run case-10's setup twice and assert byte-identical `RagHit[]` output. Demonstrates determinism under fixed embeddings.

**Files:**
- Modify: `platform/agent/rag/tests/integration/retrieve.test.ts`

- [ ] **Step 1: Add the test**

Insert before the final `})`:

```ts
  it('case 11: retrieve twice on identical query + corpus returns equal output', async () => {
    const tenantId = randomUUID()
    const sourceId = randomUUID()
    const seeds = ['alpha bravo', 'charlie delta', 'echo foxtrot']
    await tenantContext.run(tenantId, async () => {
      await insertChunks(
        testSql(),
        seeds.map((s) => ({
          tenantId,
          sourceId,
          content: s,
          contentHash: sha256hex(s),
          tokenCount: 2,
          span: { startChar: 0, endChar: s.length },
          embedding: seedEmbedding(s),
        })),
      )
    })

    const rag = createAgentRag({
      sql: testSql(),
      embeddings: {
        async embed() {
          return {
            embeddings: [seedEmbedding('alpha bravo')],
            usage: { promptTokens: 1, totalTokens: 1 },
          }
        },
      },
    })

    const r1 = await tenantContext.run(tenantId, async () => rag.retrieve('q'))
    const r2 = await tenantContext.run(tenantId, async () => rag.retrieve('q'))
    expect(r2).toEqual(r1)
  })
```

- [ ] **Step 2: Run case 11**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/retrieve.test.ts -t 'case 11'
```

Expected: pass.

- [ ] **Step 3: Commit**

```powershell
git add platform/agent/rag/tests/integration/retrieve.test.ts
git commit -m "test(agent-rag): integration case 11 (rank stability)"
```

---

## Task E7: Integration test — case 8 (end-to-end ingest → retrieve with real OpenAI recording)

Case 8 is the one retrieve test that exercises a real OpenAI fixture. Ingest a deterministic 3-doc fixture corpus, then retrieve for a known question and assert the expected top hit + populated citation span.

**Files:**
- Modify: `platform/agent/rag/tests/integration/retrieve.test.ts`
- Create (via recording): `platform/agent/rag/tests/integration/__recordings__/retrieve-end-to-end.json`

- [ ] **Step 1: Add the test**

Insert before the final `})`:

```ts
  it.skipIf(!shouldRun('retrieve-end-to-end'))(
    'case 8: ingest + retrieve end-to-end returns populated citation span',
    async () => {
      recording = setupLLMRecording({
        name: 'retrieve-end-to-end',
        recordingsDir: RECORDINGS_DIR,
      })
      recording.start()
      const tenantId = randomUUID()
      const srcA = randomUUID()
      const srcB = randomUUID()
      const srcC = randomUUID()
      const rag = createAgentRag({ sql: testSql(), embeddings: buildEmbeddings() })

      await tenantContext.run(tenantId, async () => {
        await rag.ingest(srcA, 'The Eiffel Tower is in Paris, France.')
        await rag.ingest(srcB, 'The Great Wall of China is the longest wall in the world.')
        await rag.ingest(srcC, 'The Statue of Liberty was a gift from France to the USA.')
        const hits = await rag.retrieve('Where is the Eiffel Tower located?')
        expect(hits.length).toBeGreaterThanOrEqual(1)
        const top = hits[0]!
        expect(top.content.toLowerCase()).toContain('eiffel')
        expect(top.vectorRank).toBe(1)
        expect(top.sourceId).toBe(srcA)
        expect(top.citation.span).not.toBeNull()
        expect(top.citation.span!.endChar).toBeGreaterThan(top.citation.span!.startChar)
        expect(top.rrfScore).toBeGreaterThan(0)
      })
    },
  )
```

- [ ] **Step 2: Record the fixture**

```powershell
$env:RECORD = 'force'
$env:OPENAI_API_KEY = '<your-real-key>'
pnpm --filter @seta/agent-rag test:integration -- tests/integration/retrieve.test.ts -t 'case 8'
Remove-Item Env:\RECORD
Remove-Item Env:\OPENAI_API_KEY
```

Expected: `__recordings__/retrieve-end-to-end.json` lands; test passes. The recording will contain four OpenAI requests: three ingest embeds + one retrieve query embed.

- [ ] **Step 3: Replay to verify**

```powershell
pnpm --filter @seta/agent-rag test:integration -- tests/integration/retrieve.test.ts -t 'case 8'
```

Expected: pass without network.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/tests/integration
git commit -m "test(agent-rag): integration case 8 (e2e ingest+retrieve with recording)"
```

---

## Task E8: Update `platform/agent/rag/SCOPE.md`

**Files:**
- Modify: `platform/agent/rag/SCOPE.md`

- [ ] **Step 1: Read the current file**

```powershell
Get-Content platform/agent/rag/SCOPE.md
```

The current state header reads "Directory placeholder only" — that's now false. Patterns-to-follow / -avoid need the additions agreed in the spec.

- [ ] **Step 2: Replace the status block**

Find:

```markdown
> **Status:** **P1 — own package `@seta/agent-rag` lands under `platform/agent/rag/`.** The package.json + `src/` are NOT created in this PR; this SCOPE.md is the P1 contract and the directory placeholder. The package is created in a follow-up PR via `pnpm new:package` — see CLAUDE.md "CLI-only — packages and dependencies".
```

Replace with:

```markdown
> **Status:** **P1 — `@seta/agent-rag` is implemented at `platform/agent/rag/`.** Public surface frozen per [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../../docs/superpowers/specs/2026-05-18-agent-rag-design.md). Companion vector-side change shipped via [`docs/superpowers/specs/2026-05-18-agent-vector-span-citation-design.md`](../../../docs/superpowers/specs/2026-05-18-agent-vector-span-citation-design.md). Retrieve is vector-only in P1; FTS hybrid + RRF asymmetry deferred to P2.
```

- [ ] **Step 3: Replace the "Current state" section body**

Find the heading `## Current state (P1)` and its body (the paragraph stating "Directory placeholder only…"). Replace the body (keep the heading) with:

```markdown
- **Package implemented.** `package.json`, `src/`, `tests/integration/`, recordings, and the three-subpath `exports` map (`.`, `./types`, `./testkit`) all exist at `platform/agent/rag/`.
- Public surface: `createAgentRag`, `fuseByRRF`, type exports (`RagApi`, `RagDeps`, `RagHit`, `RagCitation`, `IngestOptions`, `RetrieveOptions`, `RankedItem`, `FusedItem`), and the in-memory fake via `@seta/agent-rag/testkit` (`createFakeAgentRag`).
- **24 unit tests** pass (RRF correctness, ≥200-run property tests, testkit, factory shape, sha256hex digest).
- **13 integration tests** pass against real pgvector + recorded OpenAI fixtures (7 ingest cases + 6 retrieve cases).
- Recordings checked into `tests/integration/__recordings__/` per CLAUDE.md "LLM in tests: only via `@seta/agent-core/testkit` recordings".
- Vector-side companion (`span jsonb` column + `sourceId` + `span` on `SearchHit`) shipped via [`platform/agent/vector/SCOPE.md`](../vector/SCOPE.md).
```

- [ ] **Step 4: Add the additional patterns-to-follow and patterns-to-avoid bullets**

In the existing `## Patterns to follow` section, append at the end:

```markdown
- **Factory injection, not module-level singletons.** `createAgentRag({ sql, embeddings })` is the only construction entry point. No imported global `sql` or `embeddings`.
- **RRF runs even with one leg.** Single-leg passthrough keeps the field shape uniform with future hybrid retrieve.
- **Citation spans flow `chunkText` → `insertChunks.span` → `searchChunks.span` → `RagHit.citation.span`.** One value, one path; no re-derivation at retrieve time.
```

In the existing `## Patterns to avoid` section, append at the end:

```markdown
- **Do NOT add the FTS leg in P1.** Vector-only retrieve; `fuseByRRF` keeps the shape ready for P2.
- **Do NOT introduce new error classes.** Pass `DomainError` / `LlmError` through unchanged.
- **Do NOT cache retrieve results in-process.** Tenant-leak risk.
- **Do NOT log chunk content, query text, or embedding vectors.**
```

- [ ] **Step 5: Cross-references — add the spec link**

In the `## Cross-references` section, add at the top of the existing list:

```markdown
- **Implementation design (this package, P1):** [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../../docs/superpowers/specs/2026-05-18-agent-rag-design.md)
- **Companion vector-side spec:** [`docs/superpowers/specs/2026-05-18-agent-vector-span-citation-design.md`](../../../docs/superpowers/specs/2026-05-18-agent-vector-span-citation-design.md)
- **Superseded ingest spec:** [`docs/superpowers/specs/2026-05-15-agent-rag-dedup-ingest-design.md`](../../../docs/superpowers/specs/2026-05-15-agent-rag-dedup-ingest-design.md) (carry-forward source for the dedup pre-check decision)
```

- [ ] **Step 6: Commit**

```powershell
git add platform/agent/rag/SCOPE.md
git commit -m "docs(agent-rag): update SCOPE for implemented package + P1 deltas"
```

---

## Task E9: Add `Superseded by` header to the previous dedup-ingest spec

**Files:**
- Modify: `docs/superpowers/specs/2026-05-15-agent-rag-dedup-ingest-design.md`

- [ ] **Step 1: Open the file and add the supersede block**

Read the current header (first 10 lines). Find the existing `> **Status:**` blockquote and **prepend** (before it) a new blockquote:

```markdown
> **Superseded by [`2026-05-18-agent-rag-design.md`](./2026-05-18-agent-rag-design.md).** The dedup pre-check decisions and inline `sha256hex` rationale documented here are carried forward verbatim; the only material change is that ingest consumes `EmbeddingsClient.embed` (factory pattern) instead of the original free `embed()` function shown below. Read the new spec for the implemented surface.
>
```

Note the trailing `>` so the original status blockquote is visually distinct. The end result reads (first lines):

```markdown
# Design — `@seta/agent-rag.ingest` dedup-aware ingest flow (P1)

> **Superseded by [`2026-05-18-agent-rag-design.md`](./2026-05-18-agent-rag-design.md).** The dedup pre-check decisions and inline `sha256hex` rationale documented here are carried forward verbatim; the only material change is that ingest consumes `EmbeddingsClient.embed` (factory pattern) instead of the original free `embed()` function shown below. Read the new spec for the implemented surface.
>
> **Status:** Spec for the composition layer's use of the content-hash dedup
> introduced in
> [`2026-05-15-agent-vector-dedup-design.md`](./2026-05-15-agent-vector-dedup-design.md).
> This spec assumes that companion spec lands first — `findExistingHashes` and
> the `NewChunk.contentHash` field must exist on `@seta/agent-vector` before
> `agent-rag.ingest` can use them.
```

- [ ] **Step 2: Commit**

```powershell
git add docs/superpowers/specs/2026-05-15-agent-rag-dedup-ingest-design.md
git commit -m "docs(agent-rag): mark 2026-05-15 dedup-ingest spec as superseded"
```

---

## Task E10: Final verification

**Files:** none

- [ ] **Step 1: Full integration suite**

```powershell
pnpm --filter @seta/agent-rag test:integration
```

Expected: 13 tests pass (7 ingest + 6 retrieve). No skipped tests — every recording is committed.

- [ ] **Step 2: Full unit suite**

```powershell
pnpm --filter @seta/agent-rag test:unit
```

Expected: 24 tests pass.

- [ ] **Step 3: Typecheck + lint + build**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag build
```

All exit zero.

- [ ] **Step 4: Smoke-import from a sibling**

Reuse the `.tmp-rag-smoke.mts` script from Plan A Task A7:

```powershell
Set-Content -Path .tmp-rag-smoke.mts -Value @'
import type { RagApi, RagHit } from '@seta/agent-rag/types'
import { createFakeAgentRag } from '@seta/agent-rag/testkit'
import { createAgentRag, fuseByRRF } from '@seta/agent-rag'
const _api: RagApi = createFakeAgentRag()
const _hits: RagHit[] = []
const f = fuseByRRF([[{ id: 'x' }]], 60)
console.log(typeof createAgentRag, f[0]?.id === 'x' ? 'ok' : 'fail', _api.ingest.constructor.name)
'@
pnpm exec tsx .tmp-rag-smoke.mts
Remove-Item .tmp-rag-smoke.mts
```

Expected: prints `function ok AsyncFunction`. If `function ok Function`, the `async` keyword on the testkit `ingest` was lost — recheck Plan C.

- [ ] **Step 5: Confirm git log**

```powershell
git log --oneline -15
```

Expected: ~9 commits from this plan (retrieve impl + factory wire, scaffold + case 12, case 13, case 9, case 10, case 11, case 8, SCOPE update, supersede header).

- [ ] **Step 6: Confirm `dist/` contents**

```powershell
Get-ChildItem platform/agent/rag/dist
```

Expected files (modulo sourcemaps):
- `index.js`, `index.d.ts`
- `types.js`, `types.d.ts`
- `testkit.js`, `testkit.d.ts`

If any subpath entrypoint is missing, the build script doesn't include all three files — recheck Plan A Task A3 Step 2.

- [ ] **Step 7: Push and open PR 2**

(Outside this plan's scope.) Title suggestion: `feat(agent-rag): EP-07 composition package — ingest, retrieve, RRF, testkit`.

PR 2 is the end of EP-07 implementation. The next consumer (FAQ Agent / EP-12) will bind `createAgentRag` in `apps/api/src/main.ts` (EP-14 task 14.3) and wire `retrieve` + `cite_sources` tools.
