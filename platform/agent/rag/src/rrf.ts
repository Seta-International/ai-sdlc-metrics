import type { FusedItem, RankedItem } from './types.js'

/**
 * Reciprocal Rank Fusion over per-leg ranked lists.
 *
 * For each leg, walk its list 1-indexed; accumulate
 * `score[id] += 1 / (k + rank)` and record `ranks[id][legIndex] = rank`.
 * Returns items sorted by `rrfScore` descending. Tie-break: stable on the
 * first-appearance order across legs (Map insertion order + stable sort).
 *
 * Pure. Deterministic given identical input + `k`.
 *
 * @param rankings One ranked list per leg, 1-based ordering implicit.
 * @param k Smoothing constant. Default 60 (literature standard).
 *   Smaller `k` widens the score gap between adjacent ranks; larger `k` flattens it.
 */
export function fuseByRRF(rankings: RankedItem[][], k = 60): FusedItem[] {
  const acc = new Map<string, FusedItem>()

  for (let legIndex = 0; legIndex < rankings.length; legIndex++) {
    const leg = rankings[legIndex]
    if (leg === undefined) continue
    for (let i = 0; i < leg.length; i++) {
      const item = leg[i]
      if (item === undefined) continue
      const rank = i + 1
      const { id } = item
      const contribution = 1 / (k + rank)
      const existing = acc.get(id)
      if (existing === undefined) {
        acc.set(id, {
          id,
          rrfScore: contribution,
          ranks: { [legIndex]: rank },
        })
      } else {
        existing.rrfScore += contribution
        existing.ranks[legIndex] = rank
      }
    }
  }

  // Map insertion order preserves first-appearance; Array.prototype.sort is
  // stable in V8, so ties on rrfScore resolve to first-seen order.
  const items = Array.from(acc.values())
  items.sort((a, b) => b.rrfScore - a.rrfScore)
  return items
}
