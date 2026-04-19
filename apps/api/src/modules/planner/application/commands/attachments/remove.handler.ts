import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { AttachmentRemovedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_ATTACHMENT_REPOSITORY,
  type ITaskAttachmentRepository,
} from '../../../domain/repositories/task-attachment.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AttachmentNotFoundException } from '../../../domain/exceptions/attachment-not-found.exception'
import { RemoveAttachmentCommand } from './remove.command'

@CommandHandler(RemoveAttachmentCommand)
export class RemoveAttachmentHandler implements ICommandHandler<RemoveAttachmentCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: ITaskAttachmentRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RemoveAttachmentCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const attachment = await this.attachmentRepo.findById(command.attachmentId, command.tenantId)
    if (!attachment || attachment.taskId !== command.taskId) {
      throw new AttachmentNotFoundException(command.attachmentId)
    }

    let expectedVersion = command.expectedVersion

    if (task.coverAttachmentId === command.attachmentId) {
      task.setCoverAttachment(null)
      await this.taskRepo.update(task, expectedVersion)
      expectedVersion = task.updatedAt.toISOString()
    }

    await this.attachmentRepo.remove(command.attachmentId, command.tenantId)

    await this.eventBus.publish(
      new AttachmentRemovedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.attachmentId,
        attachment.storageKey ?? null,
      ),
    )
  }
}
