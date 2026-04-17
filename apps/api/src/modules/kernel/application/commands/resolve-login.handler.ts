import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { ResolveLoginCommand, type ResolveLoginResult } from './resolve-login.command'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  USER_IDENTITY_REPOSITORY,
  type IUserIdentityRepository,
} from '../../domain/repositories/user-identity.repository.port'
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
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(command: ResolveLoginCommand): Promise<ResolveLoginResult> {
    const { provider, ssoSubject, email, displayName, tenantId } = command

    const tenant = await this.tenantRepo.findById(tenantId)
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found; cannot resolve login`)
    }

    let actorId: string
    let identityId: string

    const existingIdentity = await this.userIdentityRepo.findBySsoSubject(ssoSubject, tenantId)

    if (existingIdentity) {
      if (existingIdentity.status === 'suspended') {
        throw new AccountSuspendedException()
      }

      const actor = await this.actorRepo.findById(existingIdentity.actorId, tenantId)
      if (actor?.status === 'suspended') {
        throw new AccountSuspendedException()
      }

      actorId = existingIdentity.actorId
      identityId = existingIdentity.id

      await this.userIdentityRepo.updateLastLogin(identityId)
    } else {
      // JIT provisioning — create actor + user_identity
      const newActor = await this.actorRepo.insert({
        tenantId,
        type: 'person',
        displayName,
        status: 'active',
      })
      actorId = newActor.id

      // Map magic_link -> local for DB storage
      const dbProvider = provider === 'magic_link' ? 'local' : provider

      const newIdentity = await this.userIdentityRepo.insert({
        tenantId,
        actorId,
        email,
        ssoSubject,
        provider: dbProvider,
      })
      identityId = newIdentity.id
    }

    const roleGrants = await this.roleGrantRepo.findByActorId(actorId, tenantId)
    const roles = roleGrants.map((g) => g.roleKey)

    await this.auditRepo.insert({
      tenantId,
      actorId,
      eventType: 'login',
      module: 'kernel',
      subjectId: identityId,
      payload: { provider, email },
    })

    return {
      actorId,
      tenantId,
      tenantName: tenant.name,
      displayName,
      email,
      roles,
      provider,
    }
  }
}
