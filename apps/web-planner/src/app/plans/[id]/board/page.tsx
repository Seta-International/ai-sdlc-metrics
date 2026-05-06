'use client'

import { useParams } from 'next/navigation'
import { useSession } from '@future/auth'
import { Button, Skeleton } from '@future/ui'
import { useBoardSnapshot } from '../../../../lib/hooks/useBoardSnapshot'
import { useOptimisticMove } from '../../../../lib/hooks/useOptimisticMove'
import { BoardDragContext } from '../../../../components/board/BoardDragContext'
import { BoardColumn } from '../../../../components/board/BoardColumn'
import { AddBucketButton } from '../../../../components/board/AddBucketButton'
import { useQueryClient } from '@future/api-client'
import { trpc } from '../../../../lib/trpc'
import { taskKeys } from '../../../../lib/query-keys'
import type {
  BoardSnapshot,
  BoardTaskSnapshot,
  BoardBucketSnapshot,
} from '../../../../lib/board-types'
import type { Progress } from '../../../../components/primitives/ProgressIcon'
import type { TaskFlat } from '@future/api-client/planner'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { useViewState } from '../../../../lib/hooks/useViewState'
import { useViewRenderedTelemetry } from '../../../../lib/hooks/useViewRenderedTelemetry'
import { applyTaskFilter } from '../../../../lib/task-filter'
import { sortTasks } from '../../../../lib/task-sort'
import { DEFAULT_VIEW_STATE } from '../../../../lib/view-state'
import { orderHintBetween } from '../../../../lib/order-hint'

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function BoardColumnSkeleton() {
  return (
    <div className="flex w-72 flex-shrink-0 flex-col gap-2" aria-hidden>
      {/* Column header skeleton */}
      <div className="flex items-center gap-2 px-1 pb-2">
        <Skeleton className="h-3.5 w-3.5 rounded" />
        <Skeleton className="h-3.5 w-24 rounded" />
        <Skeleton className="ml-auto h-3 w-4 rounded" />
      </div>
      {/* Task card skeletons */}
      {[80, 60, 72].map((w, i) => (
        <Skeleton
          key={w}
          className="h-16 rounded-lg"
          style={{ width: '100%', opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  )
}

function BoardLoadingSkeleton() {
  return (
    <div
      className="flex gap-4 px-6 py-4 overflow-x-auto"
      aria-label="Loading board…"
      data-testid="board-loading-skeleton"
    >
      {[1, 2, 3].map((i) => (
        <BoardColumnSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Error state ──────────────────────────────────────────────────────────────

function BoardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
      <p className="text-small font-400 text-fg-muted">Failed to load board.</p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function BoardEmpty({
  planId,
  actorId,
  tenantId,
}: {
  planId: string
  actorId: string
  tenantId: string
}) {
  return (
    <div className="flex flex-1 flex-col items-start gap-4 px-6 py-4 overflow-x-auto">
      <div className="flex gap-4 items-start">
        <div className="flex w-72 flex-shrink-0 flex-col items-center justify-center gap-3 rounded-lg border border-white/5 bg-white/2 px-4 py-10">
          <p className="text-small font-400 text-fg-muted text-center">
            No buckets yet. Add one to get started.
          </p>
        </div>
        <AddBucketButton planId={planId} actorId={actorId} tenantId={tenantId} />
      </div>
    </div>
  )
}

// ─── Conversion helper ────────────────────────────────────────────────────────

function toTaskFlat(t: BoardTaskSnapshot, bucket: BoardBucketSnapshot, planId: string): TaskFlat {
  const priorityMap: Record<number, TaskFlat['priority']> = {
    1: 'low',
    3: 'medium',
    5: 'important',
    9: 'urgent',
  }
  const progressMap: Record<number, TaskFlat['progress']> = {
    0: 'not-started',
    50: 'in-progress',
    100: 'completed',
  }
  return {
    id: t.id,
    planId,
    bucketId: bucket.id,
    bucketName: bucket.name,
    bucketOrderHint: bucket.orderHint,
    title: t.title,
    progress: progressMap[t.progress] ?? 'not-started',
    priority: priorityMap[t.priority] ?? 'medium',
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    assignees: t.assignees.map((a) => ({
      actorId: a.actorId,
      displayName: a.name ?? '',
      avatarUrl: a.avatarUrl ?? null,
    })),
    labels: t.appliedLabels.map((id) => ({ id, name: id, color: '#888' })),
    orderHint: t.orderHint,
    commentCount: t.commentCount,
    checklistCount: { total: t.checklistItemCount, completed: t.checklistCheckedCount },
    attachmentCount: t.attachmentCount,
    createdAt: t.updatedAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

// ─── Board inner ──────────────────────────────────────────────────────────────

interface BoardInnerProps {
  snapshot: BoardSnapshot
  planId: string
  actorId: string
  tenantId: string
}

function BoardInner({ snapshot, planId, actorId, tenantId }: BoardInnerProps) {
  const queryClient = useQueryClient()
  const queryKey = taskKeys.board(planId, actorId, tenantId)
  const { move } = useOptimisticMove({ planId, actorId, tenantId })
  const { state } = useViewState({ planId })

  // Flatten → filter → sort, then reconstruct filtered snapshot for group-by-bucket
  const allFlat = snapshot.buckets.flatMap((b) => b.tasks.map((t) => toTaskFlat(t, b, planId)))
  const filtered = applyTaskFilter(allFlat, state.filter)
  const sorted = state.sort ? sortTasks(filtered, state.sort) : filtered
  const filteredIds = new Set(sorted.map((t) => t.id))

  const activeFilterKeys = (Object.keys(state.filter) as Array<keyof typeof state.filter>).filter(
    (k) => {
      const v = state.filter[k]
      if (Array.isArray(v)) return v.length > 0
      return v !== DEFAULT_VIEW_STATE.filter[k]
    },
  )

  useViewRenderedTelemetry({
    view: 'board',
    planId,
    taskCount: sorted.length,
    filterKeys: activeFilterKeys,
    groupBy: state.groupBy,
  })

  const displaySnapshot: BoardSnapshot = {
    ...snapshot,
    buckets: snapshot.buckets.map((b) => ({
      ...b,
      tasks: b.tasks.filter((t) => filteredIds.has(t.id)),
    })),
  }

  // Build lookup structures for BoardDragContext
  const taskIndex = new Map<string, { bucketId: string; orderHint: string }>()
  const bucketTaskLists = new Map<string, Array<{ id: string; orderHint: string }>>()

  for (const bucket of displaySnapshot.buckets) {
    bucketTaskLists.set(
      bucket.id,
      bucket.tasks.map((t) => ({ id: t.id, orderHint: t.orderHint })),
    )
    for (const task of bucket.tasks) {
      taskIndex.set(task.id, { bucketId: bucket.id, orderHint: task.orderHint })
    }
  }

  const bucketOrderList = displaySnapshot.buckets.map((b) => ({ id: b.id, orderHint: b.orderHint }))
  const bucketSortableIds = displaySnapshot.buckets.map((b) => `col-${b.id}`)
  const sortActive = !!state.sort

  async function handleReorderColumn(bucketId: string, hintAfter?: string, hintBefore?: string) {
    const current = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (!current) return
    const predictedHint = orderHintBetween(hintAfter, hintBefore)
    const updated: BoardSnapshot = {
      ...current,
      buckets: current.buckets
        .map((b) => (b.id === bucketId ? { ...b, orderHint: predictedHint } : b))
        .sort((a, b) => (a.orderHint < b.orderHint ? -1 : 1)),
    }
    queryClient.setQueryData(queryKey, updated)
    try {
      await trpc.planner.buckets.reorder.mutate({
        tenantId,
        planId,
        actorId,
        bucketId,
        orderHintAfter: hintAfter,
        orderHintBefore: hintBefore,
      })
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, current)
      console.error('[BoardPage] reorderColumn failed', err)
    }
  }

  async function handleToggleComplete(taskId: string, nextProgress: Progress) {
    const current = queryClient.getQueryData<BoardSnapshot>(queryKey)
    if (!current) return

    const task = current.buckets.flatMap((b) => b.tasks).find((t) => t.id === taskId)
    if (!task) return

    // Optimistic update
    const updated: BoardSnapshot = {
      ...current,
      buckets: current.buckets.map((b) => ({
        ...b,
        tasks: b.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                progress: nextProgress,
                completedAt: nextProgress === 100 ? new Date() : null,
              }
            : t,
        ),
      })),
    }
    queryClient.setQueryData(queryKey, updated)

    try {
      await trpc.planner.tasks.setProgress.mutate({
        tenantId,
        planId,
        taskId,
        actorId,
        expectedVersion: task.updatedAt.toISOString(),
        progress: nextProgress as 0 | 50 | 100,
      })
      await queryClient.invalidateQueries({ queryKey })
    } catch (err) {
      queryClient.setQueryData(queryKey, current)
      console.error('[BoardPage] setProgress failed', err)
    }
  }

  return (
    <BoardDragContext
      onMove={({ taskId, toBucketId, hintAfter, hintBefore }) =>
        void move(taskId, toBucketId, hintAfter, hintBefore)
      }
      onReorderColumn={({ bucketId, hintAfter, hintBefore }) =>
        void handleReorderColumn(bucketId, hintAfter, hintBefore)
      }
      taskIndex={taskIndex}
      bucketTaskLists={bucketTaskLists}
      bucketOrderList={bucketOrderList}
      sortActive={sortActive}
    >
      <div className="flex flex-col h-full min-h-0">
        {sortActive && (
          <div
            data-testid="sort-active-chip"
            className="mx-6 mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-fg-muted"
          >
            <span>Sorted by {state.sort!.field} — drag to reorder is paused within columns</span>
          </div>
        )}
        <div className="flex gap-4 px-6 py-4 h-full" data-testid="board-columns">
          <SortableContext items={bucketSortableIds} strategy={horizontalListSortingStrategy}>
            {displaySnapshot.buckets.map((bucket) => (
              <BoardColumn
                key={bucket.id}
                bucket={bucket}
                planLabels={displaySnapshot.plan.labels}
                planId={planId}
                actorId={actorId}
                tenantId={tenantId}
                onToggleComplete={(taskId, nextProgress) =>
                  void handleToggleComplete(taskId, nextProgress)
                }
              />
            ))}
          </SortableContext>
          <AddBucketButton planId={planId} actorId={actorId} tenantId={tenantId} />
        </div>
      </div>
    </BoardDragContext>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlanBoardPage() {
  const { id: planId } = useParams<{ id: string }>()
  const session = useSession()

  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const { data, isLoading, error, refetch } = useBoardSnapshot({ planId, actorId, tenantId })

  if (!session || isLoading) {
    return <BoardLoadingSkeleton />
  }

  if (error) {
    return <BoardError onRetry={refetch} />
  }

  if (!data || data.buckets.length === 0) {
    return <BoardEmpty planId={planId} actorId={actorId} tenantId={tenantId} />
  }

  return (
    <div className="flex flex-1 min-h-0" data-testid="board-page">
      <BoardInner snapshot={data} planId={planId} actorId={actorId} tenantId={tenantId} />
    </div>
  )
}
