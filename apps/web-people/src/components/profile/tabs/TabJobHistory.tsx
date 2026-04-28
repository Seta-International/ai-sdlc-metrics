'use client'

import * as React from 'react'
import { Button, Skeleton } from '@future/ui'
import {
  ArrowUpCircle,
  ArrowRight,
  Users,
  Share2,
  Plus,
  Download,
  DollarSign,
} from '@future/ui/icons'
import { SideCard } from '../cards/SideCard'
import type { JobHistoryEntry } from '../../../lib/types'
import { trpc } from '../../../lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyTrpc = trpc as any

const EVENT_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  hire: { label: 'Hire', Icon: Plus, color: '#10b981' },
  promotion: { label: 'Promotion', Icon: ArrowUpCircle, color: '#7170ff' },
  demotion: { label: 'Demotion', Icon: ArrowUpCircle, color: '#f87171' },
  lateral: { label: 'Transfer', Icon: Share2, color: '#f59e0b' },
  reorg: { label: 'Manager change', Icon: Users, color: '#06b6d4' },
  termination: { label: 'Termination', Icon: DollarSign, color: '#62666d' },
}

function fallbackConfig(eventType: string) {
  return { label: eventType, Icon: Plus, color: '#8a8f98' }
}

interface TabJobHistoryProps {
  profileId: string
  canEdit: boolean
  hireDate: string
}

export function TabJobHistory({ profileId, canEdit, hireDate }: TabJobHistoryProps) {
  const [entries, setEntries] = React.useState<JobHistoryEntry[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    void (async () => {
      setIsLoading(true)
      try {
        const result = await anyTrpc.people.getJobHistory.query({ profileId })
        setEntries(Array.isArray(result) ? result : [])
      } finally {
        setIsLoading(false)
      }
    })()
  }, [profileId])

  const tenureMonths = React.useMemo(() => {
    const ms = Date.now() - new Date(hireDate).getTime()
    return Math.floor(ms / (1000 * 60 * 60 * 24 * 30))
  }, [hireDate])

  const eventCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of entries) {
      counts[e.eventType] = (counts[e.eventType] ?? 0) + 1
    }
    return counts
  }, [entries])

  if (isLoading) {
    return (
      <div className="grid grid-cols-[1fr_300px] gap-8 p-6">
        <div className="space-y-4">
          {[1, 2, 3].map((k) => (
            <Skeleton key={k} className="h-24 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-8 p-6">
      {/* Main column */}
      <div>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-tiny font-510 uppercase tracking-widest text-muted-foreground">
              Job history
            </p>
            <h2 className="text-base font-510 text-foreground">
              {entries.length} events · {tenureMonths} months
            </h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Download className="h-3 w-3" />
              Export
            </Button>
            {canEdit && (
              <Button variant="default" size="sm" className="gap-1.5">
                <Plus className="h-3 w-3" />
                Add event
              </Button>
            )}
          </div>
        </div>

        {/* Timeline */}
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No job history recorded.</p>
        ) : (
          <div className="relative pl-6">
            {/* Vertical rail */}
            <div className="absolute bottom-2 left-[0.5625rem] top-2 w-px bg-border/40" />

            {entries.map((entry, i) => {
              const cfg = EVENT_CONFIG[entry.eventType] ?? fallbackConfig(entry.eventType)
              const { Icon, color, label } = cfg

              return (
                <div key={entry.id} className={`relative ${i < entries.length - 1 ? 'pb-5' : ''}`}>
                  {/* Icon dot */}
                  <div
                    className="absolute -left-6 flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded-full"
                    style={{ background: `${color}22`, border: `1px solid ${color}55` }}
                  >
                    <Icon className="h-2.5 w-2.5" style={{ color }} />
                  </div>

                  {/* Event card */}
                  <div className="rounded-lg border border-border bg-card px-4 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span
                        className="text-tiny font-510 uppercase tracking-widest"
                        style={{ color }}
                      >
                        {label}
                      </span>
                      <span className="text-micro text-muted-foreground">
                        {new Date(entry.effectiveDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>

                    <p className="mb-1 text-sm font-510 text-foreground">{entry.jobTitle}</p>

                    {/* From → To */}
                    {entry.before && entry.after && (
                      <div className="mb-1 flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground line-through">
                          {Object.values(entry.before).join(' · ')}
                        </span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-secondary-foreground font-510">
                          {Object.values(entry.after).join(' · ')}
                        </span>
                      </div>
                    )}

                    {entry.reason && (
                      <p className="text-micro text-muted-foreground">{entry.reason}</p>
                    )}
                    {entry.manager && (
                      <p className="mt-0.5 text-tiny text-muted-foreground/60">
                        by {entry.manager}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Right side rail */}
      <div className="flex flex-col gap-4">
        <SideCard title="Tenure">
          <p className="text-2xl font-510 tracking-tight text-foreground">
            {tenureMonths}
            <span className="ml-1 text-sm font-normal text-muted-foreground">months</span>
          </p>
          <p className="mt-0.5 text-micro text-muted-foreground">
            Since{' '}
            {new Date(hireDate).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>
        </SideCard>

        <SideCard title="Event summary">
          {Object.entries(EVENT_CONFIG).map(([type, { label }]) => {
            const count = eventCounts[type] ?? 0
            if (count === 0) return null
            return (
              <div key={type} className="flex items-center justify-between py-0.5">
                <span className="text-micro text-muted-foreground">{label}s</span>
                <span className="font-mono text-micro text-secondary-foreground">{count}</span>
              </div>
            )
          })}
        </SideCard>
      </div>
    </div>
  )
}
