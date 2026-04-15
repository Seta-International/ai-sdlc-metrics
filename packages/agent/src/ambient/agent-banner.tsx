import { useState } from 'react'
import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const
const SEVERITY_ICONS = { critical: AlertCircle, warning: AlertTriangle, info: Info } as const
const SEVERITY_STYLES = {
  critical: 'border-destructive/50 bg-destructive/10 text-destructive',
  warning: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  info: 'border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-400',
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
      <button
        onClick={() => setDismissedIds((prev) => new Set([...prev, top.id]))}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
