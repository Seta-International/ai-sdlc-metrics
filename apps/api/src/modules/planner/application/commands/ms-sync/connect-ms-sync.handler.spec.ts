import { EventBus } from '@nestjs/cqrs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentityMsGraphCredentialFacade } from '../../../../identity/application/facades/identity-ms-graph-credential.facade'
import { ConnectMsSyncCommand } from './connect-ms-sync.command'
import { ConnectMsSyncHandler } from './connect-ms-sync.handler'

const TENANT_ID = 'tenant-1'
const ACTOR_ID = 'actor-1'
const INPUT = {
  clientId: 'client-1',
  tenantAdId: 'aad-tenant-1',
  clientSecret: 'shh',
}

function makeCommand() {
  return new ConnectMsSyncCommand(TENANT_ID, ACTOR_ID, INPUT)
}

describe('ConnectMsSyncHandler', () => {
  let identityGraphFacade: { connectMicrosoftGraphCredential: ReturnType<typeof vi.fn> }
  let eventBus: { publish: ReturnType<typeof vi.fn> }
  let handler: ConnectMsSyncHandler

  beforeEach(() => {
    identityGraphFacade = {
      connectMicrosoftGraphCredential: vi.fn().mockResolvedValue(undefined),
    }
    eventBus = { publish: vi.fn().mockResolvedValue(undefined) }
    handler = new ConnectMsSyncHandler(
      identityGraphFacade as unknown as IdentityMsGraphCredentialFacade,
      eventBus as unknown as EventBus,
    )
  })

  it('connects the Microsoft Graph credential and emits MsSyncEnabledEvent', async () => {
    await handler.execute(makeCommand())

    expect(identityGraphFacade.connectMicrosoftGraphCredential).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      clientId: INPUT.clientId,
      tenantAdId: INPUT.tenantAdId,
      clientSecret: INPUT.clientSecret,
    })
    expect(eventBus.publish).toHaveBeenCalledOnce()
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'planner.ms_sync.enabled',
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        tenantAdId: INPUT.tenantAdId,
        clientId: INPUT.clientId,
      }),
    )

    const event = eventBus.publish.mock.calls[0][0]
    expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false)
  })

  it('does not emit when Graph validation fails', async () => {
    identityGraphFacade.connectMicrosoftGraphCredential.mockRejectedValue(
      new Error('Microsoft Graph validation failed: 401 Unauthorized'),
    )

    await expect(handler.execute(makeCommand())).rejects.toThrow(
      /Microsoft Graph validation failed: 401 Unauthorized/,
    )
    expect(eventBus.publish).not.toHaveBeenCalled()
  })

  it('rejects connect when credential already exists', async () => {
    identityGraphFacade.connectMicrosoftGraphCredential.mockRejectedValue(
      new Error('Microsoft 365 is already connected for this tenant; disconnect first'),
    )

    await expect(handler.execute(makeCommand())).rejects.toThrow(/already connected/i)
    expect(eventBus.publish).not.toHaveBeenCalled()
  })
})
