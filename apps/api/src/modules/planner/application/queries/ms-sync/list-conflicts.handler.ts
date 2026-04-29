import { Inject } from '@nestjs/common'
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs'
import {
  MS_SYNC_CONFLICT_REPOSITORY,
  type IMsSyncConflictRepository,
} from '../../../domain/repositories/ms-sync-conflict.repository'
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

    const conflicts: ConflictDto[] = rows.map((c) => ({
      id: c.id,
      kind: c.kind,
      createdAt: c.createdAt.toISOString(),
      taskId: c.taskId,
      taskTitle: null,
      planTitle: null,
      field: c.kind === 'push_403_quota' ? null : c.field,
      mineValue: c.mineValue,
      theirsValue: c.theirsValue,
      limitCode: c.kind === 'push_403_quota' ? c.field : null,
      resolution: c.resolution,
      resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
      rawError: c.rawError,
    }))

    const lastRow = rows.length === limit ? rows[rows.length - 1] : undefined
    const nextCursor = lastRow
      ? Buffer.from(lastRow.createdAt.toISOString()).toString('base64')
      : null

    return { conflicts, nextCursor }
  }
}
