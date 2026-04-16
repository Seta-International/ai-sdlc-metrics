'use client'

import { useState } from 'react'
import { cn } from '@future/ui'
import type { AgentMessage } from '../types'

export interface AgentToolTraceProps {
  toolCall: AgentMessage
  toolResult?: AgentMessage
}

export function AgentToolTrace({ toolCall, toolResult }: AgentToolTraceProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="mx-3 my-1 rounded border border-border text-xs">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-muted-foreground hover:bg-secondary"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-mono">{toolCall.toolName}</span>
        <span className="ml-auto">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2">
          {toolCall.toolArgs && (
            <div className="mb-2">
              <div className="mb-1 font-590 text-muted-foreground">Args</div>
              <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-secondary-foreground">
                {JSON.stringify(toolCall.toolArgs, null, 2)}
              </pre>
            </div>
          )}
          {toolResult && (
            <div>
              <div className="mb-1 font-590 text-muted-foreground">Result</div>
              <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-secondary-foreground">
                {toolResult.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
