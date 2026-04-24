import { EventBus } from '@nestjs/cqrs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MS_SYNC_DISABLED_EVENT } from '@future/event-contracts'
import { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import type { KernelAuditFacade } from '../../../../kernel/application/facades/kernel-audit.facade'
import { DisconnectMsSyncCommand } from './disconnect-ms-sync.command'
import { DisconnectMsSyncHandler } from './disconnect-ms-sync.handler'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'

function makeCommand(mode: 'pause' | 'destroy') {
  return new DisconnectMsSyncCommand(TENANT_ID, ACTOR_ID, mode)
}

describe('DisconnectMsSyncHandler', () => {
  let identityGraphFacade: { disconnectMicrosoftGraphCredential: ReturnType<typeof vi.fn> }
  let auditFacade: { publishOutboxEvent: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }
  let handler: DisconnectMsSyncHandler

  beforeEach(() => {
    identityGraphFacade = {
      disconnectMicrosoftGraphCredential: vi.fn().mockImplementation(async (_input, options) => {
        await options?.persistDurableEvent?.()
        return true
      }),
    }
    auditFacade = { publishOutboxEvent: vi.fn().mockResolvedValue(undefined) }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new DisconnectMsSyncHandler(
      identityGraphFacade as unknown as IdentityMsGraphCredentialFacade,
      auditFacade as unknown as KernelAuditFacade,
      eventBus as unknown as EventBus,
    )
  })

  it('pause: pauses the credential and emits MsSyncDisabledEvent with reason paused', async () => {
    await handler.execute(makeCommand('pause'))

    expect(identityGraphFacade.disconnectMicrosoftGraphCredential).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, mode: 'pause' },
      expect.objectContaining({ persistDurableEvent: expect.any(Function) }),
    )
    expect(auditFacade.publishOutboxEvent).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventName: MS_SYNC_DISABLED_EVENT,
      payload: expect.objectContaining({
        type: MS_SYNC_DISABLED_EVENT,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        reason: 'paused',
      }),
    })
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MS_SYNC_DISABLED_EVENT,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        reason: 'paused',
      }),
    )

    const event = eventBus.publish.mock.calls[0][0]
    expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false)
  })

  it('destroy: deletes the credential and secret then emits MsSyncDisabledEvent with reason destroyed', async () => {
    await handler.execute(makeCommand('destroy'))

    expect(identityGraphFacade.disconnectMicrosoftGraphCredential).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, mode: 'destroy' },
      expect.objectContaining({ persistDurableEvent: expect.any(Function) }),
    )
    expect(auditFacade.publishOutboxEvent).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      eventName: MS_SYNC_DISABLED_EVENT,
      payload: expect.objectContaining({
        type: MS_SYNC_DISABLED_EVENT,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        reason: 'destroyed',
      }),
    })
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MS_SYNC_DISABLED_EVENT,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        reason: 'destroyed',
      }),
    )
  })

  it('no-ops without publishing events when no credential exists', async () => {
    identityGraphFacade.disconnectMicrosoftGraphCredential.mockResolvedValue(false)

    await handler.execute(makeCommand('pause'))

    expect(auditFacade.publishOutboxEvent).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('does not publish the in-process event when durable outbox persistence fails', async () => {
    auditFacade.publishOutboxEvent.mockRejectedValue(new Error('outbox unavailable'))

    await expect(handler.execute(makeCommand('pause'))).rejects.toThrow(/outbox unavailable/)

    expect(auditFacade.publishOutboxEvent).toHaveBeenCalledOnce()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('does not publish events when identity disconnect fails', async () => {
    identityGraphFacade.disconnectMicrosoftGraphCredential.mockRejectedValue(
      new Error('credential changed before disconnect'),
    )

    await expect(handler.execute(makeCommand('destroy'))).rejects.toThrow(
      /credential changed before disconnect/,
    )

    expect(auditFacade.publishOutboxEvent).not.toHaveBeenCalled()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('does not publish the in-process event when identity fails after durable event persistence', async () => {
    identityGraphFacade.disconnectMicrosoftGraphCredential.mockImplementation(
      async (_input, options) => {
        await options?.persistDurableEvent?.()
        throw new Error('credential changed before disconnect')
      },
    )

    await expect(handler.execute(makeCommand('destroy'))).rejects.toThrow(
      /credential changed before disconnect/,
    )

    expect(auditFacade.publishOutboxEvent).toHaveBeenCalledOnce()
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
