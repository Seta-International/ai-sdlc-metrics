import { ArrowRight, Brain, Repeat, Workflow } from '@future/ui/icons'
import { Tag } from '../../primitives/tag'
import { Mono } from '../../primitives/mono'
import type { PlanPartArgs } from '../../runtime/agent-message-parts'

export type PlanCardProps = PlanPartArgs

export function PlanCard({ traceId, topology, phase, subAgents, iteration }: PlanCardProps) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-gradient-to-b from-accent/[0.05] to-transparent p-2">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex text-accent">
          <Brain className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-semibold text-foreground">Plan</span>
        <Tag variant="accent">{topology}</Tag>
        {iteration !== undefined && (
          <Tag variant="warning">
            <Repeat className="mr-0.5 h-2.5 w-2.5" /> iter {iteration}
          </Tag>
        )}
        <div className="flex-1" />
        <Mono>
          <Workflow className="mr-0.5 inline-block h-2.5 w-2.5" />
          {traceId.slice(0, 8)}…
        </Mono>
      </div>
      {phase !== null && (
        <div className="mt-1 text-[0.625rem] text-muted-foreground/70">
          phase: <span className="text-foreground/80">{phase === 1 ? 'router' : 'synthesize'}</span>
        </div>
      )}
      {subAgents.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground/70">
            route <ArrowRight className="h-2.5 w-2.5" />
          </span>
          {subAgents.map((a) => (
            <Tag key={a.domain} variant="default">
              {a.domain}
            </Tag>
          ))}
        </div>
      )}
    </div>
  )
}
