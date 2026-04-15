'use client'

import * as React from 'react'
import { Skeleton } from '@future/ui'
import { TimelineEntry } from '../timeline-entry'
import type { JobHistoryEntry } from '../../lib/types'
import { trpc } from '../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

export function TabJobHistory({ employmentId }: { employmentId: string }) {
  const [entries, setEntries] = React.useState<JobHistoryEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await (anyTrpc.people.profile.jobHistory.query({ employmentId }) as Promise<{
          entries: JobHistoryEntry[]
        }>)
        setEntries(result.entries)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [employmentId])

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="text-sm text-[#62666d] py-8 text-center">No job history recorded.</p>
  }

  return (
    <div className="space-y-0">
      {entries.map((entry) => (
        <TimelineEntry
          key={entry.id}
          eventType={entry.eventType}
          effectiveDate={entry.effectiveDate}
          title={entry.jobTitle}
          subtitle={entry.department}
          reason={entry.reason}
          isCurrent={entry.isCurrent}
          isFuture={entry.isFuture}
          before={entry.before}
          after={entry.after}
        />
      ))}
    </div>
  )
}
