# Plan C — `createFakeAgentRag` testkit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `src/testkit.ts` stub with the real `createFakeAgentRag` factory. The fake returns canned hits from `retrieve` (or runs a user-supplied responder), no-ops `ingest`, and records every `ingest` call on `__calls.ingest` for downstream FAQ Agent tests to assert against.

**Architecture:** Pure in-process implementation. No DB, no network, no async setup cost. Matches `RagApi` exactly so FAQ Agent (EP-12) can bind to the fake in its tests and swap to the real `createAgentRag` in production with a one-line change.

**Tech Stack:** TypeScript (ESM), Vitest.

**Spec:** [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../specs/2026-05-18-agent-rag-design.md) §Testkit entrypoint.

---

## File Structure

After this plan completes:

```
platform/agent/rag/src/
├── testkit.ts                   # MODIFY (replace stub)
└── testkit.test.ts              # CREATE
```

---

## Task C1: Write the failing tests

**Files:**
- Create: `platform/agent/rag/src/testkit.test.ts`

- [ ] **Step 1: Write the test file**

Create `platform/agent/rag/src/testkit.test.ts` with exactly:

```ts
// platform/agent/rag/src/testkit.test.ts
import { describe, expect, it } from 'vitest'
import type { RagHit } from './types.js'
import { createFakeAgentRag } from './testkit.js'

const sampleHit = (id: string): RagHit => ({
  chunkId: id,
  sourceId: `src-${id}`,
  content: `content-${id}`,
  rrfScore: 0.1,
  vectorRank: 1,
  vectorSimilarity: 0.9,
  citation: { sourceId: `src-${id}`, span: { startChar: 0, endChar: 10 } },
})

describe('createFakeAgentRag', () => {
  it('retrieve returns canned hits regardless of query when only `hits` is set', async () => {
    const hits = [sampleHit('a'), sampleHit('b')]
    const fake = createFakeAgentRag({ hits })
    const r1 = await fake.retrieve('whatever query')
    const r2 = await fake.retrieve('completely different query')
    expect(r1).toEqual(hits)
    expect(r2).toEqual(hits)
  })

  it('retrieve uses the `retrieve` responder when supplied, ignoring `hits`', async () => {
    const fake = createFakeAgentRag({
      hits: [sampleHit('static')],
      retrieve: (q) => [{ ...sampleHit('dynamic'), content: q }],
    })
    const r = await fake.retrieve('hello')
    expect(r).toHaveLength(1)
    expect(r[0]!.content).toBe('hello')
  })

  it('retrieve responder may return a Promise', async () => {
    const fake = createFakeAgentRag({
      retrieve: async (q) => [{ ...sampleHit('async'), content: q }],
    })
    const r = await fake.retrieve('async-query')
    expect(r).toHaveLength(1)
    expect(r[0]!.content).toBe('async-query')
  })

  it('retrieve returns [] when neither `hits` nor `retrieve` is set', async () => {
    const fake = createFakeAgentRag()
    expect(await fake.retrieve('query')).toEqual([])
  })

  it('ingest is a no-op and records the call on __calls.ingest', async () => {
    const fake = createFakeAgentRag()
    await fake.ingest('s1', 'first content')
    await fake.ingest('s2', 'second content')
    expect(fake.__calls.ingest).toEqual([
      { sourceId: 's1', content: 'first content' },
      { sourceId: 's2', content: 'second content' },
    ])
  })

  it('each createFakeAgentRag instance has its own __calls array', async () => {
    const a = createFakeAgentRag()
    const b = createFakeAgentRag()
    await a.ingest('s1', 'x')
    expect(a.__calls.ingest).toHaveLength(1)
    expect(b.__calls.ingest).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Verify the tests fail against the stub**

```powershell
pnpm --filter @seta/agent-rag test:unit -- src/testkit.test.ts
```

Expected: all six tests fail. The Plan A stub throws on every method call, so each test errors with `'createFakeAgentRag: not implemented yet'`.

- [ ] **Step 3: Don't commit yet — implementation lands in C2**

---

## Task C2: Implement `createFakeAgentRag`

**Files:**
- Modify: `platform/agent/rag/src/testkit.ts` (replace the stub)

- [ ] **Step 1: Replace the file with the real implementation**

Write exactly:

```ts
// platform/agent/rag/src/testkit.ts
import type { RagApi, RagHit } from './types.js'

export interface FakeRagOptions {
  /** Canned hits returned by `retrieve` regardless of query. */
  hits?: RagHit[]
  /** Optional dynamic responder; takes precedence over `hits` when set. */
  retrieve?: (query: string) => RagHit[] | Promise<RagHit[]>
}

export interface FakeAgentRag extends RagApi {
  __calls: { ingest: Array<{ sourceId: string; content: string }> }
}

/**
 * In-memory `RagApi` for tests. Matches `RagApi` exactly so consumers
 * (e.g. the FAQ Agent) can bind to the fake and swap to the real
 * `createAgentRag` in production with a one-line change.
 *
 * - `retrieve` returns the `retrieve` responder's value when set,
 *   otherwise `hits ?? []`. The responder may be sync or async.
 * - `ingest` is a no-op that pushes `{ sourceId, content }` onto
 *   `__calls.ingest` for assertions.
 *
 * Each invocation produces a fresh instance with its own `__calls` array.
 */
export function createFakeAgentRag(opts: FakeRagOptions = {}): FakeAgentRag {
  const __calls: FakeAgentRag['__calls'] = { ingest: [] }

  return {
    __calls,
    async ingest(sourceId, content): Promise<void> {
      __calls.ingest.push({ sourceId, content })
    },
    async retrieve(query) {
      if (opts.retrieve !== undefined) {
        return Promise.resolve(opts.retrieve(query))
      }
      return opts.hits ?? []
    },
  }
}
```

The `FakeAgentRag` interface is exported alongside `FakeRagOptions` so downstream tests can type the return value precisely (e.g., `let rag: FakeAgentRag`) without resorting to `ReturnType<typeof createFakeAgentRag>`.

- [ ] **Step 2: Run the unit tests**

```powershell
pnpm --filter @seta/agent-rag test:unit -- src/testkit.test.ts
```

Expected: all six tests pass. If the "async responder" test fails because `await` was missing, recheck the `Promise.resolve(opts.retrieve(query))` wrap — that line handles both sync and async responder return types.

- [ ] **Step 3: Run typecheck + lint + full unit suite**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag test:unit
```

All three must pass. Total unit test count after this plan: 8 RRF + 4 properties + 6 testkit + 1 factory shape = 19.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/src/testkit.ts platform/agent/rag/src/testkit.test.ts
git commit -m "feat(agent-rag): implement createFakeAgentRag testkit"
```

---

## Task C3: Final verification

**Files:** none

- [ ] **Step 1: Verify the `./testkit` subpath resolves from outside the package**

Reuse the smoke-script approach from Plan A Task A7 Step 2 — write a `.tmp-rag-smoke.mts` (do NOT commit):

```powershell
Set-Content -Path .tmp-rag-smoke.mts -Value @'
import { createFakeAgentRag, type FakeAgentRag } from '@seta/agent-rag/testkit'
const rag: FakeAgentRag = createFakeAgentRag()
await rag.ingest('s', 'x')
console.log(rag.__calls.ingest.length === 1 ? 'ok' : 'fail')
'@
pnpm exec tsx .tmp-rag-smoke.mts
Remove-Item .tmp-rag-smoke.mts
```

Expected runtime output: `ok`.

If `tsx` cannot resolve `@seta/agent-rag/testkit`, the `exports` map was misconfigured — recheck Plan A Task A3 Step 1.

- [ ] **Step 2: Confirm git log**

```powershell
git log --oneline -3
```

Expected: 1 commit from this plan.

Proceed to Plan D (`ingest`).
