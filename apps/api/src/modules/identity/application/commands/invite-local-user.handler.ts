import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { KernelActorFacade } from '../../../kernel/application/facades/kernel-actor.facade'
import { CreateUserIdentityCommand } from '../../../kernel/application/commands/create-user-identity.command'
import { MAGIC_LINK_SENDER, type IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'
import { RequestMagicLinkCommand } from './request-magic-link.command'
import { InviteLocalUserCommand } from './invite-local-user.command'
import type { RoleKeyValue, ScopeTypeValue } from '@future/core'

@CommandHandler(InviteLocalUserCommand)
export class InviteLocalUserHandler implements ICommandHandler<
  InviteLocalUserCommand,
  { actorId: string }
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly auditFacade: KernelAuditFacade,
    @Inject(MAGIC_LINK_SENDER)
    private readonly magicLinkSender: IMagicLinkSender,
    private readonly actorFacade: KernelActorFacade,
  ) {}

  async execute(command: InviteLocalUserCommand): Promise<{ actorId: string }> {
    // 1. Create actor via facade
    const actorId = await this.actorFacade.createActor(
      command.tenantId,
      'person',
      command.displayName,
      command.invitedBy,
    )

    // 2. Create user_identity with provider='local' via kernel command bus
    await this.commandBus.execute(
      new CreateUserIdentityCommand(
        command.tenantId,
        actorId,
        command.email,
        `local:${command.email}`,
        'local',
      ),
    )

    // 3. Grant roles via facade
    for (const role of command.roleAssignments) {
      await this.actorFacade.grantRole(
        actorId,
        role.roleKey as RoleKeyValue,
        role.scopeType as ScopeTypeValue,
        role.scopeId,
        command.tenantId,
        command.invitedBy,
      )
    }

    // 4. Generate magic link token, then send invitation email
    const { plaintextToken } = await this.commandBus.execute(
      new RequestMagicLinkCommand(command.tenantId, command.email),
    )
    await this.magicLinkSender.sendInvitation({
      email: command.email,
      displayName: command.displayName,
      tenantSlug: command.tenantId,
      token: plaintextToken,
    })

    // 5. Audit
    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.invitedBy,
      eventType: 'local_user.invited',
      module: 'identity',
      subjectId: actorId,
      payload: {
        email: command.email,
        displayName: command.displayName,
        roles: command.roleAssignments.map((r) => r.roleKey),
      },
    })

    return { actorId }
  }
}
