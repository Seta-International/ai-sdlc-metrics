import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  TASK_COMMENT_REPOSITORY,
  type ITaskCommentRepository,
} from '../../../domain/repositories/task-comment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { ListTaskCommentsQuery, type TaskCommentDto } from './list-task-comments.query'

@QueryHandler(ListTaskCommentsQuery)
export class ListTaskCommentsHandler implements IQueryHandler<
  ListTaskCommentsQuery,
  TaskCommentDto[]
> {
  constructor(
    @Inject(TASK_COMMENT_REPOSITORY)
    private readonly commentRepo: ITaskCommentRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(query: ListTaskCommentsQuery): Promise<TaskCommentDto[]> {
    await this.authSvc.assertCanEditPlan(query.actorId, query.planId, query.tenantId)

    const comments = await this.commentRepo.listByTask(query.taskId, query.tenantId, {
      cursor: query.cursor,
      limit: query.limit,
    })

    return comments.map((comment) => ({
      id: comment.id,
      taskId: comment.taskId,
      tenantId: comment.tenantId,
      authorActorId: comment.authorActorId,
      body: comment.body,
      postedAt: comment.postedAt,
      deleted: comment.isDeleted,
    }))
  }
}
