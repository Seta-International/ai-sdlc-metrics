import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskDependencyRemovedEvent } from '@future/event-contracts'
import {
  TASK_DEPENDENCY_REPOSITORY,
  type ITaskDependencyRepository,
} from '../../../domain/repositories/task-dependency.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { RemoveDependencyCommand } from './remove-dependency.command'

@CommandHandler(RemoveDependencyCommand)
export class RemoveDependencyHandler implements ICommandHandler<RemoveDependencyCommand> {
  constructor(
    @Inject(TASK_DEPENDENCY_REPOSITORY) private readonly depRepo: ITaskDependencyRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: RemoveDependencyCommand): Promise<void> {
    const { tenantId, planId, actorId, fromTaskId, toTaskId, kind } = cmd

    await this.authSvc.assertCanEditPlan(actorId, planId, tenantId)

    const exists = await this.depRepo.exists(fromTaskId, toTaskId, kind, tenantId)
    if (!exists) return // idempotent: already removed, nothing to do

    await this.depRepo.remove(fromTaskId, toTaskId, kind, tenantId)

    await this.eventBus.publish(
      new TaskDependencyRemovedEvent(
        tenantId,
        actorId,
        fromTaskId,
        planId,
        fromTaskId,
        toTaskId,
        kind,
      ),
    )
  }
}
