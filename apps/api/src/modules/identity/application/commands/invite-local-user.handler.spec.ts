import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { InviteLocalUserCommand } from './invite-local-user.command'
import { InviteLocalUserHandler } from './invite-local-user.handler'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'
import type { IUserIdentityRepository } from '../../../kernel/domain/repositories/user-identity.repository.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const NEW_ACTOR_ID = '01900000-0000-7000-8000-000000000050'
const NEW_IDENTITY_ID = '01900000-0000-7000-8000-000000000051'
const ROLE_GRANT_ID = '01900000-0000-7000-8000-000000000052'

describe('InviteLocalUserHandler', () => {
  let handler: InviteLocalUserHandler
  let commandBus: CommandBus
  let userIdentityRepo: IUserIdentityRepository
  let auditRepo: IAuditEventRepository
  let magicLinkSender: IMagicLinkSender

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus

    userIdentityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      insert: vi.fn(),
      deprovisionByActorId: vi.fn(),
      updateLastLogin: vi.fn(),
    }
    auditRepo = {
      insert: vi.fn(),
    }
    magicLinkSender = {
      sendInvitation: vi.fn(),
    }
    handler = new InviteLocalUserHandler(commandBus, userIdentityRepo, auditRepo, magicLinkSender)
  })

  it('creates actor, identity, role grants, and sends magic link', async () => {
    // CommandBus.execute returns actorId for CreateActorCommand, grantId for GrantRoleCommand
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand
    vi.mocked(userIdentityRepo.insert).mockResolvedValue({
      id: NEW_IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: NEW_ACTOR_ID,
      email: 'contractor@example.com',
      ssoSubject: `local:contractor@example.com`,
      provider: 'local',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)
    vi.mocked(magicLinkSender.sendInvitation).mockResolvedValue(undefined)

    const result = await handler.execute(
      new InviteLocalUserCommand(
        TENANT_ID,
        'contractor@example.com',
        'John Contractor',
        [{ roleKey: 'employee', scopeType: 'global', scopeId: null }],
        ACTOR_ID,
      ),
    )

    expect(result).toEqual({ actorId: NEW_ACTOR_ID })
    expect(commandBus.execute).toHaveBeenCalledTimes(2) // CreateActor + 1 GrantRole
    expect(userIdentityRepo.insert).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      actorId: NEW_ACTOR_ID,
      email: 'contractor@example.com',
      ssoSubject: 'local:contractor@example.com',
      provider: 'local',
    })
    expect(magicLinkSender.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'contractor@example.com',
        displayName: 'John Contractor',
      }),
    )
    expect(auditRepo.insert).toHaveBeenCalled()
  })

  it('creates multiple role grants when multiple roles provided', async () => {
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand #1
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand #2
    vi.mocked(userIdentityRepo.insert).mockResolvedValue({
      id: NEW_IDENTITY_ID,
      tenantId: TENANT_ID,
      actorId: NEW_ACTOR_ID,
      email: 'contractor@example.com',
      ssoSubject: 'local:contractor@example.com',
      provider: 'local',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date(),
    })
    vi.mocked(auditRepo.insert).mockResolvedValue(undefined)
    vi.mocked(magicLinkSender.sendInvitation).mockResolvedValue(undefined)

    await handler.execute(
      new InviteLocalUserCommand(
        TENANT_ID,
        'contractor@example.com',
        'John Contractor',
        [
          { roleKey: 'employee', scopeType: 'global', scopeId: null },
          { roleKey: 'project_manager', scopeType: 'project', scopeId: 'proj-001' },
        ],
        ACTOR_ID,
      ),
    )

    // CreateActor + 2 GrantRole
    expect(commandBus.execute).toHaveBeenCalledTimes(3)
  })
})
