import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { extname } from 'node:path'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { STORAGE_CLIENT, type StorageClient } from '../../../domain/ports/storage-client.port'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { UnsafeFileTypeException } from '../../../domain/exceptions/unsafe-file-type.exception'
import { FileTooLargeException } from '../../../domain/exceptions/file-too-large.exception'
import { buildEvidenceKeyPrefix } from './evidence-key'
import { RequestEvidenceUploadCommand } from './request-upload.command'
import { uuidv7 } from 'uuidv7'

const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

const BLOCKED_EXTENSIONS = new Set(['.exe', '.sh', '.bat', '.cmd', '.com', '.msi', '.vbs', '.ps1'])

export interface RequestEvidenceUploadResult {
  uploadUrl: string
  storageKey: string
  expiresAt: Date
}

@CommandHandler(RequestEvidenceUploadCommand)
export class RequestEvidenceUploadHandler implements ICommandHandler<RequestEvidenceUploadCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(STORAGE_CLIENT) private readonly storageClient: StorageClient,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(command: RequestEvidenceUploadCommand): Promise<RequestEvidenceUploadResult> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    const ext = extname(command.filename).toLowerCase()
    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new UnsafeFileTypeException(ext)
    }

    if (command.sizeBytes > MAX_SIZE_BYTES) {
      throw new FileTooLargeException(command.sizeBytes, MAX_SIZE_BYTES)
    }

    const prefix = buildEvidenceKeyPrefix(command.tenantId, command.taskId)
    const storageKey = `${prefix}${uuidv7()}${ext}`

    const { url, expiresAt } = await this.storageClient.getUploadUrl(storageKey, {
      contentType: command.contentType,
      maxSizeBytes: command.sizeBytes,
      expiresIn: 900,
    })

    return { uploadUrl: url, storageKey, expiresAt }
  }
}
