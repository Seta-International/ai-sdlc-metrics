'use client'

import { useQuery } from '@future/api-client'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'
import { planKeys } from '../query-keys'

export type PlanRole = 'owner' | 'editor' | 'viewer'

export interface PlanMembership {
  /** The current actor's role in this plan, or null if not a member */
  role: PlanRole | null
  /** True while the membership is being fetched */
  loading: boolean
  /** True if the actor can edit (owner or editor) */
  canEdit: boolean
  /** True if the actor is the owner */
  isOwner: boolean
}

const NOT_MEMBER: PlanMembership = {
  role: null,
  loading: false,
  canEdit: false,
  isOwner: false,
}

/**
 * Returns the current actor's membership role in the given plan.
 * Uses React Query with the same cache key as layout.tsx and settings/page.tsx
 * so the request deduplicates — no extra network round-trip.
 */
export function usePlanMembership(planId: string | null | undefined): PlanMembership {
  const session = useSession()

  const { data, isLoading } = useQuery({
    queryKey: planKeys.get(planId, session?.actorId, session?.tenantId),
    queryFn: () =>
      trpc.planner.plans.get.query({
        actorId: session!.actorId,
        tenantId: session!.tenantId,
        planId: planId!,
      }),
    enabled: !!session && !!planId,
  })

  if (!session || !planId) {
    return NOT_MEMBER
  }

  if (isLoading) {
    return { role: null, loading: true, canEdit: false, isOwner: false }
  }

  const plan = data as { members: Array<{ actorId: string; role: PlanRole }> } | null | undefined
  const member = plan?.members.find((m) => m.actorId === session.actorId)
  const role = member?.role ?? null

  return {
    role,
    loading: false,
    canEdit: role === 'owner' || role === 'editor',
    isOwner: role === 'owner',
  }
}
