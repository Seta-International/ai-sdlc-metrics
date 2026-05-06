'use client'

import { Sparkles } from '@future/ui/icons'
import { useAgentState } from '../hooks/use-agent-state'
import { Tag } from '../primitives/tag'
import { Mono } from '../primitives/mono'

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
    <div className="dark flex h-7 flex-shrink-0 items-center gap-2 border-b border-white/[0.05] bg-sidebar px-3 text-muted-foreground">
      <Sparkles className="h-3 w-3 text-accent" />
      <Mono className="text-foreground">
        {insights.length} insight{insights.length !== 1 ? 's' : ''}
      </Mono>
      <span className="text-muted-foreground/50">·</span>
      {Object.entries(grouped).map(([mod, count]) => (
        <Tag key={mod}>
          {MODULE_LABELS[mod] ?? mod} ({count})
        </Tag>
      ))}
    </div>
  )
}
