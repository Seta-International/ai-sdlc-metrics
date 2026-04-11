import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type { ProfileResult } from '../queries/get-profile.handler'
import type { ListEmployeesResult } from '../queries/list-employees.handler'
import { GetProfileQuery } from '../queries/get-profile.query'
import { ListEmployeesQuery } from '../queries/list-employees.query'

@Injectable()
export class PeopleQueryFacade {
  constructor(private readonly queryBus: QueryBus) {}

  getProfile(actorId: string, tenantId: string): Promise<ProfileResult | null> {
    return this.queryBus.execute(new GetProfileQuery(actorId, tenantId))
  }

  listEmployees(tenantId: string, limit: number, offset: number): Promise<ListEmployeesResult> {
    return this.queryBus.execute(new ListEmployeesQuery(tenantId, limit, offset))
  }
}
