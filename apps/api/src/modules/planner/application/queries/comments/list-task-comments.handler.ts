import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TASK_COMMENT_REPOSITORY,
  type ITaskCommentRepository,
} from '../../../domain/repositories/task-comment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import {
  ListTaskCommentsQuery,
  type TaskCommentDto,
  type ListTaskCommentsResult,
} from './list-task-comments.query'

@QueryHandler(ListTaskCommentsQuery)
export class ListTaskCommentsHandler implements IQueryHandler<
  ListTaskCommentsQuery,
  ListTaskCommentsResult
> {
  constructor(
    @Inject(TASK_COMMENT_REPOSITORY)
    private readonly commentRepo: ITaskCommentRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(query: ListTaskCommentsQuery): Promise<ListTaskCommentsResult> {
    await this.authSvc.assertCanEditPlan(query.actorId, query.planId, query.tenantId)

    const rows = await this.commentRepo.listByTask(query.taskId, query.tenantId, {
      cursor: query.cursor,
      limit: query.limit,
    })

    const hasMore = rows.length > query.limit
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows
    const nextCursor: string | null = hasMore ? (rows[query.limit - 1]?.id ?? null) : null

    const items: TaskCommentDto[] = pageRows.map((comment) => ({
      id: comment.id,
      taskId: comment.taskId,
      tenantId: comment.tenantId,
      authorActorId: comment.authorActorId,
      body: comment.body,
      postedAt: comment.postedAt,
      deleted: comment.isDeleted,
    }))

    return { items, nextCursor }
  }
}
