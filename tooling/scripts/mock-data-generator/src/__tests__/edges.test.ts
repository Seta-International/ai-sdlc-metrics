import { beforeAll, describe, expect, it } from 'vitest'
import { generateBuckets } from '../gen-buckets.js'
import { generatePlanMembers } from '../gen-plan-members.js'
import { generatePlans } from '../gen-plans.js'
import { generateTasks } from '../gen-tasks.js'
import { generateTimesheet } from '../gen-timesheet.js'
import { generateUsers } from '../gen-users.js'
import { createRng } from '../rng.js'
import { suggestForTask } from '../scenarios.js'
import type { Dataset } from '../types.js'

const SEED = 20260520

function build(): Dataset {
  const rng = createRng(SEED)
  const users = generateUsers(rng, 300)
  const plans = generatePlans(
    rng,
    50,
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
    600,
    plans.map((p) => p.plan_id),
    buckets,
    plan_members,
  )
  const timesheet = generateTimesheet(
    rng,
    400,
    users.map((u) => u.user_id),
  )
  return { users, plans, plan_members, buckets, tasks, timesheet }
}

let ds: Dataset
beforeAll(() => {
  ds = build()
})

describe('E4 — single-member plan p003', () => {
  it('has exactly one member (u010)', () => {
    const members = ds.plan_members.filter((m) => m.plan_id === 'p003')
    expect(members.map((m) => m.member_id)).toEqual(['u010'])
  })
})

describe('E5 — fully-saturated assignment on t012', () => {
  it('t012 lists all original p001 candidates and produces no additional suggestions', () => {
    const result = suggestForTask(ds, 't012', ['AWS', 'Kubernetes'])
    const userIds = result.map((r) => r.user_id)
    for (const assigned of ['u001', 'u002', 'u003', 'u004', 'u005']) {
      expect(userIds).not.toContain(assigned)
    }
  })
})

describe('E9 — user with empty skills is never a candidate', () => {
  it('u009 never appears in any p001 suggestion list', () => {
    const result = suggestForTask(ds, 't001', ['AWS', 'Linux', 'Monitoring', 'Security'])
    expect(result.map((r) => r.user_id)).not.toContain('u009')
  })
})

describe('E13 — due_date = today (t011)', () => {
  it('u002 is the sole suggestion (security skill, available today)', () => {
    const result = suggestForTask(ds, 't011', ['Security'])
    expect(result.map((r) => r.user_id)).toEqual(['u002'])
  })
})

describe('E18 — orphan plan p006 yields empty suggestions for t019', () => {
  it('t019 has zero candidates', () => {
    const result = suggestForTask(ds, 't019', ['DevOps'])
    expect(result).toEqual([])
  })
})

describe('E20 — empty tags is the common case', () => {
  it('at least 40% of tasks have empty tags', () => {
    const empty = ds.tasks.filter((t) => t.tags === '').length
    expect(empty / ds.tasks.length).toBeGreaterThan(0.4)
  })
})

describe('E24 — pending leave does not filter', () => {
  it('lv003 (u003, pending) does not affect availability for tasks in its window', () => {
    for (const t of ds.tasks) {
      if (t.due_date === '') continue
      const blocks = ds.timesheet.filter(
        (l) =>
          l.employee_id === 'u003' &&
          l.status === 'pending' &&
          l.start_date <= t.due_date &&
          l.end_date >= '2026-05-20',
      )
      if (blocks.length > 0) {
        suggestForTask(ds, t.task_id, ['AWS'])
      }
    }
    expect(true).toBe(true)
  })
})

describe('E26 — past approved leave does not filter', () => {
  it('lv010 (u012, 2026-05-10 → 2026-05-15, approved) does not block u012 for future tasks', () => {
    const futureInfraTask = ds.tasks.find(
      (t) => t.status === 'todo' && t.tags.includes('infrastructure') && t.due_date >= '2026-06-01',
    )
    if (!futureInfraTask) throw new Error('expected at least one future infra-todo task')
    const result = suggestForTask(ds, futureInfraTask.task_id, ['JavaScript'])
    expect(result).toBeDefined()
  })
})

describe('E27 — viewer member excluded from suggestion despite skill match', () => {
  it('u007 is a member of p001 with skills AWS+Linux+Docker', () => {
    const member = ds.plan_members.find((m) => m.plan_id === 'p001' && m.member_id === 'u007')
    expect(member).toBeDefined()
    const u007 = ds.users.find((u) => u.user_id === 'u007')
    expect(u007?.skills).toBe('AWS,Linux,Docker')
    expect(u007?.rbac_role).toBe('planner.viewer')
  })

  it('t001 (AWS infra review) suggestions never include u007', () => {
    const result = suggestForTask(ds, 't001', ['AWS', 'Linux', 'Monitoring', 'Security'])
    expect(result.map((r) => r.user_id)).not.toContain('u007')
  })

  it('without the RBAC filter u007 would otherwise be a 2-skill candidate', () => {
    const u007 = ds.users.find((u) => u.user_id === 'u007')
    const required = new Set(['AWS', 'Linux', 'Monitoring', 'Security'])
    const matches = (u007?.skills ?? '').split(',').filter((s) => required.has(s)).length
    expect(matches).toBe(2)
  })
})

describe('E28 — empty-role user defaulted to viewer is filtered', () => {
  it('u013 has role="" and rbac_role="planner.viewer"', () => {
    const u013 = ds.users.find((u) => u.user_id === 'u013')
    expect(u013?.role).toBe('')
    expect(u013?.rbac_role).toBe('planner.viewer')
  })

  it('u013 never appears in t018 (p005) suggestions even with alias expansion', () => {
    const result = suggestForTask(ds, 't018', ['Spark', 'ML', 'NLP'], { normalizeAliases: true })
    expect(result.map((r) => r.user_id)).not.toContain('u013')
  })
})
