'use client'

import { Send, Square } from 'lucide-react'
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react'

export function AgentComposer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-border px-3 py-2">
      <ComposerPrimitive.Input
        rows={1}
        autoFocus
        placeholder="Ask the agent..."
        className="flex-1 resize-none rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/50 disabled:opacity-50"
      />
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send
          aria-label="Send"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Stop
          aria-label="Stop"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50"
        >
          <Square className="h-4 w-4" />
        </ComposerPrimitive.Stop>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  )
}
