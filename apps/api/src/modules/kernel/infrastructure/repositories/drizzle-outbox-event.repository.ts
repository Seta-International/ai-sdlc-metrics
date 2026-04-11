import { Inject, Injectable } from '@nestjs/common'
import type { Db } from '@future/db'
import type { IOutboxEventRepository } from '../../domain/repositories/outbox-event.repository.port'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { outboxEvent } from '../schema/index'

@Injectable()
export class DrizzleOutboxEventRepository implements IOutboxEventRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async insert(data: { tenantId: string; eventName: string; payload: unknown }): Promise<void> {
    await this.db.insert(outboxEvent).values({
      tenantId: data.tenantId,
      eventName: data.eventName,
      payload: data.payload,
    })
  }
}
