'use client'

import { useQuery } from '@tanstack/react-query'
import { trpc } from '../trpc'
import type { BoardSnapshot } from '../board-types'

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
    queryFn: () =>
      trpc.planner.tasks.getBoard.query({ planId, actorId, tenantId }) as Promise<BoardSnapshot>,
    enabled: Boolean(planId && actorId && tenantId),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
