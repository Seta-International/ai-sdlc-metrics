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
    <div className="mx-3 my-1 rounded border border-[rgba(255,255,255,0.08)] text-xs">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#8a8f98] hover:bg-[rgba(255,255,255,0.05)]"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="font-mono">{toolCall.toolName}</span>
        <span className="ml-auto">{expanded ? '−' : '+'}</span>
      </button>
      {expanded && (
        <div className="border-t border-[rgba(255,255,255,0.08)] px-3 py-2">
          {toolCall.toolArgs && (
            <div className="mb-2">
              <div className="mb-1 font-semibold text-[#8a8f98]">Args</div>
              <pre className="overflow-x-auto rounded bg-[rgba(255,255,255,0.02)] p-2 font-mono text-[#d0d6e0]">
                {JSON.stringify(toolCall.toolArgs, null, 2)}
              </pre>
            </div>
          )}
          {toolResult && (
            <div>
              <div className="mb-1 font-semibold text-[#8a8f98]">Result</div>
              <pre className="overflow-x-auto rounded bg-[rgba(255,255,255,0.02)] p-2 font-mono text-[#d0d6e0]">
                {toolResult.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
