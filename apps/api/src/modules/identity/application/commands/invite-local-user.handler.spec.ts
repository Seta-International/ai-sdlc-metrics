import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InviteLocalUserCommand } from './invite-local-user.command'
import { InviteLocalUserHandler } from './invite-local-user.handler'
import type { CommandBus } from '@nestjs/cqrs'
import type { IUserIdentityRepository } from '../../../kernel/domain/repositories/user-identity.repository.port'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000002'
const NEW_ACTOR_ID = '01900000-0000-7000-8000-000000000003'
const ROLE_GRANT_ID = '01900000-0000-7000-8000-000000000004'

describe('InviteLocalUserHandler', () => {
  let handler: InviteLocalUserHandler
  let commandBus: CommandBus
  let userIdentityRepo: IUserIdentityRepository
  let auditRepo: IAuditEventRepository
  let magicLinkSender: IMagicLinkSender

  beforeEach(() => {
    commandBus = { execute: vi.fn() } as unknown as CommandBus
    userIdentityRepo = {
      findById: vi.fn(),
      findBySsoSubject: vi.fn(),
      findByEmail: vi.fn(),
      insert: vi.fn(),
      deprovisionByActorId: vi.fn(),
      updateLastLogin: vi.fn(),
    } as unknown as IUserIdentityRepository
    auditRepo = { insert: vi.fn() } as unknown as IAuditEventRepository
    magicLinkSender = { sendInvitation: vi.fn() } as unknown as IMagicLinkSender
    handler = new InviteLocalUserHandler(commandBus, userIdentityRepo, auditRepo, magicLinkSender)
  })

  it('creates actor, identity, role grant, and sends magic link', async () => {
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand

    const command = new InviteLocalUserCommand(
      TENANT_ID,
      'alice@example.com',
      'Alice Smith',
      [{ roleKey: 'employee', scopeType: 'global', scopeId: null }],
      ACTOR_ID,
    )

    const result = await handler.execute(command)

    expect(result).toEqual({ actorId: NEW_ACTOR_ID })
    expect(commandBus.execute).toHaveBeenCalledTimes(2)
    expect(userIdentityRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: NEW_ACTOR_ID,
        email: 'alice@example.com',
        ssoSubject: 'local:alice@example.com',
        provider: 'local',
      }),
    )
    expect(magicLinkSender.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'alice@example.com',
        displayName: 'Alice Smith',
      }),
    )
    expect(auditRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
        eventType: 'local_user.invited',
        module: 'identity',
        subjectId: NEW_ACTOR_ID,
      }),
    )
  })

  it('creates multiple role grants when multiple roles provided', async () => {
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand 1
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand 2

    const command = new InviteLocalUserCommand(
      TENANT_ID,
      'bob@example.com',
      'Bob Jones',
      [
        { roleKey: 'employee', scopeType: 'global', scopeId: null },
        { roleKey: 'hr_ops', scopeType: 'department', scopeId: 'dept-uuid' },
      ],
      ACTOR_ID,
    )

    await handler.execute(command)

    // 1 CreateActorCommand + 2 GrantRoleCommands = 3 total
    expect(commandBus.execute).toHaveBeenCalledTimes(3)
  })
})
