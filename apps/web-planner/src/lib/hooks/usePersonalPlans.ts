'use client'

import { useQuery, type UseQueryResult } from '@future/api-client'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'
import { personalKeys } from '../query-keys'

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
    queryKey: personalKeys.listPlans(session?.actorId, session?.tenantId),
    queryFn: () =>
      trpc.planner.personal.listPlans
        .query({ actorId: session!.actorId, tenantId: session!.tenantId })
        .then((data) => data as unknown as PersonalPlanSummary[]),
    enabled: !!session,
  })
}
