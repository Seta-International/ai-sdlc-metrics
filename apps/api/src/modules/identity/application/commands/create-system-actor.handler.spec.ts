import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateSystemActorCommand } from './create-system-actor.command'
import { CreateSystemActorHandler } from './create-system-actor.handler'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const NEW_SYSTEM_ACTOR_ID = '01900000-0000-7000-8000-000000000080'

describe('CreateSystemActorHandler', () => {
  let handler: CreateSystemActorHandler
  let actorFacade: KernelActorFacade
  let auditFacade: KernelAuditFacade

  beforeEach(() => {
    actorFacade = {
      createActor: vi.fn(),
      deactivateActor: vi.fn(),
      grantRole: vi.fn(),
      revokeAllRoles: vi.fn(),
    } as unknown as KernelActorFacade
    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade
    handler = new CreateSystemActorHandler(actorFacade, auditFacade)
  })

  it('creates a system actor via KernelActorFacade', async () => {
    vi.mocked(actorFacade.createActor).mockResolvedValue(NEW_SYSTEM_ACTOR_ID)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    const result = await handler.execute(
      new CreateSystemActorCommand(TENANT_ID, 'Nightly Report Bot', ACTOR_ID),
    )

    expect(result).toEqual({ actorId: NEW_SYSTEM_ACTOR_ID })
    expect(actorFacade.createActor).toHaveBeenCalledWith(
      TENANT_ID,
      'system',
      'Nightly Report Bot',
      ACTOR_ID,
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
