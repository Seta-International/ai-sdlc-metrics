'use client'

import { Sparkles } from '@future/ui/icons'
import type { AgentInlineActionConfig, AgentContext } from '../types'
import { useAgentContext } from '../context/use-agent-context'
import { TinyBtn } from '../primitives/tiny-btn'

export interface AgentInlineActionProps {
  actions: AgentInlineActionConfig[]
  onAction?: (actionKey: string, context: AgentContext) => void
}

export function AgentInlineAction({ actions, onAction }: AgentInlineActionProps) {
  const ctx = useAgentContext()

  if (actions.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      {actions.map((action) => {
        const Icon = action.icon ?? Sparkles
        return (
          <TinyBtn key={action.key} onClick={() => ctx && onAction?.(action.key, ctx)}>
            <Icon className="mr-1 h-2.5 w-2.5 text-accent" />
            {action.label}
          </TinyBtn>
        )
      })}
    </div>
  )
}
