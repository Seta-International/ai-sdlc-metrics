'use client'

import { useParams } from 'next/navigation'
import { useSession } from '@future/auth'
import { useBoardSnapshot } from '../../../../lib/hooks/useBoardSnapshot'
import { useOptimisticMove } from '../../../../lib/hooks/useOptimisticMove'
import { BoardDragContext } from '../../../../components/board/BoardDragContext'
import { BoardColumn } from '../../../../components/board/BoardColumn'
import { AddBucketButton } from '../../../../components/board/AddBucketButton'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '../../../../lib/trpc'
import type { BoardSnapshot } from '../../../../lib/board-types'
import type { Progress } from '../../../../components/primitives/ProgressIcon'

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function BoardColumnSkeleton() {
  return (
    <div
      className="flex w-72 flex-shrink-0 flex-col gap-2"
      aria-hidden
      style={{ fontFeatureSettings: '"cv01", "ss03"' }}
    >
      {/* Column header skeleton */}
      <div className="flex items-center gap-2 px-1 pb-2">
        <div className="h-3.5 w-3.5 rounded bg-white/5 animate-pulse" />
        <div className="h-3.5 w-24 rounded bg-white/5 animate-pulse" />
        <div className="ml-auto h-3 w-4 rounded bg-white/5 animate-pulse" />
      </div>
      {/* Task card skeletons */}
      {[80, 60, 72].map((w, i) => (
        <div
          key={i}
          className="h-16 rounded-lg border border-white/5 bg-white/2 animate-pulse"
          style={{ width: '100%', opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  )
}

function BoardLoadingSkeleton() {
  return (
    <div className="flex gap-4 px-6 py-4 overflow-x-auto" aria-label="Loading board…">
      {[1, 2, 3].map((i) => (
        <BoardColumnSkeleton key={i} />
      ))}
    </div>
  )
}

// ─── Error state ──────────────────────────────────────────────────────────────

function BoardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16"
      style={{ fontFeatureSettings: '"cv01", "ss03"' }}
    >
      <p className="text-small font-400 text-fg-muted">Failed to load board.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-white/5 border border-white/8 px-4 py-2 text-caption-lg font-510 text-fg-secondary transition-colors hover:bg-white/8 hover:text-fg-primary"
      >
        Try again
      </button>
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
    <div
      className="flex flex-1 flex-col items-start gap-4 px-6 py-4 overflow-x-auto"
      style={{ fontFeatureSettings: '"cv01", "ss03"' }}
    >
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

// ─── Board inner ──────────────────────────────────────────────────────────────

interface BoardInnerProps {
  snapshot: BoardSnapshot
  planId: string
  actorId: string
  tenantId: string
}

function BoardInner({ snapshot, planId, actorId, tenantId }: BoardInnerProps) {
  const queryClient = useQueryClient()
  const queryKey = ['tasks.getBoard', planId, actorId, tenantId] as const
  const { move } = useOptimisticMove({ planId, actorId, tenantId })

  // Build lookup structures for BoardDragContext
  const taskIndex = new Map<string, { bucketId: string; orderHint: string }>()
  const bucketTaskLists = new Map<string, Array<{ id: string; orderHint: string }>>()

  for (const bucket of snapshot.buckets) {
    bucketTaskLists.set(
      bucket.id,
      bucket.tasks.map((t) => ({ id: t.id, orderHint: t.orderHint })),
    )
    for (const task of bucket.tasks) {
      taskIndex.set(task.id, { bucketId: bucket.id, orderHint: task.orderHint })
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
      taskIndex={taskIndex}
      bucketTaskLists={bucketTaskLists}
    >
      <div
        className="flex gap-4 px-6 py-4 overflow-x-auto h-full"
        style={{ fontFeatureSettings: '"cv01", "ss03"' }}
        data-testid="board-columns"
      >
        {snapshot.buckets.map((bucket) => (
          <BoardColumn
            key={bucket.id}
            bucket={bucket}
            planLabels={snapshot.plan.labels}
            planId={planId}
            actorId={actorId}
            tenantId={tenantId}
            onToggleComplete={(taskId, nextProgress) =>
              void handleToggleComplete(taskId, nextProgress)
            }
          />
        ))}

        <AddBucketButton planId={planId} actorId={actorId} tenantId={tenantId} />
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
    <div
      className="flex flex-1 min-h-0"
      style={{ fontFeatureSettings: '"cv01", "ss03"' }}
      data-testid="board-page"
    >
      <BoardInner snapshot={data} planId={planId} actorId={actorId} tenantId={tenantId} />
    </div>
  )
}
