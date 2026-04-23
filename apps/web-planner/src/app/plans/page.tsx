'use client'

import Link from 'next/link'
import { useQuery } from '@future/api-client'
import { PlusIcon, UsersIcon, LayoutGridIcon } from '@future/ui/icons'
import { useSession } from '@future/auth'
import { Button, Card, Skeleton } from '@future/ui'
import { trpc } from '../../lib/trpc'

interface PlanSummary {
  id: string
  name: string
  memberCount: number
  myRole: 'owner' | 'editor' | 'viewer' | null
  updatedAt: string
}

function PlansLoadingSkeleton() {
  return (
    <main className="p-8" aria-label="Loading plans" data-testid="plans-loading-skeleton">
      <div className="flex items-center justify-between mb-6">
        <Skeleton className="h-6 w-24 rounded" />
        <Skeleton className="h-8 w-24 rounded" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" style={{ opacity: 1 - (i - 1) * 0.2 }} />
        ))}
      </div>
    </main>
  )
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
    return <PlansLoadingSkeleton />
  }

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-normal tracking-h2 text-fg-primary">Plans</h1>
        <Button asChild>
          <Link href="/plans/new">
            <PlusIcon size={14} />
            New plan
          </Link>
        </Button>
      </div>

      {plans.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-32 text-center"
          data-testid="plans-empty-state"
        >
          <LayoutGridIcon size={32} className="text-fg-subtle mb-4 opacity-40" />
          <p className="text-fg-muted text-sm font-450">No plans yet</p>
          <p className="text-fg-subtle text-xs mt-1 mb-4">Create your first plan to get started</p>
          <Button asChild>
            <Link href="/plans/new">
              <PlusIcon size={14} />
              New plan
            </Link>
          </Button>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="plans-grid"
        >
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/plans/${plan.id}/board`}
              className="block hover:opacity-90 transition-opacity"
            >
              <Card className="p-4 cursor-pointer hover:bg-elevated transition-colors">
                <h2 className="text-sm font-510 text-fg-primary truncate">{plan.name}</h2>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-fg-muted">
                  <UsersIcon size={12} />
                  <span>{plan.memberCount}</span>
                  {plan.myRole && (
                    <span className="ml-1 capitalize text-fg-subtle">{plan.myRole}</span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
