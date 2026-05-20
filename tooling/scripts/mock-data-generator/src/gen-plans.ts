import { NAMED_PLANS } from './cast.js'
import {
  PLAN_TAGS_DATA,
  PLAN_TAGS_INFRA,
  PLAN_TAGS_PRODUCT,
  PLAN_TITLE_TEMPLATES,
  QUARTERS,
  TEAMS,
} from './pools.js'
import type { Rng } from './rng.js'
import type { Plan } from './types.js'

const NAMED_IDS = new Set(NAMED_PLANS.map((p) => p.plan_id))
const HIGHEST_NAMED_NUM = Math.max(
  ...NAMED_PLANS.map((p) => Number.parseInt(p.plan_id.slice(1), 10)),
)

function makeId(num: number): string {
  return `p${String(num).padStart(3, '0')}`
}

function fillTitle(rng: Rng, template: string): string {
  return template
    .replaceAll('{quarter}', rng.pick(QUARTERS))
    .replaceAll('{year}', '2026')
    .replaceAll('{team}', rng.pick(TEAMS))
}

function makeTagsForTitle(rng: Rng, title: string): string {
  const lower = title.toLowerCase()
  let pool: readonly string[]
  if (lower.includes('infrastructure') || lower.includes('cloud') || lower.includes('devops')) {
    pool = PLAN_TAGS_INFRA
  } else if (lower.includes('ai') || lower.includes('data')) {
    pool = PLAN_TAGS_DATA
  } else {
    pool = PLAN_TAGS_PRODUCT
  }
  const count = rng.intRange(2, 3)
  return rng.sample(pool, Math.min(count, pool.length)).join(',')
}

export function generatePlans(rng: Rng, total: number, userIds: readonly string[]): Plan[] {
  const plans: Plan[] = [...NAMED_PLANS]
  let nextNum = HIGHEST_NAMED_NUM + 1
  let infraCount = plans.filter((p) => p.tags.includes('infrastructure')).length

  while (plans.length < total) {
    const id = makeId(nextNum++)
    if (NAMED_IDS.has(id)) continue

    let title: string
    if (infraCount < 3) {
      title = fillTitle(rng, 'Infrastructure Review {quarter} {year}')
      infraCount++
    } else {
      title = fillTitle(rng, rng.pick(PLAN_TITLE_TEMPLATES))
    }

    const description = rng.chance(0.3) ? '' : `Plan summary for ${title.toLowerCase()}.`
    const tags = rng.chance(0.4) ? '' : makeTagsForTitle(rng, title)
    const owner = rng.pick(userIds)

    plans.push({ plan_id: id, title, description, tags, owner })
  }

  return plans
}
