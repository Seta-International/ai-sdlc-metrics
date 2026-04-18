'use client'

import { useQuery } from '@tanstack/react-query'
import { PlusIcon, UsersIcon } from 'lucide-react'
import { useSession } from '@future/auth'
import { trpc } from '../../lib/trpc'

interface PlanSummary {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: string
}

export default function PlansPage() {
  const session = useSession()

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['plans.list', session?.actorId, session?.tenantId],
    queryFn: () =>
      trpc.planner.plans.list
        .query({ actorId: session!.actorId, tenantId: session!.tenantId })
        .then((data) => data as unknown as PlanSummary[]),
    enabled: !!session,
  })

  if (!session || isLoading) {
    return (
      <main className="p-8">
        <div className="h-6 w-32 bg-white/5 rounded animate-pulse" />
      </main>
    )
  }

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-normal tracking-h2 text-fg-primary">Plans</h1>
        <a
          href="/plans/new"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-brand hover:bg-accent-hover text-fg-primary text-sm transition-colors"
        >
          <PlusIcon size={14} />
          New plan
        </a>
      </div>

      {plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <p className="text-fg-muted text-sm">Create your first plan.</p>
          <a
            href="/plans/new"
            className="mt-4 flex items-center gap-2 px-3 py-1.5 rounded-md bg-brand hover:bg-accent-hover text-fg-primary text-sm transition-colors"
          >
            <PlusIcon size={14} />
            New plan
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <a
              key={plan.id}
              href={`/plans/${plan.id}/board`}
              className="block p-4 rounded-lg border border-overlay/8 bg-surface hover:bg-elevated transition-colors"
            >
              <h2 className="text-sm font-510 text-fg-primary truncate">{plan.name}</h2>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-fg-muted">
                <UsersIcon size={12} />
                <span>{plan.memberCount}</span>
                {plan.myRole && (
                  <span className="ml-1 capitalize text-fg-subtle">{plan.myRole}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  )
}
