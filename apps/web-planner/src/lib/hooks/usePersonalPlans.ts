'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'

export interface PersonalPlanSummary {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: string
  ownerActorId: string | null
}

export function usePersonalPlans(): UseQueryResult<PersonalPlanSummary[]> {
  const session = useSession()

  return useQuery({
    queryKey: ['planner.personal.listPlans', session?.actorId, session?.tenantId],
    queryFn: () =>
      trpc.planner.personal.listPlans
        .query({ actorId: session!.actorId, tenantId: session!.tenantId })
        .then((data) => data as unknown as PersonalPlanSummary[]),
    enabled: !!session,
  })
}
