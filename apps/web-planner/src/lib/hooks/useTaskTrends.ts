'use client'

import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'
import type { TaskTrends, TrendRange } from '@future/api-client/planner'

export interface UseTaskTrendsResult {
  data: TaskTrends | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

const FIVE_MINUTES = 5 * 60 * 1000

export function useTaskTrends({
  planId,
  range,
  enabled = true,
}: {
  planId: string
  range: TrendRange
  enabled?: boolean
}): UseTaskTrendsResult {
  const session = useSession()
  const actorId = session?.actorId ?? ''
  const tenantId = session?.tenantId ?? ''

  const query = useQuery({
    queryKey: ['tasks.getTrends', planId, actorId, tenantId, range] as const,
    queryFn: () =>
      trpc.planner.tasks.getTrends.query({
        planId,
        actorId,
        tenantId,
        range,
      }) as Promise<TaskTrends>,
    enabled: enabled && Boolean(planId && actorId && tenantId),
    staleTime: FIVE_MINUTES,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
