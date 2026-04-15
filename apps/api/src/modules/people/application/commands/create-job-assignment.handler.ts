import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentNotFoundException,
  JobProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  JOB_PROFILE_REPOSITORY,
  type IJobProfileRepository,
} from '../../domain/repositories/job-profile.repository'
import {
  JOB_ASSIGNMENT_REPOSITORY,
  type IJobAssignmentRepository,
} from '../../domain/repositories/job-assignment.repository'
import type { JobAssignment } from '../../domain/entities/job-assignment.entity'
import { CreateJobAssignmentCommand } from './create-job-assignment.command'

@CommandHandler(CreateJobAssignmentCommand)
export class CreateJobAssignmentHandler implements ICommandHandler<
  CreateJobAssignmentCommand,
  JobAssignment
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(JOB_PROFILE_REPOSITORY)
    private readonly jobProfileRepo: IJobProfileRepository,
    @Inject(JOB_ASSIGNMENT_REPOSITORY)
    private readonly jobAssignmentRepo: IJobAssignmentRepository,
  ) {}

  async execute(command: CreateJobAssignmentCommand): Promise<JobAssignment> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    const jobProfile = await this.jobProfileRepo.findById(command.jobProfileId, command.tenantId)
    if (!jobProfile) throw new JobProfileNotFoundException(command.jobProfileId)

    const current = await this.jobAssignmentRepo.findCurrent(command.employmentId, command.tenantId)
    if (current) {
      const effectiveTo = new Date(command.effectiveFrom)
      effectiveTo.setDate(effectiveTo.getDate() - 1)
      await this.jobAssignmentRepo.closeAssignment(current.id, command.tenantId, effectiveTo)
    }

    return this.jobAssignmentRepo.insert({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      jobProfileId: command.jobProfileId,
      effectiveFrom: command.effectiveFrom,
      effectiveTo: null,
      departmentId: command.departmentId ?? null,
      locationId: command.locationId ?? null,
      costCenterId: command.costCenterId ?? null,
      workArrangement: command.workArrangement ?? 'onsite',
      managerId: command.managerId ?? null,
      eventType: command.eventType,
      reason: command.reason ?? null,
      createdBy: command.createdBy,
    })
  }
}
