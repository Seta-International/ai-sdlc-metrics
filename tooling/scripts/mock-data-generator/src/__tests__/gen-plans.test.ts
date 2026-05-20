import { describe, expect, it } from 'vitest'
import { NAMED_PLANS } from '../cast.js'
import { generatePlans } from '../gen-plans.js'
import { createRng } from '../rng.js'

describe('generatePlans', () => {
  it('produces ~50 plans including the named cast verbatim', () => {
    const users = ['u001', 'u002', 'u050', 'u100', 'u200']
    const plans = generatePlans(createRng(42), 50, users)
    expect(plans.length).toBeGreaterThanOrEqual(48)
    expect(plans.length).toBeLessThanOrEqual(52)
    for (const named of NAMED_PLANS) {
      expect(plans).toContainEqual(named)
    }
  })

  it('contains at least 3 infrastructure-focused plans', () => {
    const plans = generatePlans(createRng(42), 50, ['u001', 'u002'])
    const infra = plans.filter(
      (p) =>
        p.tags.split(',').includes('infrastructure') ||
        p.title.toLowerCase().includes('infrastructure') ||
        p.title.toLowerCase().includes('cloud'),
    )
    expect(infra.length).toBeGreaterThanOrEqual(3)
  })

  it('roughly 30% of plans have empty description', () => {
    const plans = generatePlans(createRng(42), 50, ['u001', 'u002'])
    const empty = plans.filter((p) => p.description === '')
    const ratio = empty.length / plans.length
    expect(ratio).toBeGreaterThan(0.2)
    expect(ratio).toBeLessThan(0.4)
  })

  it('roughly 40% of plans have empty tags', () => {
    const plans = generatePlans(createRng(42), 50, ['u001', 'u002'])
    const empty = plans.filter((p) => p.tags === '')
    const ratio = empty.length / plans.length
    expect(ratio).toBeGreaterThan(0.25)
    expect(ratio).toBeLessThan(0.55)
  })

  it('every owner is one of the supplied user_ids', () => {
    const userIds = ['u001', 'u002', 'u050', 'u100']
    const plans = generatePlans(createRng(42), 50, userIds)
    const allOwners = new Set([...userIds, ...NAMED_PLANS.map((p) => p.owner)])
    for (const p of plans) {
      expect(allOwners.has(p.owner)).toBe(true)
    }
  })

  it('plan_ids are unique', () => {
    const plans = generatePlans(createRng(42), 50, ['u001', 'u002'])
    const ids = plans.map((p) => p.plan_id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
