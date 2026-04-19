import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskCommentPostedEvent } from '@future/event-contracts'
import {
  TASK_COMMENT_REPOSITORY,
  type ITaskCommentRepository,
} from '../../../domain/repositories/task-comment.repository'
import { TaskComment } from '../../../domain/entities/task-comment.entity'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { PostCommentCommand } from './post-comment.command'

@CommandHandler(PostCommentCommand)
export class PostCommentHandler implements ICommandHandler<PostCommentCommand> {
  constructor(
    @Inject(TASK_COMMENT_REPOSITORY)
    private readonly commentRepo: ITaskCommentRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: PostCommentCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const comment = TaskComment.create({
      id: command.commentId,
      taskId: command.taskId,
      tenantId: command.tenantId,
      authorActorId: command.actorId,
      body: command.body,
    })

    await this.commentRepo.add(comment)

    await this.eventBus.publish(
      new TaskCommentPostedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.commentId,
        command.body,
      ),
    )
  }
}
