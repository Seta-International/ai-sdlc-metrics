import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { RoleGrant } from '../../domain/entities/role-grant.entity'
import {
  ROLE_GRANT_REPOSITORY,
  type IRoleGrantRepository,
} from '../../domain/repositories/role-grant.repository.port'
import { GetRoleGrantsQuery } from './get-role-grants.query'

@QueryHandler(GetRoleGrantsQuery)
export class GetRoleGrantsHandler implements IQueryHandler<GetRoleGrantsQuery, RoleGrant[]> {
  constructor(
    @Inject(ROLE_GRANT_REPOSITORY) private readonly roleGrantRepo: IRoleGrantRepository,
  ) {}

  execute(query: GetRoleGrantsQuery): Promise<RoleGrant[]> {
    return this.roleGrantRepo.findByActorId(query.actorId, query.tenantId)
  }
}
