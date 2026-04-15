import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { JobFamilyNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  JOB_FAMILY_REPOSITORY,
  type IJobFamilyRepository,
} from '../../domain/repositories/job-family.repository'
import type { JobFamily } from '../../domain/entities/job-family.entity'
import { CreateJobFamilyCommand } from './create-job-family.command'

@CommandHandler(CreateJobFamilyCommand)
export class CreateJobFamilyHandler implements ICommandHandler<CreateJobFamilyCommand, JobFamily> {
  constructor(
    @Inject(JOB_FAMILY_REPOSITORY)
    private readonly jobFamilyRepo: IJobFamilyRepository,
  ) {}

  async execute(command: CreateJobFamilyCommand): Promise<JobFamily> {
    if (command.parentId) {
      const parent = await this.jobFamilyRepo.findById(command.parentId, command.tenantId)
      if (!parent) throw new JobFamilyNotFoundException(command.parentId)
    }

    return this.jobFamilyRepo.insert({
      tenantId: command.tenantId,
      name: command.name,
      description: command.description ?? null,
      parentId: command.parentId ?? null,
      isActive: true,
    })
  }
}
