import { Inject } from '@nestjs/common'
import { CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs'
import {
  CUSTOM_FIELD_DEF_REPOSITORY,
  type ICustomFieldDefRepository,
} from '../../../domain/repositories/custom-field-def.repository'
import { PlanAuthorizationService } from '../../services/plan-authorization.service'
import { CustomFieldDefNotFoundException } from '../../../domain/exceptions/custom-field-def-not-found.exception'
import { UpdateCustomFieldDefCommand } from './update-custom-field-def.command'

@CommandHandler(UpdateCustomFieldDefCommand)
export class UpdateCustomFieldDefHandler implements ICommandHandler<UpdateCustomFieldDefCommand> {
  constructor(
    @Inject(CUSTOM_FIELD_DEF_REPOSITORY) private readonly repo: ICustomFieldDefRepository,
    private readonly authSvc: PlanAuthorizationService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(cmd: UpdateCustomFieldDefCommand): Promise<void> {
    await this.authSvc.assertCanEditPlan(cmd.actorId, cmd.planId, cmd.tenantId)

    const existing = await this.repo.findById(cmd.defId, cmd.tenantId)
    if (!existing) throw new CustomFieldDefNotFoundException(cmd.defId)

    await this.repo.update({
      ...existing,
      name: cmd.name,
      choiceOptions: cmd.choiceOptions,
      position: cmd.position,
    })
  }
}
