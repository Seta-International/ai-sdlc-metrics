import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskMovedEvent } from '@future/event-contracts'
import { MsOrderHint } from '../../../domain/value-objects/ms-order-hint.vo'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { MoveTaskCommand } from './move-task.command'

@CommandHandler(MoveTaskCommand)
export class MoveTaskHandler implements ICommandHandler<MoveTaskCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: MoveTaskCommand): Promise<void> {
    const task = await this.taskRepo.findById(command.taskId, command.tenantId)
    if (!task) throw new TaskNotFoundException(command.taskId)

    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    let orderHint: string

    if (command.orderHintAfter !== undefined || command.orderHintBefore !== undefined) {
      orderHint = MsOrderHint.between(command.orderHintAfter, command.orderHintBefore)
    } else {
      // Default: place at top of the target bucket
      const existingTasks = await this.taskRepo.findByBucketId(command.toBucketId, command.tenantId)
      if (existingTasks.length === 0) {
        orderHint = MsOrderHint.between(undefined, undefined)
      } else {
        const minHint = existingTasks.reduce((prev, cur) =>
          cur.orderHint < prev.orderHint ? cur : prev,
        ).orderHint
        orderHint = MsOrderHint.between(undefined, minHint)
      }
    }

    task.move(command.toBucketId, orderHint)

    await this.taskRepo.update(task, command.expectedVersion)

    await this.eventBus.publish(
      new TaskMovedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.planId,
        command.toBucketId,
        orderHint,
        ['bucketId', 'orderHint'],
        'user',
      ),
    )
  }
}
