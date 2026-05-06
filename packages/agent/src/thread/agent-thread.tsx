'use client'

import { ThreadPrimitive, MessagePrimitive, useAssistantToolUI } from '@assistant-ui/react'
import { PlanCard } from './cards/plan-card'
import { IterationStep } from './cards/iteration-step'
import { UserTurn } from './cards/user-turn'
import { AnswerBubble } from './cards/answer-bubble'
import {
  PLAN_TOOL,
  ITERATION_TOOL,
  isPlanArgs,
  isIterationArgs,
} from '../runtime/agent-message-parts'

export function AgentThread() {
  useAssistantToolUI({
    toolName: PLAN_TOOL,
    render: ({ args }) => {
      if (!isPlanArgs(args)) return null
      return <PlanCard {...args} />
    },
  })
  useAssistantToolUI({
    toolName: ITERATION_TOOL,
    render: ({ args }) => {
      if (!isIterationArgs(args)) return null
      return <IterationStep {...args} />
    },
  })

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
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
          components={{ UserMessage: AgentUserMessage, AssistantMessage: AgentAssistantMessage }}
        />
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function AgentUserMessage() {
  return (
    <MessagePrimitive.Root>
      <UserTurn>
        <MessagePrimitive.Content />
      </UserTurn>
    </MessagePrimitive.Root>
  )
}

function AgentAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex flex-col gap-2 px-3 py-1">
      <MessagePrimitive.Content
        components={{
          Text: ({ text }) => <AnswerBubble>{text}</AnswerBubble>,
        }}
      />
    </MessagePrimitive.Root>
  )
}
