'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@future/api-client'
import { useParams, usePathname } from 'next/navigation'
import { useSession } from '@future/auth'
import {
  Button,
  Skeleton,
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@future/ui'
import { trpc } from '../../../lib/trpc'
import { planKeys, plannerKeys } from '../../../lib/query-keys'
import { ViewPicker } from '@/components/view-picker/ViewPicker'
import { FilterBar } from '@/components/filter-bar/FilterBar'
import { GroupByPicker } from '@/components/group-by/GroupByPicker'
import { MsSyncBadge } from '@/components/board/MsSyncBadge'
import type { ViewKey } from '@/lib/view-state'
import type { PlanContext } from '@/components/filter-bar/types'

interface PlanHeader {
  id: string
  name: string
  msPlanId: string | null
}

/**
 * Plan context loader layout.
 *
 * Fetches minimal plan metadata (id + name) and renders a two-row plan
 * header:
 *   Row 1 — breadcrumb + Settings link
 *   Row 2 — ViewPicker (Board / Grid / Schedule / Charts) + FilterBar + GroupByPicker
 *
 * Runs entirely on the client because plan access requires the actor
 * session from the httpOnly cookie — no server-side DB access in zones.
 */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  const { id: planId } = useParams<{ id: string }>()
  const session = useSession()
  const pathname = usePathname()

  const { data: plan } = useQuery({
    queryKey: planKeys.get(planId, session?.actorId, session?.tenantId),
    queryFn: () =>
      trpc.planner.plans.get
        .query({ actorId: session!.actorId, tenantId: session!.tenantId, planId })
        .then((data) => {
          if (!data) return null
          const p = data as { id: string; name: string; msPlanId?: string | null }
          return { id: p.id, name: p.name, msPlanId: p.msPlanId ?? null } as PlanHeader
        }),
    enabled: !!session && !!planId,
  })

  const { data: viewFlags } = useQuery({
    queryKey: plannerKeys.viewFlags(session?.tenantId),
    queryFn: () => trpc.planner.plans.getViewFlags.query({ tenantId: session!.tenantId }),
    enabled: !!session,
  })

  // Derive current view from pathname segment (e.g. '/plans/abc/board' → 'board')
  const currentView = (pathname.split('/')[3] ?? 'board') as ViewKey
  const safeView: ViewKey = (['board', 'grid', 'schedule', 'charts'] as const).includes(
    currentView as ViewKey,
  )
    ? currentView
    : 'board'

  const flags = {
    views: viewFlags?.viewsEnabled ?? false,
    grid: viewFlags?.gridEnabled ?? false,
    schedule: viewFlags?.scheduleEnabled ?? false,
    charts: viewFlags?.chartsEnabled ?? false,
    trends: viewFlags?.trendsEnabled ?? false,
  }

  // Empty plan context — Task 11 will populate from board snapshot
  const planContext = useMemo<PlanContext>(
    () => ({
      labels: [],
      members: [],
      buckets: [],
    }),
    [],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Plan header */}
      <header className="border-b border-overlay/5 bg-panel">
        {/* Row 1: breadcrumb + settings link */}
        <div className="flex items-center gap-1 px-6 py-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/plans">Plans</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {plan ? (
                  <BreadcrumbPage>{plan.name}</BreadcrumbPage>
                ) : (
                  <Skeleton className="mx-2 h-3 w-24" />
                )}
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {plan?.msPlanId && <MsSyncBadge state="synced" />}

          <div className="ml-auto">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/plans/${planId}/settings`}>Settings</Link>
            </Button>
          </div>
        </div>

        {/* Row 2: view picker + filter bar + group by */}
        <div className="flex items-center justify-between gap-4 px-6 py-2">
          <ViewPicker planId={planId} currentView={safeView} flags={flags} />
          <div className="flex items-center gap-3">
            <FilterBar planId={planId} context={planContext} />
            <GroupByPicker planId={planId} />
          </div>
        </div>
      </header>

      {/* Page content */}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
