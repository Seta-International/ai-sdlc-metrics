import { describe, expect, it, vi } from 'vitest'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { IMsLinkedGroupRepository } from '../../domain/repositories/ms-linked-group.repository'
import type { CommandBus } from '@nestjs/cqrs'
import {
  MS_SYNC_RETRY_ATTACHMENTS_JOB,
  MsSyncRetryAttachmentsRegistrar,
} from './ms-sync-retry-attachments.registrar'
import { RetryPendingAttachmentsCommand } from '../../application/commands/ms-sync/retry-pending-attachments.command'

function makeMocks() {
  const pgBoss = {
    scheduleWithData: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  } as unknown as PgBossService

  const linkedGroups = {
    listDistinctActiveTenantIds: vi.fn().mockResolvedValue([]),
  } as unknown as IMsLinkedGroupRepository

  const commandBus = {
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as CommandBus

  const registrar = new MsSyncRetryAttachmentsRegistrar(pgBoss, linkedGroups, commandBus)

  return { pgBoss, linkedGroups, commandBus, registrar }
}

describe('MsSyncRetryAttachmentsRegistrar', () => {
  it('on module init, schedules a daily cron per active tenant', async () => {
    const { pgBoss, linkedGroups, registrar } = makeMocks()
    ;(linkedGroups.listDistinctActiveTenantIds as ReturnType<typeof vi.fn>).mockResolvedValue([
      'tenant-1',
      'tenant-2',
    ])

    await registrar.onApplicationBootstrap()

    expect(pgBoss.scheduleWithData).toHaveBeenCalledTimes(2)
    expect(pgBoss.scheduleWithData).toHaveBeenCalledWith(
      MS_SYNC_RETRY_ATTACHMENTS_JOB,
      '0 3 * * *',
      { tenantId: 'tenant-1' },
      { key: 'retry-attachments/tenant-1' },
    )
    expect(pgBoss.scheduleWithData).toHaveBeenCalledWith(
      MS_SYNC_RETRY_ATTACHMENTS_JOB,
      '0 3 * * *',
      { tenantId: 'tenant-2' },
      { key: 'retry-attachments/tenant-2' },
    )
  })

  it('registers a scheduled worker on bootstrap', async () => {
    const { pgBoss, registrar } = makeMocks()

    await registrar.onApplicationBootstrap()

    expect(pgBoss.registerScheduledWorker).toHaveBeenCalledWith(
      MS_SYNC_RETRY_ATTACHMENTS_JOB,
      expect.any(Function),
      { localConcurrency: 1 },
    )
  })

  it('worker executes RetryPendingAttachmentsCommand for each job', async () => {
    const { pgBoss, commandBus, registrar } = makeMocks()

    await registrar.onApplicationBootstrap()

    const [, worker] = (pgBoss.registerScheduledWorker as ReturnType<typeof vi.fn>).mock.calls[0]
    await worker([{ data: { tenantId: 'tenant-5' } }, { data: { tenantId: 'tenant-6' } }])

    expect(commandBus.execute).toHaveBeenCalledTimes(2)
    expect(commandBus.execute).toHaveBeenCalledWith(new RetryPendingAttachmentsCommand('tenant-5'))
    expect(commandBus.execute).toHaveBeenCalledWith(new RetryPendingAttachmentsCommand('tenant-6'))
  })

  it('no tenants active → no schedules created', async () => {
    const { pgBoss, registrar } = makeMocks()

    await registrar.onApplicationBootstrap()

    expect(pgBoss.scheduleWithData).not.toHaveBeenCalled()
  })
})
