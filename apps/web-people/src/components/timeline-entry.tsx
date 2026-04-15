'use client'

import * as React from 'react'
import { Badge, Separator } from '@future/ui'
import { ChevronDown, ChevronRight } from 'lucide-react'

const eventTypeConfig: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  hire: { label: 'Hired', variant: 'default' },
  promotion: { label: 'Promotion', variant: 'default' },
  lateral: { label: 'Lateral Move', variant: 'secondary' },
  demotion: { label: 'Demotion', variant: 'outline' },
  reorg: { label: 'Reorganization', variant: 'secondary' },
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
  const config = eventTypeConfig[eventType] ?? { label: eventType, variant: 'secondary' as const }
  const hasDiff = before != null && after != null

  return (
    <div className="relative pl-8">
      {/* Timeline dot */}
      <div
        className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 ${
          isCurrent
            ? 'border-[#7170ff] bg-[#5e6ad2]'
            : isFuture
              ? 'border-dashed border-[#8a8f98] bg-transparent'
              : 'border-[#34343a] bg-[#191a1b]'
        }`}
      />
      {/* Timeline line */}
      <div className="absolute left-[5px] top-5 bottom-0 w-px bg-[rgba(255,255,255,0.05)]" />

      <div
        className={`rounded-lg border p-4 ${
          isCurrent
            ? 'border-[#7170ff]/30 bg-[rgba(113,112,255,0.04)]'
            : isFuture
              ? 'border-dashed border-[rgba(255,255,255,0.08)] bg-transparent'
              : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)]'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant={config.variant}>{config.label}</Badge>
              {isFuture && <Badge variant="outline">Scheduled</Badge>}
              <span className="text-xs text-[#8a8f98]">
                {new Date(effectiveDate).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="text-sm font-[510] text-[#f7f8f8]">{title}</div>
            {subtitle && <div className="text-xs text-[#8a8f98]">{subtitle}</div>}
            {reason && <div className="text-xs text-[#62666d]">Reason: {reason}</div>}
          </div>

          {hasDiff && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0 rounded p-1 hover:bg-[rgba(255,255,255,0.05)]"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-[#8a8f98]" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#8a8f98]" />
              )}
            </button>
          )}
        </div>

        {expanded && hasDiff && (
          <>
            <Separator className="my-3" />
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="mb-1 font-[510] text-[#8a8f98]">Before</div>
                {Object.entries(before!).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-[#62666d]">{key}</span>
                    <span className="text-[#d0d6e0]">{val}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 font-[510] text-[#8a8f98]">After</div>
                {Object.entries(after!).map(([key, val]) => (
                  <div key={key} className="flex justify-between py-0.5">
                    <span className="text-[#62666d]">{key}</span>
                    <span className="text-[#f7f8f8] font-[510]">{val}</span>
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
