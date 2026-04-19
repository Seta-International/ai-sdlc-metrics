import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { AttachmentAddedEvent } from '@future/event-contracts'
import { type StorageClient } from '@future/storage'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_ATTACHMENT_REPOSITORY,
  type ITaskAttachmentRepository,
} from '../../../domain/repositories/task-attachment.repository'
import { TaskAttachment } from '../../../domain/entities/task-attachment.entity'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { STORAGE_CLIENT } from './request-upload.handler'
import { FinalizeUploadCommand } from './finalize-upload.command'

@CommandHandler(FinalizeUploadCommand)
export class FinalizeUploadHandler implements ICommandHandler<FinalizeUploadCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepo: ITaskAttachmentRepository,
    @Inject(STORAGE_CLIENT) private readonly storageClient: StorageClient,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: FinalizeUploadCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const expectedPrefix = `${command.tenantId}/documents/planner/${command.taskId}/`
    if (!command.storageKey.startsWith(expectedPrefix)) {
      throw new Error(`Invalid storage key: key does not belong to this task`)
    }

    const meta = await this.storageClient.headObject(command.storageKey)
    if (!meta) {
      throw new Error(`Storage key not found: ${command.storageKey}`)
    }

    const attachment = TaskAttachment.createFile({
      id: command.attachmentId,
      taskId: command.taskId,
      tenantId: command.tenantId,
      createdBy: command.actorId,
      storageKey: command.storageKey,
      filename: command.filename,
      contentType: command.contentType,
      sizeBytes: command.sizeBytes,
    })

    await this.attachmentRepo.add(attachment)

    if (command.setAsCover && command.contentType.startsWith('image/')) {
      const expectedVersion = task.updatedAt.toISOString()
      task.setCoverAttachment(command.attachmentId)
      await this.taskRepo.update(task, expectedVersion)
    }

    await this.eventBus.publish(
      new AttachmentAddedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.attachmentId,
        'file',
      ),
    )
  }
}
