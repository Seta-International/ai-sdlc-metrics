import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { UpdatePreferenceCommand } from './update-preference.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPreference } from '../../domain/entities/notification-preference.entity'

@CommandHandler(UpdatePreferenceCommand)
@Injectable()
export class UpdatePreferenceHandler implements ICommandHandler<
  UpdatePreferenceCommand,
  NotificationPreference
> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(command: UpdatePreferenceCommand): Promise<NotificationPreference> {
    return this.repo.upsertPreference({
      tenantId: command.tenantId,
      actorId: command.actorId,
      category: command.category,
      inApp: command.inApp,
      email: command.email,
    })
  }
}
