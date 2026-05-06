import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TASK_HISTORY_REPOSITORY,
  type ITaskHistoryRepository,
  type HistoryPage,
} from '../../../domain/repositories/task-history.repository'
import { GetTaskHistoryQuery } from './get-task-history.query'

@QueryHandler(GetTaskHistoryQuery)
export class GetTaskHistoryHandler implements IQueryHandler<GetTaskHistoryQuery, HistoryPage> {
  constructor(@Inject(TASK_HISTORY_REPOSITORY) private readonly repo: ITaskHistoryRepository) {}

  async execute(query: GetTaskHistoryQuery): Promise<HistoryPage> {
    return this.repo.listByTask(query.taskId, query.tenantId, {
      cursor: query.cursor,
      limit: query.limit,
    })
  }
}
