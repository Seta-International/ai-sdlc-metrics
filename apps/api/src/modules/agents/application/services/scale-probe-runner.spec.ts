/**
 * scale-probe-runner.spec.ts — Plan 13 Task 7
 *
 * Unit tests for ScaleProbeRunner.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScaleProbeRunner } from './scale-probe-runner'
import type {
  ReadinessCheckRepository,
  ReadinessCheckEntity,
} from '../../domain/repositories/readiness-check.repository'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRepo(): ReadinessCheckRepository {
  const base: ReadinessCheckEntity = {
    id: 'fake-id',
    criterionId: '',
    windowStart: new Date(),
    windowEnd: new Date(),
    observedValue: '',
    threshold: '',
    passed: false,
    notes: null,
    computedAt: new Date(),
  }
  return {
    insert: vi.fn().mockResolvedValue(base),
    findLatestByCriterion: vi.fn().mockResolvedValue(null),
    findByCriterionSince: vi.fn().mockResolvedValue([]),
    findAllLatest: vi.fn().mockResolvedValue([]),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ScaleProbeRunner', () => {
  let repo: ReadinessCheckRepository
  let runner: ScaleProbeRunner

  beforeEach(() => {
    repo = makeRepo()
    runner = new ScaleProbeRunner(repo)
  })

  it('returns syntheticModuleCount=12 and toolsPerSubAgent=20', async () => {
    const result = await runner.run()
    expect(result.syntheticModuleCount).toBe(12)
    expect(result.toolsPerSubAgent).toBe(20)
  })

  it('EI-4: observed=1.0, passed=true', async () => {
    const result = await runner.run()
    const ei4 = result.perInvariant.find((r) => r.invariantId === 'EI-4')
    expect(ei4).toBeDefined()
    expect(ei4!.observed).toBe(1.0)
    expect(ei4!.passed).toBe(true)
    expect(ei4!.threshold).toBe(0.95)
  })

  it('EI-5: observed=1.0, passed=true', async () => {
    const result = await runner.run()
    const ei5 = result.perInvariant.find((r) => r.invariantId === 'EI-5')
    expect(ei5).toBeDefined()
    expect(ei5!.observed).toBe(1.0)
    expect(ei5!.passed).toBe(true)
    expect(ei5!.threshold).toBe(0.95)
  })

  it('EI-6: estimated tokens within budget, passed=true', async () => {
    const result = await runner.run()
    const ei6 = result.perInvariant.find((r) => r.invariantId === 'EI-6')
    expect(ei6).toBeDefined()
    // 12 × 20 × 30 + 500 = 7700
    expect(ei6!.observed).toBe(7700)
    expect(ei6!.threshold).toBe(8000)
    expect(ei6!.passed).toBe(true)
  })

  it('allPassed=true when all invariants pass', async () => {
    const result = await runner.run()
    expect(result.allPassed).toBe(true)
  })

  it('persists exactly 3 rows to the readiness repository', async () => {
    await runner.run()
    expect(repo.insert).toHaveBeenCalledTimes(3)
  })

  it('persists EI-4 row with correct criterionId', async () => {
    await runner.run()
    const calls = vi.mocked(repo.insert).mock.calls
    const criterionIds = calls.map((c) => c[0].criterionId)
    expect(criterionIds).toContain('18.5.scale_probe.EI-4')
    expect(criterionIds).toContain('18.5.scale_probe.EI-5')
    expect(criterionIds).toContain('18.5.scale_probe.EI-6')
  })

  it('persists EI-4 row with passed=true', async () => {
    await runner.run()
    const calls = vi.mocked(repo.insert).mock.calls
    const ei4Call = calls.find((c) => c[0].criterionId === '18.5.scale_probe.EI-4')
    expect(ei4Call).toBeDefined()
    expect(ei4Call![0].passed).toBe(true)
  })

  it('perInvariant contains exactly 3 entries', async () => {
    const result = await runner.run()
    expect(result.perInvariant).toHaveLength(3)
  })

  it('ranAt is a Date', async () => {
    const result = await runner.run()
    expect(result.ranAt).toBeInstanceOf(Date)
  })

  it('EI-6: perInvariant[2] passed=true when estimated tokens are within budget ceiling', async () => {
    // 12 × 20 × 30 + 500 = 7700, which is below the 8000 ceiling.
    const result = await runner.run()
    const ei6 = result.perInvariant.find((r) => r.invariantId === 'EI-6')
    expect(ei6).toBeDefined()
    expect(ei6!.passed).toBe(true)
    // TODO: add failure-path test when EI-6 budget is exceeded (requires injecting ROUTER_PROMPT_BUDGET_TOKENS)
  })

  it('allPassed=false when any invariant fails (simulated via threshold spike)', async () => {
    // Force EI-4 to fail by patching CRITERION_THRESHOLDS at module scope.
    // We spy on the module to inject a threshold higher than 1.0 (impossible to meet).
    const { CRITERION_THRESHOLDS } = await import('./criterion-evaluators/criterion-thresholds')
    // Save full original entry so any future change to description doesn't cause stale restoration.
    const original = { ...CRITERION_THRESHOLDS['18.5.scale_probe.EI-4'] }

    // Cast to bypass `as const` — test-only mutation.
    const mutable = CRITERION_THRESHOLDS as Record<string, unknown>
    mutable['18.5.scale_probe.EI-4'] = { threshold: '1.1', description: 'test override' }

    try {
      const result = await runner.run()
      expect(result.allPassed).toBe(false)
      const ei4 = result.perInvariant.find((r) => r.invariantId === 'EI-4')
      expect(ei4!.passed).toBe(false)
    } finally {
      // Restore the full original object so other tests are unaffected.
      mutable['18.5.scale_probe.EI-4'] = original
    }
  })
})
