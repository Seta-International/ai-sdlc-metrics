import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'
import { UnauthorizedPlanAccessException } from '../../../domain/exceptions/unauthorized-plan-access.exception'
import { TaskNotFoundException } from '../../../domain/exceptions/task-not-found.exception'
import { STORAGE_CLIENT, type StorageClient } from '../../../domain/ports/storage-client.port'
import { GetTaskDetailQuery, type TaskDetailSnapshot } from './get-task-detail.query'
import type { MsSyncState } from '../../../domain/entities/task-attachment.entity'

@QueryHandler(GetTaskDetailQuery)
export class GetTaskDetailHandler implements IQueryHandler<GetTaskDetailQuery, TaskDetailSnapshot> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelQueryFacade: KernelQueryFacade,
    @Inject(STORAGE_CLIENT) private readonly storageClient: StorageClient,
  ) {}

  async execute(query: GetTaskDetailQuery): Promise<TaskDetailSnapshot> {
    const { planId, taskId, actorId, tenantId } = query

    // ── Query 1: Task + plan membership rows ──────────────────────────────────
    const taskMemberResult = await this.db.execute<{
      id: string
      plan_id: string
      bucket_id: string
      cover_attachment_id: string | null
      title: string
      description: string
      progress: number
      priority: number
      start_date: string | null
      due_date: string | null
      order_hint: string
      created_by: string
      created_at: Date
      updated_at: Date
      completed_at: Date | null
      completed_by: string | null
      checklist_item_count: number
      checklist_checked_count: number
      member_actor_id: string | null
    }>(
      sql`SELECT
            t.id,
            t.plan_id,
            t.bucket_id,
            t.cover_attachment_id,
            t.title,
            t.description,
            t.progress,
            t.priority,
            t.start_date,
            t.due_date,
            t.order_hint,
            t.created_by,
            t.created_at,
            t.updated_at,
            t.completed_at,
            t.completed_by,
            t.checklist_item_count,
            t.checklist_checked_count,
            pm.actor_id AS member_actor_id
          FROM planner.task t
          LEFT JOIN planner.plan_member pm
            ON pm.plan_id = t.plan_id
            AND pm.tenant_id = t.tenant_id
          WHERE t.id = ${taskId}
            AND t.plan_id = ${planId}
            AND t.tenant_id = ${tenantId}
            AND t.deleted_at IS NULL`,
    )

    const memberRows = taskMemberResult.rows

    // No rows at all → task does not exist
    if (memberRows.length === 0 || !memberRows[0]?.id) {
      throw new TaskNotFoundException(taskId)
    }

    // Check actor membership
    const isMember = memberRows.some((r) => r.member_actor_id === actorId)
    if (!isMember) {
      throw new UnauthorizedPlanAccessException(actorId, planId)
    }

    const taskRow = memberRows[0]!

    // ── Query 2: Checklist items ordered by order_hint ASC ────────────────────
    const checklistResult = await this.db.execute<{
      id: string
      title: string
      is_checked: boolean
      order_hint: string
    }>(
      sql`SELECT id, title, is_checked, order_hint
          FROM planner.task_checklist_item
          WHERE task_id = ${taskId}
            AND tenant_id = ${tenantId}
          ORDER BY order_hint COLLATE "C" ASC`,
    )

    // ── Query 3: Assignees ────────────────────────────────────────────────────
    const assigneeResult = await this.db.execute<{
      actor_id: string
      assigned_by: string
      assigned_at: Date
    }>(
      sql`SELECT actor_id, assigned_by, assigned_at
          FROM planner.task_assignee
          WHERE task_id = ${taskId}
            AND tenant_id = ${tenantId}`,
    )

    // ── Query 4: Applied labels ───────────────────────────────────────────────
    const labelResult = await this.db.execute<{ slot: string }>(
      sql`SELECT slot
          FROM planner.task_applied_label
          WHERE task_id = ${taskId}
            AND tenant_id = ${tenantId}`,
    )

    // ── Query 5: Attachments ──────────────────────────────────────────────────
    const attachmentResult = await this.db.execute<{
      id: string
      kind: string
      storage_key: string | null
      filename: string | null
      content_type: string | null
      size_bytes: number | null
      url: string | null
      link_title: string | null
      created_by: string
      created_at: Date
      ms_sync_state: string | null
    }>(
      sql`SELECT id, kind, storage_key, filename, content_type, size_bytes, url, link_title, created_by, created_at, ms_sync_state
          FROM planner.task_attachment
          WHERE task_id = ${taskId}
            AND tenant_id = ${tenantId}
          ORDER BY created_at ASC`,
    )

    // ── Query 6: Comment count ────────────────────────────────────────────────
    const commentCountResult = await this.db.execute<{ count: string }>(
      sql`SELECT COUNT(*) AS count
          FROM planner.task_comment
          WHERE task_id = ${taskId}
            AND tenant_id = ${tenantId}
            AND deleted_at IS NULL`,
    )

    // ── Query 7: Evidence count ───────────────────────────────────────────────
    const evidenceCountResult = await this.db.execute<{ count: string }>(
      sql`SELECT COUNT(*) AS count
          FROM planner.task_evidence
          WHERE task_id = ${taskId}
            AND tenant_id = ${tenantId}`,
    )

    // ── Resolve actor display info (one batch — not a planner DB query) ───────
    const assigneeIds = assigneeResult.rows.map((r) => r.actor_id)
    const actorMap = await this.kernelQueryFacade.getActorsByIds(assigneeIds, tenantId)

    // ── Assemble ──────────────────────────────────────────────────────────────
    const checklist = checklistResult.rows.map((r) => ({
      id: r.id,
      title: r.title,
      isChecked: r.is_checked,
      orderHint: r.order_hint,
    }))

    const assignees = assigneeResult.rows.map((r) => {
      const actorInfo = actorMap.get(r.actor_id)
      return {
        actorId: r.actor_id,
        assignedBy: r.assigned_by,
        assignedAt: r.assigned_at,
        name: actorInfo?.displayName,
        avatarUrl: undefined as string | undefined,
      }
    })

    const appliedLabels = labelResult.rows.map((r) => r.slot)

    // ── Query 8: Custom field defs + values ──────────────────────────────────
    const cfResult = await this.db.execute<{
      def_id: string
      name: string
      kind: string
      choice_options: unknown
      position: number
      value_text: string | null
      value_number: string | null
      value_date: string | null
      value_yes_no: boolean | null
      value_choice: string | null
    }>(
      sql`SELECT
            cfd.id          AS def_id,
            cfd.name,
            cfd.kind,
            cfd.choice_options,
            cfd.position,
            cfv.value_text,
            cfv.value_number,
            cfv.value_date,
            cfv.value_yes_no,
            cfv.value_choice
          FROM planner.custom_field_def cfd
          LEFT JOIN planner.task_custom_field_value cfv
            ON cfv.field_def_id = cfd.id
           AND cfv.task_id = ${taskId}
           AND cfv.tenant_id = ${tenantId}
          WHERE cfd.plan_id = ${taskRow.plan_id}
            AND cfd.tenant_id = ${tenantId}
          ORDER BY cfd.position`,
    )

    const customFields = cfResult.rows.map((r) => ({
      defId: r.def_id,
      name: r.name,
      kind: r.kind as 'text' | 'number' | 'date' | 'yes_no' | 'choice',
      choiceOptions: Array.isArray(r.choice_options) ? (r.choice_options as string[]) : null,
      position: r.position,
      value:
        r.value_text !== null ||
        r.value_number !== null ||
        r.value_date !== null ||
        r.value_yes_no !== null ||
        r.value_choice !== null
          ? {
              text: r.value_text ?? undefined,
              number: r.value_number !== null ? parseFloat(r.value_number) : undefined,
              date: r.value_date ?? undefined,
              yesNo: r.value_yes_no ?? undefined,
              choice: r.value_choice ?? undefined,
            }
          : null,
    }))

    // ── Query 9: Dependencies ─────────────────────────────────────────────────
    const depsResult = await this.db.execute<{
      from_task_id: string
      to_task_id: string
      kind: string
      from_title: string
      to_title: string
    }>(
      sql`SELECT d.from_task_id, d.to_task_id, d.kind,
                 ft.title AS from_title, tt.title AS to_title
            FROM planner.task_dependency d
            JOIN planner.task ft ON ft.id = d.from_task_id
            JOIN planner.task tt ON tt.id = d.to_task_id
           WHERE (d.from_task_id = ${taskId} OR d.to_task_id = ${taskId})
             AND d.tenant_id = ${tenantId}`,
    )

    const predecessors = depsResult.rows
      .filter((r) => r.to_task_id === taskId)
      .map((r) => ({ taskId: r.from_task_id, title: r.from_title, kind: r.kind }))

    const successors = depsResult.rows
      .filter((r) => r.from_task_id === taskId)
      .map((r) => ({ taskId: r.to_task_id, title: r.to_title, kind: r.kind }))

    // ── Resolve presigned GET URLs for file attachments (sequential — single DB client) ──
    const attachments: TaskDetailSnapshot['attachments'] = []
    for (const row of attachmentResult.rows) {
      let resolvedUrl: string | undefined = undefined
      if (row.kind === 'file' && row.storage_key) {
        const presigned = await this.storageClient.getDownloadUrl(row.storage_key, 900)
        resolvedUrl = presigned.url
      } else if (row.kind === 'link' && row.url) {
        resolvedUrl = row.url
      }
      attachments.push({
        id: row.id,
        kind: row.kind as 'file' | 'link',
        filename: row.filename ?? undefined,
        contentType: row.content_type ?? undefined,
        sizeBytes: row.size_bytes ?? undefined,
        url: resolvedUrl,
        linkTitle: row.link_title ?? undefined,
        createdBy: row.created_by,
        createdAt: row.created_at,
        msSyncState: (row.ms_sync_state ?? 'synced') as MsSyncState,
      })
    }

    return {
      id: taskRow.id,
      planId: taskRow.plan_id,
      bucketId: taskRow.bucket_id,
      coverAttachmentId: taskRow.cover_attachment_id ?? null,
      title: taskRow.title,
      description: taskRow.description,
      progress: Number(taskRow.progress),
      priority: Number(taskRow.priority),
      startDate: taskRow.start_date ? new Date(taskRow.start_date) : null,
      dueDate: taskRow.due_date ? new Date(taskRow.due_date) : null,
      orderHint: taskRow.order_hint,
      createdBy: taskRow.created_by,
      createdAt: taskRow.created_at,
      updatedAt: taskRow.updated_at,
      completedAt: taskRow.completed_at ?? null,
      completedBy: taskRow.completed_by ?? null,
      checklistItemCount: Number(taskRow.checklist_item_count),
      checklistCheckedCount: Number(taskRow.checklist_checked_count),
      attachmentCount: attachmentResult.rows.length,
      commentCount: Number(commentCountResult.rows[0]?.count ?? 0),
      evidenceCount: Number(evidenceCountResult.rows[0]?.count ?? 0),
      checklist,
      assignees,
      appliedLabels,
      attachments,
      customFields,
      predecessors,
      successors,
    }
  }
}
