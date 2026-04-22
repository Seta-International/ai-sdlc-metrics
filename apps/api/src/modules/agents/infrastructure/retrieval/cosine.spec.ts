/**
 * Unit tests for cosineSimilarity helper (Plan 02.5 Task 2).
 *
 * Pure function — no dependencies, no mocks needed.
 */

import { describe, it, expect } from 'vitest'
import { cosineSimilarity } from './cosine'

describe('cosineSimilarity', () => {
  // ── Basic correctness ─────────────────────────────────────────────────────

  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10)
  })

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10)
  })

  it('returns correct similarity for non-trivial vectors', () => {
    // [1, 1] · [1, 0] = 1, |[1,1]| = √2, |[1,0]| = 1 → cos = 1/√2 ≈ 0.707
    expect(cosineSimilarity([1, 1], [1, 0])).toBeCloseTo(1 / Math.sqrt(2), 10)
  })

  it('is commutative: sim(a, b) === sim(b, a)', () => {
    const a = [0.3, 0.7, 0.1]
    const b = [0.9, 0.1, 0.5]
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10)
  })

  // ── Degenerate inputs ─────────────────────────────────────────────────────

  it('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('returns 0 when one vector is empty', () => {
    expect(cosineSimilarity([1, 2, 3], [])).toBe(0)
    expect(cosineSimilarity([], [1, 2, 3])).toBe(0)
  })

  it('returns 0 when vectors have different lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('returns 0 for zero vector a', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })

  it('returns 0 for zero vector b', () => {
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0)
  })

  it('returns 0 for both zero vectors', () => {
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
  })

  // ── Non-finite inputs ─────────────────────────────────────────────────────

  it('returns 0 for a vector containing NaN', () => {
    expect(cosineSimilarity([1, NaN, 0], [1, 0, 0])).toBe(0)
    expect(cosineSimilarity([1, 0, 0], [NaN, 0, 0])).toBe(0)
  })

  it('returns 0 for a vector containing Infinity', () => {
    expect(cosineSimilarity([1, Infinity, 0], [1, 0, 0])).toBe(0)
    expect(cosineSimilarity([1, 0, 0], [Infinity, 0, 0])).toBe(0)
  })

  it('returns 0 for a vector containing -Infinity', () => {
    expect(cosineSimilarity([1, -Infinity, 0], [1, 0, 0])).toBe(0)
    expect(cosineSimilarity([1, 0, 0], [-Infinity, 0, 0])).toBe(0)
  })

  // ── Range invariant ───────────────────────────────────────────────────────

  it('returns a value in [-1, 1] for various inputs', () => {
    const pairs: [number[], number[]][] = [
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
      [
        [0.5, 0.5],
        [0.3, 0.7],
      ],
      [
        [-1, 2, 3],
        [4, -5, 6],
      ],
      [
        [100, 200, 300],
        [1, 2, 3],
      ],
    ]
    for (const [a, b] of pairs) {
      const sim = cosineSimilarity(a, b)
      expect(sim).toBeGreaterThanOrEqual(-1 - 1e-10)
      expect(sim).toBeLessThanOrEqual(1 + 1e-10)
    }
  })
})
