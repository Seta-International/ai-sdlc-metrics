import { Inject, Injectable } from '@nestjs/common'
import {
  OUTBOX_EVENT_REPOSITORY,
  type IOutboxEventRepository,
} from '../../domain/repositories/outbox-event.repository.port'

@Injectable()
export class KernelOutboxService {
  constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY)
    private readonly outboxRepo: IOutboxEventRepository,
  ) {}

  publish(data: { tenantId: string; eventName: string; payload: unknown }): Promise<void> {
    return this.outboxRepo.insert(data)
  }
}
