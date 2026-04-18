'use client'

import { useState, useEffect } from 'react'
import { useSession } from '@future/auth'
import { trpc } from '../trpc'

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
 * Reads plan details via tRPC and derives permission flags from the members list.
 */
export function usePlanMembership(planId: string | null | undefined): PlanMembership {
  const session = useSession()
  const [role, setRole] = useState<PlanRole | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session || !planId) {
      setLoading(false)
      return
    }

    setLoading(true)
    trpc.planner.plans.get
      .query({ actorId: session.actorId, tenantId: session.tenantId, planId })
      .then((data) => {
        if (!data) {
          setRole(null)
          return
        }
        const plan = data as {
          members: Array<{ actorId: string; role: 'owner' | 'editor' | 'viewer' }>
        }
        const member = plan.members.find((m) => m.actorId === session.actorId)
        setRole(member?.role ?? null)
      })
      .catch(() => {
        setRole(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [session, planId])

  if (!session || !planId) {
    return NOT_MEMBER
  }

  return {
    role,
    loading,
    canEdit: role === 'owner' || role === 'editor',
    isOwner: role === 'owner',
  }
}
