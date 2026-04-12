import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentProfileAlreadyExistsException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_PROFILE_REPOSITORY,
  type IEmploymentProfileRepository,
} from '../../domain/repositories/employment-profile.repository'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import type { EmploymentProfile } from '../../domain/entities/employment-profile.entity'
import { CreateEmploymentProfileCommand } from './create-employment-profile.command'

@CommandHandler(CreateEmploymentProfileCommand)
export class CreateEmploymentProfileHandler implements ICommandHandler<
  CreateEmploymentProfileCommand,
  EmploymentProfile
> {
  constructor(
    @Inject(EMPLOYMENT_PROFILE_REPOSITORY)
    private readonly profileRepo: IEmploymentProfileRepository,
    private readonly auditFacade: KernelAuditFacade,
  ) {}

  async execute(command: CreateEmploymentProfileCommand): Promise<EmploymentProfile> {
    // Guard: check if actor already has a profile
    const existing = await this.profileRepo.findByActorId(command.actorId, command.tenantId)
    if (existing) {
      throw new EmploymentProfileAlreadyExistsException(command.actorId)
    }

    // Create the profile (status starts at pre_hire)
    const profile = await this.profileRepo.insert({
      tenantId: command.tenantId,
      actorId: command.actorId,
      employeeCode: command.employeeCode,
      companyEmail: command.companyEmail,
      employmentType: command.employmentType,
      employmentStatus: 'pre_hire',
      workArrangement: command.workArrangement ?? 'onsite',
      hireDate: command.hireDate,
      terminationDate: null,
      jobTitle: command.jobTitle,
      jobLevel: command.jobLevel ?? null,
      costCenter: command.costCenter ?? null,
    })

    // Audit log
    await this.auditFacade.recordEvent({
      tenantId: command.tenantId,
      actorId: command.createdBy,
      eventType: 'employment_profile_created',
      module: 'people',
      subjectId: profile.id,
      payload: { actorId: command.actorId, employeeCode: command.employeeCode },
    })

    return profile
  }
}
