import { cn } from '@future/ui'
import type { AgentMessage as AgentMessageType } from '../types'

export interface AgentMessageProps {
  message: AgentMessageType
}

export function AgentMessage({ message }: AgentMessageProps) {
  if (message.role === 'tool_call') {
    return (
      <div className="flex gap-2 px-3 py-1.5 text-xs text-[#8a8f98]">
        <span className="font-mono">{message.toolName}</span>
      </div>
    )
  }

  if (message.role === 'tool_result') {
    return (
      <div className="mx-3 rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-3 py-2 text-xs font-mono">
        {message.content}
      </div>
    )
  }

  const isUser = message.role === 'user'

  return (
    <div className={cn('flex px-3 py-1', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm text-[#f7f8f8]',
          isUser ? 'bg-[#5e6ad2]' : 'bg-[rgba(255,255,255,0.05)]',
        )}
      >
        {message.content}
      </div>
    </div>
  )
}
