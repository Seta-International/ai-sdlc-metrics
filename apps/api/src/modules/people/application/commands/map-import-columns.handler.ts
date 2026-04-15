import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  IMPORT_JOB_REPOSITORY,
  type IImportJobRepository,
} from '../../domain/repositories/import-job.repository'
import { MapImportColumnsCommand } from './map-import-columns.command'

@CommandHandler(MapImportColumnsCommand)
export class MapImportColumnsHandler implements ICommandHandler<MapImportColumnsCommand, void> {
  constructor(
    @Inject(IMPORT_JOB_REPOSITORY)
    private readonly importJobRepo: IImportJobRepository,
  ) {}

  async execute(command: MapImportColumnsCommand): Promise<void> {
    const job = await this.importJobRepo.findById(command.importJobId, command.tenantId)
    if (!job) {
      throw new Error(`Import job not found: ${command.importJobId}`)
    }

    await this.importJobRepo.updateMapping(
      command.importJobId,
      command.tenantId,
      command.columnMapping,
      command.saveMappingProfile ?? null,
    )
  }
}
