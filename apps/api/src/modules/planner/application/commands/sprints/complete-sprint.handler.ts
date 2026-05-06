import { Inject } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import {
  SPRINT_REPOSITORY,
  type ISprintRepository,
} from '../../../domain/repositories/sprint.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CompleteSprintCommand } from './complete-sprint.command'

@CommandHandler(CompleteSprintCommand)
export class CompleteSprintHandler implements ICommandHandler<CompleteSprintCommand> {
  constructor(
    @Inject(SPRINT_REPOSITORY) private readonly repo: ISprintRepository,
    private readonly authSvc: PlanAuthorizationService,
  ) {}

  async execute(command: CompleteSprintCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)
    await this.repo.complete(command.sprintId, command.tenantId, new Date())
  }
}
