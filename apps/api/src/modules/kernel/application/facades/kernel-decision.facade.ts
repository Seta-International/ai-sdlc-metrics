import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { CreateDecisionCaseCommand } from '../commands/create-decision-case.command'
import { ResolveDecisionCaseCommand } from '../commands/resolve-decision-case.command'

@Injectable()
export class KernelDecisionFacade {
  constructor(private readonly commandBus: CommandBus) {}

  createDecisionCase(
    tenantId: string,
    module: string,
    subjectId: string,
    requestedBy: string,
  ): Promise<string> {
    return this.commandBus.execute(
      new CreateDecisionCaseCommand(tenantId, module, subjectId, requestedBy),
    )
  }

  resolveDecisionCase(
    tenantId: string,
    caseId: string,
    finalAction: 'approved' | 'rejected',
    decidedBy: string,
    comment: string | null,
  ): Promise<void> {
    return this.commandBus.execute(
      new ResolveDecisionCaseCommand(tenantId, caseId, finalAction, decidedBy, comment),
    )
  }
}
