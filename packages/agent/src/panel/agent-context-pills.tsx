'use client'

import { useAgentContext } from '../context/use-agent-context'

export function AgentContextPills() {
  const ctx = useAgentContext()

  if (!ctx) return null

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
      <span className="inline-flex items-center rounded-full bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
        {ctx.module}
      </span>
      <span className="inline-flex items-center rounded-full bg-secondary/50 px-2.5 py-0.5 text-xs text-muted-foreground">
        {ctx.entity}
      </span>
      {ctx.metadata &&
        Object.entries(ctx.metadata).map(([key, value]) => (
          <span
            key={key}
            className="inline-flex items-center rounded-full bg-secondary/30 px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {key}: {String(value)}
          </span>
        ))}
    </div>
  )
}
