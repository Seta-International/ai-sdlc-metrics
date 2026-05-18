# Plan B — `fuseByRRF` pure helper

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `src/rrf.ts` stub from Plan A with the real Reciprocal Rank Fusion implementation. Ship correctness unit tests covering the seven behaviours in the spec's testing matrix, plus a `fast-check` property suite (≥ 200 runs) for four invariants.

**Architecture:** Pure function. No I/O, no async, no deps beyond the type imports. Accepts an array of per-leg ranked lists, returns a fused list sorted by `rrfScore` descending. Stable on the first-leg's order as the deterministic tie-break.

**Tech Stack:** TypeScript (ESM), Vitest, `fast-check` 4.8.0.

**Spec:** [`docs/superpowers/specs/2026-05-18-agent-rag-design.md`](../../specs/2026-05-18-agent-rag-design.md) §`fuseByRRF` — pure helper, §Testing → Property tests.

---

## File Structure

After this plan completes:

```
platform/agent/rag/src/
├── rrf.ts                       # MODIFY (replace stub)
├── rrf.test.ts                  # CREATE
└── rrf.property.test.ts         # CREATE
```

---

## Task B1: Write the failing correctness tests

**Files:**
- Create: `platform/agent/rag/src/rrf.test.ts`

- [ ] **Step 1: Write the test file**

Create `platform/agent/rag/src/rrf.test.ts` with exactly:

```ts
// platform/agent/rag/src/rrf.test.ts
import { describe, expect, it } from 'vitest'
import { fuseByRRF } from './rrf.js'

describe('fuseByRRF', () => {
  it('empty input returns empty output', () => {
    expect(fuseByRRF([])).toEqual([])
    expect(fuseByRRF([[]])).toEqual([])
    expect(fuseByRRF([[], []])).toEqual([])
  })

  it('single-leg passthrough preserves order with rrfScore = 1/(k+rank)', () => {
    const fused = fuseByRRF([[{ id: 'a' }, { id: 'b' }, { id: 'c' }]], 60)
    expect(fused.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(fused[0]!.rrfScore).toBeCloseTo(1 / (60 + 1), 12)
    expect(fused[1]!.rrfScore).toBeCloseTo(1 / (60 + 2), 12)
    expect(fused[2]!.rrfScore).toBeCloseTo(1 / (60 + 3), 12)
    expect(fused[0]!.ranks).toEqual({ 0: 1 })
    expect(fused[1]!.ranks).toEqual({ 0: 2 })
    expect(fused[2]!.ranks).toEqual({ 0: 3 })
  })

  it('two-leg fusion sums scores when the same id appears in both', () => {
    const leg0 = [{ id: 'a' }, { id: 'b' }]
    const leg1 = [{ id: 'b' }, { id: 'a' }]
    const fused = fuseByRRF([leg0, leg1], 60)
    // 'a' is rank 1 in leg0 and rank 2 in leg1: 1/61 + 1/62
    // 'b' is rank 2 in leg0 and rank 1 in leg1: 1/62 + 1/61
    // The two sums are equal — tie-break must follow first-leg order (a before b).
    expect(fused.map((f) => f.id)).toEqual(['a', 'b'])
    expect(fused[0]!.rrfScore).toBeCloseTo(1 / 61 + 1 / 62, 12)
    expect(fused[1]!.rrfScore).toBeCloseTo(1 / 62 + 1 / 61, 12)
    expect(fused[0]!.ranks).toEqual({ 0: 1, 1: 2 })
    expect(fused[1]!.ranks).toEqual({ 0: 2, 1: 1 })
  })

  it('disjoint legs: each id appears in exactly one leg with one rank', () => {
    const leg0 = [{ id: 'a' }, { id: 'b' }]
    const leg1 = [{ id: 'c' }, { id: 'd' }]
    const fused = fuseByRRF([leg0, leg1], 60)
    expect(fused).toHaveLength(4)
    const a = fused.find((f) => f.id === 'a')!
    const c = fused.find((f) => f.id === 'c')!
    expect(a.ranks).toEqual({ 0: 1 })
    expect(c.ranks).toEqual({ 1: 1 })
    // 'a' (rank 1 in leg0) and 'c' (rank 1 in leg1) tie on score; tie-break = leg-0 first
    expect(fused[0]!.id).toBe('a')
    expect(fused[1]!.id).toBe('c')
  })

  it('one empty leg preserves the other leg verbatim', () => {
    const leg0 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const fused = fuseByRRF([leg0, []], 60)
    expect(fused.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(fused[0]!.ranks).toEqual({ 0: 1 })
  })

  it('smaller k produces a larger spread between adjacent ranks', () => {
    const leg = [{ id: 'a' }, { id: 'b' }]
    const fusedSmall = fuseByRRF([leg], 1)
    const fusedLarge = fuseByRRF([leg], 1000)
    const spreadSmall = fusedSmall[0]!.rrfScore - fusedSmall[1]!.rrfScore
    const spreadLarge = fusedLarge[0]!.rrfScore - fusedLarge[1]!.rrfScore
    expect(spreadSmall).toBeGreaterThan(spreadLarge)
  })

  it('deterministic — identical input produces identical output', () => {
    const leg0 = [{ id: 'a' }, { id: 'b' }]
    const leg1 = [{ id: 'c' }, { id: 'a' }]
    const a = fuseByRRF([leg0, leg1], 60)
    const b = fuseByRRF([leg0, leg1], 60)
    expect(a).toEqual(b)
  })

  it('default k is 60 when not supplied', () => {
    const fused = fuseByRRF([[{ id: 'a' }]])
    expect(fused[0]!.rrfScore).toBeCloseTo(1 / 61, 12)
  })
})
```

- [ ] **Step 2: Verify the tests fail against the stub**

```powershell
pnpm --filter @seta/agent-rag test:unit -- src/rrf.test.ts
```

Expected: all eight tests fail. The stub from Plan A throws `'fuseByRRF: not implemented yet'`; vitest reports each test as failed with that message.

- [ ] **Step 3: Don't commit yet — implementation lands in B2**

---

## Task B2: Implement `fuseByRRF`

**Files:**
- Modify: `platform/agent/rag/src/rrf.ts` (replace the stub)

- [ ] **Step 1: Replace the file with the real implementation**

Write exactly:

```ts
// platform/agent/rag/src/rrf.ts
import type { FusedItem, RankedItem } from './types.js'

/**
 * Reciprocal Rank Fusion over per-leg ranked lists.
 *
 * Algorithm: for each leg, walk its list 1-indexed; accumulate
 * `score[id] += 1 / (k + rank)` and record `ranks[id][legIndex] = rank`.
 * Returns items sorted by `rrfScore` descending. Tie-break: stable on the
 * first-appearance order across legs (insertion order of `firstSeen`).
 *
 * Pure. No async, no I/O. Deterministic given identical input + `k`.
 *
 * @param rankings One ranked list per leg, 1-based ordering implicit.
 * @param k Smoothing constant. Default 60 (literature standard).
 *   Smaller `k` widens the score gap between adjacent ranks; larger `k`
 *   flattens it.
 */
export function fuseByRRF(rankings: RankedItem[][], k = 60): FusedItem[] {
  const acc = new Map<string, FusedItem>()
  const firstSeen: string[] = []

  for (let legIndex = 0; legIndex < rankings.length; legIndex++) {
    const leg = rankings[legIndex]!
    for (let i = 0; i < leg.length; i++) {
      const rank = i + 1
      const id = leg[i]!.id
      const contribution = 1 / (k + rank)
      const existing = acc.get(id)
      if (existing === undefined) {
        acc.set(id, {
          id,
          rrfScore: contribution,
          ranks: { [legIndex]: rank },
        })
        firstSeen.push(id)
      } else {
        existing.rrfScore += contribution
        existing.ranks[legIndex] = rank
      }
    }
  }

  // Stable sort on rrfScore desc; ties resolved by first-seen order.
  // Array.prototype.sort is stable in V8 since Node 12.
  const indexed = firstSeen.map((id, idx) => ({ item: acc.get(id)!, idx }))
  indexed.sort((a, b) => b.item.rrfScore - a.item.rrfScore || a.idx - b.idx)
  return indexed.map((x) => x.item)
}
```

Why a separate `firstSeen` array: `Map` iteration order is insertion-order in the language spec, but the sort needs a deterministic tie-break key independent of iteration. Using the explicit index makes the tie-break behaviour an obvious read.

- [ ] **Step 2: Run the unit tests**

```powershell
pnpm --filter @seta/agent-rag test:unit -- src/rrf.test.ts
```

Expected: all eight tests pass. If the tie-break tests fail, check the sort comparator — it must include `|| a.idx - b.idx` (not `a.idx > b.idx ? 1 : -1`, which only works for stable sorts on numeric keys and confuses the negative branch).

- [ ] **Step 3: Run typecheck + lint**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
```

Both must pass.

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/src/rrf.ts platform/agent/rag/src/rrf.test.ts
git commit -m "feat(agent-rag): implement fuseByRRF with correctness tests"
```

---

## Task B3: Property tests with `fast-check`

**Files:**
- Create: `platform/agent/rag/src/rrf.property.test.ts`

- [ ] **Step 1: Write the property file**

Create `platform/agent/rag/src/rrf.property.test.ts` with exactly:

```ts
// platform/agent/rag/src/rrf.property.test.ts
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { RankedItem } from './types.js'
import { fuseByRRF } from './rrf.js'

// Arbitrary: a single ranked list of unique ids, length 0..20.
const legArb = fc
  .uniqueArray(
    fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !/^\s*$/.test(s)),
    { minLength: 0, maxLength: 20 },
  )
  .map((ids): RankedItem[] => ids.map((id) => ({ id })))

// Arbitrary: 0..4 legs.
const rankingsArb = fc.array(legArb, { minLength: 0, maxLength: 4 })

const kArb = fc.integer({ min: 1, max: 1000 })

const NUM_RUNS = 200

describe('fuseByRRF — properties', () => {
  it('every output rrfScore > 0', () => {
    fc.assert(
      fc.property(rankingsArb, kArb, (rankings, k) => {
        const fused = fuseByRRF(rankings, k)
        for (const f of fused) {
          expect(f.rrfScore).toBeGreaterThan(0)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('output is sorted by rrfScore descending', () => {
    fc.assert(
      fc.property(rankingsArb, kArb, (rankings, k) => {
        const fused = fuseByRRF(rankings, k)
        for (let i = 1; i < fused.length; i++) {
          expect(fused[i]!.rrfScore).toBeLessThanOrEqual(fused[i - 1]!.rrfScore)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('output ids are exactly the union of input ids across legs', () => {
    fc.assert(
      fc.property(rankingsArb, kArb, (rankings, k) => {
        const expected = new Set<string>()
        for (const leg of rankings) for (const item of leg) expected.add(item.id)
        const actual = new Set(fuseByRRF(rankings, k).map((f) => f.id))
        expect(actual).toEqual(expected)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('adding the same constant to every rank does not invert any pair', () => {
    fc.assert(
      fc.property(rankingsArb, kArb, (rankings, k) => {
        // Adding `c` to every rank is equivalent to raising k by `c`:
        // 1/((k+c) + i) for i = 1..n.
        // So calling fuseByRRF with `k + c` must produce the same id order
        // as calling it with `k` (because the contributions are still strictly
        // monotone-decreasing in rank).
        const c = 5
        const a = fuseByRRF(rankings, k).map((f) => f.id)
        const b = fuseByRRF(rankings, k + c).map((f) => f.id)
        expect(b).toEqual(a)
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
```

A note on the fourth property: the equivalence "shift all ranks by a constant ≡ raise k" is precise for this formula. The property guarantees no rank inversion as `k` scales, which is the spec's monotone-rescaling claim.

- [ ] **Step 2: Run property tests**

```powershell
pnpm --filter @seta/agent-rag test:unit -- src/rrf.property.test.ts
```

Expected: four `it` blocks, each running 200 cases, all green. If any property fails, fast-check will print a minimised counterexample — investigate that case before changing `rrf.ts`. The most likely failure mode is the sort comparator producing instability on equal scores; recheck Task B2 Step 2.

- [ ] **Step 3: Run full unit suite**

```powershell
pnpm --filter @seta/agent-rag test:unit
```

Expected: 8 correctness + 4 property tests, all pass. (`factory.test.ts` from Plan A still has its 1 passing shape test, so the total is 13.)

- [ ] **Step 4: Commit**

```powershell
git add platform/agent/rag/src/rrf.property.test.ts
git commit -m "test(agent-rag): fast-check property tests for fuseByRRF"
```

---

## Task B4: Final verification

**Files:** none

- [ ] **Step 1: Full local verification chain**

```powershell
pnpm --filter @seta/agent-rag typecheck
pnpm --filter @seta/agent-rag lint
pnpm --filter @seta/agent-rag test:unit
pnpm --filter @seta/agent-rag build
```

All four exit zero. `dist/index.{js,d.ts}` now embeds the real `fuseByRRF`.

- [ ] **Step 2: Confirm git log**

```powershell
git log --oneline -4
```

Expected: 2 commits from this plan (impl + property tests).

Proceed to Plan C (`testkit`).
