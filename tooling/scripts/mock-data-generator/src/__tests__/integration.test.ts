import { beforeAll, describe, expect, it } from 'vitest'
import {
  NAMED_BUCKETS,
  NAMED_LEAVES,
  NAMED_PLAN_MEMBERS,
  NAMED_PLANS,
  NAMED_TASKS,
  NAMED_USERS,
} from '../cast.js'
import { generateBuckets } from '../gen-buckets.js'
import { generatePlanMembers } from '../gen-plan-members.js'
import { generatePlans } from '../gen-plans.js'
import { generateTasks } from '../gen-tasks.js'
import { generateTimesheet } from '../gen-timesheet.js'
import { generateUsers } from '../gen-users.js'
import { createRng } from '../rng.js'
import type { Dataset } from '../types.js'

const SEED = 20260520
const TARGET = { users: 300, plans: 50, tasks: 600, leaves: 400 }
const TODAY = '2026-05-20'

function build(): Dataset {
  const rng = createRng(SEED)
  const users = generateUsers(rng, TARGET.users)
  const plans = generatePlans(
    rng,
    TARGET.plans,
    users.map((u) => u.user_id),
  )
  const plan_members = generatePlanMembers(
    rng,
    plans.map((p) => p.plan_id),
    users.map((u) => u.user_id),
  )
  const buckets = generateBuckets(
    rng,
    plans.map((p) => p.plan_id),
  )
  const tasks = generateTasks(
    rng,
    TARGET.tasks,
    plans.map((p) => p.plan_id),
    buckets,
    plan_members,
  )
  const timesheet = generateTimesheet(
    rng,
    TARGET.leaves,
    users.map((u) => u.user_id),
  )
  return { users, plans, plan_members, buckets, tasks, timesheet }
}

let ds: Dataset
beforeAll(() => {
  ds = build()
})

describe('referential integrity', () => {
  it('every plan.owner exists in users', () => {
    const userIds = new Set(ds.users.map((u) => u.user_id))
    for (const p of ds.plans) expect(userIds.has(p.owner)).toBe(true)
  })

  it('every plan_member references existing user and plan', () => {
    const userIds = new Set(ds.users.map((u) => u.user_id))
    const planIds = new Set(ds.plans.map((p) => p.plan_id))
    for (const m of ds.plan_members) {
      expect(userIds.has(m.member_id)).toBe(true)
      expect(planIds.has(m.plan_id)).toBe(true)
    }
  })

  it('every bucket references an existing plan', () => {
    const planIds = new Set(ds.plans.map((p) => p.plan_id))
    for (const b of ds.buckets) expect(planIds.has(b.plan_id)).toBe(true)
  })

  it('every task references a plan, bucket-in-plan, and plan-member assignees', () => {
    const planIds = new Set(ds.plans.map((p) => p.plan_id))
    const bucketsByPlan = new Map<string, Set<string>>()
    for (const b of ds.buckets) {
      const set = bucketsByPlan.get(b.plan_id) ?? new Set<string>()
      set.add(b.bucket_id)
      bucketsByPlan.set(b.plan_id, set)
    }
    const membersByPlan = new Map<string, Set<string>>()
    for (const m of ds.plan_members) {
      const set = membersByPlan.get(m.plan_id) ?? new Set<string>()
      set.add(m.member_id)
      membersByPlan.set(m.plan_id, set)
    }
    for (const t of ds.tasks) {
      expect(planIds.has(t.plan_id)).toBe(true)
      expect(bucketsByPlan.get(t.plan_id)?.has(t.bucket_id)).toBe(true)
      if (t.assignee_ids === '') continue
      for (const a of t.assignee_ids.split(',')) {
        expect(membersByPlan.get(t.plan_id)?.has(a)).toBe(true)
      }
    }
  })

  it('every leave references an existing user', () => {
    const userIds = new Set(ds.users.map((u) => u.user_id))
    for (const l of ds.timesheet) expect(userIds.has(l.employee_id)).toBe(true)
  })
})

describe('named cast survives verbatim', () => {
  it.each(NAMED_USERS)('user $user_id is unchanged', (u) => {
    expect(ds.users).toContainEqual(u)
  })
  it.each(NAMED_PLANS)('plan $plan_id is unchanged', (p) => {
    expect(ds.plans).toContainEqual(p)
  })
  it.each(NAMED_PLAN_MEMBERS)('member ($plan_id, $member_id) is unchanged', (m) => {
    expect(ds.plan_members).toContainEqual(m)
  })
  it.each(NAMED_BUCKETS)('bucket $bucket_id is unchanged', (b) => {
    expect(ds.buckets).toContainEqual(b)
  })
  it.each(NAMED_TASKS)('task $task_id is unchanged', (t) => {
    expect(ds.tasks).toContainEqual(t)
  })
  it.each(NAMED_LEAVES)('leave $leave_id is unchanged', (l) => {
    expect(ds.timesheet).toContainEqual(l)
  })
})

describe('orphan plan p006 has zero members', () => {
  it('plan_members has no rows for p006', () => {
    expect(ds.plan_members.filter((m) => m.plan_id === 'p006')).toHaveLength(0)
  })
})

describe('determinism', () => {
  it('two builds with the same seed are byte-equal', () => {
    const a = build()
    const b = build()
    expect(a).toEqual(b)
  })
})

function daysBetween(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00Z`).getTime()
  const tb = new Date(`${b}T00:00:00Z`).getTime()
  return Math.round((tb - ta) / 86_400_000)
}

describe('volume floors', () => {
  it('at least 30 infra-scoped todo tasks are unassigned', () => {
    const matches = ds.tasks.filter(
      (t) => t.status === 'todo' && t.tags.includes('infrastructure') && t.assignee_ids === '',
    )
    expect(matches.length).toBeGreaterThanOrEqual(30)
  })

  it('at least 30 infra-scoped todo tasks are due within the next 30 days', () => {
    const matches = ds.tasks.filter(
      (t) =>
        t.status === 'todo' &&
        t.tags.includes('infrastructure') &&
        t.due_date !== '' &&
        t.due_date >= TODAY &&
        daysBetween(TODAY, t.due_date) <= 30,
    )
    expect(matches.length).toBeGreaterThanOrEqual(30)
  })
})
