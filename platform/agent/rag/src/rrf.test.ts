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
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / (60 + 1), 12)
    expect(fused[1]?.rrfScore).toBeCloseTo(1 / (60 + 2), 12)
    expect(fused[2]?.rrfScore).toBeCloseTo(1 / (60 + 3), 12)
    expect(fused[0]?.ranks).toEqual({ 0: 1 })
    expect(fused[1]?.ranks).toEqual({ 0: 2 })
    expect(fused[2]?.ranks).toEqual({ 0: 3 })
  })

  it('two-leg fusion sums scores when the same id appears in both', () => {
    const leg0 = [{ id: 'a' }, { id: 'b' }]
    const leg1 = [{ id: 'b' }, { id: 'a' }]
    const fused = fuseByRRF([leg0, leg1], 60)
    // 'a' is rank 1 in leg0 and rank 2 in leg1: 1/61 + 1/62
    // 'b' is rank 2 in leg0 and rank 1 in leg1: 1/62 + 1/61
    // The two sums are equal — tie-break must follow first-leg order (a before b).
    expect(fused.map((f) => f.id)).toEqual(['a', 'b'])
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 61 + 1 / 62, 12)
    expect(fused[1]?.rrfScore).toBeCloseTo(1 / 62 + 1 / 61, 12)
    expect(fused[0]?.ranks).toEqual({ 0: 1, 1: 2 })
    expect(fused[1]?.ranks).toEqual({ 0: 2, 1: 1 })
  })

  it('disjoint legs: each id appears in exactly one leg with one rank', () => {
    const leg0 = [{ id: 'a' }, { id: 'b' }]
    const leg1 = [{ id: 'c' }, { id: 'd' }]
    const fused = fuseByRRF([leg0, leg1], 60)
    expect(fused).toHaveLength(4)
    const a = fused.find((f) => f.id === 'a')
    const c = fused.find((f) => f.id === 'c')
    expect(a?.ranks).toEqual({ 0: 1 })
    expect(c?.ranks).toEqual({ 1: 1 })
    // 'a' (rank 1 in leg0) and 'c' (rank 1 in leg1) tie on score; tie-break = leg-0 first
    expect(fused[0]?.id).toBe('a')
    expect(fused[1]?.id).toBe('c')
  })

  it('one empty leg preserves the other leg verbatim', () => {
    const leg0 = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const fused = fuseByRRF([leg0, []], 60)
    expect(fused.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(fused[0]?.ranks).toEqual({ 0: 1 })
  })

  it('smaller k produces a larger spread between adjacent ranks', () => {
    const leg = [{ id: 'a' }, { id: 'b' }]
    const fusedSmall = fuseByRRF([leg], 1)
    const fusedLarge = fuseByRRF([leg], 1000)
    const spreadSmall = (fusedSmall[0]?.rrfScore ?? 0) - (fusedSmall[1]?.rrfScore ?? 0)
    const spreadLarge = (fusedLarge[0]?.rrfScore ?? 0) - (fusedLarge[1]?.rrfScore ?? 0)
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
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 61, 12)
  })
})
