import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  EmploymentNotFoundException,
  PersonProfileNotFoundException,
} from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import {
  PERSON_PROFILE_REPOSITORY,
  type IPersonProfileRepository,
} from '../../domain/repositories/person-profile.repository'
import { EmailGenerationService } from '../services/email-generation.service'
import type { Employment } from '../../domain/entities/employment.entity'
import { GenerateCompanyEmailCommand } from './generate-company-email.command'

@CommandHandler(GenerateCompanyEmailCommand)
export class GenerateCompanyEmailHandler implements ICommandHandler<
  GenerateCompanyEmailCommand,
  Employment
> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
    @Inject(PERSON_PROFILE_REPOSITORY)
    private readonly profileRepo: IPersonProfileRepository,
    private readonly emailService: EmailGenerationService,
  ) {}

  async execute(command: GenerateCompanyEmailCommand): Promise<Employment> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) {
      throw new EmploymentNotFoundException(command.employmentId)
    }

    let email: string

    if (command.overrideEmail) {
      email = command.overrideEmail
    } else {
      const profile = await this.profileRepo.findById(employment.personProfileId, command.tenantId)
      if (!profile) {
        throw new PersonProfileNotFoundException(employment.personProfileId)
      }

      const candidates = await this.emailService.generateCandidates(
        command.tenantId,
        profile.familyName,
        profile.givenName,
        profile.middleName,
      )

      if (candidates.length === 0) {
        throw new Error('No email candidates available. Configure email generation settings.')
      }

      email = candidates[0]!
    }

    return this.employmentRepo.update(command.employmentId, command.tenantId, {
      companyEmail: email,
    })
  }
}
