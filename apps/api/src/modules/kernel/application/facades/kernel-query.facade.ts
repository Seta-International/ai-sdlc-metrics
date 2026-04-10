import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { Actor } from '../../domain/entities/actor.entity'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { Tenant } from '../../domain/entities/tenant.entity'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import { GetActorQuery } from '../queries/get-actor.query'
import { GetRoleGrantsQuery } from '../queries/get-role-grants.query'
import { GetTenantQuery } from '../queries/get-tenant.query'
import { GetUserIdentityBySsoSubjectQuery } from '../queries/get-user-identity-by-sso-subject.query'

/**
 * KernelQueryFacade is the only cross-module import allowed from the kernel.
 * No module imports kernel repositories or entities directly.
 */
@Injectable()
export class KernelQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getActor(actorId: string, tenantId: string): Promise<Actor | null> {
    return this.queryBus.execute(new GetActorQuery(actorId, tenantId))
  }

  getTenant(tenantId: string): Promise<Tenant | null> {
    return this.queryBus.execute(new GetTenantQuery(tenantId))
  }

  getRoleGrants(actorId: string, tenantId: string): Promise<RoleGrant[]> {
    return this.queryBus.execute(new GetRoleGrantsQuery(actorId, tenantId))
  }

  async hasRole(actorId: string, roleKey: string, tenantId: string): Promise<boolean> {
    const grants = await this.getRoleGrants(actorId, tenantId)
    return grants.some((grant) => grant.roleKey === roleKey)
  }

  async getActiveRoleGrant(
    actorId: string,
    roleKey: string,
    tenantId: string,
  ): Promise<RoleGrant | null> {
    const grants = await this.getRoleGrants(actorId, tenantId)
    return grants.find((grant) => grant.roleKey === roleKey) ?? null
  }

  getUserIdentityBySsoSubject(ssoSubject: string, tenantId: string): Promise<UserIdentity | null> {
    return this.queryBus.execute(new GetUserIdentityBySsoSubjectQuery(ssoSubject, tenantId))
  }
}
