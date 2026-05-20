import { describe, expect, it } from 'vitest'
import { NAMED_PLAN_MEMBERS, NAMED_PLANS, NAMED_USERS } from '../cast.js'
import { generatePlanMembers } from '../gen-plan-members.js'
import { createRng } from '../rng.js'

describe('generatePlanMembers', () => {
  const userIds = NAMED_USERS.map((u) => u.user_id).concat(
    Array.from({ length: 285 }, (_, i) => `u${String(100 + i).padStart(3, '0')}`),
  )
  const planIds = NAMED_PLANS.map((p) => p.plan_id).concat(
    Array.from({ length: 44 }, (_, i) => `p${String(7 + i).padStart(3, '0')}`),
  )

  it('contains the named membership rows verbatim', () => {
    const members = generatePlanMembers(createRng(42), planIds, userIds)
    for (const named of NAMED_PLAN_MEMBERS) {
      expect(members).toContainEqual(named)
    }
  })

  it('produces no rows for p006 (orphan plan)', () => {
    const members = generatePlanMembers(createRng(42), planIds, userIds)
    expect(members.filter((m) => m.plan_id === 'p006')).toHaveLength(0)
  })

  it('every member_id exists in the supplied users', () => {
    const members = generatePlanMembers(createRng(42), planIds, userIds)
    const userSet = new Set(userIds)
    for (const m of members) {
      expect(userSet.has(m.member_id)).toBe(true)
    }
  })

  it('every plan_id exists in the supplied plans', () => {
    const members = generatePlanMembers(createRng(42), planIds, userIds)
    const planSet = new Set(planIds)
    for (const m of members) {
      expect(planSet.has(m.plan_id)).toBe(true)
    }
  })

  it('produces ~1500-2500 total rows', () => {
    const members = generatePlanMembers(createRng(42), planIds, userIds)
    expect(members.length).toBeGreaterThanOrEqual(1500)
    expect(members.length).toBeLessThanOrEqual(2500)
  })

  it('has no duplicate (plan_id, member_id) pairs', () => {
    const members = generatePlanMembers(createRng(42), planIds, userIds)
    const seen = new Set<string>()
    for (const m of members) {
      const key = `${m.plan_id}:${m.member_id}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })
})
