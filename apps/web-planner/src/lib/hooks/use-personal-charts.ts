'use client'

import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import type { PlannerChartsData } from '@future/api-client/planner'
import { trpc } from '../trpc'
import { personalKeys } from '../query-keys'

export interface UsePersonalChartsResult {
  data: PlannerChartsData | undefined
  isLoading: boolean
  error: Error | null
}

export function usePersonalCharts(): UsePersonalChartsResult {
  const session = useSession()

  const query = useQuery({
    queryKey: personalKeys.charts(session?.actorId, session?.tenantId),
    queryFn: () =>
      trpc.planner.personal.getCharts
        .query({ actorId: session!.actorId, tenantId: session!.tenantId })
        .then((data) => data as unknown as PlannerChartsData),
    enabled: !!session,
    staleTime: 30_000,
  })

  return { data: query.data, isLoading: query.isLoading, error: query.error }
}
