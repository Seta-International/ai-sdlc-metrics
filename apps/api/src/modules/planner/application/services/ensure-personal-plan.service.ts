import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { CreatePersonalPlanCommand } from '../commands/plans/create-personal-plan.command'
import type { CreatePersonalPlanResult } from '../commands/plans/create-personal-plan.handler'

@Injectable()
export class EnsurePersonalPlanService {
  constructor(private readonly commandBus: CommandBus) {}

  async ensure(actorId: string, tenantId: string): Promise<string> {
    const result = await this.commandBus.execute<
      CreatePersonalPlanCommand,
      CreatePersonalPlanResult
    >(new CreatePersonalPlanCommand(actorId, tenantId))
    return result.planId
  }
}
