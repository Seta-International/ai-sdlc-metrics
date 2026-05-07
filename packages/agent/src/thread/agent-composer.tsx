'use client'

import { Send, Square } from '@future/ui/icons'
import { ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@future/ui'
import { useAgentState, type ExecutionMode } from '../hooks/use-agent-state'

export function AgentComposer() {
  const { executionMode, setExecutionMode } = useAgentState()

  return (
    <ComposerPrimitive.Root className="flex flex-col gap-1 border-t border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <Select value={executionMode} onValueChange={(v) => setExecutionMode(v as ExecutionMode)}>
          <SelectTrigger className="h-7 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default approvals</SelectItem>
            <SelectItem value="bypass">Bypass approvals</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end gap-2">
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
            suppressHydrationWarning
          >
            <Send className="h-4 w-4" />
          </ComposerPrimitive.Send>
        </ThreadPrimitive.If>
        <ThreadPrimitive.If running>
          <ComposerPrimitive.Cancel
            aria-label="Cancel"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary/50"
          >
            <Square className="h-4 w-4" />
          </ComposerPrimitive.Cancel>
        </ThreadPrimitive.If>
      </div>
    </ComposerPrimitive.Root>
  )
}
