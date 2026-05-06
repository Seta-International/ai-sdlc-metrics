import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  SPRINT_REPOSITORY,
  type ISprintRepository,
} from '../../../domain/repositories/sprint.repository'
import { ListSprintsQuery, type ListSprintsResult } from './list-sprints.query'

@QueryHandler(ListSprintsQuery)
export class ListSprintsHandler implements IQueryHandler<ListSprintsQuery, ListSprintsResult> {
  constructor(@Inject(SPRINT_REPOSITORY) private readonly repo: ISprintRepository) {}

  async execute(query: ListSprintsQuery): Promise<ListSprintsResult> {
    const sprints = await this.repo.listByPlan(query.planId, query.tenantId)
    return { sprints }
  }
}
