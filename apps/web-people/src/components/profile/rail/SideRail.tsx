'use client'

import * as React from 'react'
import { Button, Skeleton } from '@future/ui'
import { SideCard } from '../cards/SideCard'
import type { EmployeeProfile, DirectReport, ActivityEvent } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

interface SideRailProps {
  profile: EmployeeProfile
  employmentId: string
  onViewAll: () => void
}

export function SideRail({ profile, employmentId, onViewAll }: SideRailProps) {
  const { completenessScore, completenessMissing, currentJob } = profile

  const [directReports, setDirectReports] = React.useState<DirectReport[]>([])
  const [reportsLoading, setReportsLoading] = React.useState(true)
  const [activityEvents, setActivityEvents] = React.useState<ActivityEvent[]>([])

  React.useEffect(() => {
    void (async () => {
      setReportsLoading(true)
      try {
        const result = await anyTrpc.people.getDirectReports.query({ employmentId })
        setDirectReports(result ?? [])
      } finally {
        setReportsLoading(false)
      }
    })()
  }, [employmentId])

  React.useEffect(() => {
    void (async () => {
      const result = await anyTrpc.people.getActivityFeed.query({
        employmentId,
        limit: 3,
      })
      setActivityEvents(result?.events ?? [])
    })()
  }, [employmentId])

  function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return '1 day ago'
    if (days < 7) return `${days} days ago`
    const weeks = Math.floor(days / 7)
    if (weeks === 1) return '1 week ago'
    return `${weeks} weeks ago`
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Completeness */}
      <SideCard title="Completeness">
        <div className="mb-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-510 tracking-tight text-foreground">
            {completenessScore}
          </span>
          <span className="text-sm text-muted-foreground">%</span>
          {completenessMissing.length > 0 && (
            <span className="ml-auto rounded-sm bg-accent/10 px-1.5 py-0.5 text-xs font-510 text-accent">
              {completenessMissing.length} missing
            </span>
          )}
        </div>
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-secondary/30">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent/70 to-accent"
            style={{ width: `${completenessScore}%` }}
          />
        </div>
        {completenessMissing.map((field) => (
          <div
            key={field}
            className="flex items-center gap-1.5 py-0.5 text-xs text-muted-foreground"
          >
            <span className="h-1 w-1 rounded-full bg-amber-500" />
            {field}
          </div>
        ))}
      </SideCard>

      {/* Reports to */}
      {currentJob?.managerName && (
        <SideCard title="Reports to">
          <div className="flex items-center gap-2 py-1">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-xs font-510 text-secondary-foreground">
              {currentJob.managerName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-510 text-foreground">{currentJob.managerName}</p>
            </div>
          </div>
        </SideCard>
      )}

      {/* Direct reports */}
      <SideCard title="Direct reports" count={reportsLoading ? undefined : directReports.length}>
        {reportsLoading ? (
          <Skeleton className="h-6 w-full" />
        ) : directReports.length === 0 ? (
          <p className="text-xs text-muted-foreground">No direct reports.</p>
        ) : (
          directReports.map((r) => (
            <div key={r.employmentId} className="flex items-center gap-2 py-1">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary/50 text-xs font-510 text-secondary-foreground">
                {r.fullName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-secondary-foreground">{r.fullName}</p>
                {r.jobTitle && (
                  <p className="truncate text-xs text-muted-foreground">{r.jobTitle}</p>
                )}
              </div>
            </div>
          ))
        )}
      </SideCard>

      {/* Recent activity */}
      <SideCard title="Recent activity">
        {activityEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground">No recent activity.</p>
        ) : (
          <>
            {activityEvents.map((evt, i) => (
              <div key={evt.id} className={`py-1.5 ${i > 0 ? 'border-t border-border/40' : ''}`}>
                <p className="text-xs text-secondary-foreground">{evt.description}</p>
                <p className="text-xs text-muted-foreground">{relativeTime(evt.occurredAt)}</p>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewAll}
              className="mt-1 h-auto p-0 text-xs text-accent hover:underline"
            >
              View all
            </Button>
          </>
        )}
      </SideCard>
    </div>
  )
}
