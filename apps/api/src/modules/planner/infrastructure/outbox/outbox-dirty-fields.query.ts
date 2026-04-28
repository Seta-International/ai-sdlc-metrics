import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { SYNCABLE_TASK_FIELDS, type SyncableTaskField } from '@future/event-contracts'

const SYNCABLE_FIELD_SET = new Set<string>(SYNCABLE_TASK_FIELDS)

@Injectable()
export class OutboxDirtyFieldsQuery {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async forTask(taskId: string, since: Date): Promise<Set<SyncableTaskField>> {
    const result = await this.db.execute<{ changed_fields: unknown }>(
      sql`SELECT payload->'changedFields' AS changed_fields
          FROM core.outbox_event
          WHERE payload->>'taskId' = ${taskId}
            AND payload->>'origin' IN ('user', 'api')
            AND created_at >= ${since}`,
    )

    const out = new Set<SyncableTaskField>()
    for (const row of result.rows) {
      const fields = row.changed_fields
      if (Array.isArray(fields)) {
        for (const f of fields) {
          if (typeof f === 'string' && SYNCABLE_FIELD_SET.has(f)) {
            out.add(f as SyncableTaskField)
          }
        }
      }
    }
    return out
  }
}
