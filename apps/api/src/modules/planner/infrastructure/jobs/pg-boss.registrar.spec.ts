import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { CommandBus } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import type { ClsService } from 'nestjs-cls'
import type { RequestDbContextService } from '../../../../common/db/request-db-context.service'
import type { BackfillGroupWorker } from '../ms-graph/pull/backfill-group.worker'
import type { BackfillRosterWorker } from '../ms-graph/pull/backfill-roster.worker'
import {
  MS_SYNC_PUSH_TASK_JOB,
  MS_SYNC_PUSH_PLAN_JOB,
  MS_SYNC_PUSH_BUCKET_JOB,
  MsSyncJobRegistrar,
} from './pg-boss.registrar'
import { PushTaskCommand } from '../../application/commands/ms-sync/push-task.command'
import { PushPlanCommand } from '../../application/commands/ms-sync/push-plan.command'
import { PushBucketCommand } from '../../application/commands/ms-sync/push-bucket.command'

// Mock runWithTenantContext so it simply invokes the handler without real DB/CLS deps
vi.mock('../../../../common/jobs/run-with-tenant-context', () => ({
  runWithTenantContext: async (_opts: unknown, handler: () => Promise<unknown>) => handler(),
}))

function makeMocks() {
  const pgBoss = {
    registerWorker: vi.fn(),
  } as unknown as PgBossService

  const commandBus = {
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as CommandBus

  const backfillWorker = {
    run: vi.fn().mockResolvedValue(undefined),
  } as unknown as BackfillGroupWorker

  const backfillRosterWorker = {
    run: vi.fn().mockResolvedValue(undefined),
  } as unknown as BackfillRosterWorker

  const baseDb = {} as unknown as Db
  const requestDbContext = {} as unknown as RequestDbContextService
  const cls = {} as unknown as ClsService

  const registrar = new MsSyncJobRegistrar(
    pgBoss,
    backfillWorker,
    backfillRosterWorker,
    commandBus,
    baseDb,
    requestDbContext,
    cls,
  )

  return { pgBoss, commandBus, backfillWorker, backfillRosterWorker, registrar }
}

/**
 * Helper: finds the worker callback registered under the given job name.
 * registerWorker is called with (jobName, callback).
 */
function getWorker(
  pgBoss: PgBossService,
  jobName: string,
): (jobs: { data: Record<string, string> }[]) => Promise<void> {
  const calls = (pgBoss.registerWorker as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    (jobs: { data: Record<string, string> }[]) => Promise<void>,
  ][]
  const match = calls.find(([name]) => name === jobName)
  if (!match) throw new Error(`No worker registered for job: ${jobName}`)
  return match[1]
}

describe('MsSyncJobRegistrar — push workers', () => {
  let mocks: ReturnType<typeof makeMocks>

  beforeEach(async () => {
    mocks = makeMocks()
    await mocks.registrar.onApplicationBootstrap()
  })

  // ── push-task ────────────────────────────────────────────────────────────────

  describe('ms-sync-push-task worker', () => {
    it('registers a worker with the correct job name', () => {
      const names = (mocks.pgBoss.registerWorker as ReturnType<typeof vi.fn>).mock.calls.map(
        ([name]: [string]) => name,
      )
      expect(names).toContain(MS_SYNC_PUSH_TASK_JOB)
    })

    it('dispatches PushTaskCommand with correct arguments for each job', async () => {
      const worker = getWorker(mocks.pgBoss, MS_SYNC_PUSH_TASK_JOB)
      await worker([
        { data: { taskId: 'task-1', tenantId: 'tenant-a' } },
        { data: { taskId: 'task-2', tenantId: 'tenant-b' } },
      ])

      expect(mocks.commandBus.execute).toHaveBeenCalledTimes(2)
      expect(mocks.commandBus.execute).toHaveBeenCalledWith(
        new PushTaskCommand('task-1', 'tenant-a'),
      )
      expect(mocks.commandBus.execute).toHaveBeenCalledWith(
        new PushTaskCommand('task-2', 'tenant-b'),
      )
    })

    it('re-throws errors from commandBus.execute so pg-boss retries', async () => {
      const error = new Error('push-task-failure')
      ;(mocks.commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)

      const worker = getWorker(mocks.pgBoss, MS_SYNC_PUSH_TASK_JOB)
      await expect(worker([{ data: { taskId: 'task-x', tenantId: 'tenant-x' } }])).rejects.toThrow(
        'push-task-failure',
      )
    })
  })

  // ── push-plan ────────────────────────────────────────────────────────────────

  describe('ms-sync-push-plan worker', () => {
    it('registers a worker with the correct job name', () => {
      const names = (mocks.pgBoss.registerWorker as ReturnType<typeof vi.fn>).mock.calls.map(
        ([name]: [string]) => name,
      )
      expect(names).toContain(MS_SYNC_PUSH_PLAN_JOB)
    })

    it('dispatches PushPlanCommand with correct arguments for each job', async () => {
      const worker = getWorker(mocks.pgBoss, MS_SYNC_PUSH_PLAN_JOB)
      await worker([
        { data: { planId: 'plan-1', tenantId: 'tenant-a' } },
        { data: { planId: 'plan-2', tenantId: 'tenant-b' } },
      ])

      expect(mocks.commandBus.execute).toHaveBeenCalledTimes(2)
      expect(mocks.commandBus.execute).toHaveBeenCalledWith(
        new PushPlanCommand('plan-1', 'tenant-a'),
      )
      expect(mocks.commandBus.execute).toHaveBeenCalledWith(
        new PushPlanCommand('plan-2', 'tenant-b'),
      )
    })

    it('re-throws errors from commandBus.execute so pg-boss retries', async () => {
      const error = new Error('push-plan-failure')
      ;(mocks.commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)

      const worker = getWorker(mocks.pgBoss, MS_SYNC_PUSH_PLAN_JOB)
      await expect(worker([{ data: { planId: 'plan-x', tenantId: 'tenant-x' } }])).rejects.toThrow(
        'push-plan-failure',
      )
    })
  })

  // ── push-bucket ──────────────────────────────────────────────────────────────

  describe('ms-sync-push-bucket worker', () => {
    it('registers a worker with the correct job name', () => {
      const names = (mocks.pgBoss.registerWorker as ReturnType<typeof vi.fn>).mock.calls.map(
        ([name]: [string]) => name,
      )
      expect(names).toContain(MS_SYNC_PUSH_BUCKET_JOB)
    })

    it('dispatches PushBucketCommand with correct arguments for each job', async () => {
      const worker = getWorker(mocks.pgBoss, MS_SYNC_PUSH_BUCKET_JOB)
      await worker([
        { data: { bucketId: 'bucket-1', tenantId: 'tenant-a' } },
        { data: { bucketId: 'bucket-2', tenantId: 'tenant-b' } },
      ])

      expect(mocks.commandBus.execute).toHaveBeenCalledTimes(2)
      expect(mocks.commandBus.execute).toHaveBeenCalledWith(
        new PushBucketCommand('bucket-1', 'tenant-a'),
      )
      expect(mocks.commandBus.execute).toHaveBeenCalledWith(
        new PushBucketCommand('bucket-2', 'tenant-b'),
      )
    })

    it('re-throws errors from commandBus.execute so pg-boss retries', async () => {
      const error = new Error('push-bucket-failure')
      ;(mocks.commandBus.execute as ReturnType<typeof vi.fn>).mockRejectedValueOnce(error)

      const worker = getWorker(mocks.pgBoss, MS_SYNC_PUSH_BUCKET_JOB)
      await expect(
        worker([{ data: { bucketId: 'bucket-x', tenantId: 'tenant-x' } }]),
      ).rejects.toThrow('push-bucket-failure')
    })
  })
})
