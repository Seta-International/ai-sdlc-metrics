import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  PROJECT_REPOSITORY,
  type IProjectRepository,
} from '../../domain/repositories/project.repository.port'
import type { Project } from '../../domain/entities/project.entity'
import { ListProjectsQuery } from './list-projects.query'

export interface ListProjectsResult {
  items: Project[]
  total: number
}

@QueryHandler(ListProjectsQuery)
export class ListProjectsHandler implements IQueryHandler<ListProjectsQuery, ListProjectsResult> {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projectRepo: IProjectRepository) {}

  async execute(query: ListProjectsQuery): Promise<ListProjectsResult> {
    const options = {
      limit: query.limit,
      offset: query.offset,
      accountId: query.accountId,
    }
    const [items, total] = await Promise.all([
      this.projectRepo.list(query.tenantId, options),
      this.projectRepo.count(query.tenantId, { accountId: query.accountId }),
    ])

    return { items, total }
  }
}
