'use client'

import { useAgentContext } from '../context/use-agent-context'

export function AgentContextPills() {
  const ctx = useAgentContext()

  if (!ctx) return null

  return (
    <div className="flex flex-wrap gap-1.5 border-b border-[rgba(255,255,255,0.08)] px-3 py-2">
      <span className="inline-flex items-center rounded-full bg-[rgba(255,255,255,0.05)] px-2.5 py-0.5 text-xs text-[#8a8f98]">
        {ctx.module}
      </span>
      <span className="inline-flex items-center rounded-full bg-[rgba(255,255,255,0.05)] px-2.5 py-0.5 text-xs text-[#8a8f98]">
        {ctx.entity}
      </span>
      {ctx.metadata &&
        Object.entries(ctx.metadata).map(([key, value]) => (
          <span
            key={key}
            className="inline-flex items-center rounded-full bg-[rgba(255,255,255,0.03)] px-2.5 py-0.5 text-xs text-[#8a8f98]"
          >
            {key}: {String(value)}
          </span>
        ))}
    </div>
  )
}
