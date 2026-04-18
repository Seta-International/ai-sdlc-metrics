import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, asc, eq, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type { IChecklistItemRepository } from '../../domain/repositories/checklist-item.repository'
import { ChecklistItem } from '../../domain/entities/checklist-item.value-object'
import { plannerTask, plannerTaskChecklistItem } from '../schema/planner.schema'
import { ConcurrentModificationException } from '../../domain/exceptions/concurrent-modification.exception'

@Injectable()
export class DrizzleChecklistItemRepository implements IChecklistItemRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  async addItem(
    taskId: string,
    tenantId: string,
    item: ChecklistItem,
    createdBy: string,
    expectedVersion?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(plannerTaskChecklistItem).values({
        id: item.id,
        taskId,
        title: item.title,
        isChecked: item.isChecked,
        orderHint: item.orderHint,
        tenantId,
        createdBy,
      })

      const updated = await tx
        .update(plannerTask)
        .set({
          checklistItemCount: sql`${plannerTask.checklistItemCount} + 1`,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(plannerTask.id, taskId),
            eq(plannerTask.tenantId, tenantId),
            expectedVersion ? eq(plannerTask.updatedAt, new Date(expectedVersion)) : sql`TRUE`,
          ),
        )
        .returning({ id: plannerTask.id })

      if (updated.length === 0) {
        throw new ConcurrentModificationException()
      }
    })
  }

  async toggleItem(
    taskId: string,
    tenantId: string,
    itemId: string,
    isChecked: boolean,
    expectedVersion?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(plannerTaskChecklistItem)
        .set({
          isChecked,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(plannerTaskChecklistItem.id, itemId),
            eq(plannerTaskChecklistItem.taskId, taskId),
            eq(plannerTaskChecklistItem.tenantId, tenantId),
          ),
        )

      const updated = await tx
        .update(plannerTask)
        .set({
          checklistCheckedCount: sql`${plannerTask.checklistCheckedCount} + ${isChecked ? 1 : -1}`,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(plannerTask.id, taskId),
            eq(plannerTask.tenantId, tenantId),
            expectedVersion ? eq(plannerTask.updatedAt, new Date(expectedVersion)) : sql`TRUE`,
          ),
        )
        .returning({ id: plannerTask.id })

      if (updated.length === 0) {
        throw new ConcurrentModificationException()
      }
    })
  }

  async updateItem(
    taskId: string,
    tenantId: string,
    itemId: string,
    title: string,
    expectedVersion?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(plannerTask)
        .set({ updatedAt: sql`NOW()` })
        .where(
          and(
            eq(plannerTask.id, taskId),
            eq(plannerTask.tenantId, tenantId),
            expectedVersion ? eq(plannerTask.updatedAt, new Date(expectedVersion)) : sql`TRUE`,
          ),
        )
        .returning({ id: plannerTask.id })

      if (updated.length === 0) {
        throw new ConcurrentModificationException()
      }

      await tx
        .update(plannerTaskChecklistItem)
        .set({
          title,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(plannerTaskChecklistItem.id, itemId),
            eq(plannerTaskChecklistItem.taskId, taskId),
            eq(plannerTaskChecklistItem.tenantId, tenantId),
          ),
        )
    })
  }

  async removeItem(
    taskId: string,
    tenantId: string,
    itemId: string,
    expectedVersion?: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Fetch current isChecked state before deleting
      const rows = await tx
        .select({ isChecked: plannerTaskChecklistItem.isChecked })
        .from(plannerTaskChecklistItem)
        .where(
          and(
            eq(plannerTaskChecklistItem.id, itemId),
            eq(plannerTaskChecklistItem.taskId, taskId),
            eq(plannerTaskChecklistItem.tenantId, tenantId),
          ),
        )
        .limit(1)

      if (rows.length === 0) return

      const wasChecked = rows[0]!.isChecked

      await tx
        .delete(plannerTaskChecklistItem)
        .where(
          and(
            eq(plannerTaskChecklistItem.id, itemId),
            eq(plannerTaskChecklistItem.taskId, taskId),
            eq(plannerTaskChecklistItem.tenantId, tenantId),
          ),
        )

      const updated = await tx
        .update(plannerTask)
        .set({
          checklistItemCount: sql`${plannerTask.checklistItemCount} - 1`,
          checklistCheckedCount: wasChecked
            ? sql`${plannerTask.checklistCheckedCount} - 1`
            : plannerTask.checklistCheckedCount,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(plannerTask.id, taskId),
            eq(plannerTask.tenantId, tenantId),
            expectedVersion ? eq(plannerTask.updatedAt, new Date(expectedVersion)) : sql`TRUE`,
          ),
        )
        .returning({ id: plannerTask.id })

      if (updated.length === 0) {
        throw new ConcurrentModificationException()
      }
    })
  }

  async reorderItem(
    taskId: string,
    tenantId: string,
    itemId: string,
    orderHint: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(plannerTaskChecklistItem)
        .set({
          orderHint,
          updatedAt: sql`NOW()`,
        })
        .where(
          and(
            eq(plannerTaskChecklistItem.id, itemId),
            eq(plannerTaskChecklistItem.taskId, taskId),
            eq(plannerTaskChecklistItem.tenantId, tenantId),
          ),
        )
    })
  }

  async listByTask(taskId: string, tenantId: string): Promise<ChecklistItem[]> {
    const rows = await this.db
      .select()
      .from(plannerTaskChecklistItem)
      .where(
        and(
          eq(plannerTaskChecklistItem.taskId, taskId),
          eq(plannerTaskChecklistItem.tenantId, tenantId),
        ),
      )
      .orderBy(asc(plannerTaskChecklistItem.orderHint))

    return rows.map((row) =>
      ChecklistItem.reconstitute({
        id: row.id,
        title: row.title,
        isChecked: row.isChecked,
        orderHint: row.orderHint,
      }),
    )
  }
}
