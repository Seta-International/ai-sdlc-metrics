import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  CONTRACT_VERSION_REPOSITORY,
  type IContractVersionRepository,
} from '../../domain/repositories/contract-version.repository'
import type { ContractVersion } from '../../domain/entities/contract-version.entity'
import { CreateContractVersionCommand } from './create-contract-version.command'

@CommandHandler(CreateContractVersionCommand)
export class CreateContractVersionHandler implements ICommandHandler<
  CreateContractVersionCommand,
  ContractVersion
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(CONTRACT_VERSION_REPOSITORY)
    private readonly contractVersionRepo: IContractVersionRepository,
  ) {}

  async execute(command: CreateContractVersionCommand): Promise<ContractVersion> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    // Supersede any existing active contract
    const existingActive = await this.contractVersionRepo.findActiveByEmploymentId(
      command.employmentId,
      command.tenantId,
    )
    if (existingActive) {
      await this.contractVersionRepo.update(existingActive.id, command.tenantId, {
        status: 'superseded',
      })
    }

    return this.contractVersionRepo.insert({
      tenantId: command.tenantId,
      employmentId: command.employmentId,
      contractType: command.contractType,
      startDate: command.startDate,
      endDate: command.endDate ?? null,
      status: 'active',
      probationEndDate: command.probationEndDate ?? null,
      noticePeriodDays: command.noticePeriodDays ?? null,
      workHoursPerWeek: command.workHoursPerWeek ?? null,
      baseSalary: command.baseSalary ?? null,
      salaryCurrency: command.salaryCurrency ?? null,
      salaryFrequency: command.salaryFrequency ?? null,
      documentId: null,
      note: command.note ?? null,
      createdBy: command.createdBy,
      signedAt: null,
      signedBy: null,
    })
  }
}
