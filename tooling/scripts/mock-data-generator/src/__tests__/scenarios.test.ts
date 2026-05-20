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

describe('Scenario 1 — strong infra match with availability filter (full dataset)', () => {
  it('produces [u005] only', () => {
    const result = suggestForTask(ds, 't001', ['AWS', 'Linux', 'Monitoring', 'Security'])
    expect(result.map((r) => r.user_id)).toEqual(['u005'])
  })
})

describe('Scenario 2 — already-assigned + empty result', () => {
  it('without alias normalization, list is empty', () => {
    const result = suggestForTask(ds, 't002', ['Kubernetes', 'Security'])
    expect(result.map((r) => r.user_id)).toEqual([])
  })

  it('with alias normalization, u015 becomes the sole candidate (E22 cross-check)', () => {
    const result = suggestForTask(ds, 't002', ['Kubernetes', 'Security'], {
      normalizeAliases: true,
    })
    expect(result.map((r) => r.user_id)).toEqual(['u015'])
  })
})

describe('Scenario 3 — no due_date → today-only availability', () => {
  it('u001 is filtered out by today-only leave (lv004)', () => {
    const result = suggestForTask(ds, 't003', ['AWS', 'Linux'])
    expect(result.map((r) => r.user_id)).not.toContain('u001')
  })
})

describe('Scenario 4 — non-member must NOT be suggested', () => {
  it('u008 never appears for any p001 task', () => {
    const result = suggestForTask(ds, 't001', ['AWS', 'Kubernetes', 'Terraform', 'Security'])
    expect(result.map((r) => r.user_id)).not.toContain('u008')
  })
})

describe('Scenario 5 — todo + infra filter input list', () => {
  it('t001/t002/t003 are in the in-scope list', () => {
    const inScope = ds.tasks
      .filter(
        (t) =>
          t.status === 'todo' &&
          (t.tags.includes('infrastructure') || t.description.toLowerCase().includes('aws')),
      )
      .map((t) => t.task_id)
    expect(inScope).toContain('t001')
    expect(inScope).toContain('t002')
    expect(inScope).toContain('t003')
  })

  it('t004 (done), t005 (in progress), t006 (frontend) are NOT in the in-scope list', () => {
    const inScope = ds.tasks
      .filter(
        (t) =>
          t.status === 'todo' &&
          (t.tags.includes('infrastructure') || t.description.toLowerCase().includes('aws')),
      )
      .map((t) => t.task_id)
    expect(inScope).not.toContain('t004')
    expect(inScope).not.toContain('t005')
    expect(inScope).not.toContain('t006')
  })
})
