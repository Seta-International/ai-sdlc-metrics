'use client'

import { useQueryClient } from '@future/api-client'
import { trpc } from '../trpc'
import { orderHintBetween } from '../order-hint'
import { taskKeys } from '../query-keys'
import type { BoardSnapshot } from '../board-types'

interface UseOptimisticMoveInput {
  planId: string
  actorId: string
  tenantId: string
}

/**
 * Optimistic move hook for task drag-and-drop.
 *
 * 1. Snapshots current cache
 * 2. Predicts new orderHint locally
 * 3. Patches cache immediately (no flicker)
 * 4. Fires move mutation
 * 5. On success: overwrites task with authoritative server response
 * 6. On error: reverts to snapshot; on 409 CONFLICT, refetches then retries once
 */
export function useOptimisticMove({ planId, actorId, tenantId }: UseOptimisticMoveInput) {
  const queryClient = useQueryClient()
  const queryKey = taskKeys.board(planId, actorId, tenantId)

  function getSnapshot(): BoardSnapshot | undefined {
    return queryClient.getQueryData<BoardSnapshot>(queryKey)
  }

  function patchCache(
    snapshot: BoardSnapshot,
    taskId: string,
    toBucketId: string,
    predictedHint: string,
  ): void {
    const updated: BoardSnapshot = {
      ...snapshot,
      buckets: snapshot.buckets.map((bucket) => {
        // Remove task from its current bucket
        const filteredTasks = bucket.tasks.filter((t) => t.id !== taskId)

        if (bucket.id === toBucketId) {
          // Find the task from anywhere in the snapshot
          const movedTask = snapshot.buckets.flatMap((b) => b.tasks).find((t) => t.id === taskId)

          if (!movedTask) return { ...bucket, tasks: filteredTasks }

          const updatedTask = { ...movedTask, orderHint: predictedHint }
          const tasksWithMoved = [...filteredTasks, updatedTask]
          const sorted = [...tasksWithMoved].sort((a, b) =>
            a.orderHint < b.orderHint ? -1 : a.orderHint > b.orderHint ? 1 : 0,
          )
          return { ...bucket, tasks: sorted }
        }

        return { ...bucket, tasks: filteredTasks }
      }),
    }
    queryClient.setQueryData(queryKey, updated)
  }

  async function move(
    taskId: string,
    toBucketId: string,
    orderHintAfter: string | undefined,
    orderHintBefore: string | undefined,
  ): Promise<void> {
    const snapshot = getSnapshot()
    if (!snapshot) return

    // Find current task to get expectedVersion
    const currentTask = snapshot.buckets.flatMap((b) => b.tasks).find((t) => t.id === taskId)
    if (!currentTask) return

    const predictedHint = orderHintBetween(orderHintAfter, orderHintBefore)

    // Optimistic patch
    patchCache(snapshot, taskId, toBucketId, predictedHint)

    const mutationInput = {
      tenantId,
      planId,
      taskId,
      actorId,
      expectedVersion: currentTask.updatedAt.toISOString(),
      toBucketId,
      orderHintAfter,
      orderHintBefore,
    }

    try {
      const result = await trpc.planner.tasks.move.mutate(mutationInput)

      // Overwrite with authoritative server response
      if (result) {
        const afterMove = getSnapshot()
        if (!afterMove) return
        const serverResult = result as { orderHint?: string; updatedAt?: Date | string }
        const authoritativeHint = serverResult.orderHint ?? predictedHint
        const authoritativeUpdatedAt = serverResult.updatedAt
          ? new Date(serverResult.updatedAt as string | Date)
          : currentTask.updatedAt

        const withServer: BoardSnapshot = {
          ...afterMove,
          buckets: afterMove.buckets.map((bucket) => ({
            ...bucket,
            tasks: bucket.tasks.map((t) => {
              if (t.id !== taskId) return t
              return { ...t, orderHint: authoritativeHint, updatedAt: authoritativeUpdatedAt }
            }),
          })),
        }
        queryClient.setQueryData(queryKey, withServer)
      }
    } catch (err: unknown) {
      const trpcErr = err as { data?: { code?: string } }
      const isConflict = trpcErr?.data?.code === 'CONFLICT'

      if (isConflict) {
        // Refetch authoritative state, then retry once
        await queryClient.refetchQueries({ queryKey })

        const refreshedSnapshot = getSnapshot()
        if (!refreshedSnapshot) return

        const refreshedTask = refreshedSnapshot.buckets
          .flatMap((b) => b.tasks)
          .find((t) => t.id === taskId)
        if (!refreshedTask) return

        // Re-patch with refreshed snapshot
        patchCache(refreshedSnapshot, taskId, toBucketId, predictedHint)

        try {
          const retryInput = {
            ...mutationInput,
            expectedVersion: refreshedTask.updatedAt.toISOString(),
          }
          const retryResult = await trpc.planner.tasks.move.mutate(retryInput)

          if (retryResult) {
            const afterRetry = getSnapshot()
            if (!afterRetry) return
            const retryRes = retryResult as { orderHint?: string; updatedAt?: Date | string }
            const authoritativeHint = retryRes.orderHint ?? predictedHint
            const authoritativeUpdatedAt = retryRes.updatedAt
              ? new Date(retryRes.updatedAt as string | Date)
              : refreshedTask.updatedAt

            const withServer: BoardSnapshot = {
              ...afterRetry,
              buckets: afterRetry.buckets.map((bucket) => ({
                ...bucket,
                tasks: bucket.tasks.map((t) => {
                  if (t.id !== taskId) return t
                  return {
                    ...t,
                    orderHint: authoritativeHint,
                    updatedAt: authoritativeUpdatedAt,
                  }
                }),
              })),
            }
            queryClient.setQueryData(queryKey, withServer)
          }
        } catch {
          // Second failure: revert to refreshed snapshot and surface conflict
          queryClient.setQueryData(queryKey, refreshedSnapshot)
          console.error('[useOptimisticMove] Conflict: move failed after retry')
        }
      } else {
        // Non-conflict error: revert to original snapshot
        queryClient.setQueryData(queryKey, snapshot)
        console.error('[useOptimisticMove] Move failed, reverted', err)
      }
    }
  }

  return { move }
}
