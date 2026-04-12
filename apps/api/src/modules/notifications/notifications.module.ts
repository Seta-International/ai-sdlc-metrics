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
    // TODO: Replace with real Drizzle repository when infra is ready
    {
      provide: NOTIFICATION_REPOSITORY,
      useValue: new Proxy(
        {},
        {
          get(_, key) {
            throw new Error(`NOTIFICATION_REPOSITORY not implemented: ${String(key)}`)
          },
        },
      ),
    },
    // TODO: Replace with real Redis publisher when infra is ready
    {
      provide: NOTIFICATION_PUBLISHER,
      useValue: new Proxy(
        {},
        {
          get(_, key) {
            throw new Error(`NOTIFICATION_PUBLISHER not implemented: ${String(key)}`)
          },
        },
      ),
    },
  ],
  exports: [NotificationsQueryFacade],
})
export class NotificationsModule {}
