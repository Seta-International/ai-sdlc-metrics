import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '@future/db'
import { DB_TOKEN } from '../../../../common/db/db.module'
import { plannerMyDayEntry } from '../schema/planner.schema'
import { MyDayEntry } from '../../domain/entities/my-day-entry.entity'
import type { IMyDayRepository, MyDayInsertRow } from '../../domain/repositories/my-day.repository'

@Injectable()
export class DrizzleMyDayRepository implements IMyDayRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async findForDate(actorId: string, tenantId: string, date: string): Promise<MyDayEntry[]> {
    const rows = await this.db
      .select()
      .from(plannerMyDayEntry)
      .where(
        and(
          eq(plannerMyDayEntry.tenantId, tenantId),
          eq(plannerMyDayEntry.actorId, actorId),
          eq(plannerMyDayEntry.addedDate, date),
        ),
      )
    return rows.map(
      (r) =>
        new MyDayEntry({
          actorId: r.actorId,
          taskId: r.taskId,
          addedDate: r.addedDate,
          addedAt: r.addedAt,
          completedAt: r.completedAt ?? null,
          tenantId: r.tenantId,
        }),
    )
  }

  async add(entry: MyDayEntry): Promise<void> {
    await this.db
      .insert(plannerMyDayEntry)
      .values({
        actorId: entry.actorId,
        taskId: entry.taskId,
        addedDate: entry.addedDate,
        addedAt: entry.addedAt,
        completedAt: entry.completedAt,
        tenantId: entry.tenantId,
      })
      .onConflictDoNothing({
        target: [plannerMyDayEntry.actorId, plannerMyDayEntry.taskId, plannerMyDayEntry.addedDate],
      })
  }

  async remove(actorId: string, taskId: string, date: string, tenantId: string): Promise<void> {
    await this.db
      .delete(plannerMyDayEntry)
      .where(
        and(
          eq(plannerMyDayEntry.tenantId, tenantId),
          eq(plannerMyDayEntry.actorId, actorId),
          eq(plannerMyDayEntry.taskId, taskId),
          eq(plannerMyDayEntry.addedDate, date),
        ),
      )
  }

  async insertMany(rows: MyDayInsertRow[]): Promise<number> {
    if (rows.length === 0) return 0
    const now = new Date()
    const values = rows.map((r) => ({
      actorId: r.actorId,
      taskId: r.taskId,
      addedDate: r.addedDate,
      addedAt: now,
      completedAt: null,
      tenantId: r.tenantId,
    }))
    const result = await this.db
      .insert(plannerMyDayEntry)
      .values(values)
      .onConflictDoNothing({
        target: [plannerMyDayEntry.actorId, plannerMyDayEntry.taskId, plannerMyDayEntry.addedDate],
      })
      .returning({ taskId: plannerMyDayEntry.taskId })
    return result.length
  }

  async markTaskCompleted(taskId: string, tenantId: string): Promise<void> {
    await this.db
      .update(plannerMyDayEntry)
      .set({ completedAt: new Date() })
      .where(
        and(
          eq(plannerMyDayEntry.tenantId, tenantId),
          eq(plannerMyDayEntry.taskId, taskId),
          isNull(plannerMyDayEntry.completedAt),
        ),
      )
  }
}
