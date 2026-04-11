import { Inject } from '@nestjs/common'
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { CreateActorCommand } from '../../../kernel/application/commands/create-actor.command'
import { GrantRoleCommand } from '../../../kernel/application/commands/grant-role.command'
import type {
  RoleKeyValue,
  ScopeTypeValue,
} from '../../../kernel/domain/entities/role-grant.entity'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../../kernel/domain/repositories/user-identity.repository.port'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../../kernel/domain/repositories/audit-event.repository.port'
import { MAGIC_LINK_SENDER, type IMagicLinkSender } from '../../domain/ports/magic-link-sender.port'
import { InviteLocalUserCommand } from './invite-local-user.command'

export interface InviteLocalUserResult {
  actorId: string
}

@CommandHandler(InviteLocalUserCommand)
export class InviteLocalUserHandler implements ICommandHandler<
  InviteLocalUserCommand,
  InviteLocalUserResult
> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(USER_IDENTITY_REPOSITORY)
    private readonly userIdentityRepo: IUserIdentityRepository,
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepo: IAuditEventRepository,
    @Inject(MAGIC_LINK_SENDER)
    private readonly magicLinkSender: IMagicLinkSender,
  ) {}

  async execute(command: InviteLocalUserCommand): Promise<InviteLocalUserResult> {
    const { tenantId, email, displayName, roleAssignments, invitedBy } = command

    // Create actor
    const actorId = await this.commandBus.execute<CreateActorCommand, string>(
      new CreateActorCommand(tenantId, 'person', displayName),
    )

    // Create user identity
    await this.userIdentityRepo.insert({
      tenantId,
      actorId,
      email,
      ssoSubject: `local:${email}`,
      provider: 'local',
    })

    // Grant roles
    for (const assignment of roleAssignments) {
      await this.commandBus.execute(
        new GrantRoleCommand(
          tenantId,
          actorId,
          assignment.roleKey as RoleKeyValue,
          assignment.scopeType as ScopeTypeValue,
          assignment.scopeId,
          invitedBy,
        ),
      )
    }

    // Send invitation
    await this.magicLinkSender.sendInvitation({
      email,
      displayName,
      tenantSlug: tenantId,
      token: '',
    })

    // Audit log
    await this.auditRepo.insert({
      tenantId,
      actorId: invitedBy,
      eventType: 'local_user.invited',
      module: 'identity',
      subjectId: actorId,
      payload: {
        email,
        displayName,
        roles: roleAssignments.map((r) => r.roleKey),
      },
    })

    return { actorId }
  }
}
