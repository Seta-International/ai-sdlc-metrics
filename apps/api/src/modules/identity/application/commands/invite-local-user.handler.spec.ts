import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandBus } from '@nestjs/cqrs'
import { InviteLocalUserCommand } from './invite-local-user.command'
import { InviteLocalUserHandler } from './invite-local-user.handler'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { KernelUserIdentityFacade } from '../../../kernel/application/facades/kernel-user-identity.facade'
import type { IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'

const TENANT_ID = '01900000-0000-7000-8000-000000000001'
const ACTOR_ID = '01900000-0000-7000-8000-000000000005'
const NEW_ACTOR_ID = '01900000-0000-7000-8000-000000000050'
const PLAINTEXT_TOKEN = 'abc123token'

describe('InviteLocalUserHandler', () => {
  let handler: InviteLocalUserHandler
  let commandBus: CommandBus
  let auditFacade: KernelAuditFacade
  let actorFacade: KernelActorFacade
  let userIdentityFacade: KernelUserIdentityFacade
  let magicLinkSender: IMagicLinkSender

  beforeEach(() => {
    commandBus = {
      execute: vi.fn(),
    } as unknown as CommandBus

    auditFacade = {
      recordEvent: vi.fn(),
      publishOutboxEvent: vi.fn(),
    } as unknown as KernelAuditFacade

    actorFacade = {
      createActor: vi.fn(),
      deactivateActor: vi.fn(),
      grantRole: vi.fn(),
      revokeAllRoles: vi.fn(),
    } as unknown as KernelActorFacade

    userIdentityFacade = {
      createUserIdentity: vi.fn(),
      deprovisionUserIdentity: vi.fn(),
    } as unknown as KernelUserIdentityFacade

    magicLinkSender = {
      sendInvitation: vi.fn(),
    }
    handler = new InviteLocalUserHandler(
      commandBus,
      auditFacade,
      magicLinkSender,
      actorFacade,
      userIdentityFacade,
    )
  })

  it('creates actor, identity, role grants, and sends magic link', async () => {
    vi.mocked(actorFacade.createActor).mockResolvedValue(NEW_ACTOR_ID)
    vi.mocked(actorFacade.grantRole).mockResolvedValue(undefined)
    vi.mocked(userIdentityFacade.createUserIdentity).mockResolvedValue(undefined)
    vi.mocked(commandBus.execute).mockResolvedValueOnce({ plaintextToken: PLAINTEXT_TOKEN }) // RequestMagicLinkCommand
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)
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
    expect(actorFacade.createActor).toHaveBeenCalledWith(
      TENANT_ID,
      'person',
      'John Contractor',
      ACTOR_ID,
    )
    expect(userIdentityFacade.createUserIdentity).toHaveBeenCalledWith(
      TENANT_ID,
      NEW_ACTOR_ID,
      'contractor@example.com',
      'local:contractor@example.com',
      'local',
    )
    expect(actorFacade.grantRole).toHaveBeenCalledTimes(1)
    // Only RequestMagicLink goes through commandBus now
    expect(commandBus.execute).toHaveBeenCalledTimes(1)
    expect(magicLinkSender.sendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'contractor@example.com',
        displayName: 'John Contractor',
        token: PLAINTEXT_TOKEN,
      }),
    )
    expect(auditFacade.recordEvent).toHaveBeenCalled()
  })

  it('creates multiple role grants when multiple roles provided', async () => {
    vi.mocked(actorFacade.createActor).mockResolvedValue(NEW_ACTOR_ID)
    vi.mocked(actorFacade.grantRole).mockResolvedValue(undefined)
    vi.mocked(userIdentityFacade.createUserIdentity).mockResolvedValue(undefined)
    vi.mocked(commandBus.execute).mockResolvedValueOnce({ plaintextToken: PLAINTEXT_TOKEN }) // RequestMagicLinkCommand
    vi.mocked(auditFacade.recordEvent).mockResolvedValue(undefined)
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

    // 2 GrantRole calls via facade
    expect(actorFacade.grantRole).toHaveBeenCalledTimes(2)
    // Only RequestMagicLink goes through commandBus now
    expect(commandBus.execute).toHaveBeenCalledTimes(1)
  })
})
