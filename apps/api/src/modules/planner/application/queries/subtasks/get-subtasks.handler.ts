import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import { sql } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { GetSubtasksQuery, type GetSubtasksResult, type SubtaskItem } from './get-subtasks.query'

@QueryHandler(GetSubtasksQuery)
export class GetSubtasksHandler implements IQueryHandler<GetSubtasksQuery, GetSubtasksResult> {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async execute(query: GetSubtasksQuery): Promise<GetSubtasksResult> {
    const rows = await this.db.execute<{
      id: string
      title: string
      progress: number
      order_hint: string
    }>(
      sql`SELECT id, title, progress, order_hint
          FROM planner.task
          WHERE parent_task_id = ${query.parentTaskId}
            AND plan_id = ${query.planId}
            AND tenant_id = ${query.tenantId}
            AND deleted_at IS NULL
          ORDER BY order_hint`,
    )

    const subtasks: SubtaskItem[] = rows.rows.map((r) => ({
      id: r.id,
      title: r.title,
      progress: Number(r.progress),
      orderHint: r.order_hint,
    }))

    return { subtasks }
  }
}
