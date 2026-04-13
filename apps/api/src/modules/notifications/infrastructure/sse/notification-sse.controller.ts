import { Controller, Req, Sse } from '@nestjs/common'
import { Observable, Subject } from 'rxjs'
import type { MessageEvent } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import { RedisService } from '../../../../common/redis/redis.service'

interface SseRequest {
  on(event: 'close', handler: () => void): void
}

@Controller()
export class NotificationSseController {
  constructor(
    private readonly redisService: RedisService,
    private readonly cls: ClsService,
  ) {}

  @Sse('/api/notifications/stream')
  stream(@Req() req: SseRequest): Observable<MessageEvent> {
    const tenantId = this.cls.get<string>('tenantId')
    const actorId = this.cls.get<string>('actorId')
    const subject = new Subject<MessageEvent>()
    const channel = `notifications:${tenantId}:${actorId}`

    this.redisService
      .subscribe(channel, (message: string) => {
        subject.next({ data: message })
      })
      .catch((err: unknown) => {
        subject.error(err)
      })

    req.on('close', () => {
      void this.redisService.unsubscribe(channel)
      subject.complete()
    })

    return subject.asObservable()
  }
}
