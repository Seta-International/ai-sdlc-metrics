import { describe, expect, it } from 'vitest'
import { NAMED_BUCKETS, NAMED_PLAN_MEMBERS, NAMED_PLANS, NAMED_TASKS } from '../cast.js'
import { generateTasks } from '../gen-tasks.js'
import { createRng } from '../rng.js'

const planIds = NAMED_PLANS.map((p) => p.plan_id)
const buckets = [...NAMED_BUCKETS]
const planMembers = [...NAMED_PLAN_MEMBERS]

describe('generateTasks', () => {
  it('produces ~600 tasks including the named cast verbatim', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    expect(tasks.length).toBeGreaterThanOrEqual(580)
    expect(tasks.length).toBeLessThanOrEqual(620)
    for (const named of NAMED_TASKS) {
      expect(tasks).toContainEqual(named)
    }
  })

  it('every bucket_id belongs to the task plan', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    const bucketsByPlan = new Map<string, Set<string>>()
    for (const b of buckets) {
      const set = bucketsByPlan.get(b.plan_id) ?? new Set<string>()
      set.add(b.bucket_id)
      bucketsByPlan.set(b.plan_id, set)
    }
    for (const t of tasks) {
      expect(bucketsByPlan.get(t.plan_id)?.has(t.bucket_id)).toBe(true)
    }
  })

  it('every assignee is a member of the task plan', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    const membersByPlan = new Map<string, Set<string>>()
    for (const m of planMembers) {
      const set = membersByPlan.get(m.plan_id) ?? new Set<string>()
      set.add(m.member_id)
      membersByPlan.set(m.plan_id, set)
    }
    for (const t of tasks) {
      if (t.assignee_ids === '') continue
      for (const a of t.assignee_ids.split(',')) {
        expect(membersByPlan.get(t.plan_id)?.has(a)).toBe(true)
      }
    }
  })

  it('roughly 60% of tasks have empty tags', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    const empty = tasks.filter((t) => t.tags === '')
    const ratio = empty.length / tasks.length
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(0.75)
  })

  it('roughly 20% of tasks have very short titles (≤ 3 words or empty)', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    const shortish = tasks.filter((t) => t.title === '' || t.title.split(/\s+/).length <= 3)
    const ratio = shortish.length / tasks.length
    expect(ratio).toBeGreaterThan(0.15)
    expect(ratio).toBeLessThan(0.3)
  })

  it('priority values are in the 1/3/5/9 set', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    const allowed = new Set([1, 3, 5, 9])
    for (const t of tasks) expect(allowed.has(t.priority)).toBe(true)
  })

  it('status values are valid enum members', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    const allowed = new Set(['todo', 'in progress', 'done'])
    for (const t of tasks) expect(allowed.has(t.status)).toBe(true)
  })

  it('at least 80 todo tasks are clearly infra-scoped', () => {
    const tasks = generateTasks(createRng(42), 600, planIds, buckets, planMembers)
    const infraTodo = tasks.filter(
      (t) =>
        t.status === 'todo' &&
        (t.tags.split(',').includes('infrastructure') ||
          t.title.toLowerCase().includes('infrastructure') ||
          t.description.toLowerCase().includes('aws') ||
          t.description.toLowerCase().includes('kubernetes')),
    )
    expect(infraTodo.length).toBeGreaterThanOrEqual(80)
  })
})
