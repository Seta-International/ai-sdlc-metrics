import { Workflow, Coins, DollarSign } from '@future/ui/icons'
import { Mono } from '../primitives/mono'
import type { UsageSnapshot } from '../runtime/sse-event-schema'

export interface AgentPanelMetaStripProps {
  traceId: string | null
  model: string | null
  usage: UsageSnapshot | null
}

function abbreviateFlow(traceId: string | null): string {
  if (!traceId) return 'flow_—'
  return `flow_${traceId.slice(0, 8)}…`
}

function formatTokens(usage: UsageSnapshot | null): string {
  if (!usage) return '—'
  const total = usage.input_tokens + usage.output_tokens
  if (total >= 1000) return `${(total / 1000).toFixed(1)}k`
  return total.toString()
}

export function AgentPanelMetaStrip({ traceId, model, usage }: AgentPanelMetaStripProps) {
  return (
    <div className="flex h-6.5 items-center gap-1.5 border-b border-white/[0.05] bg-white/[0.01] px-2.5">
      <Workflow className="h-2.5 w-2.5 text-muted-foreground/70" />
      <Mono>{abbreviateFlow(traceId)}</Mono>
      <span className="text-muted-foreground/70">·</span>
      <Mono className="text-foreground/80">{model ?? '—'}</Mono>
      <div className="flex-1" />
      <Coins className="h-2.5 w-2.5 text-muted-foreground/70" />
      <Mono>{formatTokens(usage)}</Mono>
      <DollarSign className="h-2.5 w-2.5 text-muted-foreground/70" />
      <Mono>—</Mono>
    </div>
  )
}
