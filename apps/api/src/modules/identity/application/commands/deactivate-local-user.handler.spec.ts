import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'
import { DeactivateLocalUserHandler } from './deactivate-local-user.handler'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const TARGET_ACTOR_ID = '01900000-0000-7000-8000-000000000050'
const ADMIN_ACTOR_ID = '01900000-0000-7000-8000-000000000005'

describe('DeactivateLocalUserHandler', () => {
  let handler: DeactivateLocalUserHandler
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
    handler = new DeactivateLocalUserHandler(commandBus, auditFacade)
  })

  it('deactivates user identity, revokes roles, and updates actor status', async () => {
    vi.mocked(commandBus.execute).mockResolvedValue(undefined)
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)

    await handler.execute(
      new DeactivateLocalUserCommand(TENANT_ID, TARGET_ACTOR_ID, ADMIN_ACTOR_ID),
    )

    // DeprovisionUserIdentity + RevokeAllRoleGrants + UpdateActorStatus
    expect(commandBus.execute).toHaveBeenCalledTimes(3)
    expect(auditFacade.recordEvent).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: ADMIN_ACTOR_ID,
      eventType: 'local_user.deactivated',
      module: 'identity',
      subjectId: TARGET_ACTOR_ID,
      payload: {},
    })
  })
})
