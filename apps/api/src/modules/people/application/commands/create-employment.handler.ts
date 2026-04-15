import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { PersonProfileNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import type { Employment } from '../../domain/entities/employment.entity'
import { CreateEmploymentCommand } from './create-employment.command'

@CommandHandler(CreateEmploymentCommand)
export class CreateEmploymentHandler implements ICommandHandler<
  CreateEmploymentCommand,
  Employment
> {
  constructor(
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
  ) {}

  async execute(command: CreateEmploymentCommand): Promise<Employment> {
    const profile = await this.personProfileRepo.findById(command.personProfileId, command.tenantId)
    if (!profile) throw new PersonProfileNotFoundException(command.personProfileId)

    const employment = await this.employmentRepo.insert({
      tenantId: command.tenantId,
      personProfileId: command.personProfileId,
      workerType: command.workerType,
      employmentType: command.employmentType,
      countryCode: command.countryCode,
      hireDate: command.hireDate,
      employeeCode: command.employeeCode ?? null,
      companyEmail: command.companyEmail ?? null,
      originalHireDate: command.originalHireDate ?? null,
      employmentStatus: 'pre_hire',
      terminationDate: null,
      terminationReason: null,
    })

    await this.employmentDetailRepo.insert({
      tenantId: command.tenantId,
      employmentId: employment.id,
      nationalId: null,
      nationalIdType: null,
      nationalIdIssuedDate: null,
      nationalIdExpiryDate: null,
      taxId: null,
      socialInsuranceId: null,
      passportNumber: null,
      passportExpiryDate: null,
      bankAccountNumber: null,
      bankName: null,
      bankBranch: null,
      bankAccountHolder: null,
      bankSwiftCode: null,
      personalEmail: null,
      personalPhone: null,
      permanentAddress: null,
      currentAddress: null,
      emergencyContacts: null,
      countryData: null,
      customFields: null,
    })

    return employment
  }
}
