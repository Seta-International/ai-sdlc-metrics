'use client'

import {
  ThreadPrimitive,
  MessagePrimitive,
  UserMessagePrimitive,
  AssistantMessagePrimitive,
} from '@assistant-ui/react'

export function AgentThread() {
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
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function AgentUserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
        <UserMessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AgentAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start px-3 py-1">
      <div className="max-w-[85%] rounded-lg bg-secondary/50 px-3 py-2 text-sm text-foreground">
        <AssistantMessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}
