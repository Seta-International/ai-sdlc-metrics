import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShadowExecutor, type ShadowShouldOpts, type ShadowRunOpts } from './shadow-executor'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import { SHADOW_TURN_JOB_NAME } from '../../infrastructure/workers/shadow-turn-worker'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const USER_ID = '00000000-0000-7000-8000-000000000002'
const ROLLOUT_CONFIG_ID = '00000000-0000-7000-8000-000000000003'
const BASELINE_TRACE_ID = '00000000-0000-7000-8000-000000000004'

function makeRolloutConfig(
  overrides: Partial<ShadowShouldOpts['rolloutConfig']> = {},
): ShadowShouldOpts['rolloutConfig'] {
  return {
    id: ROLLOUT_CONFIG_ID,
    shadowEnabled: true,
    trafficPercentage: 10,
    status: 'active',
    ...overrides,
  }
}

function makeShouldOpts(overrides: Partial<ShadowShouldOpts> = {}): ShadowShouldOpts {
  return {
    rolloutConfig: makeRolloutConfig(),
    tenantId: TENANT_ID,
    userId: USER_ID,
    fromCandidate: true,
    ...overrides,
  }
}

function makeRunOpts(overrides: Partial<ShadowRunOpts> = {}): ShadowRunOpts {
  return {
    baselineTraceId: BASELINE_TRACE_ID,
    baselineOutput: {
      toolCallNames: ['planner.list_tasks'],
      permissionKeys: ['tasks.read'],
      answerShape: 'list',
    },
    candidateVersion: 'v2',
    baselineVersion: 'v1',
    rolloutConfigId: ROLLOUT_CONFIG_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    ...overrides,
  }
}

// ── Mocks ──────────────────────────────────────────────────────────────────────

function makePgBossService(): PgBossService {
  return {
    enqueue: vi.fn().mockResolvedValue('job-id-123'),
    registerWorker: vi.fn(),
    registerScheduledWorker: vi.fn(),
    schedule: vi.fn(),
    onApplicationBootstrap: vi.fn(),
    onApplicationShutdown: vi.fn(),
  } as unknown as PgBossService
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ShadowExecutor', () => {
  let pgBossService: PgBossService
  let executor: ShadowExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    pgBossService = makePgBossService()
    executor = new ShadowExecutor(pgBossService)
  })

  describe('shouldShadow()', () => {
    it('returns true when status=active, shadowEnabled=true, fromCandidate=true', () => {
      const result = executor.shouldShadow(makeShouldOpts())
      expect(result).toBe(true)
    })

    it('returns false when status=rolled_back even if shadowEnabled=true and fromCandidate=true', () => {
      const result = executor.shouldShadow(
        makeShouldOpts({
          rolloutConfig: makeRolloutConfig({ status: 'rolled_back' }),
        }),
      )
      expect(result).toBe(false)
    })

    it('returns false when status=draft', () => {
      const result = executor.shouldShadow(
        makeShouldOpts({
          rolloutConfig: makeRolloutConfig({ status: 'draft' }),
        }),
      )
      expect(result).toBe(false)
    })

    it('returns false when shadowEnabled=false even if status=active and fromCandidate=true', () => {
      const result = executor.shouldShadow(
        makeShouldOpts({
          rolloutConfig: makeRolloutConfig({ shadowEnabled: false }),
        }),
      )
      expect(result).toBe(false)
    })

    it('returns false when fromCandidate=false even if status=active and shadowEnabled=true', () => {
      const result = executor.shouldShadow(
        makeShouldOpts({
          fromCandidate: false,
        }),
      )
      expect(result).toBe(false)
    })

    it('returns false when all three conditions are false', () => {
      const result = executor.shouldShadow(
        makeShouldOpts({
          rolloutConfig: makeRolloutConfig({ status: 'paused', shadowEnabled: false }),
          fromCandidate: false,
        }),
      )
      expect(result).toBe(false)
    })
  })

  describe('runShadow()', () => {
    it('calls pgBossService.enqueue with job name agent.shadow-turn and correct payload', async () => {
      const opts = makeRunOpts()
      await executor.runShadow(opts)

      expect(pgBossService.enqueue).toHaveBeenCalledWith(SHADOW_TURN_JOB_NAME, {
        baselineTraceId: opts.baselineTraceId,
        baselineOutput: opts.baselineOutput,
        candidateVersion: opts.candidateVersion,
        baselineVersion: opts.baselineVersion,
        rolloutConfigId: opts.rolloutConfigId,
        tenantId: opts.tenantId,
        userId: opts.userId,
      })
    })

    it('calls pgBossService.enqueue with the constant SHADOW_TURN_JOB_NAME', async () => {
      await executor.runShadow(makeRunOpts())

      const enqueueMock = pgBossService.enqueue as ReturnType<typeof vi.fn>
      expect(enqueueMock.mock.calls[0][0]).toBe('agent.shadow-turn')
    })

    it('is fire-and-forget: does not await job completion result', async () => {
      // enqueue returns a resolved promise — runShadow should return void without surfacing the id
      const opts = makeRunOpts()
      const result = await executor.runShadow(opts)
      expect(result).toBeUndefined()
    })

    it('passes userId=undefined when not supplied', async () => {
      const opts = makeRunOpts({ userId: undefined })
      await executor.runShadow(opts)

      const enqueueMock = pgBossService.enqueue as ReturnType<typeof vi.fn>
      expect(enqueueMock.mock.calls[0][1]).toMatchObject({
        userId: undefined,
      })
    })

    it('enqueues exactly once per call', async () => {
      await executor.runShadow(makeRunOpts())
      expect(pgBossService.enqueue).toHaveBeenCalledTimes(1)
    })
  })
})
