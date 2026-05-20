import { describe, expect, it } from 'vitest'
import { createRng } from '../rng.js'

describe('createRng', () => {
  it('produces deterministic numbers for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 5 }, () => a.next())
    const seqB = Array.from({ length: 5 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('produces different sequences for different seeds', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toEqual(b.next())
  })

  it('next() returns numbers in [0, 1)', () => {
    const r = createRng(99)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('pick() returns one of the input items deterministically', () => {
    const r = createRng(123)
    const items = ['a', 'b', 'c', 'd']
    const picks = Array.from({ length: 20 }, () => r.pick(items))
    expect(picks.every((p) => items.includes(p))).toBe(true)
    expect(createRng(123).pick(items)).toBe(picks[0])
  })

  it('sample(k) returns k distinct items', () => {
    const r = createRng(7)
    const items = ['a', 'b', 'c', 'd', 'e']
    const sample = r.sample(items, 3)
    expect(sample).toHaveLength(3)
    expect(new Set(sample).size).toBe(3)
    expect(sample.every((s) => items.includes(s))).toBe(true)
  })

  it('chance(p) is roughly p over many trials', () => {
    const r = createRng(2026)
    let hits = 0
    const n = 10_000
    for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++
    expect(hits / n).toBeGreaterThan(0.27)
    expect(hits / n).toBeLessThan(0.33)
  })

  it('intRange(lo, hi) returns integers in [lo, hi]', () => {
    const r = createRng(5)
    for (let i = 0; i < 1000; i++) {
      const v = r.intRange(3, 7)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(3)
      expect(v).toBeLessThanOrEqual(7)
    }
  })
})
