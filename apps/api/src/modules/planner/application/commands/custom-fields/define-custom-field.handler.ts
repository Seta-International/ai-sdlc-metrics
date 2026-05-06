import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import { uuidv7 } from 'uuidv7'
import {
  CUSTOM_FIELD_DEF_REPOSITORY,
  type ICustomFieldDefRepository,
} from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldLimitExceededException } from '../../../domain/exceptions/custom-field-limit-exceeded.exception'
import { DefineCustomFieldCommand } from './define-custom-field.command'

const MAX_FIELDS_PER_PLAN = 10

@CommandHandler(DefineCustomFieldCommand)
export class DefineCustomFieldHandler implements ICommandHandler<
  DefineCustomFieldCommand,
  { id: string }
> {
  constructor(
    @Inject(CUSTOM_FIELD_DEF_REPOSITORY) private readonly repo: ICustomFieldDefRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: DefineCustomFieldCommand): Promise<{ id: string }> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const count = await this.repo.countByPlan(cmd.planId, cmd.tenantId)
    if (count >= MAX_FIELDS_PER_PLAN) throw new CustomFieldLimitExceededException(cmd.planId)

    const id = uuidv7()
    await this.repo.save({
      id,
      tenantId: cmd.tenantId,
      planId: cmd.planId,
      name: cmd.name,
      kind: cmd.kind,
      choiceOptions: cmd.choiceOptions,
      position: cmd.position,
    })

    return { id }
  }
}
