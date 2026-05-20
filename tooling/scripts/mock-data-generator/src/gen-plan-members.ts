import { NAMED_PLAN_MEMBERS } from './cast.js'
import type { Rng } from './rng.js'
import type { PlanMember } from './types.js'

const ORPHAN_PLAN_IDS = new Set(['p006'])
const NAMED_PLAN_IDS = new Set(NAMED_PLAN_MEMBERS.map((m) => m.plan_id))

export function generatePlanMembers(
  rng: Rng,
  planIds: readonly string[],
  userIds: readonly string[],
): PlanMember[] {
  const members: PlanMember[] = [...NAMED_PLAN_MEMBERS]
  const seen = new Set(members.map((m) => `${m.plan_id}:${m.member_id}`))

  for (const planId of planIds) {
    if (ORPHAN_PLAN_IDS.has(planId)) continue
    if (NAMED_PLAN_IDS.has(planId)) continue
    const size = rng.intRange(25, 50)
    const sample = rng.sample(userIds, Math.min(size, userIds.length))
    for (const memberId of sample) {
      const key = `${planId}:${memberId}`
      if (seen.has(key)) continue
      seen.add(key)
      members.push({ plan_id: planId, member_id: memberId })
    }
  }

  return members
}
