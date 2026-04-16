'use client'

import * as React from 'react'
import { Badge, Separator } from '@future/ui'
import { ChevronDown, ChevronRight } from 'lucide-react'

const eventTypeConfig: Record<
  string,
  { label: string; variant: 'default' | 'subtle' | 'destructive' | 'warning' | 'info' }
> = {
  hire: { label: 'Hired', variant: 'default' },
  promotion: { label: 'Promotion', variant: 'default' },
  lateral: { label: 'Lateral Move', variant: 'subtle' },
  demotion: { label: 'Demotion', variant: 'warning' },
  reorg: { label: 'Reorganization', variant: 'subtle' },
  termination: { label: 'Termination', variant: 'destructive' },
}

interface TimelineEntryProps {
  eventType: string
  effectiveDate: string
  title: string
  subtitle?: string | null
  reason?: string | null
  isCurrent?: boolean
  isFuture?: boolean
  before?: Record<string, string> | null
  after?: Record<string, string> | null
}

export function TimelineEntry({
  eventType,
  effectiveDate,
  title,
  subtitle,
  reason,
  isCurrent = false,
  isFuture = false,
  before,
  after,
}: TimelineEntryProps) {
  const [expanded, setExpanded] = React.useState(false)
  const config = eventTypeConfig[eventType] ?? { label: eventType, variant: 'subtle' as const }
  const hasDiff = before != null && after != null

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 ${
          isCurrent
            ? 'border-accent bg-primary'
            : isFuture
              ? 'border-dashed border-muted-foreground bg-transparent'
              : 'border-border bg-muted'
        }`}
      />
      {/* Timeline line */}
      <div className="absolute left-1.5 top-5 bottom-0 w-px bg-sidebar-border" />

      <div
        className={`rounded-lg border p-4 ${
          isCurrent
            ? 'border-accent/30 bg-accent/5'
            : isFuture
              ? 'border-dashed border-border bg-transparent'
              : 'border-border bg-card'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={config.variant}>{config.label}</Badge>
              {isFuture && <Badge variant="info">Scheduled</Badge>}
              <span className="text-xs text-muted-foreground">
                {new Date(effectiveDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="text-sm font-510 text-foreground">{title}</div>
            {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
            {reason && <div className="text-xs text-secondary-foreground/60">Reason: {reason}</div>}
          </div>

          {hasDiff && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 rounded p-1 hover:bg-secondary/50"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        {expanded && hasDiff && (
          <>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="mb-1 font-510 text-muted-foreground">Before</div>
                {Object.entries(before!).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-secondary-foreground/60">{key}</span>
                    <span className="text-secondary-foreground">{val}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 font-510 text-muted-foreground">After</div>
                {Object.entries(after!).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-secondary-foreground/60">{key}</span>
                    <span className="text-foreground font-510">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
