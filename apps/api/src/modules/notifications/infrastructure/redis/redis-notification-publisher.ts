import { Injectable } from '@nestjs/common'
import { RedisService } from '../../../../common/redis/redis.service'
import type { NotificationPublisher } from './notification-publisher'
import type { Notification } from '../../domain/entities/notification.entity'

@Injectable()
export class RedisNotificationPublisher implements NotificationPublisher {
  constructor(private readonly redisService: RedisService) {}

  async publish(tenantId: string, recipientId: string, notification: Notification): Promise<void> {
    const channel = `notifications:${tenantId}:${recipientId}`
    await this.redisService.publish(channel, JSON.stringify(notification))
  }
}
