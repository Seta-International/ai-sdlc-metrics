import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  DECISION_CASE_REPOSITORY,
  type IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'
import { ResolveDecisionCaseCommand } from './resolve-decision-case.command'

@CommandHandler(ResolveDecisionCaseCommand)
export class ResolveDecisionCaseHandler implements ICommandHandler<
  ResolveDecisionCaseCommand,
  void
> {
  constructor(
    @Inject(DECISION_CASE_REPOSITORY) private readonly decisionCaseRepo: IDecisionCaseRepository,
  ) {}

  async execute(command: ResolveDecisionCaseCommand): Promise<void> {
    await this.decisionCaseRepo.updateStatus(command.caseId, command.tenantId, command.finalAction)
    await this.decisionCaseRepo.insertOutcome({
      tenantId: command.tenantId,
      caseId: command.caseId,
      finalAction: command.finalAction,
      decidedBy: command.decidedBy,
      comment: command.comment,
    })
  }
}
