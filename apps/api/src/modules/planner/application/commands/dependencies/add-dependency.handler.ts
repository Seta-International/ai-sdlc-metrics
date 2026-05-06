import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskDependencyAddedEvent } from '@future/event-contracts'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import {
  TASK_DEPENDENCY_REPOSITORY,
  type ITaskDependencyRepository,
} from '../../../domain/repositories/task-dependency.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { DependencySelfLinkException } from '../../../domain/exceptions/dependency-self-link.exception'
import { DependencyCycleDetectedException } from '../../../domain/exceptions/dependency-cycle-detected.exception'
import { wouldCreateCycle } from './cycle-detector'
import { AddDependencyCommand } from './add-dependency.command'

@CommandHandler(AddDependencyCommand)
export class AddDependencyHandler implements ICommandHandler<AddDependencyCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_DEPENDENCY_REPOSITORY) private readonly depRepo: ITaskDependencyRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: AddDependencyCommand): Promise<void> {
    const { tenantId, planId, actorId, fromTaskId, toTaskId, kind } = cmd

    if (fromTaskId === toTaskId) {
      throw new DependencySelfLinkException(fromTaskId)
    }

    await this.authSvc.assertCanEditPlan(actorId, planId, tenantId)

    const fromTask = await this.taskRepo.findById(fromTaskId, tenantId)
    if (!fromTask) throw new TaskNotFoundException(fromTaskId)

    const toTask = await this.taskRepo.findById(toTaskId, tenantId)
    if (!toTask) throw new TaskNotFoundException(toTaskId)

    const edges = await this.depRepo.listEdgesForPlan(planId, tenantId)
    if (wouldCreateCycle(fromTaskId, toTaskId, edges)) {
      throw new DependencyCycleDetectedException(fromTaskId, toTaskId)
    }

    await this.depRepo.add({ fromTaskId, toTaskId, kind, tenantId })

    await this.eventBus.publish(
      new TaskDependencyAddedEvent(
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
