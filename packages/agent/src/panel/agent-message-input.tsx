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
    <div className="flex items-center gap-2 border-t border-[rgba(255,255,255,0.08)] px-3 py-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask the agent..."
        disabled={disabled}
        className="flex-1 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] px-3 py-1.5 text-sm text-[#f7f8f8] placeholder:text-[#62666d] outline-none focus:outline-none focus:shadow-[0px_4px_12px_rgba(0,0,0,0.1)] disabled:opacity-50"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={cn(
          'rounded-md p-1.5 text-[#8a8f98] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-50',
        )}
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
