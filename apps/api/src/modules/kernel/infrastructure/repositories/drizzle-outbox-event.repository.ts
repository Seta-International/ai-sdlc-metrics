import { Inject, Injectable } from '@nestjs/common'
import { and, eq, desc, sql } from 'drizzle-orm'
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

  async findLatestByJobId(jobId: string, eventName: string): Promise<{ payload: unknown } | null> {
    const rows = await this.db
      .select({ payload: outboxEvent.payload })
      .from(outboxEvent)
      .where(
        and(eq(outboxEvent.eventName, eventName), sql`${outboxEvent.payload}->>'jobId' = ${jobId}`),
      )
      .orderBy(desc(outboxEvent.createdAt))
      .limit(1)
    const first = rows[0]
    return first ? { payload: first.payload } : null
  }
}
