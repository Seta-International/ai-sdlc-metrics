import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_ATTACHMENT_REPOSITORY,
  type ITaskAttachmentRepository,
} from '../../../domain/repositories/task-attachment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AttachmentNotFoundException } from '../../../domain/exceptions/attachment-not-found.exception'
import { SetCoverCommand } from './set-cover.command'

@CommandHandler(SetCoverCommand)
export class SetCoverHandler implements ICommandHandler<SetCoverCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: ITaskAttachmentRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(command: SetCoverCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    if (command.attachmentId != null) {
      const attachment = await this.attachmentRepo.findById(command.attachmentId, command.tenantId)
      if (!attachment || attachment.taskId !== command.taskId) {
        throw new AttachmentNotFoundException(command.attachmentId)
      }
    }

    task.setCoverAttachment(command.attachmentId ?? null)
    await this.taskRepo.update(task, command.expectedVersion)
  }
}
