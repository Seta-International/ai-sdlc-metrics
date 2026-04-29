'use client'

import { useQuery } from '@future/api-client'
import { trpc } from '../trpc'
import type { BoardSnapshot } from '../board-types'

type DateLike = Date | string | null | undefined

interface RawBoardTaskSnapshot {
  id: string
  title: string
  description: string
  progress: number
  priority: number
  startDate: DateLike
  dueDate: DateLike
  orderHint: string
  completedAt: DateLike
  completedBy: string | null
  checklistItemCount: number
  checklistCheckedCount: number
  attachmentCount: number
  commentCount: number
  evidenceCount: number
  hasPendingAttachment: boolean
  coverAttachmentId: string | null
  appliedLabels: string[]
  assignees: Array<{ actorId: string; name?: string; avatarUrl?: string }>
  updatedAt: Date | string
}

interface RawBoardBucketSnapshot {
  id: string
  name: string
  orderHint: string
  tasks: RawBoardTaskSnapshot[]
}

interface RawBoardSnapshot {
  plan: BoardSnapshot['plan']
  buckets: RawBoardBucketSnapshot[]
}

function toDateOrNull(value: DateLike): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function normalizeBoardSnapshot(raw: RawBoardSnapshot): BoardSnapshot {
  return {
    ...raw,
    buckets: raw.buckets.map((bucket) => ({
      ...bucket,
      tasks: bucket.tasks.map((task) => ({
        ...task,
        startDate: toDateOrNull(task.startDate),
        dueDate: toDateOrNull(task.dueDate),
        completedAt: toDateOrNull(task.completedAt),
        updatedAt: toDate(task.updatedAt),
      })),
    })),
  }
}

interface UseBoardSnapshotInput {
  planId: string
  actorId: string
  tenantId: string
}

interface UseBoardSnapshotResult {
  data: BoardSnapshot | null | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * React Query wrapper around trpc.planner.tasks.getBoard.
 * Cache key is scoped to planId + actorId + tenantId for RLS correctness.
 */
export function useBoardSnapshot({
  planId,
  actorId,
  tenantId,
}: UseBoardSnapshotInput): UseBoardSnapshotResult {
  const query = useQuery({
    queryKey: ['tasks.getBoard', planId, actorId, tenantId] as const,
    queryFn: async () =>
      normalizeBoardSnapshot(
        (await trpc.planner.tasks.getBoard.query({
          planId,
          actorId,
          tenantId,
        })) as RawBoardSnapshot,
      ),
    enabled: Boolean(planId && actorId && tenantId),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
