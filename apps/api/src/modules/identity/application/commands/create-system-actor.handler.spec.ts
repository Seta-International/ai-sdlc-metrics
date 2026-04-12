import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { CreateSystemActorCommand } from './create-system-actor.command'
import { CreateSystemActorHandler } from './create-system-actor.handler'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const NEW_SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000080'

describe('CreateSystemActorHandler', () => {
  let handler: CreateSystemActorHandler
  let commandBus: CommandBus
  let auditFacade: KernelAuditFacade

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    handler = new CreateSystemActorHandler(commandBus, auditFacade)
  })

  it('creates a system actor via kernel command bus', async () => {
    vi.mocked(commandBus.execute).mockResolvedValue(NEW_SYSTEM_ACTOR_ID)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    const result = await handler.execute(
      new CreateSystemActorCommand(TENANT_ID, 'Nightly Report Bot', ACTOR_ID),
    )

    expect(result).toEqual({ actorId: NEW_SYSTEM_ACTOR_ID })
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        type: 'system',
        displayName: 'Nightly Report Bot',
      }),
    )
    expect(auditFacade.recordEvent).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      eventType: 'system_actor.created',
      module: 'identity',
      subjectId: NEW_SYSTEM_ACTOR_ID,
      payload: { displayName: 'Nightly Report Bot' },
    })
  })
})
