import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { JobFamilyNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  JOB_FAMILY_REPOSITORY,
  type IJobFamilyRepository,
} from '../../domain/repositories/job-family.repository'
import {
  JOB_PROFILE_REPOSITORY,
  type IJobProfileRepository,
} from '../../domain/repositories/job-profile.repository'
import type { JobProfile } from '../../domain/entities/job-profile.entity'
import { CreateJobProfileCommand } from './create-job-profile.command'

@CommandHandler(CreateJobProfileCommand)
export class CreateJobProfileHandler implements ICommandHandler<
  CreateJobProfileCommand,
  JobProfile
> {
  constructor(
    @Inject(JOB_FAMILY_REPOSITORY)
    private readonly jobFamilyRepo: IJobFamilyRepository,
    @Inject(JOB_PROFILE_REPOSITORY)
    private readonly jobProfileRepo: IJobProfileRepository,
  ) {}

  async execute(command: CreateJobProfileCommand): Promise<JobProfile> {
    const family = await this.jobFamilyRepo.findById(command.jobFamilyId, command.tenantId)
    if (!family) throw new JobFamilyNotFoundException(command.jobFamilyId)

    return this.jobProfileRepo.insert({
      tenantId: command.tenantId,
      jobFamilyId: command.jobFamilyId,
      title: command.title,
      level: command.level ?? null,
      description: command.description ?? null,
      isActive: true,
    })
  }
}
