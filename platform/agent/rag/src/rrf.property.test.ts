import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fuseByRRF } from './rrf.js'
import type { RankedItem } from './types.js'

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
          const prev = fused[i - 1]?.rrfScore ?? Number.POSITIVE_INFINITY
          const curr = fused[i]?.rrfScore ?? 0
          expect(curr).toBeLessThanOrEqual(prev)
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
