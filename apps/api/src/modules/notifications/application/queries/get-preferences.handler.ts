import { Inject, Injectable } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { GetPreferencesQuery } from './get-preferences.query'
import type { INotificationRepository } from '../../domain/repositories/notification.repository.port'
import { NOTIFICATION_REPOSITORY } from '../../domain/repositories/notification.repository.port'
import type { NotificationPreference } from '../../domain/entities/notification-preference.entity'
import type { NotificationCategory } from '../../domain/value-objects/category.vo'

const ALL_CATEGORIES: NotificationCategory[] = ['approval', 'mention', 'assignment', 'system']

@QueryHandler(GetPreferencesQuery)
@Injectable()
export class GetPreferencesHandler implements IQueryHandler<
  GetPreferencesQuery,
  NotificationPreference[]
> {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly repo: INotificationRepository) {}

  async execute(query: GetPreferencesQuery): Promise<NotificationPreference[]> {
    const stored = await this.repo.getPreferences(query.tenantId, query.actorId)
    const storedMap = new Map(stored.map((p) => [p.category, p]))

    return ALL_CATEGORIES.map((category) => {
      return (
        storedMap.get(category) ?? {
          id: '',
          tenantId: query.tenantId,
          actorId: query.actorId,
          category,
          inApp: true,
          email: true,
        }
      )
    })
  }
}
