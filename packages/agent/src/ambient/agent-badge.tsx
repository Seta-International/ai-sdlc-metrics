import { Sparkles } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'

export function AgentBadge() {
  const { insights } = useAgentState()
  const ctx = useAgentContext()

  if (!ctx) return null

  const matching = insights.filter(
    (i) => i.module === ctx.module && i.entity === ctx.entity && i.entityId === ctx.id,
  )

  if (matching.length === 0) return null

  const hasCritical = matching.some((i) => i.severity === 'critical')
  const hasWarning = matching.some((i) => i.severity === 'warning')

  const colorClass = hasCritical
    ? 'bg-destructive text-destructive-foreground'
    : hasWarning
      ? 'bg-yellow-500 text-white'
      : 'bg-muted text-muted-foreground'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
    >
      <Sparkles className="h-3 w-3" />
      {matching.length}
    </span>
  )
}
