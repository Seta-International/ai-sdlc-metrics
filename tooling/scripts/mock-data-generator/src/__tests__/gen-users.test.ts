import { describe, expect, it } from 'vitest'
import { NAMED_USERS } from '../cast.js'
import { generateUsers } from '../gen-users.js'
import { ALIAS_SKILLS } from '../pools.js'
import { createRng } from '../rng.js'

describe('generateUsers', () => {
  it('produces ~300 users including the named cast verbatim', () => {
    const users = generateUsers(createRng(42), 300)
    expect(users.length).toBeGreaterThanOrEqual(295)
    expect(users.length).toBeLessThanOrEqual(305)
    for (const named of NAMED_USERS) {
      expect(users).toContainEqual(named)
    }
  })

  it('assigns unique user_ids', () => {
    const users = generateUsers(createRng(42), 300)
    const ids = users.map((u) => u.user_id)
    expect(new Set(ids).size).toBe(ids.length)
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

  it('is deterministic given the same seed', () => {
    const a = generateUsers(createRng(42), 300)
    const b = generateUsers(createRng(42), 300)
    expect(a).toEqual(b)
  })
})
