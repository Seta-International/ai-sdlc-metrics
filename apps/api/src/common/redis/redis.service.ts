import { Injectable, OnApplicationShutdown } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly publisher: Redis
  private readonly subscriber: Redis
  private readonly listeners = new Map<string, (ch: string, msg: string) => void>()

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
    const listener = (ch: string, msg: string) => {
      if (ch === channel) handler(msg)
    }
    this.listeners.set(channel, listener)
    this.subscriber.on('message', listener)
    await this.subscriber.subscribe(channel)
  }

  async unsubscribe(channel: string): Promise<void> {
    const listener = this.listeners.get(channel)
    if (listener) {
      this.subscriber.removeListener('message', listener)
      this.listeners.delete(channel)
    }
    await this.subscriber.unsubscribe(channel)
  }
}
