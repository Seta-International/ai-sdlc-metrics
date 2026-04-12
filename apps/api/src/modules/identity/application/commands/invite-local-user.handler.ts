import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { CreateUserIdentityCommand } from '../../../kernel/application/commands/create-user-identity.command'
import { GrantRoleCommand } from '../../../kernel/application/commands/grant-role.command'
import { MAGIC_LINK_SENDER, type IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'
import { RequestMagicLinkCommand } from './request-magic-link.command'
import { InviteLocalUserCommand } from './invite-local-user.command'
import type {
  RoleKeyValue,
  ScopeTypeValue,
} from '../../../kernel/domain/entities/role-grant.entity'

@CommandHandler(InviteLocalUserCommand)
export class InviteLocalUserHandler implements ICommandHandler<
  InviteLocalUserCommand,
  { actorId: string }
> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    @Inject(MAGIC_LINK_SENDER)
    private readonly magicLinkSender: IMagicLinkSender,
  ) {}

  async execute(command: InviteLocalUserCommand): Promise<{ actorId: string }> {
    // 1. Create actor via kernel command bus
    const actorId = await this.commandBus.execute(
      new CreateActorCommand(command.tenantId, 'person', command.displayName),
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

    // 3. Grant roles via kernel command bus
    for (const role of command.roleAssignments) {
      await this.commandBus.execute(
        new GrantRoleCommand(
          command.tenantId,
          actorId,
          role.roleKey as RoleKeyValue,
          role.scopeType as ScopeTypeValue,
          role.scopeId,
          command.invitedBy,
        ),
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
    await this.auditRepo.insert({
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
