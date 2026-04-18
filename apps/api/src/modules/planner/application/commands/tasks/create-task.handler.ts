import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskCreatedEvent } from '@future/event-contracts'
import { Task } from '../../../domain/entities/task.entity'
import { MsOrderHint } from '../../../domain/value-objects/ms-order-hint.vo'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CreateTaskCommand } from './create-task.command'

@CommandHandler(CreateTaskCommand)
export class CreateTaskHandler implements ICommandHandler<CreateTaskCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateTaskCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    let orderHint: string

    if (command.orderHintAfter !== undefined || command.orderHintBefore !== undefined) {
      orderHint = MsOrderHint.between(command.orderHintAfter, command.orderHintBefore)
    } else {
      // Default: "top of bucket" = before the minimum existing orderHint
      const existingTasks = await this.taskRepo.findByBucketId(command.bucketId, command.tenantId)
      if (existingTasks.length === 0) {
        orderHint = MsOrderHint.between(undefined, undefined)
      } else {
        const minHint = existingTasks.reduce((prev, cur) =>
          cur.orderHint < prev.orderHint ? cur : prev,
        ).orderHint
        orderHint = MsOrderHint.between(undefined, minHint)
      }
    }

    const task = Task.create({
      id: command.taskId,
      tenantId: command.tenantId,
      planId: command.planId,
      bucketId: command.bucketId,
      title: command.title,
      orderHint,
      createdBy: command.actorId,
      description: command.description,
      priority: command.priority,
    })

    await this.taskRepo.save(task)

    await this.eventBus.publish(
      new TaskCreatedEvent(
        command.tenantId,
        command.actorId,
        command.taskId,
        command.title,
        null,
        null,
      ),
    )
  }
}
