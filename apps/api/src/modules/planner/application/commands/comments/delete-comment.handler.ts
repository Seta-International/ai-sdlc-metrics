import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskCommentDeletedEvent } from '@future/event-contracts'
import {
  TASK_COMMENT_REPOSITORY,
  type ITaskCommentRepository,
} from '../../../domain/repositories/task-comment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CommentNotFoundException } from '../../../domain/exceptions/comment-not-found.exception'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { DeleteCommentCommand } from './delete-comment.command'

@CommandHandler(DeleteCommentCommand)
export class DeleteCommentHandler implements ICommandHandler<DeleteCommentCommand> {
  constructor(
    @Inject(TASK_COMMENT_REPOSITORY)
    private readonly commentRepo: ITaskCommentRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: DeleteCommentCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const comment = await this.commentRepo.findById(command.commentId, command.tenantId)
    if (!comment || comment.taskId !== command.taskId) {
      throw new CommentNotFoundException(command.commentId)
    }

    if (comment.authorActorId !== command.actorId) {
      throw new UnauthorizedPlanAccessException(command.actorId, command.planId)
    }

    await this.commentRepo.softDelete(command.commentId, command.tenantId, new Date())

    await this.eventBus.publish(
      new TaskCommentDeletedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.commentId,
      ),
    )
  }
}
