import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  IMPORT_JOB_REPOSITORY,
  type IImportJobRepository,
} from '../../domain/repositories/import-job.repository'
import type { ImportJob } from '../../domain/entities/import-job.entity'
import { UploadImportFileCommand } from './upload-import-file.command'

@CommandHandler(UploadImportFileCommand)
export class UploadImportFileHandler implements ICommandHandler<
  UploadImportFileCommand,
  ImportJob
> {
  constructor(
    @Inject(IMPORT_JOB_REPOSITORY)
    private readonly importJobRepo: IImportJobRepository,
  ) {}

  async execute(command: UploadImportFileCommand): Promise<ImportJob> {
    return this.importJobRepo.insert({
      tenantId: command.tenantId,
      fileDocumentId: command.fileDocumentId,
      fileName: command.fileName,
      rowCount: command.rowCount,
      columnMapping: null,
      mappingProfile: null,
      status: 'uploaded',
      validCount: null,
      errorCount: null,
      warningCount: null,
      validationReport: null,
      createdCount: null,
      updatedCount: null,
      skippedCount: null,
      errorDetails: null,
      requestedBy: command.requestedBy,
      createdAt: new Date(),
      completedAt: null,
    })
  }
}
