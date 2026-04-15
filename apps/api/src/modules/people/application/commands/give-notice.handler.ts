import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { EmploymentNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  EMPLOYMENT_REPOSITORY,
  type IEmploymentRepository,
} from '../../domain/repositories/employment.repository'
import { assertValidTransition } from '../../domain/value-objects/employment-state-machine'
import { GiveNoticeCommand } from './give-notice.command'

@CommandHandler(GiveNoticeCommand)
export class GiveNoticeHandler implements ICommandHandler<GiveNoticeCommand, void> {
  constructor(
    @Inject(EMPLOYMENT_REPOSITORY)
    private readonly employmentRepo: IEmploymentRepository,
  ) {}

  async execute(command: GiveNoticeCommand): Promise<void> {
    const employment = await this.employmentRepo.findById(command.employmentId, command.tenantId)
    if (!employment) throw new EmploymentNotFoundException(command.employmentId)

    assertValidTransition(employment.employmentStatus, 'notice_period')

    await this.employmentRepo.updateStatus(command.employmentId, command.tenantId, 'notice_period')
  }
}
