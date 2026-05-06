import { describe, it, expect } from 'vitest'
import { wouldCreateCycle } from './cycle-detector'

describe('wouldCreateCycle', () => {
  it('returns false for an empty graph', () => {
    expect(wouldCreateCycle('A', 'B', [])).toBe(false)
  })

  it('returns false when no path from B to A exists', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ]
    expect(wouldCreateCycle('A', 'C', edges)).toBe(false)
  })

  it('returns true when adding B→A creates a cycle (A→B already exists)', () => {
    const edges = [{ from: 'A', to: 'B' }]
    expect(wouldCreateCycle('B', 'A', edges)).toBe(true)
  })

  it('returns true for a longer cycle A→B→C→A', () => {
    const edges = [
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ]
    expect(wouldCreateCycle('C', 'A', edges)).toBe(true)
  })

  it('returns true for self-link', () => {
    expect(wouldCreateCycle('A', 'A', [])).toBe(true)
  })
})
