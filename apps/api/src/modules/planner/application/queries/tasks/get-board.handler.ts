import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
// Schema tables are referenced via raw SQL queries for the 3-query board snapshot approach
import { GetBoardQuery } from './get-board.query'

export interface BoardTaskSnapshot {
  id: string
  title: string
  description: string
  progress: number
  priority: number
  startDate: Date | null
  dueDate: Date | null
  orderHint: string
  completedAt: Date | null
  completedBy: string | null
  checklistItemCount: number
  checklistCheckedCount: number
  attachmentCount: number
  commentCount: number
  evidenceCount: number
  coverAttachmentId: string | null
  appliedLabels: string[]
  assignees: Array<{ actorId: string; name?: string; avatarUrl?: string }>
  updatedAt: Date
}

export interface BoardBucketSnapshot {
  id: string
  name: string
  orderHint: string
  tasks: BoardTaskSnapshot[]
}

export interface BoardSnapshot {
  plan: {
    id: string
    name: string
    labels: Array<{ slot: string; name: string; color: string }>
    members: Array<{ actorId: string; role: string; person?: { name: string; avatarUrl?: string } }>
  }
  buckets: BoardBucketSnapshot[]
}

@QueryHandler(GetBoardQuery)
export class GetBoardHandler implements IQueryHandler<GetBoardQuery, BoardSnapshot> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async execute(query: GetBoardQuery): Promise<BoardSnapshot> {
    const { planId, actorId, tenantId } = query

    // ── Query 1: Plan + labels + members ─────────────────────────────────────
    const [planRows, labelRows, memberRows] = await this.fetchPlanWithLabelsAndMembers(
      planId,
      tenantId,
    )

    // Validate: plan must exist and actor must be a member
    if (!planRows[0]) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }

    const isMember = memberRows.some((m) => m.actorId === actorId)
    if (!isMember) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }

    const planRow = planRows[0]

    // ── Query 2: Buckets ───────────────────────────────────────────────────────
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
          ORDER BY order_hint ASC`,
    )
    const bucketRows = bucketResult.rows

    // ── Query 3: Tasks + assignees + applied labels ────────────────────────────
    const { taskRows, assigneeRows, appliedLabelRows } =
      await this.fetchTasksWithAssigneesAndLabels(planId, tenantId)

    // ── Resolve actor display info (one batch call — not a planner DB query) ──
    const allAssigneeIds = [...new Set(assigneeRows.map((a) => a.actorId))]
    const actorMap = await this.kernelQueryFacade.getActorsByIds(allAssigneeIds, tenantId)

    // ── Assemble ──────────────────────────────────────────────────────────────

    // Group assignees and labels by taskId
    const assigneesByTaskId = new Map<string, Array<{ actorId: string }>>()
    for (const assignee of assigneeRows) {
      const list = assigneesByTaskId.get(assignee.taskId) ?? []
      list.push({ actorId: assignee.actorId })
      assigneesByTaskId.set(assignee.taskId, list)
    }

    const labelsByTaskId = new Map<string, string[]>()
    for (const label of appliedLabelRows) {
      const list = labelsByTaskId.get(label.taskId) ?? []
      list.push(label.slot)
      labelsByTaskId.set(label.taskId, list)
    }

    // Group tasks by bucketId, sorted by orderHint
    const tasksByBucketId = new Map<string, BoardTaskSnapshot[]>()
    for (const taskRow of taskRows) {
      const rawAssignees = assigneesByTaskId.get(taskRow.id) ?? []
      const assignees = rawAssignees.map((a) => {
        const actorInfo = actorMap.get(a.actorId)
        return {
          actorId: a.actorId,
          name: actorInfo?.displayName,
          avatarUrl: undefined as string | undefined,
        }
      })

      const task: BoardTaskSnapshot = {
        id: taskRow.id,
        title: taskRow.title,
        description: taskRow.description,
        progress: taskRow.progress,
        priority: taskRow.priority,
        startDate: taskRow.startDate ? new Date(taskRow.startDate as string) : null,
        dueDate: taskRow.dueDate ? new Date(taskRow.dueDate as string) : null,
        orderHint: taskRow.orderHint,
        completedAt: taskRow.completedAt,
        completedBy: taskRow.completedBy,
        checklistItemCount: taskRow.checklistItemCount,
        checklistCheckedCount: taskRow.checklistCheckedCount,
        // Plan 03/04 will add attachment, comment, evidence tables; stub as 0 for now
        attachmentCount: 0,
        commentCount: 0,
        evidenceCount: 0,
        coverAttachmentId: taskRow.coverAttachmentId,
        appliedLabels: labelsByTaskId.get(taskRow.id) ?? [],
        assignees,
        updatedAt: taskRow.updatedAt,
      }

      const list = tasksByBucketId.get(taskRow.bucketId) ?? []
      list.push(task)
      tasksByBucketId.set(taskRow.bucketId, list)
    }

    // Tasks are already sorted by orderHint from the DB query (see fetchTasksWithAssigneesAndLabels)

    const buckets: BoardBucketSnapshot[] = bucketRows.map((b) => ({
      id: b.id,
      name: b.name,
      orderHint: b.order_hint,
      tasks: tasksByBucketId.get(b.id) ?? [],
    }))

    return {
      plan: {
        id: planRow.id,
        name: planRow.name,
        labels: labelRows.map((l) => ({ slot: l.slot, name: l.name, color: l.color })),
        members: memberRows.map((m) => ({
          actorId: m.actorId,
          role: m.role,
        })),
      },
      buckets,
    }
  }

  /**
   * Query 1: Plan + labels + members in one SQL round trip via LEFT JOINs.
   * Uses Drizzle sql template for safe parameterization.
   */
  private async fetchPlanWithLabelsAndMembers(
    planId: string,
    tenantId: string,
  ): Promise<
    [
      Array<{ id: string; name: string }>,
      Array<{ slot: string; name: string; color: string }>,
      Array<{ actorId: string; role: string }>,
    ]
  > {
    const result = await this.db.execute<{
      plan_id: string | null
      plan_name: string | null
      label_slot: string | null
      label_name: string | null
      label_color: string | null
      member_actor_id: string | null
      member_role: string | null
    }>(
      sql`SELECT
            p.id            AS plan_id,
            p.name          AS plan_name,
            pl.slot         AS label_slot,
            pl.name         AS label_name,
            pl.color        AS label_color,
            pm.actor_id     AS member_actor_id,
            pm.role         AS member_role
          FROM planner.plan p
          LEFT JOIN planner.plan_label pl
            ON pl.plan_id = p.id AND pl.tenant_id = p.tenant_id
          LEFT JOIN planner.plan_member pm
            ON pm.plan_id = p.id AND pm.tenant_id = p.tenant_id
          WHERE p.id = ${planId}
            AND p.tenant_id = ${tenantId}
            AND p.deleted_at IS NULL`,
    )

    const rows = result.rows

    if (rows.length === 0 || !rows[0]?.plan_id) {
      return [[], [], []]
    }

    const planId_ = rows[0].plan_id
    const planName = rows[0].plan_name ?? ''

    // Deduplicate labels and members (cross-product rows due to dual LEFT JOIN)
    const labelMap = new Map<string, { slot: string; name: string; color: string }>()
    const memberMap = new Map<string, { actorId: string; role: string }>()

    for (const row of rows) {
      if (row.label_slot) {
        labelMap.set(row.label_slot, {
          slot: row.label_slot,
          name: row.label_name ?? '',
          color: row.label_color ?? '',
        })
      }
      if (row.member_actor_id) {
        memberMap.set(row.member_actor_id, {
          actorId: row.member_actor_id,
          role: row.member_role ?? '',
        })
      }
    }

    return [[{ id: planId_, name: planName }], [...labelMap.values()], [...memberMap.values()]]
  }

  /**
   * Query 3: Tasks + their assignees + their applied labels in one SQL round trip.
   * Uses a UNION ALL to batch-fetch two child tables in a single execute() call.
   * Tasks are fetched via a separate .select() (counted as query 2 for buckets, this is 3).
   *
   * Actually structure: tasks are fetched with a .select() that is Query 3,
   * and assignees+labels are fetched inside the same logical query via UNION ALL execute().
   * To keep exactly 3 DB round trips total, tasks+assignees+labels are combined below.
   */
  private async fetchTasksWithAssigneesAndLabels(
    planId: string,
    tenantId: string,
  ): Promise<{
    taskRows: Array<{
      id: string
      bucketId: string
      title: string
      description: string
      progress: number
      priority: number
      startDate: string | null
      dueDate: string | null
      orderHint: string
      completedAt: Date | null
      completedBy: string | null
      checklistItemCount: number
      checklistCheckedCount: number
      coverAttachmentId: string | null
      updatedAt: Date
    }>
    assigneeRows: Array<{ taskId: string; actorId: string }>
    appliedLabelRows: Array<{ taskId: string; slot: string }>
  }> {
    // Single execute() for tasks + assignees + labels via UNION ALL with row_type discriminator
    // Sorted by (bucket_id, order_hint) for tasks; other rows are ignored for sorting
    const result = await this.db.execute<{
      row_type: string
      task_id: string
      bucket_id: string | null
      title: string | null
      description: string | null
      progress: number | null
      priority: number | null
      start_date: string | null
      due_date: string | null
      order_hint: string | null
      completed_at: Date | null
      completed_by: string | null
      checklist_item_count: number | null
      checklist_checked_count: number | null
      cover_attachment_id: string | null
      updated_at: Date | null
      actor_id: string | null
      slot: string | null
    }>(
      sql`WITH task_ids AS (
            SELECT id
            FROM planner.task
            WHERE plan_id = ${planId}
              AND tenant_id = ${tenantId}
              AND deleted_at IS NULL
          )
          SELECT
            'task'                AS row_type,
            t.id                  AS task_id,
            t.bucket_id,
            t.title,
            t.description,
            t.progress,
            t.priority,
            t.start_date,
            t.due_date,
            t.order_hint,
            t.completed_at,
            t.completed_by,
            t.checklist_item_count,
            t.checklist_checked_count,
            t.cover_attachment_id,
            t.updated_at,
            NULL::uuid             AS actor_id,
            NULL::text             AS slot
          FROM planner.task t
          WHERE t.plan_id = ${planId}
            AND t.tenant_id = ${tenantId}
            AND t.deleted_at IS NULL

          UNION ALL

          SELECT
            'assignee'            AS row_type,
            ta.task_id,
            NULL::uuid            AS bucket_id,
            NULL::text            AS title,
            NULL::text            AS description,
            NULL::smallint        AS progress,
            NULL::smallint        AS priority,
            NULL::date            AS start_date,
            NULL::date            AS due_date,
            NULL::text            AS order_hint,
            NULL::timestamptz     AS completed_at,
            NULL::uuid            AS completed_by,
            NULL::smallint        AS checklist_item_count,
            NULL::smallint        AS checklist_checked_count,
            NULL::uuid            AS cover_attachment_id,
            NULL::timestamptz     AS updated_at,
            ta.actor_id,
            NULL::text            AS slot
          FROM planner.task_assignee ta
          WHERE ta.task_id IN (SELECT id FROM task_ids)
            AND ta.tenant_id = ${tenantId}

          UNION ALL

          SELECT
            'label'               AS row_type,
            al.task_id,
            NULL::uuid            AS bucket_id,
            NULL::text            AS title,
            NULL::text            AS description,
            NULL::smallint        AS progress,
            NULL::smallint        AS priority,
            NULL::date            AS start_date,
            NULL::date            AS due_date,
            NULL::text            AS order_hint,
            NULL::timestamptz     AS completed_at,
            NULL::uuid            AS completed_by,
            NULL::smallint        AS checklist_item_count,
            NULL::smallint        AS checklist_checked_count,
            NULL::uuid            AS cover_attachment_id,
            NULL::timestamptz     AS updated_at,
            NULL::uuid            AS actor_id,
            al.slot
          FROM planner.task_applied_label al
          WHERE al.task_id IN (SELECT id FROM task_ids)
            AND al.tenant_id = ${tenantId}

          ORDER BY bucket_id NULLS LAST, order_hint NULLS LAST`,
    )

    const taskRows: Array<{
      id: string
      bucketId: string
      title: string
      description: string
      progress: number
      priority: number
      startDate: string | null
      dueDate: string | null
      orderHint: string
      completedAt: Date | null
      completedBy: string | null
      checklistItemCount: number
      checklistCheckedCount: number
      coverAttachmentId: string | null
      updatedAt: Date
    }> = []
    const assigneeRows: Array<{ taskId: string; actorId: string }> = []
    const appliedLabelRows: Array<{ taskId: string; slot: string }> = []

    for (const row of result.rows) {
      if (row.row_type === 'task' && row.bucket_id && row.order_hint) {
        taskRows.push({
          id: row.task_id,
          bucketId: row.bucket_id,
          title: row.title ?? '',
          description: row.description ?? '',
          progress: Number(row.progress ?? 0),
          priority: Number(row.priority ?? 5),
          startDate: row.start_date ?? null,
          dueDate: row.due_date ?? null,
          orderHint: row.order_hint,
          completedAt: row.completed_at ?? null,
          completedBy: row.completed_by ?? null,
          checklistItemCount: Number(row.checklist_item_count ?? 0),
          checklistCheckedCount: Number(row.checklist_checked_count ?? 0),
          coverAttachmentId: row.cover_attachment_id ?? null,
          updatedAt: row.updated_at ?? new Date(),
        })
      } else if (row.row_type === 'assignee' && row.actor_id) {
        assigneeRows.push({ taskId: row.task_id, actorId: row.actor_id })
      } else if (row.row_type === 'label' && row.slot) {
        appliedLabelRows.push({ taskId: row.task_id, slot: row.slot })
      }
    }

    return { taskRows, assigneeRows, appliedLabelRows }
  }
}
