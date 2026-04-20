import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import type { Db } from '@future/db'
import type { TaskFlatWithPlan } from '@future/api-client/planner'
import { sql } from 'drizzle-orm'
import { DB_TOKEN } from '../../../../../common/db/db.module'
import { KernelQueryFacade } from '../../../../kernel/application/facades/kernel-query.facade'
import { ListTasksForActorQuery } from './list-tasks-for-actor.query'

function mapProgress(p: number): TaskFlatWithPlan['progress'] {
  if (p === 100) return 'completed'
  if (p === 50) return 'in-progress'
  return 'not-started'
}

function mapPriority(p: number): TaskFlatWithPlan['priority'] {
  if (p === 1) return 'urgent'
  if (p === 3) return 'important'
  if (p === 9) return 'low'
  return 'medium'
}

@QueryHandler(ListTasksForActorQuery)
export class ListTasksForActorHandler implements IQueryHandler<
  ListTasksForActorQuery,
  TaskFlatWithPlan[]
> {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly kernelQueryFacade: KernelQueryFacade,
  ) {}

  async execute(query: ListTasksForActorQuery): Promise<TaskFlatWithPlan[]> {
    const { actorId, tenantId, options } = query
    const progressFilter = options.includeCompleted ? sql`TRUE` : sql`t.progress < 100`

    // Query 1: Tasks joined to plan + bucket, filtered by assignee + visibility
    const taskResult = await this.db.execute<{
      task_id: string
      plan_id: string
      plan_name: string
      plan_owner_actor_id: string | null
      bucket_id: string
      bucket_name: string
      bucket_order_hint: string
      title: string
      progress: number
      priority: number
      start_date: string | null
      due_date: string | null
      order_hint: string
      checklist_item_count: number
      checklist_checked_count: number
      attachment_count: number
      comment_count: number
      created_at: Date | string
      updated_at: Date | string
    }>(
      sql`SELECT
            t.id                                AS task_id,
            p.id                                AS plan_id,
            p.name                              AS plan_name,
            p.owner_actor_id                    AS plan_owner_actor_id,
            t.bucket_id,
            b.name                              AS bucket_name,
            b.order_hint                        AS bucket_order_hint,
            t.title,
            t.progress,
            t.priority,
            t.start_date,
            t.due_date,
            t.order_hint,
            COALESCE(t.checklist_item_count, 0) AS checklist_item_count,
            COALESCE(t.checklist_checked_count, 0) AS checklist_checked_count,
            (SELECT COUNT(*)::int FROM planner.task_attachment ta
              WHERE ta.task_id = t.id AND ta.tenant_id = ${tenantId}) AS attachment_count,
            (SELECT COUNT(*)::int FROM planner.task_comment tc
              WHERE tc.task_id = t.id AND tc.tenant_id = ${tenantId}
                AND tc.deleted_at IS NULL) AS comment_count,
            t.created_at,
            t.updated_at
          FROM planner.task t
          JOIN planner.task_assignee ta
            ON ta.task_id = t.id
            AND ta.tenant_id = t.tenant_id
          JOIN planner.plan p
            ON p.id = t.plan_id
            AND p.tenant_id = t.tenant_id
            AND p.deleted_at IS NULL
          LEFT JOIN planner.bucket b
            ON b.id = t.bucket_id
            AND b.tenant_id = t.tenant_id
            AND b.deleted_at IS NULL
          WHERE ta.actor_id = ${actorId}
            AND t.tenant_id = ${tenantId}
            AND t.deleted_at IS NULL
            AND (p.owner_actor_id IS NULL OR p.owner_actor_id = ${actorId})
            AND ${progressFilter}
          ORDER BY p.name ASC, b.order_hint NULLS LAST, t.order_hint NULLS LAST`,
    )

    if (taskResult.rows.length === 0) return []
    const taskIds = taskResult.rows.map((r) => r.task_id)
    const taskIdList = sql.join(
      taskIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )

    // Query 2: Co-assignees for returned tasks
    const assigneeResult = await this.db.execute<{ task_id: string; actor_id: string }>(
      sql`SELECT ta.task_id, ta.actor_id
          FROM planner.task_assignee ta
          WHERE ta.tenant_id = ${tenantId}
            AND ta.task_id = ANY(ARRAY[${taskIdList}])`,
    )

    // Query 3: Labels for returned tasks
    const labelResult = await this.db.execute<{
      task_id: string
      slot: string
      label_name: string
      label_color: string
    }>(
      sql`SELECT al.task_id, al.slot, pl.name AS label_name, pl.color AS label_color
          FROM planner.task_applied_label al
          JOIN planner.plan_label pl
            ON pl.plan_id = al.plan_id
            AND pl.slot = al.slot
            AND pl.tenant_id = al.tenant_id
          WHERE al.tenant_id = ${tenantId}
            AND al.task_id = ANY(ARRAY[${taskIdList}])`,
    )

    const assigneesByTaskId = new Map<string, string[]>()
    for (const r of assigneeResult.rows) {
      const list = assigneesByTaskId.get(r.task_id) ?? []
      list.push(r.actor_id)
      assigneesByTaskId.set(r.task_id, list)
    }

    const labelsByTaskId = new Map<string, Array<{ id: string; name: string; color: string }>>()
    for (const r of labelResult.rows) {
      const list = labelsByTaskId.get(r.task_id) ?? []
      list.push({ id: r.slot, name: r.label_name, color: r.label_color })
      labelsByTaskId.set(r.task_id, list)
    }

    const allActorIds = Array.from(new Set([...assigneesByTaskId.values()].flat()))
    const actorMap = await this.kernelQueryFacade.getActorsByIds(allActorIds, tenantId)

    return taskResult.rows.map<TaskFlatWithPlan>((r) => {
      const actorIds = assigneesByTaskId.get(r.task_id) ?? []
      const assignees = actorIds.map((id) => {
        const actor = actorMap.get(id)
        return {
          actorId: id,
          displayName: actor?.displayName ?? '',
          avatarUrl: null,
        }
      })

      return {
        id: r.task_id,
        planId: r.plan_id,
        planName: r.plan_name,
        planKind: r.plan_owner_actor_id === null ? 'team' : 'personal',
        bucketId: r.bucket_id,
        bucketName: r.bucket_name,
        bucketOrderHint: r.bucket_order_hint,
        title: r.title,
        progress: mapProgress(Number(r.progress)),
        priority: mapPriority(Number(r.priority)),
        startDate: r.start_date ? new Date(r.start_date).toISOString() : null,
        dueDate: r.due_date ? new Date(r.due_date).toISOString() : null,
        assignees,
        labels: labelsByTaskId.get(r.task_id) ?? [],
        orderHint: r.order_hint,
        commentCount: Number(r.comment_count),
        checklistCount: {
          total: Number(r.checklist_item_count),
          completed: Number(r.checklist_checked_count),
        },
        attachmentCount: Number(r.attachment_count),
        createdAt: new Date(r.created_at).toISOString(),
        updatedAt: new Date(r.updated_at).toISOString(),
      }
    })
  }
}
