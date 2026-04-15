import { Sparkles } from 'lucide-react'
import type { AgentInlineActionConfig, AgentContext } from '../types'
import { useAgentContext } from '../context/use-agent-context'

export interface AgentInlineActionProps {
  actions: AgentInlineActionConfig[]
  onAction?: (actionKey: string, context: AgentContext) => void
}

export function AgentInlineAction({ actions, onAction }: AgentInlineActionProps) {
  const ctx = useAgentContext()

  if (actions.length === 0) return <div />

  const handleClick = (actionKey: string) => {
    if (ctx && onAction) {
      onAction(actionKey, ctx)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => {
        const Icon = action.icon ?? Sparkles
        return (
          <button
            key={action.key}
            onClick={() => handleClick(action.key)}
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        )
      })}
    </div>
  )
}
