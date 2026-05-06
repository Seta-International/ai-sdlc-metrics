import { Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, desc, eq, lt, or } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerTaskHistory } from '../schema/planner.schema'
import type {
  HistoryPage,
  HistoryRecord,
  ITaskHistoryRepository,
} from '../../domain/repositories/task-history.repository'

export class DrizzleTaskHistoryRepository implements ITaskHistoryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async append(record: HistoryRecord): Promise<void> {
    await this.db.insert(plannerTaskHistory).values({
      id: record.id,
      tenantId: record.tenantId,
      taskId: record.taskId,
      actorId: record.actorId,
      field: record.field,
      oldValue: record.oldValue as Record<string, unknown> | null,
      newValue: record.newValue as Record<string, unknown> | null,
      changedAt: record.changedAt,
    })
  }

  async listByTask(
    taskId: string,
    tenantId: string,
    opts: { cursor?: string; limit: number },
  ): Promise<HistoryPage> {
    const { cursor, limit } = opts

    // Parse cursor format: "${changedAt.toISOString()}:${id}"
    // The changedAt ISO string itself contains colons (e.g. "2026-05-01T10:00:00.000Z"),
    // so we split at the position before the 36-char UUID.
    let parsedCursorAt: Date | undefined
    let parsedCursorId: string | undefined
    if (cursor) {
      const uuidLen = 36
      const separatorIdx = cursor.length - uuidLen - 1
      if (separatorIdx > 0 && cursor[separatorIdx] === ':') {
        parsedCursorAt = new Date(cursor.slice(0, separatorIdx))
        parsedCursorId = cursor.slice(separatorIdx + 1)
      }
    }

    // Fetch limit + 1 to detect if there's a next page
    const fetchLimit = limit + 1

    const baseCondition = and(
      eq(plannerTaskHistory.taskId, taskId),
      eq(plannerTaskHistory.tenantId, tenantId),
    )

    // Keyset pagination (DESC order): rows where (changedAt < cursorAt) OR (changedAt = cursorAt AND id < cursorId)
    const rows = await this.db
      .select()
      .from(plannerTaskHistory)
      .where(
        parsedCursorAt && parsedCursorId
          ? and(
              baseCondition,
              or(
                lt(plannerTaskHistory.changedAt, parsedCursorAt),
                and(
                  eq(plannerTaskHistory.changedAt, parsedCursorAt),
                  lt(plannerTaskHistory.id, parsedCursorId),
                ),
              ),
            )
          : baseCondition,
      )
      .orderBy(desc(plannerTaskHistory.changedAt), desc(plannerTaskHistory.id))
      .limit(fetchLimit)

    const hasNextPage = rows.length > limit
    const items = hasNextPage ? rows.slice(0, limit) : rows

    // nextCursor points to the LAST item in items (the oldest in this page)
    // so the next page continues from after this item
    const nextCursor =
      hasNextPage && items.length > 0
        ? `${items[items.length - 1]!.changedAt.toISOString()}:${items[items.length - 1]!.id}`
        : null

    return {
      items: items.map((row) => ({
        id: row.id,
        taskId: row.taskId,
        tenantId: row.tenantId,
        actorId: row.actorId,
        field: row.field,
        oldValue: row.oldValue,
        newValue: row.newValue,
        changedAt: row.changedAt,
      })),
      nextCursor,
    }
  }
}
