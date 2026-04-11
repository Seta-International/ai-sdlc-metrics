import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { AccountSuspendedException } from '../../domain/exceptions/account-suspended.exception'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../domain/repositories/audit-event.repository.port'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import { ResolveLoginCommand, type ResolveLoginResult } from './resolve-login.command'

@CommandHandler(ResolveLoginCommand)
export class ResolveLoginHandler implements ICommandHandler<
  ResolveLoginCommand,
  ResolveLoginResult
> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY) private readonly userIdentityRepo: IUserIdentityRepository,
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly auditRepo: IAuditEventRepository,
  ) {}

  async execute(command: ResolveLoginCommand): Promise<ResolveLoginResult> {
    const { provider, ssoSubject, email, displayName, tenantId } = command

    let identity = await this.userIdentityRepo.findBySsoSubject(ssoSubject, tenantId)
    let actorId: string

    if (identity) {
      if (identity.status === 'suspended' || identity.status === 'deprovisioned') {
        throw new AccountSuspendedException(identity.actorId)
      }

      const actor = await this.actorRepo.findById(identity.actorId, tenantId)
      if (actor && (actor.status === 'suspended' || actor.status === 'archived')) {
        throw new AccountSuspendedException(actor.id)
      }

      actorId = identity.actorId
      await this.userIdentityRepo.updateLastLogin(identity.id)
    } else {
      // JIT provision: create actor then identity
      const resolvedProvider = provider === 'magic_link' ? 'local' : provider
      const actor = await this.actorRepo.insert({
        tenantId,
        type: 'person',
        displayName,
        status: 'active',
      })

      identity = await this.userIdentityRepo.insert({
        tenantId,
        actorId: actor.id,
        email,
        ssoSubject,
        provider: resolvedProvider as 'microsoft' | 'google' | 'local',
        status: 'active',
      })

      actorId = actor.id
    }

    const grants = await this.roleGrantRepo.findByActorId(actorId, tenantId)
    const roles = grants.map((g) => g.roleKey)

    await this.auditRepo.insert({
      tenantId,
      actorId,
      eventType: 'user_login',
      module: 'kernel',
      subjectId: actorId,
      payload: { provider, email },
    })

    return { actorId, tenantId, roles, provider }
  }
}
