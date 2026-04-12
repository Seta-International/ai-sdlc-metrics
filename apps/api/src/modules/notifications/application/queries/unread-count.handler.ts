import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { UnreadCountQuery } from './unread-count.query'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@QueryHandler(UnreadCountQuery)
@Injectable()
export class UnreadCountHandler implements IQueryHandler<UnreadCountQuery, number> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(query: UnreadCountQuery): Promise<number> {
    return this.repo.countUnread(query.tenantId, query.recipientId)
  }
}
