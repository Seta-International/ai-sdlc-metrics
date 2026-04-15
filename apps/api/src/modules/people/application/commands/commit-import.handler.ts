import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  IMPORT_JOB_REPOSITORY,
  type IImportJobRepository,
} from '../../domain/repositories/import-job.repository'
import { CommitImportCommand } from './commit-import.command'

@CommandHandler(CommitImportCommand)
export class CommitImportHandler implements ICommandHandler<CommitImportCommand, void> {
  constructor(
    @Inject(IMPORT_JOB_REPOSITORY)
    private readonly importJobRepo: IImportJobRepository,
  ) {}

  async execute(command: CommitImportCommand): Promise<void> {
    const job = await this.importJobRepo.findById(command.importJobId, command.tenantId)
    if (!job) {
      throw new Error(`Import job not found: ${command.importJobId}`)
    }
    if (job.status !== 'validated' && job.status !== 'previewed') {
      throw new Error(`Import job must be validated or previewed to commit, got '${job.status}'`)
    }

    await this.importJobRepo.updateStatus(command.importJobId, command.tenantId, 'committed')
    // TODO: for rowCount > 100, queue via pg-boss; otherwise process synchronously
    // Actual CSV row processing is deferred to the pg-boss job handler (Task 22)
  }
}
