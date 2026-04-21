import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { EmployeeRehiredEvent } from '@future/event-contracts'
import {
  InvalidRehireException,
  PersonProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { JobHistoryRecorderService } from '../services/job-history-recorder.service'
import { RehireEmploymentCommand } from './rehire-employment.command'

@CommandHandler(RehireEmploymentCommand)
export class RehireEmploymentHandler implements ICommandHandler<
  RehireEmploymentCommand,
  { profileId: string; employmentId: string }
> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    private readonly eventBus: EventBus,
    private readonly recorder: JobHistoryRecorderService,
  ) {}

  async execute(
    command: RehireEmploymentCommand,
  ): Promise<{ profileId: string; employmentId: string }> {
    const prevProfile = await this.profileRepo.findById(command.previousProfileId, command.tenantId)
    if (!prevProfile) throw new PersonProfileNotFoundException(command.previousProfileId)

    const prevEmployment = await this.employmentRepo.findActiveByActorId(
      prevProfile.actorId,
      command.tenantId,
    )
    if (prevEmployment) {
      throw new InvalidRehireException(command.previousProfileId)
    }

    const prevEmployments = await this.employmentRepo.findByPersonProfileId(
      command.previousProfileId,
      command.tenantId,
    )
    const latestPrevEmployment = prevEmployments[0]

    const newProfile = await this.profileRepo.insert({
      tenantId: command.tenantId,
      actorId: prevProfile.actorId,
      familyName: prevProfile.familyName,
      middleName: prevProfile.middleName,
      givenName: prevProfile.givenName,
      fullName: prevProfile.fullName,
      fullNameUnaccented: prevProfile.fullNameUnaccented,
      preferredName: prevProfile.preferredName,
      nameDisplayOrder: prevProfile.nameDisplayOrder,
      dateOfBirth: prevProfile.dateOfBirth,
      gender: prevProfile.gender,
      nationality: prevProfile.nationality,
      maritalStatus: prevProfile.maritalStatus,
      photoDocumentId: prevProfile.photoDocumentId,
    })

    const newEmployment = await this.employmentRepo.insert({
      tenantId: command.tenantId,
      personProfileId: newProfile.id,
      previousProfileId: command.previousProfileId,
      employeeCode: null,
      companyEmail: null,
      workerType: command.workerType,
      employmentType: command.employmentType,
      countryCode: command.countryCode,
      employmentStatus: 'active',
      terminationDate: null,
      terminationReason: null,
      hireDate: command.rehireDate,
      originalHireDate:
        latestPrevEmployment?.originalHireDate ??
        latestPrevEmployment?.hireDate ??
        command.rehireDate,
    })

    await this.recorder.recordRehire({
      profileId: newProfile.id,
      tenantId: command.tenantId,
      effectiveFrom: command.rehireDate,
      jobTitle: command.jobTitle,
      departmentId: command.departmentId,
      managerProfileId: command.managerProfileId,
      changeReason: 'rehire',
      recordedBy: command.rehiredBy,
    })

    await this.eventBus.publish(
      new EmployeeRehiredEvent(
        command.tenantId,
        newProfile.id,
        command.previousProfileId,
        newEmployment.id,
        prevProfile.actorId,
        command.rehireDate,
        command.rehiredBy,
        new Date(),
      ),
    )

    return { profileId: newProfile.id, employmentId: newEmployment.id }
  }
}
