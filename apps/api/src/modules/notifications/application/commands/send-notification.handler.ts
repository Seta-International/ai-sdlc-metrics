import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { SendNotificationCommand } from './send-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPublisher } from '../../infrastructure/redis/notification-publisher'
import { NOTIFICATION_PUBLISHER } from '../../infrastructure/redis/notification-publisher'

@CommandHandler(SendNotificationCommand)
@Injectable()
export class SendNotificationHandler implements ICommandHandler<SendNotificationCommand, string> {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly publisher: NotificationPublisher,
  ) {}

  async execute(command: SendNotificationCommand): Promise<string> {
    const notification = await this.repo.insert({
      tenantId: command.tenantId,
      recipientId: command.recipientId,
      senderId: command.senderId,
      category: command.category,
      title: command.title,
      body: command.body,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      resourceUrl: command.resourceUrl,
    })

    // Check preference
    const pref = await this.repo.getPreference(
      command.tenantId,
      command.recipientId,
      command.category,
    )

    const inAppEnabled = pref?.inApp ?? true // default enabled

    if (inAppEnabled) {
      await this.publisher.publish(command.tenantId, command.recipientId, notification)
    }

    return notification.id
  }
}
