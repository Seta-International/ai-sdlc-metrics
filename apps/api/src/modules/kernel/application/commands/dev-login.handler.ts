import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { DevLoginCommand } from './dev-login.command'
import type { ResolveLoginResult } from './resolve-login.command'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import {
  AUDIT_EVENT_REPOSITORY,
  type IAuditEventRepository,
} from '../../domain/repositories/audit-event.repository.port'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import { AccountSuspendedException } from '../../domain/exceptions/actor.exceptions'

@CommandHandler(DevLoginCommand)
export class DevLoginHandler implements ICommandHandler<DevLoginCommand, ResolveLoginResult> {
  constructor(
    @Inject(USER_IDENTITY_REPOSITORY) private readonly userIdentityRepo: IUserIdentityRepository,
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(AUDIT_EVENT_REPOSITORY) private readonly auditRepo: IAuditEventRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(command: DevLoginCommand): Promise<ResolveLoginResult> {
    const { email } = command

    const identity = await this.userIdentityRepo.findByEmail(email)
    if (!identity) {
      throw new Error('User not found')
    }

    if (identity.status !== 'active') {
      throw new AccountSuspendedException()
    }

    const actor = await this.actorRepo.findById(identity.actorId, identity.tenantId)
    if (!actor) {
      throw new Error('Actor not found')
    }

    if (actor.status === 'suspended') {
      throw new AccountSuspendedException()
    }

    const tenant = await this.tenantRepo.findById(identity.tenantId)
    if (!tenant) {
      throw new Error(`Tenant ${identity.tenantId} not found; cannot resolve dev login`)
    }

    const roleGrants = await this.roleGrantRepo.findByActorId(identity.actorId, identity.tenantId)
    const roles = roleGrants.map((g) => g.roleKey)

    await this.auditRepo.insert({
      tenantId: identity.tenantId,
      actorId: identity.actorId,
      eventType: 'login',
      module: 'kernel',
      subjectId: identity.id,
      payload: { provider: 'dev', email },
    })

    return {
      actorId: identity.actorId,
      tenantId: identity.tenantId,
      tenantName: tenant.name,
      displayName: actor.displayName,
      email: identity.email,
      roles,
      provider: 'dev',
    }
  }
}
