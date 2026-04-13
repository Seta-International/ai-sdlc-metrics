import { Inject, Injectable } from '@nestjs/common'
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs'
import { SendNotificationCommand } from './send-notification.command'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPublisher } from '../../infrastructure/redis/notification-publisher'
import { NOTIFICATION_PUBLISHER } from '../../infrastructure/redis/notification-publisher'
import {
  PgBossService,
  JOB_NOTIFICATIONS_SEND_EMAIL,
} from '../../../../common/jobs/pg-boss.service'

@CommandHandler(SendNotificationCommand)
@Injectable()
export class SendNotificationHandler implements ICommandHandler<SendNotificationCommand, string> {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly publisher: NotificationPublisher,
    private readonly pgBoss: PgBossService,
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

    const pref = await this.repo.getPreference(
      command.tenantId,
      command.recipientId,
      command.category,
    )

    const inAppEnabled = pref?.inApp ?? true
    const emailEnabled = pref?.email ?? true

    if (inAppEnabled) {
      await this.publisher.publish(command.tenantId, command.recipientId, notification)
    }

    if (emailEnabled) {
      await this.pgBoss.enqueue(JOB_NOTIFICATIONS_SEND_EMAIL, {
        notificationId: notification.id,
        tenantId: command.tenantId,
        recipientId: command.recipientId,
      })
    }

    return notification.id
  }
}
