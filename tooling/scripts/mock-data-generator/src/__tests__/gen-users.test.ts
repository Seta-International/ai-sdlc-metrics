import { describe, expect, it } from 'vitest'
import { NAMED_USERS } from '../cast.js'
import { generateUsers } from '../gen-users.js'
import { ALIAS_SKILLS, ROLE_HEADCOUNT_TARGET, seniorityOf } from '../pools.js'
import { createRng } from '../rng.js'

describe('generateUsers', () => {
  it('produces exactly 300 users', () => {
    const users = generateUsers(createRng(42), 300)
    expect(users.length).toBe(300)
  })

  it('includes the named cast verbatim', () => {
    const users = generateUsers(createRng(42), 300)
    for (const named of NAMED_USERS) {
      expect(users).toContainEqual(named)
    }
  })

  it('assigns unique user_ids', () => {
    const users = generateUsers(createRng(42), 300)
    const ids = users.map((u) => u.user_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('hits exactly one CEO, one CTO, one CDO', () => {
    const users = generateUsers(createRng(42), 300)
    expect(users.filter((u) => u.role === 'CEO')).toHaveLength(1)
    expect(users.filter((u) => u.role === 'CTO')).toHaveLength(1)
    expect(users.filter((u) => u.role === 'CDO')).toHaveLength(1)
  })

  it('produces the exact per-role headcount from ROLE_HEADCOUNT_TARGET (ignoring empty-role rows)', () => {
    const users = generateUsers(createRng(42), 300)
    const actual: Record<string, number> = {}
    for (const u of users) {
      if (u.role === '') continue
      actual[u.role] = (actual[u.role] ?? 0) + 1
    }
    for (const [role, target] of Object.entries(ROLE_HEADCOUNT_TARGET)) {
      expect(actual[role] ?? 0).toBe(target)
    }
  })

  it('roughly 15% of users have at least one of project/role empty', () => {
    const users = generateUsers(createRng(42), 300)
    const sparse = users.filter((u) => u.project === '' || u.role === '')
    const ratio = sparse.length / users.length
    expect(ratio).toBeGreaterThan(0.1)
    expect(ratio).toBeLessThan(0.2)
  })

  it('roughly 5% of users have empty skills', () => {
    const users = generateUsers(createRng(42), 300)
    const empty = users.filter((u) => u.skills === '')
    const ratio = empty.length / users.length
    expect(ratio).toBeGreaterThan(0.02)
    expect(ratio).toBeLessThan(0.08)
  })

  it('roughly 10% of users use at least one alias-form skill', () => {
    const users = generateUsers(createRng(42), 300)
    const aliasUsers = users.filter((u) =>
      u.skills.split(',').some((s) => (ALIAS_SKILLS as readonly string[]).includes(s)),
    )
    const ratio = aliasUsers.length / users.length
    expect(ratio).toBeGreaterThan(0.05)
    expect(ratio).toBeLessThan(0.15)
  })

  it('Junior roles carry 2–3 skills', () => {
    const users = generateUsers(createRng(42), 300)
    const juniors = users.filter((u) => seniorityOf(u.role) === 'junior' && u.skills !== '')
    expect(juniors.length).toBeGreaterThan(0)
    for (const u of juniors) {
      const count = u.skills.split(',').length
      expect(count).toBeGreaterThanOrEqual(2)
      expect(count).toBeLessThanOrEqual(3)
    }
  })

  it('Senior roles carry 5–7 skills', () => {
    const users = generateUsers(createRng(42), 300)
    const seniors = users
      .filter((u) => seniorityOf(u.role) === 'senior' && u.skills !== '')
      // Exclude the named cast — they have fixed skill lists from cast.ts
      .filter((u) => !NAMED_USERS.some((n) => n.user_id === u.user_id))
    expect(seniors.length).toBeGreaterThan(0)
    for (const u of seniors) {
      const count = u.skills.split(',').length
      expect(count).toBeGreaterThanOrEqual(5)
      expect(count).toBeLessThanOrEqual(7)
    }
  })

  it('is deterministic given the same seed', () => {
    const a = generateUsers(createRng(42), 300)
    const b = generateUsers(createRng(42), 300)
    expect(a).toEqual(b)
  })
})
