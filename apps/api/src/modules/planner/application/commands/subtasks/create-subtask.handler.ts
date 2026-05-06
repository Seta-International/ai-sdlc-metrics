import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { uuidv7 } from 'uuidv7'
import { TaskCreatedEvent } from '@future/event-contracts'
import { Task } from '../../../domain/entities/task.entity'
import { MsOrderHint } from '../../../domain/value-objects/ms-order-hint.vo'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { CreateSubtaskCommand } from './create-subtask.command'

@CommandHandler(CreateSubtaskCommand)
export class CreateSubtaskHandler implements ICommandHandler<CreateSubtaskCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateSubtaskCommand): Promise<{ id: string }> {
    await this.authSvc.assertCanEditPlan(command.actorId, command.planId, command.tenantId)

    const parent = await this.taskRepo.findById(command.parentTaskId, command.tenantId)
    if (!parent) throw new TaskNotFoundException(command.parentTaskId)

    const id = uuidv7()
    const subtask = Task.create({
      id,
      tenantId: command.tenantId,
      planId: command.planId,
      bucketId: command.bucketId,
      title: command.title,
      orderHint: MsOrderHint.between(undefined, undefined),
      createdBy: command.actorId,
      parentTaskId: command.parentTaskId,
    })

    await this.taskRepo.save(subtask)

    await this.eventBus.publish(
      new TaskCreatedEvent(
        command.tenantId,
        command.actorId,
        id,
        command.title,
        null,
        null,
        ['title'],
        'user',
      ),
    )

    return { id }
  }
}
