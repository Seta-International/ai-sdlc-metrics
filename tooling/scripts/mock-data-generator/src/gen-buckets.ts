import { NAMED_BUCKETS } from './cast.js'
import type { Rng } from './rng.js'
import type { Bucket } from './types.js'

const HIGHEST_NAMED_NUM = Math.max(
  ...NAMED_BUCKETS.map((b) => Number.parseInt(b.bucket_id.slice(1), 10)),
)

const NAMED_BUCKETS_BY_PLAN = new Map<string, Bucket[]>()
for (const b of NAMED_BUCKETS) {
  const list = NAMED_BUCKETS_BY_PLAN.get(b.plan_id) ?? []
  list.push(b)
  NAMED_BUCKETS_BY_PLAN.set(b.plan_id, list)
}

const BUCKET_NAME_SETS: readonly (readonly string[])[] = [
  ['To Do', 'In Progress', 'Done'],
  ['To Do', 'In Progress', 'In Review', 'Done'],
  ['Backlog', 'Sprint 1', 'Sprint 2', 'Done'],
  ['To Do', 'In Progress', 'Blocked', 'Done'],
]

const DEFAULT_FILL_NAMES = ['To Do', 'In Progress', 'Done']

function makeId(num: number): string {
  return `b${String(num).padStart(3, '0')}`
}

export function generateBuckets(rng: Rng, planIds: readonly string[]): Bucket[] {
  const buckets: Bucket[] = [...NAMED_BUCKETS]
  let nextNum = HIGHEST_NAMED_NUM + 1
  const target = 3

  for (const planId of planIds) {
    const existing = NAMED_BUCKETS_BY_PLAN.get(planId)
    if (existing) {
      const haveNames = new Set(existing.map((b) => b.name))
      const candidates = DEFAULT_FILL_NAMES.filter((n) => !haveNames.has(n))
      let count = existing.length
      for (const name of candidates) {
        if (count >= target) break
        buckets.push({ bucket_id: makeId(nextNum++), plan_id: planId, name })
        count++
      }
      continue
    }
    const set = rng.pick(BUCKET_NAME_SETS)
    for (const name of set) {
      buckets.push({ bucket_id: makeId(nextNum++), plan_id: planId, name })
    }
  }

  return buckets
}
