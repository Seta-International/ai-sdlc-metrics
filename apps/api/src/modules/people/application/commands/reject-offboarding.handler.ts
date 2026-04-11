import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { OffboardingCaseNotFoundException } from '../../domain/exceptions/people.exceptions'
import {
  OFFBOARDING_CASE_REPOSITORY,
  type IOffboardingCaseRepository,
} from '../../domain/repositories/offboarding.repository.port'
import { KernelWorkflowService } from '../../../kernel/application/facades/kernel-workflow.service'
import { RejectOffboardingCommand } from './reject-offboarding.command'

@CommandHandler(RejectOffboardingCommand)
export class RejectOffboardingHandler implements ICommandHandler<RejectOffboardingCommand, void> {
  constructor(
    @Inject(OFFBOARDING_CASE_REPOSITORY)
    private readonly caseRepo: IOffboardingCaseRepository,
    private readonly workflowService: KernelWorkflowService,
  ) {}

  async execute(command: RejectOffboardingCommand): Promise<void> {
    const offboardingCase = await this.caseRepo.findById(
      command.offboardingCaseId,
      command.tenantId,
    )
    if (!offboardingCase) throw new OffboardingCaseNotFoundException(command.offboardingCaseId)

    // 1. Reject the case
    await this.caseRepo.updateStatus(command.offboardingCaseId, command.tenantId, 'rejected')

    // 2. Resolve decision case
    if (offboardingCase.decisionCaseId) {
      await this.workflowService.resolveDecisionCase(
        command.tenantId,
        offboardingCase.decisionCaseId,
        'rejected',
        command.rejectedBy,
        command.comment,
      )
    }
  }
}
