'use client'

import { useState } from 'react'
import { AlertTriangle, Info, AlertCircle, X } from '@future/ui/icons'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'
import { IconBtn } from '../primitives/icon-btn'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const
const SEVERITY_ICONS = { critical: AlertCircle, warning: AlertTriangle, info: Info } as const
const SEVERITY_STYLES = {
  critical: 'border-red-400/30 bg-red-400/[0.06] text-red-300',
  warning: 'border-amber-400/30 bg-amber-400/[0.06] text-amber-300',
  info: 'border-accent/30 bg-accent/[0.06] text-accent',
} as const

export function AgentBanner() {
  const { insights } = useAgentState()
  const ctx = useAgentContext()
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())

  if (!ctx) return null

  const matching = insights
    .filter(
      (i) =>
        i.module === ctx.module &&
        i.entity === ctx.entity &&
        i.entityId === ctx.id &&
        !dismissedIds.has(i.id),
    )
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  const top = matching[0]
  if (!top) return null

  const Icon = SEVERITY_ICONS[top.severity]

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 ${SEVERITY_STYLES[top.severity]}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 text-sm">
        <div className="font-medium">{top.title}</div>
        <div className="mt-0.5 opacity-80">{top.description}</div>
        {top.actionLabel && top.actionHref && (
          <a href={top.actionHref} className="mt-1.5 inline-block text-xs font-medium underline">
            {top.actionLabel}
          </a>
        )}
      </div>
      <IconBtn
        aria-label="Dismiss"
        onClick={() => setDismissedIds((prev) => new Set([...prev, top.id]))}
        className="shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </IconBtn>
    </div>
  )
}
