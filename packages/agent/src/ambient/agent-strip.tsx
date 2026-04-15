'use client'

import { Sparkles } from 'lucide-react'
import { useAgentState } from '../hooks/use-agent-state'

const MODULE_LABELS: Record<string, string> = {
  people: 'People',
  time: 'Time',
  hiring: 'Hiring',
  performance: 'Performance',
  projects: 'Projects',
  finance: 'Finance',
  goals: 'Goals',
  insights: 'Insights',
  planner: 'Planner',
  admin: 'Admin',
  kernel: 'Kernel',
}

export function AgentStrip() {
  const { insights } = useAgentState()

  if (insights.length === 0) return null

  const grouped = insights.reduce<Record<string, number>>((acc, insight) => {
    acc[insight.module] = (acc[insight.module] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-b bg-muted/30 px-4 text-xs text-muted-foreground">
      <Sparkles className="h-3 w-3" />
      <span>
        {insights.length} insight{insights.length !== 1 ? 's' : ''}
      </span>
      <span className="text-border">·</span>
      {Object.entries(grouped).map(([mod, count]) => (
        <span key={mod}>
          {MODULE_LABELS[mod] ?? mod} ({count})
        </span>
      ))}
    </div>
  )
}
