import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { uuidv7 } from 'uuidv7'
import {
  SPRINT_REPOSITORY,
  type ISprintRepository,
} from '../../../domain/repositories/sprint.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreateSprintCommand } from './create-sprint.command'

@CommandHandler(CreateSprintCommand)
export class CreateSprintHandler implements ICommandHandler<CreateSprintCommand> {
  constructor(
    @Inject(SPRINT_REPOSITORY) private readonly repo: ISprintRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(command: CreateSprintCommand): Promise<{ id: string }> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const id = uuidv7()
    await this.repo.save({
      id,
      tenantId: command.tenantId,
      planId: command.planId,
      name: command.name,
      startDate: command.startDate,
      endDate: command.endDate,
      completedAt: null,
    })

    return { id }
  }
}
