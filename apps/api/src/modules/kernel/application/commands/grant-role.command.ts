import type {
  RoleGrantSourceValue,
  RoleKeyValue,
  ScopeTypeValue,
} from '../../domain/entities/role-grant.entity'

export class GrantRoleCommand {
  constructor(
    readonly tenantId: string,
    readonly actorId: string,
    readonly roleKey: RoleKeyValue,
    readonly scopeType: ScopeTypeValue,
    readonly scopeId: string | null,
    readonly grantedBy: string,
    readonly source: RoleGrantSourceValue = 'manual',
  ) {}
}
