import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly publisher: Redis
  private readonly subscriber: Redis

  constructor(private readonly redisUrl: string) {
    this.publisher = new Redis(redisUrl)
    this.subscriber = new Redis(redisUrl)
  }

  async onApplicationShutdown(): Promise<void> {
    await this.publisher.quit()
    await this.subscriber.quit()
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message)
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel)
    this.subscriber.on('message', (ch: string, msg: string) => {
      if (ch === channel) handler(msg)
    })
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel)
  }
}
