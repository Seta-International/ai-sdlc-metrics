import { Inject, Injectable } from '@nestjs/common'
import { EventsHandler, type IEventHandler, CommandBus } from '@nestjs/cqrs'
import { TaskAssignedEvent } from '@future/event-contracts'
import { SendNotificationCommand } from '../../../notifications/application/commands/send-notification.command'
import { buildTaskAssignedNotification } from '../../../notifications/application/templates/task-assigned.template'
import { TASK_REPOSITORY, type ITaskRepository } from '../../domain/repositories/task.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../domain/repositories/plan.repository'
import { KernelQueryFacade } from '../../../kernel/application/facades/kernel-query.facade'

@EventsHandler(TaskAssignedEvent)
@Injectable()
export class OnTaskAssignedHandler implements IEventHandler<TaskAssignedEvent> {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async handle(event: TaskAssignedEvent): Promise<void> {
    const task = await this.taskRepo.findById(event.taskId, event.tenantId)
    const plan = await this.planRepo.findById(event.planId, event.tenantId)
    const actorMap = await this.kernelQueryFacade.getActorsByIds([event.actorId], event.tenantId)

    const assignerName = actorMap.get(event.actorId)?.displayName ?? 'A teammate'
    const taskTitle = task?.title ?? 'a task'
    const planName = plan?.name ?? ''
    const dueDate = task?.dueDate ? task.dueDate.toISOString().slice(0, 10) : undefined

    const { title, body, resourceUrl } = buildTaskAssignedNotification({
      assignerName,
      taskTitle,
      planName,
      dueDate,
      planId: event.planId,
      taskId: event.taskId,
    })

    await this.commandBus.execute(
      new SendNotificationCommand(
        event.tenantId,
        event.assigneeId,
        event.actorId,
        'assignment',
        title,
        body,
        'task',
        event.taskId,
        resourceUrl,
      ),
    )
  }
}
