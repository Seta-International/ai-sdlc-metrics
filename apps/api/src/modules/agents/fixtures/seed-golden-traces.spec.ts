import { describe, it, expect } from 'vitest'
import { GOLDEN_TRACE_FIXTURES } from './seed-golden-traces'

describe('GOLDEN_TRACE_FIXTURES', () => {
  it('has exactly 4 fixtures', () => {
    expect(GOLDEN_TRACE_FIXTURES).toHaveLength(4)
  })

  it('all fixtures have required non-empty fields', () => {
    for (const f of GOLDEN_TRACE_FIXTURES) {
      expect(f.title).toBeTruthy()
      expect(f.userUtterance).toBeTruthy()
      expect(f.expectedToolCalls.length).toBeGreaterThan(0)
      expect(['short-answer', 'list', 'table', 'narrative', 'chart', 'refusal']).toContain(
        f.expectedShape,
      )
      expect(f.taintExpectation).toBe(false)
      expect(f.adversarialCategory).toBeNull()
    }
  })

  it('covers planner and kb tool slugs', () => {
    const allToolCalls = GOLDEN_TRACE_FIXTURES.flatMap((f) => [...f.expectedToolCalls])
    expect(allToolCalls).toContain('planner.list-my-tasks')
    expect(allToolCalls).toContain('planner.get-plan-status')
    expect(allToolCalls).toContain('planner.list-at-risk-plans')
    expect(allToolCalls).toContain('kb.retrieve')
  })

  it('answerShapeContract is a non-empty object for every fixture', () => {
    for (const f of GOLDEN_TRACE_FIXTURES) {
      expect(typeof f.answerShapeContract).toBe('object')
      expect(Object.keys(f.answerShapeContract).length).toBeGreaterThan(0)
    }
  })
})
