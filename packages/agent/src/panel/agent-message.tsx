'use client'

import { cn } from '@future/ui'
import type { AgentMessage as AgentMessageType } from '../types'

export interface AgentMessageProps {
  message: AgentMessageType
}

export function AgentMessage({ message }: AgentMessageProps) {
  if (message.role === 'tool_call') {
    return (
      <div className="flex gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{message.toolName}</span>
      </div>
    )
  }

  if (message.role === 'tool_result') {
    return (
      <div className="mx-3 rounded border border-border bg-secondary/20 px-3 py-2 text-xs font-mono">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={cn('flex px-3 py-1', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm text-foreground',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary/50',
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
