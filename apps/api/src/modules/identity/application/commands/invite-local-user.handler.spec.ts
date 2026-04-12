import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { InviteLocalUserCommand } from './invite-local-user.command'
import { InviteLocalUserHandler } from './invite-local-user.handler'
import type { IAuditEventRepository } from '../../../kernel/domain/repositories/audit-event.repository.port'
import type { IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const NEW_ACTOR_ID = '01900000-0000-7000-8000-000000000050'
const ROLE_GRANT_ID = '01900000-0000-7000-8000-000000000052'
const PLAINTEXT_TOKEN = 'abc123token'

describe('InviteLocalUserHandler', () => {
  let handler: InviteLocalUserHandler
  let commandBus: CommandBus
  let auditRepo: IAuditEventRepository
  let magicLinkSender: IMagicLinkSender

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus

    auditRepo = {
      insert: vi.fn(),
    }
    magicLinkSender = {
      sendInvitation: vi.fn(),
    }
    handler = new InviteLocalUserHandler(commandBus, auditRepo, magicLinkSender)
  })

  it('creates actor, identity, role grants, and sends magic link', async () => {
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(undefined) // CreateUserIdentityCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand
      .mockResolvedValueOnce({ plaintextToken: PLAINTEXT_TOKEN }) // RequestMagicLinkCommand
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
    // CreateActor + CreateUserIdentity + 1 GrantRole + RequestMagicLink = 4 calls
    expect(commandBus.execute).toHaveBeenCalledTimes(4)
    expect(magicLinkSender.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'contractor@example.com',
        displayName: 'John Contractor',
        token: PLAINTEXT_TOKEN,
      }),
    )
    expect(auditRepo.insert).toHaveBeenCalled()
  })

  it('creates multiple role grants when multiple roles provided', async () => {
    vi.mocked(commandBus.execute)
      .mockResolvedValueOnce(NEW_ACTOR_ID) // CreateActorCommand
      .mockResolvedValueOnce(undefined) // CreateUserIdentityCommand
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand #1
      .mockResolvedValueOnce(ROLE_GRANT_ID) // GrantRoleCommand #2
      .mockResolvedValueOnce({ plaintextToken: PLAINTEXT_TOKEN }) // RequestMagicLinkCommand
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

    // CreateActor + CreateUserIdentity + 2 GrantRole + RequestMagicLink = 5
    expect(commandBus.execute).toHaveBeenCalledTimes(5)
  })
})
