'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useSession } from '@future/auth'
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
  const [plan, setPlan] = useState<PlanHeader | null>(null)

  useEffect(() => {
    if (!session || !planId) return
    trpc.planner.plans.get
      .query({ actorId: session.actorId, tenantId: session.tenantId, planId })
      .then((data) => {
        if (data) {
          const p = data as { id: string; name: string }
          setPlan({ id: p.id, name: p.name })
        }
      })
      .catch(() => {
        /* non-fatal — children will handle missing plan */
      })
  }, [session, planId])

  return (
    <div className="flex flex-col min-h-0">
      {/* Plan sub-navigation bar */}
      <nav
        className="flex items-center gap-1 px-6 py-2 border-b border-overlay/5 bg-panel"
        style={{ fontFeatureSettings: '"cv01", "ss03"' }}
      >
        <a
          href="/plans"
          className="text-xs text-fg-subtle hover:text-fg-muted transition-colors mr-2"
        >
          Plans
        </a>
        <span className="text-divider-lg text-xs select-none">/</span>

        {plan ? (
          <span className="text-xs font-510 text-fg-secondary mx-2 truncate max-w-44">
            {plan.name}
          </span>
        ) : (
          <span className="mx-2 h-3 w-24 rounded bg-overlay/5 animate-pulse inline-block" />
        )}

        <span className="text-divider-lg text-xs select-none mr-2">/</span>

        <div className="flex items-center gap-0.5">
          <a
            href={`/plans/${planId}/board`}
            className="px-2 py-1 rounded text-xs font-510 text-fg-muted hover:text-fg-primary hover:bg-overlay/4 transition-colors"
            style={{ fontFeatureSettings: '"cv01", "ss03"' }}
          >
            Board
          </a>
          <a
            href={`/plans/${planId}/settings`}
            className="px-2 py-1 rounded text-xs font-510 text-fg-muted hover:text-fg-primary hover:bg-overlay/4 transition-colors"
            style={{ fontFeatureSettings: '"cv01", "ss03"' }}
          >
            Settings
          </a>
        </div>
      </nav>

      {/* Page content */}
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
