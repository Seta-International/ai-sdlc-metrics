import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { ListNotificationsQuery } from './list-notifications.query'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { Notification } from '../../domain/entities/notification.entity'

@QueryHandler(ListNotificationsQuery)
@Injectable()
export class ListNotificationsHandler implements IQueryHandler<
  ListNotificationsQuery,
  Notification[]
> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(query: ListNotificationsQuery): Promise<Notification[]> {
    return this.repo.findByRecipient(query.tenantId, query.recipientId, query.opts)
  }
}
