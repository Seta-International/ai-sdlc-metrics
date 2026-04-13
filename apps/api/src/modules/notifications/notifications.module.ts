import { Module, OnApplicationBootstrap } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { NotificationsQueryFacade } from './application/facades/notifications-query.facade'
import { SendNotificationHandler } from './application/commands/send-notification.handler'
import { MarkReadHandler, MarkAllReadHandler } from './application/commands/mark-read.handler'
import { ArchiveNotificationHandler } from './application/commands/archive-notification.handler'
import { UpdatePreferenceHandler } from './application/commands/update-preference.handler'
import { UnreadCountHandler } from './application/queries/unread-count.handler'
import { ListNotificationsHandler } from './application/queries/list-notifications.handler'
import { GetPreferencesHandler } from './application/queries/get-preferences.handler'
import { OnLeaveApprovedHandler } from './application/event-handlers/on-leave-approved.handler'
import { OnDocumentGeneratedHandler } from './application/event-handlers/on-document-generated.handler'
import { NOTIFICATION_REPOSITORY } from './domain/repositories/notification.repository.port'
import { NOTIFICATION_PUBLISHER } from './domain/ports/notification-publisher'
import { DrizzleNotificationRepository } from './infrastructure/repositories/drizzle-notification.repository'
import { RedisNotificationPublisher } from './infrastructure/redis/redis-notification-publisher'
import { NotificationSseController } from './infrastructure/sse/notification-sse.controller'
import {
  SendNotificationEmailWorker,
  SendEmailJobData,
} from './infrastructure/jobs/send-notification-email.worker'
import { PgBossService, JOB_NOTIFICATIONS_SEND_EMAIL } from '../../common/jobs/pg-boss.service'
import { PeopleModule } from '../people/people.module'
import { AdminModule } from '../admin/admin.module'
import { NotificationsRouterService } from './interface/trpc/notifications-router.service'

@Module({
  imports: [CqrsModule, PeopleModule, AdminModule],
  providers: [
    NotificationsQueryFacade,
    SendNotificationHandler,
    MarkReadHandler,
    MarkAllReadHandler,
    ArchiveNotificationHandler,
    UpdatePreferenceHandler,
    UnreadCountHandler,
    ListNotificationsHandler,
    GetPreferencesHandler,
    OnLeaveApprovedHandler,
    OnDocumentGeneratedHandler,
    NotificationsRouterService,
    SendNotificationEmailWorker,
    { provide: NOTIFICATION_REPOSITORY, useClass: DrizzleNotificationRepository },
    { provide: NOTIFICATION_PUBLISHER, useClass: RedisNotificationPublisher },
  ],
  exports: [NotificationsQueryFacade],
  controllers: [NotificationSseController],
})
export class NotificationsModule implements OnApplicationBootstrap {
  constructor(
    private readonly pgBoss: PgBossService,
    private readonly emailWorker: SendNotificationEmailWorker,
  ) {}

  onApplicationBootstrap(): void {
    this.pgBoss.registerWorker<SendEmailJobData>(JOB_NOTIFICATIONS_SEND_EMAIL, (jobs) =>
      Promise.all(jobs.map((job) => this.emailWorker.handle(job))).then(() => undefined),
    )
  }
}
