/**
 * golden-trace-runner.spec.ts — Plan 10 Task 6
 *
 * Unit tests for GoldenTraceRunner and its pure helper functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  GoldenTraceRunner,
  buildExpectedFingerprint,
  computeRegressionReport,
  type CiGateResult,
} from './golden-trace-runner'
import type {
  GoldenTraceRepository,
  GoldenTraceEntity,
} from '../../domain/repositories/golden-trace.repository'
import type { ScorerRegistry } from './scorer-registry'
import type { ReplayHarness } from './replay-harness'
import type { Fingerprint } from '../../domain/scorer-types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrace(overrides: Partial<GoldenTraceEntity> = {}): GoldenTraceEntity {
  return {
    id: 'trace-id-1',
    title: 'Planner overdue',
    tenantId: 'tenant-1',
    seedUserId: 'user-1',
    userUtterance: 'Show me overdue tasks',
    expectedToolCalls: ['planner.listTasks', 'kernel.checkPermission'],
    expectedShape: 'list',
    expectedPermissionKeys: ['planner.read', 'kernel.read'],
    taintExpectation: false,
    answerShapeContract: { columns: ['title', 'due'] },
    adversarialCategory: null,
    createdBy: 'author-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    removedAt: null,
    removalReason: null,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('buildExpectedFingerprint()', () => {
  it('1. sorts tool calls and permission keys', () => {
    const trace = makeTrace({
      expectedToolCalls: ['b.tool', 'a.tool'],
      expectedPermissionKeys: ['z.read', 'a.read'],
      expectedShape: 'table',
      taintExpectation: true,
    })

    const fp = buildExpectedFingerprint(trace)

    expect(fp.toolCallsSorted).toEqual(['a.tool', 'b.tool'])
    expect(fp.permissionKeys).toEqual(['a.read', 'z.read'])
    expect(fp.shape).toBe('table')
    expect(fp.taintFlipped).toBe(true)
  })

  it('2. does not mutate the original trace arrays', () => {
    const tools = ['b.tool', 'a.tool']
    const perms = ['z.read', 'a.read']
    const trace = makeTrace({ expectedToolCalls: tools, expectedPermissionKeys: perms })

    buildExpectedFingerprint(trace)

    expect(tools).toEqual(['b.tool', 'a.tool'])
    expect(perms).toEqual(['z.read', 'a.read'])
  })

  it('3. handles empty tool calls and permissions', () => {
    const trace = makeTrace({
      expectedToolCalls: [],
      expectedPermissionKeys: [],
      taintExpectation: false,
      expectedShape: 'refusal',
    })

    const fp = buildExpectedFingerprint(trace)

    expect(fp.toolCallsSorted).toEqual([])
    expect(fp.permissionKeys).toEqual([])
    expect(fp.taintFlipped).toBe(false)
  })
})

describe('computeRegressionReport()', () => {
  it('4. divergedFields is empty when actual matches expected', () => {
    const trace = makeTrace()
    const expected = buildExpectedFingerprint(trace)

    const report = computeRegressionReport(trace, expected)

    expect(report.divergedFields).toEqual([])
    expect(report.goldenTraceId).toBe('trace-id-1')
  })

  it('5. detects diverged toolCallsSorted', () => {
    const trace = makeTrace()
    const actual: Fingerprint = {
      ...buildExpectedFingerprint(trace),
      toolCallsSorted: ['other.tool'],
    }

    const report = computeRegressionReport(trace, actual)

    expect(report.divergedFields).toContain('toolCallsSorted')
  })

  it('6. detects diverged shape', () => {
    const trace = makeTrace()
    const actual: Fingerprint = {
      ...buildExpectedFingerprint(trace),
      shape: 'narrative',
    }

    const report = computeRegressionReport(trace, actual)

    expect(report.divergedFields).toContain('shape')
  })

  it('7. detects diverged permissionKeys', () => {
    const trace = makeTrace()
    const actual: Fingerprint = {
      ...buildExpectedFingerprint(trace),
      permissionKeys: ['other.read'],
    }

    const report = computeRegressionReport(trace, actual)

    expect(report.divergedFields).toContain('permissionKeys')
  })

  it('8. detects diverged taintFlipped', () => {
    const trace = makeTrace({ taintExpectation: false })
    const actual: Fingerprint = {
      ...buildExpectedFingerprint(trace),
      taintFlipped: true,
    }

    const report = computeRegressionReport(trace, actual)

    expect(report.divergedFields).toContain('taintFlipped')
  })

  it('9. reports all diverged fields simultaneously', () => {
    const trace = makeTrace()
    const actual: Fingerprint = {
      toolCallsSorted: ['other.tool'],
      shape: 'narrative',
      permissionKeys: ['other.read'],
      taintFlipped: true,
    }

    const report = computeRegressionReport(trace, actual)

    expect(report.divergedFields).toHaveLength(4)
    expect(report.divergedFields).toContain('toolCallsSorted')
    expect(report.divergedFields).toContain('shape')
    expect(report.divergedFields).toContain('permissionKeys')
    expect(report.divergedFields).toContain('taintFlipped')
  })
})

describe('GoldenTraceRunner', () => {
  let repo: GoldenTraceRepository
  let scorerRegistry: ScorerRegistry
  let replayHarness: ReplayHarness
  let runner: GoldenTraceRunner

  beforeEach(() => {
    repo = {
      findActive: vi.fn().mockResolvedValue([]),
      countActive: vi.fn().mockResolvedValue(0),
      insert: vi.fn(),
      retire: vi.fn(),
      findById: vi.fn(),
    } as unknown as GoldenTraceRepository

    scorerRegistry = {
      getDeterministic: vi.fn().mockReturnValue([]),
      getLlmJudge: vi.fn().mockReturnValue([]),
      getAll: vi.fn().mockReturnValue(new Map()),
      register: vi.fn(),
      demote: vi.fn(),
      findById: vi.fn(),
    } as unknown as ScorerRegistry

    replayHarness = {
      replay: vi.fn(),
    } as unknown as ReplayHarness

    runner = new GoldenTraceRunner(repo, scorerRegistry, replayHarness)
  })

  it('10. loads active traces from repo', async () => {
    await runner.runCiGate({ branch: 'main', commit: 'abc123' })

    expect(repo.findActive).toHaveBeenCalledOnce()
  })

  it('11. with no traces → passed: true, empty regressions', async () => {
    vi.mocked(repo.findActive).mockResolvedValue([])

    const result: CiGateResult = await runner.runCiGate({ branch: 'main', commit: 'abc123' })

    expect(result.passed).toBe(true)
    expect(result.regressions).toEqual([])
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('12. with traces and no scorers → passed: true (nothing to fail)', async () => {
    vi.mocked(repo.findActive).mockResolvedValue([makeTrace()])
    vi.mocked(scorerRegistry.getDeterministic).mockReturnValue([])
    vi.mocked(scorerRegistry.getLlmJudge).mockReturnValue([])

    const result = await runner.runCiGate({ branch: 'main', commit: 'abc123' })

    expect(result.passed).toBe(true)
    expect(result.regressions).toEqual([])
  })

  it('13. deterministic scorer returning passed: true → no regression recorded', async () => {
    const trace = makeTrace()
    vi.mocked(repo.findActive).mockResolvedValue([trace])
    const passingScorer = {
      id: 'det-scorer',
      name: 'Passing scorer',
      kind: 'deterministic' as const,
      scope: 'trace' as const,
      definitionSource: 'code' as const,
      run: vi.fn().mockResolvedValue({ score: 1, passed: true }),
    }
    vi.mocked(scorerRegistry.getDeterministic).mockReturnValue([passingScorer])

    const result = await runner.runCiGate({ branch: 'main', commit: 'abc123' })

    expect(result.passed).toBe(true)
    expect(result.regressions).toEqual([])
    expect(passingScorer.run).toHaveBeenCalledOnce()
  })

  it('14. deterministic scorer returning passed: false → regression recorded, passed: false', async () => {
    const trace = makeTrace()
    vi.mocked(repo.findActive).mockResolvedValue([trace])
    const failingScorer = {
      id: 'det-fail',
      name: 'Failing scorer',
      kind: 'deterministic' as const,
      scope: 'trace' as const,
      definitionSource: 'code' as const,
      run: vi.fn().mockResolvedValue({ score: 0, passed: false, reason: 'tool diverged' }),
    }
    vi.mocked(scorerRegistry.getDeterministic).mockReturnValue([failingScorer])

    const result = await runner.runCiGate({ branch: 'main', commit: 'abc123' })

    expect(result.passed).toBe(false)
    expect(result.regressions).toHaveLength(1)
    expect(result.regressions[0]?.goldenTraceId).toBe(trace.id)
  })

  it('15. llm-judge scorer returning passed: false → NOT gating (passed: true, no regression)', async () => {
    const trace = makeTrace()
    vi.mocked(repo.findActive).mockResolvedValue([trace])
    vi.mocked(scorerRegistry.getDeterministic).mockReturnValue([])
    const llmJudgeScorer = {
      id: 'llm-judge-observe',
      name: 'Observe-only scorer',
      kind: 'llm-judge' as const,
      scope: 'trace' as const,
      definitionSource: 'code' as const,
      run: vi.fn().mockResolvedValue({ score: 0, passed: false, reason: 'observe-only' }),
    }
    vi.mocked(scorerRegistry.getLlmJudge).mockReturnValue([llmJudgeScorer])

    const result = await runner.runCiGate({ branch: 'main', commit: 'abc123' })

    // LLM-judge results never gate CI at MVP (R-10.30).
    expect(result.passed).toBe(true)
    expect(result.regressions).toEqual([])
    // The scorer WAS executed (observe-only) but did not block.
    expect(llmJudgeScorer.run).toHaveBeenCalledOnce()
  })

  it('16. durationMs is a non-negative number', async () => {
    const result = await runner.runCiGate({ branch: 'feat/x', commit: 'def456' })

    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('17. deterministic scorer that throws → regression recorded, runner does not throw', async () => {
    const trace = makeTrace()
    vi.mocked(repo.findActive).mockResolvedValue([trace])
    const throwingScorer = {
      id: 'det-throwing',
      name: 'Throwing scorer',
      kind: 'deterministic' as const,
      scope: 'trace' as const,
      definitionSource: 'code' as const,
      run: vi.fn().mockRejectedValue(new Error('scorer exploded')),
    }
    vi.mocked(scorerRegistry.getDeterministic).mockReturnValue([throwingScorer])

    const result = await runner.runCiGate({ branch: 'main', commit: 'abc123' })

    // A throwing scorer is treated as failed — regression reported, suite continues.
    expect(result.passed).toBe(false)
    expect(result.regressions).toHaveLength(1)
  })
})
