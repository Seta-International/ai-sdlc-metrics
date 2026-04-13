import { Controller, Req, Sse } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'
import type { MessageEvent } from '@nestjs/common'
import { RedisService } from '../../../../common/redis/redis.service'

interface SseRequest {
  tenantId: string
  actorId: string
  on(event: 'close', handler: () => void): void
}

@Controller()
export class NotificationSseController {
  constructor(private readonly redisService: RedisService) {}

  @Sse('/api/notifications/stream')
  stream(@Req() req: SseRequest): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>()
    const channel = `notifications:${req.tenantId}:${req.actorId}`

    void this.redisService.subscribe(channel, (message: string) => {
      subject.next({ data: message })
    })

    req.on('close', () => {
      void this.redisService.unsubscribe(channel)
      subject.complete()
    })

    return subject.asObservable()
  }
}
