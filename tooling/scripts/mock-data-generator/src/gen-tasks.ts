import { NAMED_TASKS } from './cast.js'
import {
  DESCRIPTION_SKILL_HINTS,
  TASK_DESCRIPTION_TEMPLATES,
  TASK_TAGS_INFRA,
  TASK_TAGS_NON_INFRA,
  TASK_TITLES_LONG,
  TASK_TITLES_MEDIUM,
  TASK_TITLES_SHORT,
  TITLE_SLOTS,
} from './pools.js'
import type { Rng } from './rng.js'
import type { Bucket, PlanMember, Task } from './types.js'

const NAMED_IDS = new Set(NAMED_TASKS.map((t) => t.task_id))
const HIGHEST_NAMED_NUM = Math.max(
  ...NAMED_TASKS.map((t) => Number.parseInt(t.task_id.slice(1), 10)),
)
const PRIORITIES: readonly Task['priority'][] = [1, 3, 5, 9]
const STATUSES: readonly Task['status'][] = ['todo', 'in progress', 'done']

function makeId(num: number): string {
  return `t${String(num).padStart(3, '0')}`
}

function fillSlots(rng: Rng, template: string): string {
  return template.replaceAll(/\{(\w+)\}/g, (_, key: string) => {
    const slot = TITLE_SLOTS[key as keyof typeof TITLE_SLOTS]
    return slot ? rng.pick(slot) : `{${key}}`
  })
}

function makeTitle(rng: Rng): string {
  const roll = rng.next()
  if (roll < 0.2) return rng.pick(TASK_TITLES_SHORT)
  if (roll < 0.9) return fillSlots(rng, rng.pick(TASK_TITLES_MEDIUM))
  return rng.pick(TASK_TITLES_LONG)
}

function makeTags(rng: Rng, scope: 'infra' | 'non-infra'): string {
  if (rng.chance(0.6)) return ''
  const pool = scope === 'infra' ? TASK_TAGS_INFRA : TASK_TAGS_NON_INFRA
  const count = rng.intRange(1, 3)
  return rng.sample(pool, Math.min(count, pool.length)).join(',')
}

function makeDescription(rng: Rng, scope: keyof typeof DESCRIPTION_SKILL_HINTS): string {
  const template = rng.pick(TASK_DESCRIPTION_TEMPLATES)
  const skill = rng.pick(DESCRIPTION_SKILL_HINTS[scope])
  const team = rng.pick(['ML', 'data', 'backend', 'platform'])
  return template.replaceAll('{skills}', skill).replaceAll('{team}', team)
}

function daysFromAnchor(rng: Rng, lo: number, hi: number): Date {
  const anchor = new Date('2026-05-20T00:00:00Z')
  const offset = rng.intRange(lo, hi)
  return new Date(anchor.getTime() + offset * 86_400_000)
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pickDueDate(rng: Rng): string {
  const roll = rng.next()
  if (roll < 0.1) return ''
  if (roll < 0.2) return formatDate(daysFromAnchor(rng, -120, -1))
  if (roll < 0.7) return formatDate(daysFromAnchor(rng, 0, 30))
  return formatDate(daysFromAnchor(rng, 31, 120))
}

export function generateTasks(
  rng: Rng,
  total: number,
  planIds: readonly string[],
  buckets: readonly Bucket[],
  planMembers: readonly PlanMember[],
): Task[] {
  const bucketsByPlan = new Map<string, Bucket[]>()
  for (const b of buckets) {
    const list = bucketsByPlan.get(b.plan_id) ?? []
    list.push(b)
    bucketsByPlan.set(b.plan_id, list)
  }
  const membersByPlan = new Map<string, string[]>()
  for (const m of planMembers) {
    const list = membersByPlan.get(m.plan_id) ?? []
    list.push(m.member_id)
    membersByPlan.set(m.plan_id, list)
  }

  const tasks: Task[] = [...NAMED_TASKS]
  let nextNum = HIGHEST_NAMED_NUM + 1
  let infraTodoCount = tasks.filter(
    (t) => t.status === 'todo' && t.tags.includes('infrastructure'),
  ).length
  const INFRA_TODO_FLOOR = 80

  const plansWithBuckets = planIds.filter((id) => (bucketsByPlan.get(id)?.length ?? 0) > 0)
  if (plansWithBuckets.length === 0) return tasks

  while (tasks.length < total) {
    const id = makeId(nextNum++)
    if (NAMED_IDS.has(id)) continue
    const planId = rng.pick(plansWithBuckets)
    const planBuckets = bucketsByPlan.get(planId)!
    const bucketId = rng.pick(planBuckets).bucket_id
    const planMemberIds = membersByPlan.get(planId) ?? []

    const forceInfra = infraTodoCount < INFRA_TODO_FLOOR
    const scope: 'infra' | 'non-infra' = forceInfra || rng.chance(0.35) ? 'infra' : 'non-infra'

    const title = makeTitle(rng)
    const description = makeDescription(
      rng,
      scope === 'infra'
        ? 'infra'
        : (rng.pick(['data', 'frontend', 'backend']) as keyof typeof DESCRIPTION_SKILL_HINTS),
    )
    const status: Task['status'] = forceInfra ? 'todo' : rng.pick(STATUSES)
    const priority = rng.pick(PRIORITIES)
    const due_date = pickDueDate(rng)
    const tags =
      scope === 'infra'
        ? rng.chance(0.4)
          ? ''
          : `infrastructure,${rng.sample(TASK_TAGS_INFRA, rng.intRange(1, 2)).join(',')}`
        : makeTags(rng, 'non-infra')

    let assignee_ids = ''
    if (planMemberIds.length > 0 && rng.chance(0.5)) {
      const count = Math.min(rng.intRange(1, 3), planMemberIds.length)
      assignee_ids = rng.sample(planMemberIds, count).join(',')
    }

    tasks.push({
      task_id: id,
      plan_id: planId,
      bucket_id: bucketId,
      assignee_ids,
      title,
      description,
      status,
      priority,
      due_date,
      tags,
      checklist: [],
      comments: [],
      attachments: [],
    })

    if (status === 'todo' && tags.includes('infrastructure')) infraTodoCount++
  }

  return tasks
}
