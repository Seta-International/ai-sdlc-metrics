import { describe, it, expect } from 'vitest'
import { listAtRiskPlansIntent } from './list-at-risk-plans'

describe('listAtRiskPlansIntent', () => {
  it('has the correct slug', () => {
    expect(listAtRiskPlansIntent.slug).toBe('planner.list-at-risk-plans')
  })

  it('has domain planner', () => {
    expect(listAtRiskPlansIntent.domain).toBe('planner')
  })

  it('has a non-empty description', () => {
    expect(listAtRiskPlansIntent.description.length).toBeGreaterThan(10)
  })
})
