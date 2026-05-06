import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { TaskCustomFieldUpdatedEvent } from '@future/event-contracts'
import {
  CUSTOM_FIELD_DEF_REPOSITORY,
  type ICustomFieldDefRepository,
} from '../../../domain/repositories/custom-field-def.repository'
import {
  TASK_CUSTOM_FIELD_VALUE_REPOSITORY,
  type ITaskCustomFieldValueRepository,
} from '../../../domain/repositories/task-custom-field-value.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { SetCustomFieldValueCommand } from './set-custom-field-value.command'

@CommandHandler(SetCustomFieldValueCommand)
export class SetCustomFieldValueHandler implements ICommandHandler<SetCustomFieldValueCommand> {
  constructor(
    @Inject(CUSTOM_FIELD_DEF_REPOSITORY) private readonly defRepo: ICustomFieldDefRepository,
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(TASK_CUSTOM_FIELD_VALUE_REPOSITORY)
    private readonly valueRepo: ITaskCustomFieldValueRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: SetCustomFieldValueCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const def = await this.defRepo.findById(cmd.fieldDefId, cmd.tenantId)
    if (!def) throw new CustomFieldDefNotFoundException(cmd.fieldDefId)

    const task = await this.taskRepo.findById(cmd.taskId, cmd.tenantId)
    if (!task) throw new TaskNotFoundException(cmd.taskId)

    await this.valueRepo.upsert({
      taskId: cmd.taskId,
      fieldDefId: cmd.fieldDefId,
      tenantId: cmd.tenantId,
      value: cmd.value,
    })

    await this.eventBus.publish(
      new TaskCustomFieldUpdatedEvent(
        cmd.tenantId,
        cmd.actorId,
        cmd.taskId,
        cmd.planId,
        cmd.fieldDefId,
        def.name,
      ),
    )
  }
}
