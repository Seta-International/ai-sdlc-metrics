import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'
import { ListEmployeesQuery } from './list-employees.query'

export type ListEmployeesResult = {
  items: EmploymentProfile[]
  total: number
}

@QueryHandler(ListEmployeesQuery)
export class ListEmployeesHandler implements IQueryHandler<
  ListEmployeesQuery,
  ListEmployeesResult
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
  ) {}

  async execute(query: ListEmployeesQuery): Promise<ListEmployeesResult> {
    const [items, all] = await Promise.all([
      this.profileRepo.listByTenant(query.tenantId, {
        limit: query.limit,
        offset: query.offset,
      }),
      this.profileRepo.listByTenant(query.tenantId),
    ])

    return { items, total: all.length }
  }
}
