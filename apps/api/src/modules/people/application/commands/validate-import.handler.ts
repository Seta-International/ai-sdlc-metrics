import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  IMPORT_JOB_REPOSITORY,
  type IImportJobRepository,
} from '../../domain/repositories/import-job.repository'
import { ValidateImportCommand } from './validate-import.command'

@CommandHandler(ValidateImportCommand)
export class ValidateImportHandler implements ICommandHandler<ValidateImportCommand, void> {
  constructor(
    @Inject(IMPORT_JOB_REPOSITORY)
    private readonly importJobRepo: IImportJobRepository,
  ) {}

  async execute(command: ValidateImportCommand): Promise<void> {
    const job = await this.importJobRepo.findById(command.importJobId, command.tenantId)
    if (!job) {
      throw new Error(`Import job not found: ${command.importJobId}`)
    }
    if (job.status !== 'mapped') {
      throw new Error(`Import job must be in 'mapped' status to validate, got '${job.status}'`)
    }

    // TODO: implement actual validation logic (format checks, referential integrity, etc.)
    // For now, mark as validated with placeholder counts
    await this.importJobRepo.updateValidation(
      command.importJobId,
      command.tenantId,
      job.rowCount, // assume all valid for now
      0, // no errors
      0, // no warnings
      { message: 'Validation not yet implemented' },
    )
  }
}
