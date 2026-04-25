import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job } from 'pg-boss'
import { ShadowTurnWorker, SHADOW_TURN_JOB_NAME, type ShadowTurnJob } from './shadow-turn-worker'
import type { ShadowDiffScorer } from '../../application/services/shadow-diff-scorer'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { Db } from '@future/db'

vi.mock('uuidv7', () => {
  let counter = 0
  return {
    uuidv7: vi.fn(() => `019dc2fd-0000-7000-8000-${String(++counter).padStart(12, '0')}`),
  }
})

// ── Fixtures ───────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-7000-8000-000000000001'
const USER_ID = '00000000-0000-7000-8000-000000000002'
const ROLLOUT_CONFIG_ID = '00000000-0000-7000-8000-000000000003'
const BASELINE_TRACE_ID = '00000000-0000-7000-8000-000000000004'
const CANDIDATE_VERSION = 'v2'
const BASELINE_VERSION = 'v1'

function makeJobPayload(overrides: Partial<ShadowTurnJob> = {}): ShadowTurnJob {
  return {
    baselineTraceId: BASELINE_TRACE_ID,
    baselineOutput: {
      toolCallNames: ['planner.list_tasks'],
      permissionKeys: ['tasks.read'],
      answerShape: 'list',
    },
    candidateVersion: CANDIDATE_VERSION,
    baselineVersion: BASELINE_VERSION,
    rolloutConfigId: ROLLOUT_CONFIG_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    ...overrides,
  }
}

function makeJob(payload: ShadowTurnJob): Job<ShadowTurnJob> {
  return {
    id: '00000000-0000-7000-8000-000000000099',
    name: SHADOW_TURN_JOB_NAME,
    data: payload,
  } as Job<ShadowTurnJob>
}

// ── Mocks ──────────────────────────────────────────────────────────────────────

function makePgBossService(): PgBossService {
  return {
    enqueue: vi.fn().mockResolvedValue(''),
    registerWorker: vi.fn(),
    registerScheduledWorker: vi.fn(),
    schedule: vi.fn(),
    onApplicationBootstrap: vi.fn(),
    onApplicationShutdown: vi.fn(),
  } as unknown as PgBossService
}

function makeDiffScorer(): ShadowDiffScorer {
  return {
    score: vi.fn().mockReturnValue({
      score: 1,
      category: 'shadow_errored',
      componentDiffs: { toolCallOverlap: 0, shapeDiff: 0, permissionKeyOverlap: 0 },
    }),
  } as unknown as ShadowDiffScorer
}

function makeDb(): Db {
  const insertResult = {
    values: vi.fn().mockReturnThis(),
  }
  return {
    insert: vi.fn().mockReturnValue(insertResult),
  } as unknown as Db
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ShadowTurnWorker', () => {
  let pgBossService: PgBossService
  let diffScorer: ShadowDiffScorer
  let db: Db
  let worker: ShadowTurnWorker

  beforeEach(() => {
    vi.clearAllMocks()
    pgBossService = makePgBossService()
    diffScorer = makeDiffScorer()
    db = makeDb()
    worker = new ShadowTurnWorker(pgBossService, diffScorer, db)
  })

  describe('SHADOW_TURN_JOB_NAME constant', () => {
    it('equals agent.shadow-turn', () => {
      expect(SHADOW_TURN_JOB_NAME).toBe('agent.shadow-turn')
    })
  })

  describe('handle()', () => {
    it('calls diffScorer.score with baselineOutput and null candidateOutput (MVP stub)', async () => {
      const payload = makeJobPayload()
      await worker.handle([makeJob(payload)])

      expect(diffScorer.score).toHaveBeenCalledWith({
        baselineOutput: payload.baselineOutput,
        candidateOutput: null,
      })
    })

    it('writes an agent_shadow_run row to the DB with required fields', async () => {
      const payload = makeJobPayload()
      await worker.handle([makeJob(payload)])

      const dbInsertMock = db.insert as ReturnType<typeof vi.fn>
      expect(dbInsertMock).toHaveBeenCalledTimes(1)

      const valuesMock = dbInsertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>
      const insertedRow = valuesMock.mock.calls[0][0]

      expect(insertedRow).toMatchObject({
        tenantId: TENANT_ID,
        baselineTraceId: BASELINE_TRACE_ID,
        rolloutConfigId: ROLLOUT_CONFIG_ID,
        candidateVersion: CANDIDATE_VERSION,
        baselineVersion: BASELINE_VERSION,
      })
      // ID and shadowTraceId should be UUIDs (non-empty strings)
      expect(typeof insertedRow.id).toBe('string')
      expect(insertedRow.id.length).toBeGreaterThan(0)
      expect(typeof insertedRow.shadowTraceId).toBe('string')
      expect(insertedRow.shadowTraceId.length).toBeGreaterThan(0)
    })

    it('writes diff_category=shadow_errored and diff_score=1 when MVP stub returns null candidate', async () => {
      const payload = makeJobPayload()
      await worker.handle([makeJob(payload)])

      const dbInsertMock = db.insert as ReturnType<typeof vi.fn>
      const valuesMock = dbInsertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>
      const insertedRow = valuesMock.mock.calls[0][0]

      expect(insertedRow.diffCategory).toBe('shadow_errored')
      expect(Number(insertedRow.diffScore)).toBe(1)
    })

    it('generates a unique shadowTraceId UUID for each job', async () => {
      const payload = makeJobPayload()
      await worker.handle([makeJob(payload)])
      await worker.handle([makeJob(payload)])

      // Both calls go through db.insert → .values(row). The values() mock accumulates
      // all calls since the same insertResult object is reused.
      const dbInsertMock = db.insert as ReturnType<typeof vi.fn>
      const valuesMock = dbInsertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>

      // Two handle() calls → two .values() invocations
      expect(valuesMock.mock.calls).toHaveLength(2)
      const firstShadowTraceId = valuesMock.mock.calls[0][0].shadowTraceId
      const secondShadowTraceId = valuesMock.mock.calls[1][0].shadowTraceId

      expect(typeof firstShadowTraceId).toBe('string')
      expect(typeof secondShadowTraceId).toBe('string')
      expect(firstShadowTraceId).not.toBe(secondShadowTraceId)
    })

    it('does not throw when diffScorer.score throws — errors are swallowed (shadow is lossy-okay)', async () => {
      const scorerWithError = {
        score: vi.fn().mockImplementation(() => {
          throw new Error('scorer crashed')
        }),
      } as unknown as ShadowDiffScorer

      const workerWithFailingScorer = new ShadowTurnWorker(pgBossService, scorerWithError, db)
      const payload = makeJobPayload()

      await expect(workerWithFailingScorer.handle([makeJob(payload)])).resolves.not.toThrow()
    })

    it('does not throw when DB insert fails — errors are swallowed (shadow is lossy-okay)', async () => {
      const dbWithError = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockRejectedValue(new Error('DB write failed')),
        }),
      } as unknown as Db

      const workerWithFailingDb = new ShadowTurnWorker(pgBossService, diffScorer, dbWithError)
      const payload = makeJobPayload()

      await expect(workerWithFailingDb.handle([makeJob(payload)])).resolves.not.toThrow()
    })

    it('processes multiple jobs in a single handle() call', async () => {
      const jobs = [makeJob(makeJobPayload()), makeJob(makeJobPayload())]
      await worker.handle(jobs)

      expect(diffScorer.score).toHaveBeenCalledTimes(2)
      const dbInsertMock = db.insert as ReturnType<typeof vi.fn>
      expect(dbInsertMock).toHaveBeenCalledTimes(2)
    })

    it('continues processing remaining jobs even when one job fails', async () => {
      let callCount = 0
      const scorerThatFailsOnFirst = {
        score: vi.fn().mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            throw new Error('first job failed')
          }
          return {
            score: 1,
            category: 'shadow_errored',
            componentDiffs: { toolCallOverlap: 0, shapeDiff: 0, permissionKeyOverlap: 0 },
          }
        }),
      } as unknown as ShadowDiffScorer

      const workerWithPartialFailure = new ShadowTurnWorker(
        pgBossService,
        scorerThatFailsOnFirst,
        db,
      )
      const jobs = [makeJob(makeJobPayload()), makeJob(makeJobPayload())]

      await expect(workerWithPartialFailure.handle(jobs)).resolves.not.toThrow()

      // Second job should still insert
      const dbInsertMock = db.insert as ReturnType<typeof vi.fn>
      expect(dbInsertMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('onModuleInit()', () => {
    it('registers a worker for agent.shadow-turn queue', () => {
      worker.onModuleInit()

      expect(pgBossService.registerWorker).toHaveBeenCalledWith(
        SHADOW_TURN_JOB_NAME,
        expect.any(Function),
      )
    })
  })
})
