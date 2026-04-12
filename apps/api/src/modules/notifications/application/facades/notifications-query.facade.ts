import { Inject, Injectable } from '@nestjs/common'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'

@Injectable()
export class NotificationsQueryFacade {
  constructor(
    @Inject(NOTIFICATION_REPOSITORY)
    private readonly repo: INotificationRepository,
  ) {}

  async getUnreadCount(tenantId: string, recipientId: string): Promise<number> {
    return this.repo.countUnread(tenantId, recipientId)
  }
}
