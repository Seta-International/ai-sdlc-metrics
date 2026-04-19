import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { AttachmentAddedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_ATTACHMENT_REPOSITORY,
  type ITaskAttachmentRepository,
} from '../../../domain/repositories/task-attachment.repository'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { AddLinkCommand } from './add-link.command'

@CommandHandler(AddLinkCommand)
export class AddLinkHandler implements ICommandHandler<AddLinkCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: ITaskAttachmentRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AddLinkCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    let url: URL
    try {
      url = new URL(command.url)
    } catch {
      throw new Error(`Invalid URL: ${command.url}`)
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`URL must use http or https protocol`)
    }

    const attachment = TaskAttachment.createLink({
      id: command.attachmentId,
      taskId: command.taskId,
      tenantId: command.tenantId,
      createdBy: command.actorId,
      url: command.url,
      linkTitle: command.linkTitle,
    })

    await this.attachmentRepo.add(attachment)

    await this.eventBus.publish(
      new AttachmentAddedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.attachmentId,
        'link',
      ),
    )
  }
}
