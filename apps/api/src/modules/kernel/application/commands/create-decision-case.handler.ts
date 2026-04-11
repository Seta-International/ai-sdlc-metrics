import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  DECISION_CASE_REPOSITORY,
  type IDecisionCaseRepository,
} from '../../domain/repositories/decision-case.repository.port'
import { CreateDecisionCaseCommand } from './create-decision-case.command'

@CommandHandler(CreateDecisionCaseCommand)
export class CreateDecisionCaseHandler implements ICommandHandler<
  CreateDecisionCaseCommand,
  string
> {
  constructor(
    @Inject(DECISION_CASE_REPOSITORY) private readonly decisionCaseRepo: IDecisionCaseRepository,
  ) {}

  async execute(command: CreateDecisionCaseCommand): Promise<string> {
    const decisionCase = await this.decisionCaseRepo.insert({
      tenantId: command.tenantId,
      module: command.module,
      subjectId: command.subjectId,
      requestedBy: command.requestedBy,
    })
    return decisionCase.id
  }
}
