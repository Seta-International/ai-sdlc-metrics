import { Injectable, Inject } from '@nestjs/common'
import type { Db } from '@future/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../common/db/db.module'
import type {
  ITaskRepository,
  MsTaskUpsertProps,
  MsTaskDetailsUpsertProps,
  MsSyncedTaskRef,
  PendingTaskRef,
} from '../../domain/repositories/task.repository'
import { Task } from '../../domain/entities/task.entity'
import { TaskAssignee } from '../../domain/entities/task-assignee.value-object'
import { LabelSlot } from '../../domain/value-objects/label-slot.vo'
import { ConcurrentModificationException } from '../../domain/exceptions/concurrent-modification.exception'
import {
  plannerTask,
  plannerTaskAssignee,
  plannerTaskAppliedLabel,
  plannerBucket,
  plannerTaskChecklistItem,
} from '../schema/planner.schema'
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

    if (!rows[0]) return null

    const assigneeRows = await this.db
      .select()
      .from(plannerTaskAssignee)
      .where(and(eq(plannerTaskAssignee.taskId, id), eq(plannerTaskAssignee.tenantId, tenantId)))

    const appliedLabelRows = await this.db
      .select()
      .from(plannerTaskAppliedLabel)
      .where(
        and(eq(plannerTaskAppliedLabel.taskId, id), eq(plannerTaskAppliedLabel.tenantId, tenantId)),
      )

    const row = rows[0]
    return Task.reconstitute({
      id: row.id,
      tenantId: row.tenantId,
      planId: row.planId,
      bucketId: row.bucketId,
      title: row.title,
      description: row.description,
      progress: row.progress as 0 | 50 | 100,
      priority: row.priority as 1 | 3 | 5 | 9,
      startDate: row.startDate ? new Date(row.startDate) : null,
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
      orderHint: row.orderHint,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedBy: row.completedBy ?? null,
      completedAt: row.completedAt ?? null,
      deletedAt: row.deletedAt ?? null,
      checklistItemCount: row.checklistItemCount,
      checklistCheckedCount: row.checklistCheckedCount,
      coverAttachmentId: row.coverAttachmentId ?? null,
      msTaskId: row.msTaskId ?? null,
      msTaskEtag: row.msTaskEtag ?? null,
      msTaskDetailsEtag: row.msTaskDetailsEtag ?? null,
      pendingMsAssignments: Array.isArray(row.pendingMsAssignments)
        ? (row.pendingMsAssignments as string[])
        : [],
      lastPushedAt: row.msSyncPushedAt ?? null,
      assignees: assigneeRows.map((a) =>
        TaskAssignee.create(a.actorId, a.assignedBy, a.assignedAt),
      ),
      appliedLabels: appliedLabelRows.map((l) => LabelSlot.of(l.slot)),
    })
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

  async listByPlanIncludingCompleted(planId: string, tenantId: string): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(plannerTask)
      .where(
        and(
          eq(plannerTask.planId, planId),
          eq(plannerTask.tenantId, tenantId),
          isNull(plannerTask.deletedAt),
        ),
      )

    const tasks: Task[] = []
    for (const row of rows) {
      const assigneeRows = await this.db
        .select()
        .from(plannerTaskAssignee)
        .where(
          and(eq(plannerTaskAssignee.taskId, row.id), eq(plannerTaskAssignee.tenantId, tenantId)),
        )

      tasks.push(
        Task.reconstitute({
          id: row.id,
          tenantId: row.tenantId,
          planId: row.planId,
          bucketId: row.bucketId,
          title: row.title,
          description: row.description,
          progress: row.progress as 0 | 50 | 100,
          priority: row.priority as 1 | 3 | 5 | 9,
          startDate: row.startDate ? new Date(row.startDate) : null,
          dueDate: row.dueDate ? new Date(row.dueDate) : null,
          orderHint: row.orderHint,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          completedBy: row.completedBy ?? null,
          completedAt: row.completedAt ?? null,
          deletedAt: row.deletedAt ?? null,
          checklistItemCount: row.checklistItemCount,
          checklistCheckedCount: row.checklistCheckedCount,
          coverAttachmentId: row.coverAttachmentId ?? null,
          msTaskId: row.msTaskId ?? null,
          msTaskEtag: row.msTaskEtag ?? null,
          msTaskDetailsEtag: row.msTaskDetailsEtag ?? null,
          pendingMsAssignments: Array.isArray(row.pendingMsAssignments)
            ? (row.pendingMsAssignments as string[])
            : [],
          assignees: assigneeRows.map((a) =>
            TaskAssignee.create(a.actorId, a.assignedBy, a.assignedAt),
          ),
          appliedLabels: [],
        }),
      )
    }

    return tasks
  }

  async save(task: Task): Promise<void> {
    await this.db
      .insert(plannerTask)
      .values({
        id: task.id,
        tenantId: task.tenantId,
        planId: task.planId,
        bucketId: task.bucketId,
        title: task.title,
        description: task.description,
        progress: task.progress,
        priority: task.priority,
        startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
        dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
        orderHint: task.orderHint,
        createdBy: task.createdBy,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        completedBy: task.completedBy,
        completedAt: task.completedAt,
        deletedAt: task.deletedAt,
        msTaskId: task.msTaskId,
        msTaskEtag: task.msTaskEtag,
        msTaskDetailsEtag: task.msTaskDetailsEtag,
        pendingMsAssignments: task.pendingMsAssignments,
      })
      .onConflictDoNothing()

    // Sync assignees
    for (const assignee of task.assignees) {
      await this.db
        .insert(plannerTaskAssignee)
        .values({
          taskId: task.id,
          actorId: assignee.actorId,
          assignedBy: assignee.assignedBy,
          assignedAt: assignee.assignedAt,
          tenantId: task.tenantId,
        })
        .onConflictDoNothing()
    }

    // Sync applied labels
    for (const slot of task.appliedLabels) {
      await this.db
        .insert(plannerTaskAppliedLabel)
        .values({
          taskId: task.id,
          slot: slot.value,
          tenantId: task.tenantId,
          planId: task.planId,
        })
        .onConflictDoNothing()
    }
  }

  async update(task: Task, expectedVersion: string): Promise<void> {
    // Optimistic concurrency: check updatedAt matches before writing
    const updated = await this.db
      .update(plannerTask)
      .set({
        bucketId: task.bucketId,
        title: task.title,
        description: task.description,
        progress: task.progress,
        priority: task.priority,
        startDate: task.startDate ? task.startDate.toISOString().split('T')[0] : null,
        dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : null,
        orderHint: task.orderHint,
        updatedAt: task.updatedAt,
        completedBy: task.completedBy,
        completedAt: task.completedAt,
        deletedAt: task.deletedAt,
        pendingMsAssignments: task.pendingMsAssignments,
        coverAttachmentId: task.coverAttachmentId,
      })
      .where(
        and(
          eq(plannerTask.id, task.id),
          eq(plannerTask.tenantId, task.tenantId),
          eq(plannerTask.updatedAt, new Date(expectedVersion)),
        ),
      )
      .returning({ id: plannerTask.id })

    if (updated.length === 0) {
      throw new ConcurrentModificationException()
    }

    // Sync assignees: replace all
    await this.db
      .delete(plannerTaskAssignee)
      .where(
        and(
          eq(plannerTaskAssignee.taskId, task.id),
          eq(plannerTaskAssignee.tenantId, task.tenantId),
        ),
      )

    for (const assignee of task.assignees) {
      await this.db.insert(plannerTaskAssignee).values({
        taskId: task.id,
        actorId: assignee.actorId,
        assignedBy: assignee.assignedBy,
        assignedAt: assignee.assignedAt,
        tenantId: task.tenantId,
      })
    }

    // Sync applied labels: replace all
    await this.db
      .delete(plannerTaskAppliedLabel)
      .where(
        and(
          eq(plannerTaskAppliedLabel.taskId, task.id),
          eq(plannerTaskAppliedLabel.tenantId, task.tenantId),
        ),
      )

    for (const slot of task.appliedLabels) {
      await this.db.insert(plannerTaskAppliedLabel).values({
        taskId: task.id,
        slot: slot.value,
        tenantId: task.tenantId,
        planId: task.planId,
      })
    }
  }

  async softDelete(id: string, tenantId: string): Promise<void> {
    await this.db
      .update(plannerTask)
      .set({ deletedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(
        and(
          eq(plannerTask.id, id),
          eq(plannerTask.tenantId, tenantId),
          isNull(plannerTask.deletedAt),
        ),
      )
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

  async findByMsTaskId(
    tenantId: string,
    msTaskId: string,
  ): Promise<{
    id: string
    msTaskEtag: string | null
    msDetailsEtag: string | null
    msSoftDeletedAt: Date | null
  } | null> {
    const rows = await this.db
      .select({
        id: plannerTask.id,
        msTaskEtag: plannerTask.msTaskEtag,
        msDetailsEtag: plannerTask.msTaskDetailsEtag,
        msSoftDeletedAt: plannerTask.msSoftDeletedAt,
      })
      .from(plannerTask)
      .where(and(eq(plannerTask.tenantId, tenantId), eq(plannerTask.msTaskId, msTaskId)))
      .limit(1)
    if (!rows[0]) return null
    return {
      id: rows[0].id,
      msTaskEtag: rows[0].msTaskEtag ?? null,
      msDetailsEtag: rows[0].msDetailsEtag ?? null,
      msSoftDeletedAt: rows[0].msSoftDeletedAt ?? null,
    }
  }

  async upsertFromMs(props: MsTaskUpsertProps, _opts: { origin: string }): Promise<{ id: string }> {
    let bucketId: string | null = null
    if (props.msBucketId) {
      const row = await this.db
        .select({ id: plannerBucket.id })
        .from(plannerBucket)
        .where(
          and(
            eq(plannerBucket.tenantId, props.tenantId),
            eq(plannerBucket.msBucketId, props.msBucketId),
          ),
        )
        .limit(1)
      bucketId = row[0]?.id ?? null
    }
    if (!bucketId) throw new Error(`Bucket not found for msBucketId=${props.msBucketId}`)

    const progress: 0 | 50 | 100 =
      props.percentComplete >= 75 ? 100 : props.percentComplete >= 25 ? 50 : 0
    const completedAt = progress === 100 ? (props.completedDateTime ?? new Date()) : null

    const existing = await this.db
      .select({ id: plannerTask.id })
      .from(plannerTask)
      .where(
        and(eq(plannerTask.tenantId, props.tenantId), eq(plannerTask.msTaskId, props.msTaskId)),
      )
      .limit(1)

    let taskId: string
    if (existing[0]) {
      taskId = existing[0].id
      await this.db
        .update(plannerTask)
        .set({
          bucketId,
          title: props.title,
          orderHint: props.orderHint,
          progress,
          priority: props.priority as 1 | 3 | 5 | 9,
          startDate: props.startDateTime ? props.startDateTime.toISOString().split('T')[0] : null,
          dueDate: props.dueDateTime ? props.dueDateTime.toISOString().split('T')[0] : null,
          completedAt,
          msTaskEtag: props.msTaskEtag,
          pendingMsAssignments: props.pendingMsAssignments,
          updatedAt: sql`NOW()`,
        })
        .where(eq(plannerTask.id, taskId))
    } else {
      const rows = await this.db
        .insert(plannerTask)
        .values({
          tenantId: props.tenantId,
          planId: props.localPlanId,
          bucketId,
          title: props.title,
          orderHint: props.orderHint,
          progress,
          priority: props.priority as 1 | 3 | 5 | 9,
          startDate: props.startDateTime ? props.startDateTime.toISOString().split('T')[0] : null,
          dueDate: props.dueDateTime ? props.dueDateTime.toISOString().split('T')[0] : null,
          completedAt,
          createdBy: props.tenantId,
          msTaskId: props.msTaskId,
          msTaskEtag: props.msTaskEtag,
          pendingMsAssignments: props.pendingMsAssignments,
        })
        .returning({ id: plannerTask.id })
      taskId = rows[0]!.id
    }

    await this.db
      .delete(plannerTaskAssignee)
      .where(
        and(
          eq(plannerTaskAssignee.taskId, taskId),
          eq(plannerTaskAssignee.tenantId, props.tenantId),
        ),
      )
    for (const actorId of props.assigneeActorIds) {
      await this.db.insert(plannerTaskAssignee).values({
        taskId,
        actorId,
        assignedBy: props.tenantId,
        tenantId: props.tenantId,
      })
    }

    return { id: taskId }
  }

  async upsertDetailsFromMs(
    props: MsTaskDetailsUpsertProps,
    _opts: { origin: string },
  ): Promise<void> {
    const taskRow = await this.db
      .select({ tenantId: plannerTask.tenantId })
      .from(plannerTask)
      .where(eq(plannerTask.id, props.taskId))
      .limit(1)
    const tenantId = taskRow[0]?.tenantId ?? ''

    const checkedCount = props.checklist.filter((c) => c.isChecked).length

    await this.db
      .update(plannerTask)
      .set({
        msTaskDetailsEtag: props.msDetailsEtag,
        checklistItemCount: props.checklist.length,
        checklistCheckedCount: checkedCount,
        updatedAt: sql`NOW()`,
      })
      .where(eq(plannerTask.id, props.taskId))

    await this.db
      .delete(plannerTaskChecklistItem)
      .where(eq(plannerTaskChecklistItem.taskId, props.taskId))

    for (const item of props.checklist) {
      await this.db.insert(plannerTaskChecklistItem).values({
        taskId: props.taskId,
        title: item.title,
        isChecked: item.isChecked,
        orderHint: item.orderHint,
        tenantId,
        createdBy: tenantId,
      })
    }
  }

  async softDeleteFromMs(id: string, _opts: { origin: string }): Promise<void> {
    await this.db
      .update(plannerTask)
      .set({ msSoftDeletedAt: sql`NOW()`, updatedAt: sql`NOW()` })
      .where(eq(plannerTask.id, id))
  }

  async listWithPendingAssignments(tenantId: string): Promise<PendingTaskRef[]> {
    const rows = await this.db
      .select({
        id: plannerTask.id,
        planId: plannerTask.planId,
        pendingMsAssignments: plannerTask.pendingMsAssignments,
      })
      .from(plannerTask)
      .where(
        and(
          eq(plannerTask.tenantId, tenantId),
          isNull(plannerTask.deletedAt),
          sql`${plannerTask.pendingMsAssignments} != '[]'::jsonb`,
        ),
      )

    return rows.map((r) => ({
      id: r.id,
      planId: r.planId,
      pendingMsAssignments: Array.isArray(r.pendingMsAssignments)
        ? (r.pendingMsAssignments as string[])
        : [],
    }))
  }

  async applyPendingResolution(
    taskId: string,
    resolution: { newAssignees: string[]; stillPending: string[]; origin: string },
  ): Promise<void> {
    const taskRow = await this.db
      .select({ tenantId: plannerTask.tenantId })
      .from(plannerTask)
      .where(eq(plannerTask.id, taskId))
      .limit(1)

    const tenantId = taskRow[0]?.tenantId
    if (!tenantId) return

    await this.db
      .update(plannerTask)
      .set({ pendingMsAssignments: resolution.stillPending, updatedAt: sql`NOW()` })
      .where(eq(plannerTask.id, taskId))

    for (const actorId of resolution.newAssignees) {
      await this.db
        .insert(plannerTaskAssignee)
        .values({ taskId, actorId, assignedBy: tenantId, tenantId })
        .onConflictDoNothing()
    }
  }

  async listByPlan(planId: string, opts: { onlySynced: boolean }): Promise<MsSyncedTaskRef[]> {
    const rows = await this.db
      .select({
        id: plannerTask.id,
        msTaskId: plannerTask.msTaskId,
        msTaskEtag: plannerTask.msTaskEtag,
        msDetailsEtag: plannerTask.msTaskDetailsEtag,
        msSoftDeletedAt: plannerTask.msSoftDeletedAt,
      })
      .from(plannerTask)
      .where(
        opts.onlySynced
          ? and(
              eq(plannerTask.planId, planId),
              isNull(plannerTask.deletedAt),
              sql`${plannerTask.msTaskId} IS NOT NULL`,
            )
          : and(eq(plannerTask.planId, planId), isNull(plannerTask.deletedAt)),
      )
    return rows.map((r) => ({
      id: r.id,
      msTaskId: r.msTaskId ?? null,
      msTaskEtag: r.msTaskEtag ?? null,
      msDetailsEtag: r.msDetailsEtag ?? null,
      msSoftDeletedAt: r.msSoftDeletedAt ?? null,
    }))
  }

  async markPushed(id: string, pushedAt: Date): Promise<void> {
    await this.db
      .update(plannerTask)
      .set({ msSyncPushedAt: pushedAt })
      .where(eq(plannerTask.id, id))
  }

  async updateMsEtag(
    id: string,
    etags: { msTaskEtag?: string | null; msDetailsEtag?: string | null },
  ): Promise<void> {
    const patch: Partial<typeof plannerTask.$inferInsert> = {}
    if (etags.msTaskEtag !== undefined) patch.msTaskEtag = etags.msTaskEtag
    if (etags.msDetailsEtag !== undefined) patch.msTaskDetailsEtag = etags.msDetailsEtag
    if (Object.keys(patch).length === 0) return
    await this.db.update(plannerTask).set(patch).where(eq(plannerTask.id, id))
  }
}
