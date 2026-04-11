import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DeactivateLocalUserCommand } from './deactivate-local-user.command'
import { DeactivateLocalUserHandler } from './deactivate-local-user.handler'
import type { CommandBus } from '@nestjs/cqrs'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const DEACTIVATED_BY = '01900000-0000-7000-8000-000000000003'

describe('DeactivateLocalUserHandler', () => {
  let handler: DeactivateLocalUserHandler
  let commandBus: CommandBus
  let auditRepo: IAuditEventRepository

  beforeEach(() => {
    commandBus = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as CommandBus
    auditRepo = { insert: vi.fn() } as unknown as IAuditEventRepository
    handler = new DeactivateLocalUserHandler(commandBus, auditRepo)
  })

  it('deactivates a local user by deprovisioning, revoking grants, and setting status inactive', async () => {
    const command = new DeactivateLocalUserCommand(TENANT_ID, ACTOR_ID, DEACTIVATED_BY)

    await handler.execute(command)

    // DeprovisionUserIdentityCommand + RevokeAllRoleGrantsCommand + UpdateActorStatusCommand = 3
    expect(commandBus.execute).toHaveBeenCalledTimes(3)
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: DEACTIVATED_BY,
        eventType: 'local_user.deactivated',
        module: 'identity',
        subjectId: ACTOR_ID,
      }),
    )
  })
})
