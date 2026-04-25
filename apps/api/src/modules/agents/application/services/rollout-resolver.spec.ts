/**
 * rollout-resolver.spec.ts — Plan 11 §4 — RolloutResolver service
 *
 * Covers:
 *  1. retryContextVersion bypass: returns it immediately, fromCandidate=true if matches candidateVersion
 *  2. retryContextVersion bypass: fromCandidate=false if it matches baselineVersion
 *  3. No active rollout: returns { version: 'baseline', fromCandidate: false, rolloutConfigId: null }
 *  4. Hash routing at 1% threshold: hash=0 (< 1) → candidate; hash=1 (>= 1) → baseline
 *  5. Determinism: 100 consecutive calls with same inputs → same output
 *  6. Stability key — sub_agent_prompt uses tenantId+userId; other classes use tenantId only
 *  7. No active rollout returns a non-empty version string
 *  8. Different rollout_config_ids produce independent hash spaces (same tenant → different assignments)
 *  9. [Property] Monotonicity: increasing trafficPercentage 0→100 yields non-decreasing candidate count
 */

import { describe, it, expect, vi } from 'vitest'
import { RolloutResolver } from './rollout-resolver'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// sha256('cfg-test-58:tenant-test-58') mod 100 = 0  → candidate when pct >= 1
const CONFIG_CANDIDATE_AT_1 = 'cfg-test-58'
const TENANT_CANDIDATE_AT_1 = 'tenant-test-58'

// sha256('cfg-test-17:tenant-test-17') mod 100 = 1  → baseline when pct = 1
const CONFIG_BASELINE_AT_1 = 'cfg-test-17'
const TENANT_BASELINE_AT_1 = 'tenant-test-17'

// sub_agent_prompt stability key fixtures (stability key = tenantId + ':' + userId)
// sha256('cfg-sub-test-1:tenant-sub-1:user-sub-a') mod 100 = 11 → candidate when pct >= 12, baseline when pct <= 11
// sha256('cfg-sub-test-1:tenant-sub-1:user-sub-b') mod 100 = 6  → candidate when pct >= 7,  baseline when pct <= 6
// sha256('cfg-sub-test-1:tenant-sub-1') mod 100 = 8 (tenant-only key, for model class)
// At pct=9: user-a (11 >= 9) → baseline; user-b (6 < 9) → candidate (different assignments)
const CONFIG_SUB = 'cfg-sub-test-1'
const TENANT_SUB = 'tenant-sub-1'
const USER_A = 'user-sub-a'
const USER_B = 'user-sub-b'

// Two configs mapping the same tenant: rollout-config-a → hash 79, rollout-config-b → hash 34
// At pct=50: config-a (79 >= 50) → baseline, config-b (34 < 50) → candidate
const TENANT_SAME = 'tenant-same'
const CONFIG_A_ID = 'rollout-config-a'
const CONFIG_B_ID = 'rollout-config-b'

// ─── Mock DB factory ──────────────────────────────────────────────────────────

/**
 * Builds a DB mock where select().from().where().limit() returns the provided rows array.
 */
function buildDb(rows: Record<string, unknown>[]) {
  const limitMock = vi.fn().mockResolvedValue(rows)
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock })
  const fromMock = vi.fn().mockReturnValue({ where: whereMock })
  const selectMock = vi.fn().mockReturnValue({ from: fromMock })
  return { db: { select: selectMock } as never, whereMock, limitMock }
}

function makeConfig(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'rollout-cfg-uuid-0001',
    tenantId: 'tenant-default',
    changeClass: 'router',
    candidateVersion: 'v2',
    baselineVersion: 'v1',
    trafficPercentage: '50',
    status: 'active',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RolloutResolver', () => {
  // ── Test 1: retryContextVersion bypass — version matches candidateVersion ────

  it('1. retryContextVersion bypass: returns provided version immediately, fromCandidate=true when matches candidateVersion', async () => {
    const config = makeConfig({ id: 'rollout-cfg-uuid-0001', candidateVersion: 'v2' })
    const { db } = buildDb([config])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'router',
      tenantId: 'tenant-default',
      retryContextVersion: 'v2',
    })

    expect(result.version).toBe('v2')
    expect(result.fromCandidate).toBe(true)
    expect(result.rolloutConfigId).toBe('rollout-cfg-uuid-0001')
  })

  // ── Test 2: retryContextVersion bypass — version matches baselineVersion ─────

  it('2. retryContextVersion bypass: fromCandidate=false when version matches baselineVersion', async () => {
    const config = makeConfig({
      id: 'rollout-cfg-uuid-0001',
      candidateVersion: 'v2',
      baselineVersion: 'v1',
    })
    const { db } = buildDb([config])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'router',
      tenantId: 'tenant-default',
      retryContextVersion: 'v1',
    })

    expect(result.version).toBe('v1')
    expect(result.fromCandidate).toBe(false)
    expect(result.rolloutConfigId).toBe('rollout-cfg-uuid-0001')
  })

  // ── Test 3: No active rollout → safe fallback ─────────────────────────────

  it('3. No active rollout: returns baseline fallback with rolloutConfigId=null', async () => {
    const { db } = buildDb([])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'model',
      tenantId: 'tenant-no-rollout',
    })

    expect(result).toEqual({
      version: 'baseline',
      fromCandidate: false,
      rolloutConfigId: null,
    })
  })

  // ── Test 4a: Hash routing — hash=0 at 1% → routes to candidate ───────────

  it('4a. Hash routing: hash=0 (< trafficPercentage=1) → candidate', async () => {
    // sha256('cfg-test-58:tenant-test-58') mod 100 = 0 → 0 < 1 → candidate
    const config = makeConfig({
      id: CONFIG_CANDIDATE_AT_1,
      tenantId: TENANT_CANDIDATE_AT_1,
      changeClass: 'router',
      candidateVersion: 'v2',
      baselineVersion: 'v1',
      trafficPercentage: '1',
    })
    const { db } = buildDb([config])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'router',
      tenantId: TENANT_CANDIDATE_AT_1,
    })

    expect(result.fromCandidate).toBe(true)
    expect(result.version).toBe('v2')
    expect(result.rolloutConfigId).toBe(CONFIG_CANDIDATE_AT_1)
  })

  // ── Test 4b: Hash routing — hash=1 at 1% → routes to baseline ────────────

  it('4b. Hash routing: hash=1 (>= trafficPercentage=1) → baseline', async () => {
    // sha256('cfg-test-17:tenant-test-17') mod 100 = 1 → 1 >= 1 → baseline
    const config = makeConfig({
      id: CONFIG_BASELINE_AT_1,
      tenantId: TENANT_BASELINE_AT_1,
      changeClass: 'router',
      candidateVersion: 'v2',
      baselineVersion: 'v1',
      trafficPercentage: '1',
    })
    const { db } = buildDb([config])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'router',
      tenantId: TENANT_BASELINE_AT_1,
    })

    expect(result.fromCandidate).toBe(false)
    expect(result.version).toBe('v1')
    expect(result.rolloutConfigId).toBe(CONFIG_BASELINE_AT_1)
  })

  // ── Test 5: Determinism — 100 consecutive calls → same result ────────────

  it('5. Determinism: 100 consecutive calls with same inputs produce same output', async () => {
    const config = makeConfig({
      id: 'cfg-determinism-1',
      tenantId: 'tenant-determinism-1',
      trafficPercentage: '50',
    })

    const results: boolean[] = []
    for (let i = 0; i < 100; i++) {
      const { db } = buildDb([config])
      const resolver = new RolloutResolver(db)
      const r = await resolver.resolveVersion({
        changeClass: 'router',
        tenantId: 'tenant-determinism-1',
      })
      results.push(r.fromCandidate)
    }

    const first = results[0]
    expect(results.every((v) => v === first)).toBe(true)
  })

  // ── Test 6a: Stability key — sub_agent_prompt uses tenantId+userId ────────

  it('6a. sub_agent_prompt stability key: different userId → different assignment (user-b gets candidate at pct=9)', async () => {
    // sha256('cfg-sub-test-1:tenant-sub-1:user-sub-b') mod 100 = 6 → 6 < 9 → candidate
    const config = makeConfig({
      id: CONFIG_SUB,
      tenantId: TENANT_SUB,
      changeClass: 'sub_agent_prompt',
      candidateVersion: 'v-cand',
      baselineVersion: 'v-base',
      trafficPercentage: '9',
    })
    const { db } = buildDb([config])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'sub_agent_prompt',
      tenantId: TENANT_SUB,
      userId: USER_B,
    })

    expect(result.fromCandidate).toBe(true)
    expect(result.version).toBe('v-cand')
  })

  it('6b. sub_agent_prompt stability key: different userId → different assignment (user-a gets baseline at pct=9)', async () => {
    // sha256('cfg-sub-test-1:tenant-sub-1:user-sub-a') mod 100 = 11 → 11 >= 9 → baseline
    const config = makeConfig({
      id: CONFIG_SUB,
      tenantId: TENANT_SUB,
      changeClass: 'sub_agent_prompt',
      candidateVersion: 'v-cand',
      baselineVersion: 'v-base',
      trafficPercentage: '9',
    })
    const { db } = buildDb([config])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'sub_agent_prompt',
      tenantId: TENANT_SUB,
      userId: USER_A,
    })

    expect(result.fromCandidate).toBe(false)
    expect(result.version).toBe('v-base')
  })

  it('6c. model class uses tenantId only as stability key (ignores userId)', async () => {
    // sha256('cfg-sub-test-1:tenant-sub-1') mod 100 = 8 → at pct=10 → candidate
    // sha256('cfg-sub-test-1:tenant-sub-1:user-sub-a') mod 100 = 11 → different key, but model class ignores userId
    // The key test: passing different userIds to a non-sub_agent_prompt class yields same result
    const config = makeConfig({
      id: CONFIG_SUB,
      tenantId: TENANT_SUB,
      changeClass: 'model',
      candidateVersion: 'v-m-cand',
      baselineVersion: 'v-m-base',
      trafficPercentage: '10', // hash=8 < 10 → candidate
    })

    // Call with userId USER_A
    const { db: db1 } = buildDb([config])
    const r1 = await new RolloutResolver(db1).resolveVersion({
      changeClass: 'model',
      tenantId: TENANT_SUB,
      userId: USER_A,
    })

    // Call with userId USER_B — model class should ignore userId, use same tenant key
    const { db: db2 } = buildDb([config])
    const r2 = await new RolloutResolver(db2).resolveVersion({
      changeClass: 'model',
      tenantId: TENANT_SUB,
      userId: USER_B,
    })

    // Both should get identical assignments because stability key = tenantId only
    expect(r1.fromCandidate).toBe(r2.fromCandidate)
    expect(r1.version).toBe(r2.version)
    // And the tenant-only hash (8 < 10) → candidate
    expect(r1.fromCandidate).toBe(true)
  })

  // ── Test 6d: Missing userId for sub_agent_prompt throws ──────────────────

  it('6d. throws when sub_agent_prompt called without userId', async () => {
    const config = makeConfig({
      id: CONFIG_SUB,
      tenantId: TENANT_SUB,
      changeClass: 'sub_agent_prompt',
      candidateVersion: 'v-cand',
      baselineVersion: 'v-base',
      trafficPercentage: '50',
    })
    const { db } = buildDb([config])
    const resolver = new RolloutResolver(db)

    await expect(
      resolver.resolveVersion({ changeClass: 'sub_agent_prompt', tenantId: TENANT_SUB }),
    ).rejects.toThrow('userId is required')
  })

  // ── Test 7: No active rollout returns a non-empty version string ──────────

  it('7. No active rollout: returned version is a non-empty string', async () => {
    const { db } = buildDb([])
    const resolver = new RolloutResolver(db)

    const result = await resolver.resolveVersion({
      changeClass: 'planner',
      tenantId: 'tenant-xyz',
    })

    expect(typeof result.version).toBe('string')
    expect(result.version.length).toBeGreaterThan(0)
  })

  // ── Test 8: Different config IDs produce independent hash spaces ──────────

  it('8. Different rollout_config_ids produce independent hash spaces for same tenant', async () => {
    // sha256('rollout-config-a:tenant-same') mod 100 = 79 → at pct=50: 79 >= 50 → baseline
    // sha256('rollout-config-b:tenant-same') mod 100 = 34 → at pct=50: 34 < 50 → candidate
    const configA = makeConfig({
      id: CONFIG_A_ID,
      tenantId: TENANT_SAME,
      changeClass: 'router',
      candidateVersion: 'v2',
      baselineVersion: 'v1',
      trafficPercentage: '50',
    })
    const configB = makeConfig({
      id: CONFIG_B_ID,
      tenantId: TENANT_SAME,
      changeClass: 'router',
      candidateVersion: 'v2',
      baselineVersion: 'v1',
      trafficPercentage: '50',
    })

    const { db: dbA } = buildDb([configA])
    const resultA = await new RolloutResolver(dbA).resolveVersion({
      changeClass: 'router',
      tenantId: TENANT_SAME,
    })

    const { db: dbB } = buildDb([configB])
    const resultB = await new RolloutResolver(dbB).resolveVersion({
      changeClass: 'router',
      tenantId: TENANT_SAME,
    })

    // config-a hash=79 → baseline; config-b hash=34 → candidate
    expect(resultA.fromCandidate).toBe(false)
    expect(resultB.fromCandidate).toBe(true)
    expect(resultA.rolloutConfigId).toBe(CONFIG_A_ID)
    expect(resultB.rolloutConfigId).toBe(CONFIG_B_ID)
  })

  // ── Test 9: Property — Monotonicity ──────────────────────────────────────

  it('9. [Property] Monotonicity: increasing trafficPercentage yields non-decreasing candidate count across 50 tenants', async () => {
    const configId = 'mono-config-1'
    const pcts = [0, 1, 5, 25, 50, 75, 100]
    const tenants = Array.from({ length: 50 }, (_, i) => `mono-tenant-${i}`)

    const candidateCounts: number[] = []

    for (const pct of pcts) {
      let count = 0
      for (const tenantId of tenants) {
        const config = makeConfig({
          id: configId,
          tenantId,
          changeClass: 'router',
          trafficPercentage: String(pct),
        })
        const { db } = buildDb([config])
        const result = await new RolloutResolver(db).resolveVersion({
          changeClass: 'router',
          tenantId,
        })
        if (result.fromCandidate) count++
      }
      candidateCounts.push(count)
    }

    // Verify monotonicity: each count is >= previous count
    for (let i = 1; i < candidateCounts.length; i++) {
      expect(candidateCounts[i]).toBeGreaterThanOrEqual(candidateCounts[i - 1])
    }

    // Sanity: pct=0 yields 0 candidates; pct=100 yields 50 candidates
    expect(candidateCounts[0]).toBe(0)
    expect(candidateCounts[candidateCounts.length - 1]).toBe(50)
  })
})
