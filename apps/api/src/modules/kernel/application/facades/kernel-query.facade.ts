import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { Actor } from '../../domain/entities/actor.entity'
import {
  ACTOR_REPOSITORY,
  type IActorRepository,
} from '../../domain/repositories/actor.repository.port'
import {
  TENANT_REPOSITORY,
  type ITenantRepository,
} from '../../domain/repositories/tenant.repository.port'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import type { Tenant } from '../../domain/entities/tenant.entity'
import type { UserIdentity } from '../../domain/entities/user-identity.entity'
import { GetActorQuery } from '../queries/get-actor.query'
import { GetRoleGrantsQuery } from '../queries/get-role-grants.query'
import { GetTenantQuery } from '../queries/get-tenant.query'
import { GetUserIdentityBySsoSubjectQuery } from '../queries/get-user-identity-by-sso-subject.query'
import { CanDoQuery, type CanDoContext } from '../queries/can-do.query'
export type { CanDoContext } from '../queries/can-do.query'
import { GetEffectivePermissionsQuery } from '../queries/get-effective-permissions.query'
import { GetRolePermissionsQuery } from '../queries/get-role-permissions.query'
import type { RolePermissionsDto } from '../queries/get-role-permissions.handler'
import { ListRolesQuery } from '../queries/list-roles.query'
import type { RoleSummaryDto } from '../queries/list-roles.handler'
import { GetLocalUsersWithActorsQuery } from '../queries/get-local-users-with-actors.query'
import type { LocalUserWithActorDto } from '../queries/get-local-users-with-actors.handler'
import { GetUserIdentityByActorIdQuery } from '../queries/get-user-identity-by-actor-id.query'
import { ListTenantsQuery } from '../queries/list-tenants.query'
import type { TenantSummaryDto } from '../queries/list-tenants.handler'

/**
 * KernelQueryFacade is the only cross-module import allowed from the kernel.
 * No module imports kernel repositories or entities directly.
 */
@Injectable()
export class KernelQueryFacade {
  constructor(
    private readonly queryBus: QueryBus,
    @Inject(ACTOR_REPOSITORY) private readonly actorRepo: IActorRepository,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
  ) {}

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

  canDo(actorId: string, permission: string, context: CanDoContext): Promise<boolean> {
    return this.queryBus.execute(new CanDoQuery(actorId, permission, context))
  }

  getEffectivePermissions(actorId: string, tenantId: string): Promise<string[]> {
    return this.queryBus.execute(new GetEffectivePermissionsQuery(actorId, tenantId))
  }

  getRolePermissions(roleKey: string, tenantId: string): Promise<RolePermissionsDto> {
    return this.queryBus.execute(new GetRolePermissionsQuery(tenantId, roleKey))
  }

  listRoles(tenantId: string): Promise<RoleSummaryDto[]> {
    return this.queryBus.execute(new ListRolesQuery(tenantId))
  }

  getLocalUsersWithActors(tenantId: string): Promise<LocalUserWithActorDto[]> {
    return this.queryBus.execute(new GetLocalUsersWithActorsQuery(tenantId))
  }

  /**
   * Batch-fetch actors by IDs. Used by board/snapshot queries to enrich assignee display info.
   * Returns a map of actorId → { displayName }. Missing actors are omitted.
   */
  async getActorsByIds(
    ids: string[],
    tenantId: string,
  ): Promise<Map<string, { displayName: string }>> {
    if (ids.length === 0) return new Map()
    const actors = await this.actorRepo.findManyByIds(ids, tenantId)
    return new Map(actors.map((a) => [a.id, { displayName: a.displayName }]))
  }

  /**
   * Returns the SSO subject (e.g. Microsoft Entra OID) for a given actor.
   * Returns null if no user identity exists for that actor.
   */
  async getExternalUserId(actorId: string, tenantId: string): Promise<string | null> {
    const identity: UserIdentity | null = await this.queryBus.execute(
      new GetUserIdentityByActorIdQuery(actorId, tenantId),
    )
    return identity?.ssoSubject ?? null
  }

  /**
   * Returns all tenant IDs in the system. Used by scheduled fanout workers that must
   * iterate over every tenant (e.g. task-daily-snapshot). The tenant table has no RLS
   * so this is safe to call without a request context.
   */
  async listAllTenantIds(): Promise<string[]> {
    const tenants = await this.tenantRepo.findAll()
    return tenants.map((t) => t.id)
  }

  /**
   * Returns all tenants (active, suspended, cancelled, hidden system tenant).
   * Intended for platform_admin use — route-level auth enforcement is the caller's
   * responsibility.
   */
  listTenants(requestorActorId: string): Promise<TenantSummaryDto[]> {
    return this.queryBus.execute(new ListTenantsQuery(requestorActorId))
  }

  /**
   * Look up a tenant by its URL slug (e.g. "seta").
   * Returns null if no tenant with that slug exists.
   * Used by the auth-gateway discovery flow — no RLS context required.
   */
  getTenantBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantRepo.findBySlug(slug)
  }
}
