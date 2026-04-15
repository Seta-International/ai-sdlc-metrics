'use client'

import { X } from 'lucide-react'

export interface AgentInlineResponseProps {
  content: string
  isStreaming?: boolean
  onDismiss: () => void
  onContinueInPanel?: () => void
}

export function AgentInlineResponse({
  content,
  isStreaming,
  onDismiss,
  onContinueInPanel,
}: AgentInlineResponseProps) {
  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 text-sm">
          {content}
          {isStreaming && (
            <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-foreground" />
          )}
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {onContinueInPanel && !isStreaming && (
        <button onClick={onContinueInPanel} className="mt-2 text-xs text-primary hover:underline">
          Continue in panel →
        </button>
      )}
    </div>
  )
}
