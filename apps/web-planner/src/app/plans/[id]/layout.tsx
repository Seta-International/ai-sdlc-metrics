'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
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

interface PlanHeader {
  id: string
  name: string
}

/**
 * Plan context loader layout.
 *
 * Fetches minimal plan metadata (id + name) and renders a plan-level
 * sub-navigation bar with Board and Settings links.  All nested pages
 * (board, settings, …) are rendered as children below the bar.
 *
 * Runs entirely on the client because plan access requires the actor
 * session from the httpOnly cookie — no server-side DB access in zones.
 */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  const { id: planId } = useParams<{ id: string }>()
  const session = useSession()

  const { data: plan } = useQuery({
    queryKey: ['plans.get', planId, session?.actorId, session?.tenantId],
    queryFn: () =>
      trpc.planner.plans.get
        .query({ actorId: session!.actorId, tenantId: session!.tenantId, planId })
        .then((data) => {
          if (!data) return null
          const p = data as { id: string; name: string }
          return { id: p.id, name: p.name } as PlanHeader
        }),
    enabled: !!session && !!planId,
  })

  return (
    <div className="flex flex-col min-h-0">
      {/* Plan sub-navigation bar */}
      <nav className="flex items-center gap-1 px-6 py-2 border-b border-overlay/5 bg-panel">
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

        <div className="flex items-center gap-0.5 ml-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/plans/${planId}/board`}>Board</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/plans/${planId}/settings`}>Settings</Link>
          </Button>
        </div>
      </nav>

      {/* Page content */}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
