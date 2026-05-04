import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { GetFlatTasksQuery } from './get-flat.query'

export type TaskFlat = {
  id: string
  planId: string
  bucketId: string
  bucketName: string
  bucketOrderHint: string
  title: string
  progress: 'not-started' | 'in-progress' | 'completed'
  priority: 'urgent' | 'important' | 'medium' | 'low'
  startDate: string | null
  dueDate: string | null
  assignees: { actorId: string; displayName: string; avatarUrl: string | null }[]
  labels: { id: string; name: string; color: string }[]
  orderHint: string
  commentCount: number
  checklistCount: { total: number; completed: number }
  attachmentCount: number
  createdAt: string
  updatedAt: string
}

// Map numeric progress to string union
function mapProgress(progress: number): TaskFlat['progress'] {
  if (progress === 100) return 'completed'
  if (progress === 50) return 'in-progress'
  return 'not-started'
}

// Map numeric priority to string union (1=urgent, 3=important, 5=medium, 9=low)
function mapPriority(priority: number): TaskFlat['priority'] {
  if (priority === 1) return 'urgent'
  if (priority === 3) return 'important'
  if (priority === 9) return 'low'
  return 'medium'
}

@QueryHandler(GetFlatTasksQuery)
export class GetFlatTasksHandler implements IQueryHandler<GetFlatTasksQuery, TaskFlat[]> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async execute(query: GetFlatTasksQuery): Promise<TaskFlat[]> {
    const { planId, actorId, tenantId } = query

    // ── Query 1: Verify plan exists and actor is a member ─────────────────────
    const memberResult = await this.db.execute<{
      plan_exists: boolean
      actor_is_member: boolean
    }>(
      sql`SELECT
            EXISTS(
              SELECT 1 FROM planner.plan
              WHERE id = ${planId}
                AND tenant_id = ${tenantId}
                AND deleted_at IS NULL
            ) AS plan_exists,
            EXISTS(
              SELECT 1 FROM planner.plan_member
              WHERE plan_id = ${planId}
                AND tenant_id = ${tenantId}
                AND actor_id = ${actorId}
            ) AS actor_is_member`,
    )

    const memberRow = memberResult.rows[0]
    if (!memberRow?.plan_exists || !memberRow.actor_is_member) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }

    // ── Query 2: Buckets for this plan ────────────────────────────────────────
    const bucketResult = await this.db.execute<{
      id: string
      name: string
      order_hint: string
    }>(
      sql`SELECT id, name, order_hint
          FROM planner.bucket
          WHERE plan_id = ${planId}
            AND tenant_id = ${tenantId}
            AND deleted_at IS NULL
          ORDER BY order_hint COLLATE "C" ASC`,
    )

    const bucketById = new Map(
      bucketResult.rows.map((b) => [b.id, { name: b.name, orderHint: b.order_hint }]),
    )

    // ── Query 3: Tasks + assignees + applied labels + plan label details via UNION ALL ──
    const unionResult = await this.db.execute<{
      row_type: string
      task_id: string
      bucket_id: string | null
      title: string | null
      progress: number | null
      priority: number | null
      start_date: string | null
      due_date: string | null
      order_hint: string | null
      checklist_item_count: number | null
      checklist_checked_count: number | null
      created_at: Date | null
      updated_at: Date | null
      actor_id: string | null
      slot: string | null
      label_name: string | null
      label_color: string | null
    }>(
      sql`WITH task_ids AS (
            SELECT id
            FROM planner.task
            WHERE plan_id = ${planId}
              AND tenant_id = ${tenantId}
              AND deleted_at IS NULL
          )
          SELECT
            'task'                   AS row_type,
            t.id                     AS task_id,
            t.bucket_id,
            t.title,
            t.progress,
            t.priority,
            t.start_date,
            t.due_date,
            t.order_hint COLLATE "C" AS order_hint,
            t.checklist_item_count,
            t.checklist_checked_count,
            t.created_at,
            t.updated_at,
            NULL::uuid               AS actor_id,
            NULL::text               AS slot,
            NULL::text               AS label_name,
            NULL::text               AS label_color
          FROM planner.task t
          WHERE t.plan_id = ${planId}
            AND t.tenant_id = ${tenantId}
            AND t.deleted_at IS NULL

          UNION ALL

          SELECT
            'assignee'               AS row_type,
            ta.task_id,
            NULL::uuid               AS bucket_id,
            NULL::text               AS title,
            NULL::smallint           AS progress,
            NULL::smallint           AS priority,
            NULL::date               AS start_date,
            NULL::date               AS due_date,
            NULL::text COLLATE "C"   AS order_hint,
            NULL::smallint           AS checklist_item_count,
            NULL::smallint           AS checklist_checked_count,
            NULL::timestamptz        AS created_at,
            NULL::timestamptz        AS updated_at,
            ta.actor_id,
            NULL::text               AS slot,
            NULL::text               AS label_name,
            NULL::text               AS label_color
          FROM planner.task_assignee ta
          WHERE ta.task_id IN (SELECT id FROM task_ids)
            AND ta.tenant_id = ${tenantId}

          UNION ALL

          SELECT
            'label'                  AS row_type,
            al.task_id,
            NULL::uuid               AS bucket_id,
            NULL::text               AS title,
            NULL::smallint           AS progress,
            NULL::smallint           AS priority,
            NULL::date               AS start_date,
            NULL::date               AS due_date,
            NULL::text COLLATE "C"   AS order_hint,
            NULL::smallint           AS checklist_item_count,
            NULL::smallint           AS checklist_checked_count,
            NULL::timestamptz        AS created_at,
            NULL::timestamptz        AS updated_at,
            NULL::uuid               AS actor_id,
            al.slot,
            pl.name                  AS label_name,
            pl.color                 AS label_color
          FROM planner.task_applied_label al
          JOIN planner.plan_label pl
            ON pl.plan_id = al.plan_id
            AND pl.slot = al.slot
            AND pl.tenant_id = al.tenant_id
          WHERE al.task_id IN (SELECT id FROM task_ids)
            AND al.tenant_id = ${tenantId}

          ORDER BY bucket_id NULLS LAST, order_hint NULLS LAST`,
    )

    // ── Query 4: Batch counts (attachments + comments) ────────────────────────
    const countsResult = await this.db.execute<{
      task_id: string
      kind: string
      cnt: number
    }>(
      sql`WITH task_ids AS (
            SELECT id FROM planner.task
            WHERE plan_id = ${planId}
              AND tenant_id = ${tenantId}
              AND deleted_at IS NULL
          )
          SELECT task_id, 'attachment' AS kind, COUNT(*)::int AS cnt
          FROM planner.task_attachment
          WHERE task_id IN (SELECT id FROM task_ids)
            AND tenant_id = ${tenantId}
          GROUP BY task_id

          UNION ALL

          SELECT task_id, 'comment' AS kind, COUNT(*)::int AS cnt
          FROM planner.task_comment
          WHERE task_id IN (SELECT id FROM task_ids)
            AND tenant_id = ${tenantId}
            AND deleted_at IS NULL
          GROUP BY task_id`,
    )

    // ── Parse UNION ALL rows ──────────────────────────────────────────────────

    interface TaskRow {
      id: string
      bucketId: string
      title: string
      progress: number
      priority: number
      startDate: string | null
      dueDate: string | null
      orderHint: string
      checklistItemCount: number
      checklistCheckedCount: number
      createdAt: Date
      updatedAt: Date
    }

    const taskRows: TaskRow[] = []
    const assigneesByTaskId = new Map<string, string[]>()
    const labelsByTaskId = new Map<string, Array<{ id: string; name: string; color: string }>>()

    for (const row of unionResult.rows) {
      if (row.row_type === 'task' && row.bucket_id && row.order_hint) {
        taskRows.push({
          id: row.task_id,
          bucketId: row.bucket_id,
          title: row.title ?? '',
          progress: Number(row.progress ?? 0),
          priority: Number(row.priority ?? 5),
          startDate: row.start_date ?? null,
          dueDate: row.due_date ?? null,
          orderHint: row.order_hint,
          checklistItemCount: Number(row.checklist_item_count ?? 0),
          checklistCheckedCount: Number(row.checklist_checked_count ?? 0),
          createdAt: row.created_at ?? new Date(),
          updatedAt: row.updated_at ?? new Date(),
        })
      } else if (row.row_type === 'assignee' && row.actor_id) {
        const list = assigneesByTaskId.get(row.task_id) ?? []
        list.push(row.actor_id)
        assigneesByTaskId.set(row.task_id, list)
      } else if (row.row_type === 'label' && row.slot) {
        const list = labelsByTaskId.get(row.task_id) ?? []
        list.push({
          id: row.slot,
          name: row.label_name ?? '',
          color: row.label_color ?? '',
        })
        labelsByTaskId.set(row.task_id, list)
      }
    }

    // Parse counts
    const countMap = new Map<string, { attachment: number; comment: number }>()
    for (const row of countsResult.rows) {
      const entry = countMap.get(row.task_id) ?? { attachment: 0, comment: 0 }
      if (row.kind === 'attachment') entry.attachment = Number(row.cnt)
      else if (row.kind === 'comment') entry.comment = Number(row.cnt)
      countMap.set(row.task_id, entry)
    }

    // ── Batch-resolve assignees (one call for all actors — NOT per-task) ──────
    const allActorIds = Array.from(new Set([...assigneesByTaskId.values()].flat()))
    const actorMap = await this.kernelQueryFacade.getActorsByIds(allActorIds, tenantId)

    // ── Assemble TaskFlat rows ────────────────────────────────────────────────
    return taskRows.map<TaskFlat>((t) => {
      const actorIds = assigneesByTaskId.get(t.id) ?? []
      const assignees = actorIds.map((id) => {
        const actor = actorMap.get(id)
        return {
          actorId: id,
          displayName: actor?.displayName ?? '',
          // TODO: KernelQueryFacade.getActorsByIds does not currently return avatarUrl.
          // avatarUrl is typed as string | null in TaskFlat — null is a valid interim value.
          // Populate this field once the facade exposes avatar data.
          avatarUrl: null,
        }
      })

      const bucket = bucketById.get(t.bucketId)
      const counts = countMap.get(t.id) ?? { attachment: 0, comment: 0 }

      return {
        id: t.id,
        planId,
        bucketId: t.bucketId,
        bucketName: bucket?.name ?? '',
        bucketOrderHint: bucket?.orderHint ?? '',
        title: t.title,
        progress: mapProgress(t.progress),
        priority: mapPriority(t.priority),
        startDate: t.startDate ? new Date(t.startDate).toISOString() : null,
        dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null,
        assignees,
        labels: labelsByTaskId.get(t.id) ?? [],
        orderHint: t.orderHint,
        commentCount: counts.comment,
        checklistCount: {
          total: t.checklistItemCount,
          completed: t.checklistCheckedCount,
        },
        attachmentCount: counts.attachment,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }
    })
  }
}
