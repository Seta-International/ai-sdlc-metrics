import { describe, it, expect } from 'vitest'
import { getPlanStatusIntent } from './get-plan-status'

describe('getPlanStatusIntent', () => {
  it('has the correct slug', () => {
    expect(getPlanStatusIntent.slug).toBe('planner.get-plan-status')
  })

  it('has domain planner', () => {
    expect(getPlanStatusIntent.domain).toBe('planner')
  })

  it('has a non-empty description', () => {
    expect(getPlanStatusIntent.description.length).toBeGreaterThan(10)
  })
})
