import { describe, expect, it } from 'vitest'
import { NAMED_BUCKETS, NAMED_PLANS } from '../cast.js'
import { generateBuckets } from '../gen-buckets.js'
import { createRng } from '../rng.js'

describe('generateBuckets', () => {
  const planIds = NAMED_PLANS.map((p) => p.plan_id).concat(
    Array.from({ length: 44 }, (_, i) => `p${String(7 + i).padStart(3, '0')}`),
  )

  it('contains the named buckets verbatim', () => {
    const buckets = generateBuckets(createRng(42), planIds)
    for (const named of NAMED_BUCKETS) {
      expect(buckets).toContainEqual(named)
    }
  })

  it('every plan has 3 or 4 buckets', () => {
    const buckets = generateBuckets(createRng(42), planIds)
    for (const planId of planIds) {
      const count = buckets.filter((b) => b.plan_id === planId).length
      expect(count).toBeGreaterThanOrEqual(3)
      expect(count).toBeLessThanOrEqual(4)
    }
  })

  it('bucket_ids are unique', () => {
    const buckets = generateBuckets(createRng(42), planIds)
    const ids = buckets.map((b) => b.bucket_id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every bucket has a plan_id from the input list', () => {
    const buckets = generateBuckets(createRng(42), planIds)
    const planSet = new Set(planIds)
    for (const b of buckets) {
      expect(planSet.has(b.plan_id)).toBe(true)
    }
  })
})
