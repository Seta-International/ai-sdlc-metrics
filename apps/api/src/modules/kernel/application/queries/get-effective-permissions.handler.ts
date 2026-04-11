import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import {
  ROLE_PERMISSION_REPOSITORY,
  type IRolePermissionRepository,
} from '../../domain/repositories/role-permission.repository.port'
import {
  DELEGATION_REPOSITORY,
  type IDelegationRepository,
} from '../../domain/repositories/delegation.repository.port'
import { GetEffectivePermissionsQuery } from './get-effective-permissions.query'

@QueryHandler(GetEffectivePermissionsQuery)
export class GetEffectivePermissionsHandler implements IQueryHandler<
  GetEffectivePermissionsQuery,
  string[]
> {
  constructor(
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
    @Inject(DELEGATION_REPOSITORY) private readonly delegationRepo: IDelegationRepository,
  ) {}

  async execute(query: GetEffectivePermissionsQuery): Promise<string[]> {
    const { actorId, tenantId } = query

    // Step 1+2: Fetch grants and delegations in parallel
    const [grants, delegations] = await Promise.all([
      this.roleGrantRepo.findByActorId(actorId, tenantId),
      this.delegationRepo.findActiveDelegationsForDelegatee(actorId, tenantId),
    ])

    // Step 3: Collect unique role keys
    const roleKeysFromGrants = grants.map((g) => g.roleKey)
    const roleKeysFromDelegations = delegations.map((d) => d.role)
    const allRoleKeys = [...new Set([...roleKeysFromGrants, ...roleKeysFromDelegations])]

    if (allRoleKeys.length === 0) {
      return []
    }

    // Step 4: Fetch all permissions for those roles
    const permissions = await this.rolePermissionRepo.findByRoleKeys(allRoleKeys, tenantId)

    // Step 5: Return unique permission keys
    const uniquePermissions = [...new Set(permissions.map((p) => p.permissionKey))]

    return uniquePermissions
  }
}
