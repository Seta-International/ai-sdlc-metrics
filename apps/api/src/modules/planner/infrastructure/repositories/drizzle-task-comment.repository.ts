import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, lt, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITaskCommentRepository } from '../../domain/repositories/task-comment.repository'
import { TaskComment } from '../../domain/entities/task-comment.entity'
import { plannerTaskComment } from '../schema/planner.schema'

@Injectable()
export class DrizzleTaskCommentRepository implements ITaskCommentRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async add(comment: TaskComment): Promise<void> {
    await this.db.insert(plannerTaskComment).values({
      id: comment.id,
      taskId: comment.taskId,
      tenantId: comment.tenantId,
      authorActorId: comment.authorActorId,
      body: comment.body,
      postedAt: comment.postedAt,
      deletedAt: comment.deletedAt ?? null,
      msThreadId: comment.msThreadId ?? null,
      msPostId: comment.msPostId ?? null,
      msPostEtag: comment.msPostEtag ?? null,
    })
  }

  async findById(id: string, tenantId: string): Promise<TaskComment | null> {
    const rows = await this.db
      .select()
      .from(plannerTaskComment)
      .where(and(eq(plannerTaskComment.id, id), eq(plannerTaskComment.tenantId, tenantId)))
      .limit(1)

    const row = rows[0]
    if (!row) return null

    return TaskComment.reconstitute({
      id: row.id,
      taskId: row.taskId,
      tenantId: row.tenantId,
      authorActorId: row.authorActorId,
      body: row.body,
      postedAt: row.postedAt,
      deletedAt: row.deletedAt ?? null,
      msThreadId: row.msThreadId ?? null,
      msPostId: row.msPostId ?? null,
      msPostEtag: row.msPostEtag ?? null,
    })
  }

  async softDelete(id: string, tenantId: string, deletedAt: Date): Promise<void> {
    await this.db
      .update(plannerTaskComment)
      .set({ deletedAt })
      .where(and(eq(plannerTaskComment.id, id), eq(plannerTaskComment.tenantId, tenantId)))
  }

  async listByTask(
    taskId: string,
    tenantId: string,
    opts: { cursor?: string; limit: number },
  ): Promise<TaskComment[]> {
    const { cursor, limit } = opts

    let rows: (typeof plannerTaskComment.$inferSelect)[]

    if (cursor) {
      // Subquery to get the postedAt of the cursor row, then fetch rows older than it
      rows = await this.db
        .select()
        .from(plannerTaskComment)
        .where(
          and(
            eq(plannerTaskComment.taskId, taskId),
            eq(plannerTaskComment.tenantId, tenantId),
            lt(
              plannerTaskComment.postedAt,
              sql<Date>`(SELECT posted_at FROM planner.task_comment WHERE id = ${cursor} AND tenant_id = ${tenantId})`,
            ),
          ),
        )
        .orderBy(sql`${plannerTaskComment.postedAt} DESC`)
        .limit(limit + 1)
    } else {
      rows = await this.db
        .select()
        .from(plannerTaskComment)
        .where(
          and(eq(plannerTaskComment.taskId, taskId), eq(plannerTaskComment.tenantId, tenantId)),
        )
        .orderBy(sql`${plannerTaskComment.postedAt} DESC`)
        .limit(limit + 1)
    }

    return rows.map((row) =>
      TaskComment.reconstitute({
        id: row.id,
        taskId: row.taskId,
        tenantId: row.tenantId,
        authorActorId: row.authorActorId,
        body: row.body,
        postedAt: row.postedAt,
        deletedAt: row.deletedAt ?? null,
        msThreadId: row.msThreadId ?? null,
        msPostId: row.msPostId ?? null,
        msPostEtag: row.msPostEtag ?? null,
      }),
    )
  }
}
