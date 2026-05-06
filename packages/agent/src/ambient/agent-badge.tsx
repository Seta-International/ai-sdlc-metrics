'use client'

import { Sparkles } from '@future/ui/icons'
import { useAgentState } from '../hooks/use-agent-state'
import { useAgentContext } from '../context/use-agent-context'
import { Tag } from '../primitives/tag'

export function AgentBadge() {
  const { insights } = useAgentState()
  const ctx = useAgentContext()

  if (!ctx) return null

  const matching = insights.filter(
    (i) => i.module === ctx.module && i.entity === ctx.entity && i.entityId === ctx.id,
  )

  if (matching.length === 0) return null

  const variant = matching.some((i) => i.severity === 'critical')
    ? 'danger'
    : matching.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'accent'

  return (
    <Tag variant={variant}>
      <Sparkles className="mr-0.5 h-2.5 w-2.5" />
      {matching.length}
    </Tag>
  )
}
