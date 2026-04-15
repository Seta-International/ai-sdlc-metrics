import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  EMPLOYMENT_DETAIL_REPOSITORY,
  type IEmploymentDetailRepository,
} from '../../domain/repositories/employment-detail.repository'
import type { EmploymentDetail } from '../../domain/entities/employment-detail.entity'
import { UpdateEmploymentDetailCommand } from './update-employment-detail.command'

@CommandHandler(UpdateEmploymentDetailCommand)
export class UpdateEmploymentDetailHandler implements ICommandHandler<
  UpdateEmploymentDetailCommand,
  EmploymentDetail
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(EMPLOYMENT_DETAIL_REPOSITORY)
    private readonly employmentDetailRepo: IEmploymentDetailRepository,
  ) {}

  async execute(command: UpdateEmploymentDetailCommand): Promise<EmploymentDetail> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    const updateData: Partial<Omit<EmploymentDetail, 'id' | 'tenantId' | 'employmentId'>> = {}

    if (command.nationalId !== undefined) updateData.nationalId = command.nationalId
    if (command.nationalIdType !== undefined) updateData.nationalIdType = command.nationalIdType
    if (command.nationalIdIssuedDate !== undefined)
      updateData.nationalIdIssuedDate = command.nationalIdIssuedDate
    if (command.nationalIdExpiryDate !== undefined)
      updateData.nationalIdExpiryDate = command.nationalIdExpiryDate
    if (command.taxId !== undefined) updateData.taxId = command.taxId
    if (command.socialInsuranceId !== undefined)
      updateData.socialInsuranceId = command.socialInsuranceId
    if (command.passportNumber !== undefined) updateData.passportNumber = command.passportNumber
    if (command.passportExpiryDate !== undefined)
      updateData.passportExpiryDate = command.passportExpiryDate
    if (command.bankAccountNumber !== undefined)
      updateData.bankAccountNumber = command.bankAccountNumber
    if (command.bankName !== undefined) updateData.bankName = command.bankName
    if (command.bankBranch !== undefined) updateData.bankBranch = command.bankBranch
    if (command.bankAccountHolder !== undefined)
      updateData.bankAccountHolder = command.bankAccountHolder
    if (command.bankSwiftCode !== undefined) updateData.bankSwiftCode = command.bankSwiftCode
    if (command.personalEmail !== undefined) updateData.personalEmail = command.personalEmail
    if (command.personalPhone !== undefined) updateData.personalPhone = command.personalPhone
    if (command.permanentAddress !== undefined)
      updateData.permanentAddress = command.permanentAddress
    if (command.currentAddress !== undefined) updateData.currentAddress = command.currentAddress
    if (command.emergencyContacts !== undefined)
      updateData.emergencyContacts = command.emergencyContacts
    if (command.countryData !== undefined) updateData.countryData = command.countryData
    if (command.customFields !== undefined) updateData.customFields = command.customFields

    return this.employmentDetailRepo.update(command.employmentId, command.tenantId, updateData)
  }
}
