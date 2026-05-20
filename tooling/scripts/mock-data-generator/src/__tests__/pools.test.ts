import { describe, expect, it } from 'vitest'
import { ROLE_HEADCOUNT_TARGET, ROLE_SKILL_PROFILE, ROLES, seniorityOf } from '../pools.js'

describe('ROLE_HEADCOUNT_TARGET', () => {
  it('sums to 299 (catalog total; u013 with empty role brings dataset to 300)', () => {
    const sum = Object.values(ROLE_HEADCOUNT_TARGET).reduce((acc, n) => acc + n, 0)
    expect(sum).toBe(299)
  })

  it('has exactly one CEO, CTO, and CDO', () => {
    expect(ROLE_HEADCOUNT_TARGET.CEO).toBe(1)
    expect(ROLE_HEADCOUNT_TARGET.CTO).toBe(1)
    expect(ROLE_HEADCOUNT_TARGET.CDO).toBe(1)
  })

  it('has a target for every role in ROLES', () => {
    for (const role of ROLES) {
      expect(ROLE_HEADCOUNT_TARGET[role]).toBeDefined()
    }
  })

  it('has a skill profile for every role in ROLES', () => {
    for (const role of ROLES) {
      const profile = ROLE_SKILL_PROFILE[role]
      expect(profile).toBeDefined()
      expect(profile?.length ?? 0).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('seniorityOf', () => {
  it('classifies Junior roles', () => {
    expect(seniorityOf('Junior Frontend Developer')).toBe('junior')
    expect(seniorityOf('Junior QA Engineer')).toBe('junior')
  })
  it('classifies Senior roles', () => {
    expect(seniorityOf('Senior Backend Developer')).toBe('senior')
    expect(seniorityOf('Senior DevOps Engineer')).toBe('senior')
  })
  it('classifies everything else as mid', () => {
    expect(seniorityOf('CEO')).toBe('mid')
    expect(seniorityOf('Mid Backend Developer')).toBe('mid')
    expect(seniorityOf('Engineering Manager')).toBe('mid')
    expect(seniorityOf('Project Manager')).toBe('mid')
  })
})
