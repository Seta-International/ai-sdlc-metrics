import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { ITaskRepository } from '../../domain/repositories/task.repository'
import type { Task } from '../../domain/entities/task.entity'
import { plannerTask } from '../schema/planner.schema'
import { taskRowToEntity } from './mappers/task.mapper'

@Injectable()
export class DrizzleTaskRepository implements ITaskRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findById(id: string, tenantId: string): Promise<Task | null> {
    const rows = await this.db
      .select()
      .from(plannerTask)
      .where(
        and(
          eq(plannerTask.id, id),
          eq(plannerTask.tenantId, tenantId),
          isNull(plannerTask.deletedAt),
        ),
      )
      .limit(1)

    return rows[0] ? taskRowToEntity(rows[0]) : null
  }

  async findByBucketId(bucketId: string, tenantId: string): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(plannerTask)
      .where(
        and(
          eq(plannerTask.bucketId, bucketId),
          eq(plannerTask.tenantId, tenantId),
          isNull(plannerTask.deletedAt),
        ),
      )

    return rows.map(taskRowToEntity)
  }

  async softDeleteMany(bucketId: string, tenantId: string): Promise<string[]> {
    const rows = await this.db
      .update(plannerTask)
      .set({ deletedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(
        and(
          eq(plannerTask.bucketId, bucketId),
          eq(plannerTask.tenantId, tenantId),
          isNull(plannerTask.deletedAt),
        ),
      )
      .returning({ id: plannerTask.id })

    return rows.map((r) => r.id)
  }
}
