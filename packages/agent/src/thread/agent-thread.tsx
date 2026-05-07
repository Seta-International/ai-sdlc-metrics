'use client'

import { ThreadPrimitive, MessagePrimitive } from '@assistant-ui/react'
import { useAgentTurnStore } from '../runtime/agent-turn-store'

export function AgentThread() {
  const citations = useAgentTurnStore((s) => s.citations)

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto py-2">
        <ThreadPrimitive.Empty>
          <div
            data-testid="agent-thread-empty"
            className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <p className="text-sm">Start a conversation</p>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{
            UserMessage: AgentUserMessage,
            AssistantMessage: AgentAssistantMessage,
          }}
        />
        {citations.length > 0 && (
          <details className="mx-3 my-1 rounded-lg border border-border px-3 py-2 text-xs">
            <summary className="cursor-pointer select-none font-medium text-muted-foreground">
              Sources ({citations.length})
            </summary>
            <ul className="mt-2 space-y-2">
              {citations.map((c, i) => (
                <li key={i}>
                  <p className="font-semibold text-foreground">{c.documentTitle}</p>
                  <blockquote className="mt-0.5 border-l-2 border-border pl-2 text-muted-foreground">
                    {c.excerpt}
                  </blockquote>
                </li>
              ))}
            </ul>
          </details>
        )}
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function AgentUserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AgentAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-secondary/50 px-3 py-2 text-sm text-foreground">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}
