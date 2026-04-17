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
import { CanDoQuery } from './can-do.query'

@QueryHandler(CanDoQuery)
export class CanDoHandler implements IQueryHandler<CanDoQuery, boolean> {
  constructor(
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
    @Inject(ROLE_PERMISSION_REPOSITORY)
    private readonly rolePermissionRepo: IRolePermissionRepository,
    @Inject(DELEGATION_REPOSITORY) private readonly delegationRepo: IDelegationRepository,
  ) {}

  async execute(query: CanDoQuery): Promise<boolean> {
    const { actorId, permission, context } = query

    // Step 1+2: Fetch grants and delegations
    const grants = await this.roleGrantRepo.findByActorId(actorId, context.tenantId)
    const delegations = await this.delegationRepo.findActiveDelegationsForDelegatee(
      actorId,
      context.tenantId,
    )

    // Step 3: Collect all unique role keys from grants + delegations
    const roleKeysFromGrants = grants.map((g) => g.roleKey)
    const roleKeysFromDelegations = delegations.map((d) => d.role)
    const allRoleKeys = [...new Set([...roleKeysFromGrants, ...roleKeysFromDelegations])]

    if (allRoleKeys.length === 0) {
      return false
    }

    // Step 4: Fetch role_permissions for those role_keys
    const permissions = await this.rolePermissionRepo.findByRoleKeys(allRoleKeys, context.tenantId)

    // Step 5: Find matching permissions
    const matchingPermissions = permissions.filter((p) => p.permissionKey === permission)

    if (matchingPermissions.length === 0) {
      return false
    }

    // Step 6: Check scope for each matching permission
    const isSelfPermission = permission.includes(':self:')

    for (const matchedPerm of matchingPermissions) {
      // Check self qualifier
      if (isSelfPermission && context.resourceOwnerId !== undefined) {
        if (actorId !== context.resourceOwnerId) {
          continue
        }
      }

      // Find grants (direct or delegated) that provide this role
      const directGrantsForRole = grants.filter((g) => g.roleKey === matchedPerm.roleKey)
      const delegatedForRole = delegations.filter((d) => d.role === matchedPerm.roleKey)

      // Check direct grants scope
      for (const grant of directGrantsForRole) {
        if (grant.scopeType === 'global') {
          return true
        }

        if (
          context.scopeType &&
          context.scopeId &&
          grant.scopeType === context.scopeType &&
          grant.scopeId === context.scopeId
        ) {
          return true
        }

        // No scope requested — any grant passes
        if (!context.scopeType) {
          return true
        }
      }

      // Delegated roles: treated as global scope (authority transfer).
      // TODO(access-control-02): For scoped delegation, consult delegator's own grants
      // to restrict scope. Tracked in access-control-strategy-design.md §1.
      if (delegatedForRole.length > 0) {
        if (!context.scopeType) {
          return true
        }
        // Delegation grants global scope for the delegated role until scoped
        // delegation is implemented (see TODO above).
        return true
      }
    }

    return false
  }
}
