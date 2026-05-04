import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
import { TASK_REPOSITORY, type ITaskRepository } from '../../../domain/repositories/task.repository'
import { PLAN_REPOSITORY, type IPlanRepository } from '../../../domain/repositories/plan.repository'
import { ListConflictsQuery } from './list-conflicts.query'

export interface ConflictDto {
  id: string
  kind: string
  createdAt: string
  taskId: string | null
  taskTitle: string | null
  planTitle: string | null
  field: string | null
  mineValue: unknown
  theirsValue: unknown
  limitCode: string | null
  resolution: string | null
  resolvedAt: string | null
  rawError: unknown
}

export interface ListConflictsResult {
  conflicts: ConflictDto[]
  nextCursor: string | null
}

@QueryHandler(ListConflictsQuery)
export class ListConflictsHandler implements IQueryHandler<
  ListConflictsQuery,
  ListConflictsResult
> {
  constructor(
    @Inject(MS_SYNC_CONFLICT_REPOSITORY)
    private readonly conflictRepo: IMsSyncConflictRepository,
    @Inject(TASK_REPOSITORY)
    private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY)
    private readonly planRepo: IPlanRepository,
  ) {}

  async execute(query: ListConflictsQuery): Promise<ListConflictsResult> {
    const { tenantId, opts } = query
    const { resolved, limit, cursor } = opts

    let before: Date | undefined
    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8')
      before = new Date(decoded)
    }

    const rows = await this.conflictRepo.list(tenantId, { resolved, limit, before })

    const taskMap = new Map<string, { title: string; planId: string }>()
    const planMap = new Map<string, string>() // planId -> name

    for (const conflict of rows) {
      if (conflict.taskId && !taskMap.has(conflict.taskId)) {
        const task = await this.taskRepo.findById(conflict.taskId, tenantId)
        if (task) taskMap.set(conflict.taskId, { title: task.title, planId: task.planId })
      }
    }

    for (const [, taskData] of taskMap) {
      if (!planMap.has(taskData.planId)) {
        const plan = await this.planRepo.findById(taskData.planId, tenantId)
        if (plan) planMap.set(taskData.planId, plan.name)
      }
    }

    const conflicts: ConflictDto[] = rows.map((c) => {
      const taskData = c.taskId ? taskMap.get(c.taskId) : undefined
      return {
        id: c.id,
        kind: c.kind,
        createdAt: c.createdAt.toISOString(),
        taskId: c.taskId,
        taskTitle: taskData?.title ?? null,
        planTitle: taskData ? (planMap.get(taskData.planId) ?? null) : null,
        field: c.kind === 'push_403_quota' ? null : c.field,
        mineValue: c.mineValue,
        theirsValue: c.theirsValue,
        limitCode: c.kind === 'push_403_quota' ? c.field : null,
        resolution: c.resolution,
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        rawError: c.rawError,
      }
    })

    const lastRow = rows.length === limit ? rows[rows.length - 1] : undefined
    const nextCursor = lastRow
      ? Buffer.from(lastRow.createdAt.toISOString()).toString('base64')
      : null

    return { conflicts, nextCursor }
  }
}
