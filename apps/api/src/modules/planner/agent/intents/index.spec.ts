import { describe, it, expect } from 'vitest'
import * as intents from './index'

describe('planner intents barrel', () => {
  it('exports getPlanStatusIntent with correct slug', () => {
    expect(intents.getPlanStatusIntent).toBeDefined()
    expect(intents.getPlanStatusIntent.slug).toBe('planner.get-plan-status')
  })

  it('exports listAtRiskPlansIntent with correct slug', () => {
    expect(intents.listAtRiskPlansIntent).toBeDefined()
    expect(intents.listAtRiskPlansIntent.slug).toBe('planner.list-at-risk-plans')
  })

  it('still exports all pre-existing intents', () => {
    expect(intents.listMyTasksIntent).toBeDefined()
    expect(intents.listMyPlansIntent).toBeDefined()
    expect(intents.listEvidenceIntent).toBeDefined()
  })
})
