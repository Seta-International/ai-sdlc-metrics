import { describe, expect, it } from 'vitest'
import { plannerRouter } from './planner.router'

describe('plannerRouter shape', () => {
  it('exposes planner.personal.listPlans', () => {
    expect(plannerRouter.personal).toBeDefined()
    expect(plannerRouter.personal.listPlans).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((plannerRouter as any)._def.procedures['personal.listPlans']).toBeDefined()
  })
})
