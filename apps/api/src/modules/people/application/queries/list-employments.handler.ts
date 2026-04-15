import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Employment } from '../../domain/entities/employment.entity'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { ListEmploymentsQuery } from './list-employments.query'

export type ListEmploymentsResult = {
  items: Employment[]
  total: number
}

@QueryHandler(ListEmploymentsQuery)
export class ListEmploymentsHandler implements IQueryHandler<
  ListEmploymentsQuery,
  ListEmploymentsResult
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(query: ListEmploymentsQuery): Promise<ListEmploymentsResult> {
    const filters = {
      status: query.status,
      countryCode: query.countryCode,
      limit: query.limit,
      offset: query.offset,
    }

    const [items, total] = await Promise.all([
      this.employmentRepo.listByTenant(query.tenantId, filters),
      this.employmentRepo.countByTenant(query.tenantId, {
        status: query.status,
        countryCode: query.countryCode,
      }),
    ])

    return { items, total }
  }
}
