import { describe, expect, it, vi } from 'vitest'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { IMsLinkedGroupRepository } from '../../domain/repositories/ms-linked-group.repository'
import type { CommandBus, EventBus } from '@nestjs/cqrs'
import { MS_SYNC_POLL_JOB, MsSyncPollTenantRegistrar } from './ms-sync-poll-tenant.registrar'
import { PollTenantCommand } from '../../application/commands/ms-sync/poll-tenant.command'
import {
  MS_SYNC_CREDENTIAL_INVALIDATED_EVENT,
  MS_SYNC_DISABLED_EVENT,
  MS_SYNC_ENABLED_EVENT,
} from '@future/event-contracts'

function makeMocks() {
  let eventSubscriber: ((event: unknown) => void) | undefined

  const pgBoss = {
    scheduleWithData: vi.fn().mockResolvedValue(undefined),
    unschedule: vi.fn().mockResolvedValue(undefined),
    registerScheduledWorker: vi.fn(),
  } as unknown as PgBossService

  const linkedGroups = {
    listDistinctActiveTenantIds: vi.fn().mockResolvedValue([]),
  } as unknown as IMsLinkedGroupRepository

  const commandBus = {
    execute: vi.fn().mockResolvedValue(undefined),
  } as unknown as CommandBus

  const eventBus = {
    subscribe: vi.fn((cb: (event: unknown) => void) => {
      eventSubscriber = cb
      return { unsubscribe: vi.fn() }
    }),
  } as unknown as EventBus

  const registrar = new MsSyncPollTenantRegistrar(pgBoss, linkedGroups, commandBus, eventBus)

  return {
    pgBoss,
    linkedGroups,
    commandBus,
    eventBus,
    registrar,
    emitEvent: (event: unknown) => {
      eventSubscriber?.(event)
      return new Promise<void>((r) => setTimeout(r, 0))
    },
  }
}

describe('MsSyncPollTenantRegistrar', () => {
  it('on module init, schedules a cron per active tenant', async () => {
    const { pgBoss, linkedGroups, registrar } = makeMocks()
    ;(linkedGroups.listDistinctActiveTenantIds as ReturnType<typeof vi.fn>).mockResolvedValue([
      'tenant-1',
      'tenant-2',
    ])

    await registrar.onApplicationBootstrap()

    expect(pgBoss.scheduleWithData).toHaveBeenCalledTimes(2)
    expect(pgBoss.scheduleWithData).toHaveBeenCalledWith(
      MS_SYNC_POLL_JOB,
      '*/3 * * * *',
      { tenantId: 'tenant-1' },
      expect.objectContaining({ key: 'poll-tenant:tenant-1' }),
    )
    expect(pgBoss.scheduleWithData).toHaveBeenCalledWith(
      MS_SYNC_POLL_JOB,
      '*/3 * * * *',
      { tenantId: 'tenant-2' },
      expect.objectContaining({ key: 'poll-tenant:tenant-2' }),
    )
  })

  it('subscribes MsSyncEnabledEvent → schedules cron for the new tenant', async () => {
    const { pgBoss, registrar, emitEvent } = makeMocks()

    await registrar.onApplicationBootstrap()
    await emitEvent({
      type: MS_SYNC_ENABLED_EVENT,
      tenantId: 'tenant-new',
      actorId: 'actor-1',
      tenantAdId: 'ad-1',
      clientId: 'client-1',
      occurredAt: new Date().toISOString(),
    })

    expect(pgBoss.scheduleWithData).toHaveBeenCalledWith(
      MS_SYNC_POLL_JOB,
      '*/3 * * * *',
      { tenantId: 'tenant-new' },
      expect.objectContaining({ key: 'poll-tenant:tenant-new' }),
    )
  })

  it('subscribes MsSyncDisabledEvent → unschedules cron for the tenant', async () => {
    const { pgBoss, registrar, emitEvent } = makeMocks()

    await registrar.onApplicationBootstrap()
    await emitEvent({
      type: MS_SYNC_DISABLED_EVENT,
      tenantId: 'tenant-off',
      actorId: 'actor-1',
      reason: 'paused',
      occurredAt: new Date().toISOString(),
    })

    expect(pgBoss.unschedule).toHaveBeenCalledWith(MS_SYNC_POLL_JOB, 'poll-tenant:tenant-off')
  })

  it('subscribes MsSyncCredentialInvalidatedEvent → unschedules cron for the tenant', async () => {
    const { pgBoss, registrar, emitEvent } = makeMocks()

    await registrar.onApplicationBootstrap()
    await emitEvent({
      type: MS_SYNC_CREDENTIAL_INVALIDATED_EVENT,
      tenantId: 'tenant-invalid',
      reason: 'token_expired',
      occurredAt: new Date().toISOString(),
    })

    expect(pgBoss.unschedule).toHaveBeenCalledWith(MS_SYNC_POLL_JOB, 'poll-tenant:tenant-invalid')
  })

  it('worker executes PollTenantCommand for each job', async () => {
    const { pgBoss, commandBus, registrar } = makeMocks()

    await registrar.onApplicationBootstrap()

    const [, worker] = (pgBoss.registerScheduledWorker as ReturnType<typeof vi.fn>).mock.calls[0]
    await worker([{ data: { tenantId: 'tenant-5' } }, { data: { tenantId: 'tenant-6' } }])

    expect(commandBus.execute).toHaveBeenCalledTimes(2)
    expect(commandBus.execute).toHaveBeenCalledWith(new PollTenantCommand('tenant-5'))
    expect(commandBus.execute).toHaveBeenCalledWith(new PollTenantCommand('tenant-6'))
  })
})
