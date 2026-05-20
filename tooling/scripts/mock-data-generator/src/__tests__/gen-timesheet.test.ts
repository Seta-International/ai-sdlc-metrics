import { describe, expect, it } from 'vitest'
import { NAMED_LEAVES, NAMED_USERS } from '../cast.js'
import { generateTimesheet } from '../gen-timesheet.js'
import { createRng } from '../rng.js'

const userIds = NAMED_USERS.map((u) => u.user_id).concat(
  Array.from({ length: 285 }, (_, i) => `u${String(100 + i).padStart(3, '0')}`),
)

describe('generateTimesheet', () => {
  it('contains the named leave entries verbatim', () => {
    const leaves = generateTimesheet(createRng(42), 400, userIds)
    for (const named of NAMED_LEAVES) {
      expect(leaves).toContainEqual(named)
    }
  })

  it('produces ~400 leaves', () => {
    const leaves = generateTimesheet(createRng(42), 400, userIds)
    expect(leaves.length).toBeGreaterThanOrEqual(380)
    expect(leaves.length).toBeLessThanOrEqual(420)
  })

  it('status mix is roughly 70/25/5 approved/pending/rejected', () => {
    const leaves = generateTimesheet(createRng(42), 400, userIds)
    const approved = leaves.filter((l) => l.status === 'approved').length / leaves.length
    const pending = leaves.filter((l) => l.status === 'pending').length / leaves.length
    const rejected = leaves.filter((l) => l.status === 'rejected').length / leaves.length
    expect(approved).toBeGreaterThan(0.6)
    expect(approved).toBeLessThan(0.8)
    expect(pending).toBeGreaterThan(0.18)
    expect(pending).toBeLessThan(0.32)
    expect(rejected).toBeGreaterThan(0.02)
    expect(rejected).toBeLessThan(0.1)
  })

  it('start_date <= end_date for every row', () => {
    const leaves = generateTimesheet(createRng(42), 400, userIds)
    for (const l of leaves) {
      expect(l.start_date <= l.end_date).toBe(true)
    }
  })

  it('every employee_id exists in the supplied user list', () => {
    const leaves = generateTimesheet(createRng(42), 400, userIds)
    const userSet = new Set(userIds)
    for (const l of leaves) {
      expect(userSet.has(l.employee_id)).toBe(true)
    }
  })

  it('leave_ids are unique', () => {
    const leaves = generateTimesheet(createRng(42), 400, userIds)
    const ids = leaves.map((l) => l.leave_id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
