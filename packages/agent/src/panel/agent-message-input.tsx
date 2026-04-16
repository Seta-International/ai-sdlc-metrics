'use client'

import { useState, useCallback, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@future/ui'

export interface AgentMessageInputProps {
  onSend: (content: string) => void
  disabled?: boolean
}

export function AgentMessageInput({ onSend, disabled }: AgentMessageInputProps) {
  const [value, setValue] = useState('')

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
  }, [value, onSend])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex items-center gap-2 border-t border-border px-3 py-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask the agent..."
        disabled={disabled}
        className="flex-1 rounded-md border border-border bg-secondary/20 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={cn(
          'rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50 disabled:opacity-50',
        )}
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
