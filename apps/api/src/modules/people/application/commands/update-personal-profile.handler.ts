import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import type { PersonProfile } from '../../domain/entities/person-profile.entity'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'
import { UpdatePersonalProfileCommand } from './update-personal-profile.command'

export interface UpdatePersonalProfileResult {
  personProfile: PersonProfile
  detail: EmploymentDetail | null
}

@CommandHandler(UpdatePersonalProfileCommand)
export class UpdatePersonalProfileHandler implements ICommandHandler<
  UpdatePersonalProfileCommand,
  UpdatePersonalProfileResult
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly personProfileRepo: IPersonProfileRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
  ) {}

  async execute(command: UpdatePersonalProfileCommand): Promise<UpdatePersonalProfileResult> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    const personProfile = await this.personProfileRepo.findById(
      employment.personProfileId,
      command.tenantId,
    )
    if (!personProfile) throw new EmploymentNotFoundException(command.employmentId)

    const profileUpdates: Partial<
      Omit<PersonProfile, 'id' | 'tenantId' | 'actorId' | 'createdAt'>
    > = {}
    if (command.preferredName !== undefined) profileUpdates.preferredName = command.preferredName
    if (command.dateOfBirth !== undefined) profileUpdates.dateOfBirth = command.dateOfBirth
    if (command.gender !== undefined)
      profileUpdates.gender = command.gender as PersonProfile['gender']
    if (command.nationality !== undefined) profileUpdates.nationality = command.nationality
    if (command.maritalStatus !== undefined)
      profileUpdates.maritalStatus = command.maritalStatus as PersonProfile['maritalStatus']
    if (command.nameDisplayOrder !== undefined)
      profileUpdates.nameDisplayOrder = command.nameDisplayOrder

    let updatedProfile = personProfile
    if (Object.keys(profileUpdates).length > 0) {
      updatedProfile = await this.personProfileRepo.update(
        personProfile.id,
        command.tenantId,
        profileUpdates,
      )
    }

    const detailUpdates: Partial<Omit<EmploymentDetail, 'id' | 'tenantId' | 'employmentId'>> = {}
    if (command.personalEmail !== undefined) detailUpdates.personalEmail = command.personalEmail
    if (command.personalPhone !== undefined) detailUpdates.personalPhone = command.personalPhone
    if (command.permanentAddress !== undefined)
      detailUpdates.permanentAddress = command.permanentAddress
    if (command.currentAddress !== undefined) detailUpdates.currentAddress = command.currentAddress
    if (command.nationalId !== undefined) detailUpdates.nationalId = command.nationalId
    if (command.nationalIdType !== undefined) detailUpdates.nationalIdType = command.nationalIdType
    if (command.nationalIdIssuedDate !== undefined)
      detailUpdates.nationalIdIssuedDate = command.nationalIdIssuedDate
    if (command.nationalIdExpiryDate !== undefined)
      detailUpdates.nationalIdExpiryDate = command.nationalIdExpiryDate
    if (command.passportNumber !== undefined) detailUpdates.passportNumber = command.passportNumber
    if (command.passportExpiryDate !== undefined)
      detailUpdates.passportExpiryDate = command.passportExpiryDate
    if (command.bankAccountNumber !== undefined)
      detailUpdates.bankAccountNumber = command.bankAccountNumber
    if (command.bankName !== undefined) detailUpdates.bankName = command.bankName
    if (command.bankBranch !== undefined) detailUpdates.bankBranch = command.bankBranch
    if (command.bankSwiftCode !== undefined) detailUpdates.bankSwiftCode = command.bankSwiftCode
    if (command.bankAccountHolder !== undefined)
      detailUpdates.bankAccountHolder = command.bankAccountHolder
    if (command.emergencyContacts !== undefined)
      detailUpdates.emergencyContacts = command.emergencyContacts

    let updatedDetail: EmploymentDetail | null = null
    if (Object.keys(detailUpdates).length > 0) {
      updatedDetail = await this.employmentDetailRepo.update(
        command.employmentId,
        command.tenantId,
        detailUpdates,
      )
    }

    return { personProfile: updatedProfile, detail: updatedDetail }
  }
}
