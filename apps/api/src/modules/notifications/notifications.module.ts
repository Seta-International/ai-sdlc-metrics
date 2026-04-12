import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { NotificationsQueryFacade } from './application/facades/notifications-query.facade'
import { SendNotificationHandler } from './application/commands/send-notification.handler'
import { MarkReadHandler, MarkAllReadHandler } from './application/commands/mark-read.handler'
import { UnreadCountHandler } from './application/queries/unread-count.handler'
import { ListNotificationsHandler } from './application/queries/list-notifications.handler'
import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository.port'
import { NOTIFICATION_PUBLISHER } from './infrastructure/redis/notification-publisher'

@Module({
  imports: [CqrsModule],
  providers: [
    NotificationsQueryFacade,
    SendNotificationHandler,
    MarkReadHandler,
    MarkAllReadHandler,
    UnreadCountHandler,
    ListNotificationsHandler,
    // TODO: Wire real Drizzle repository and Redis publisher when infra is ready
    {
      provide: NOTIFICATION_REPOSITORY,
      useValue: {},
    },
    {
      provide: NOTIFICATION_PUBLISHER,
      useValue: { publish: async () => {} },
    },
  ],
  exports: [NotificationsQueryFacade],
})
export class NotificationsModule {}
