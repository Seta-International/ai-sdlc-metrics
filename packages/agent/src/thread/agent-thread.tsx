'use client'

import {
  ThreadPrimitive,
  MessagePrimitive,
  useAssistantToolUI,
  useMessage,
} from '@assistant-ui/react'
import { PlanCard } from './cards/plan-card'
import { IterationStep } from './cards/iteration-step'
import { UserTurn } from './cards/user-turn'
import { AnswerBubble } from './cards/answer-bubble'
import { DraftCard } from './cards/draft-card'
import { useAgentContext } from '../context/use-agent-context'
import {
  PLAN_TOOL,
  ITERATION_TOOL,
  DRAFT_TOOL,
  isPlanArgs,
  isIterationArgs,
  isDraftArgs,
  type IterationPartArgs,
} from '../runtime/agent-message-parts'
import { IdleState } from '../panel/idle/idle-state'
import { IterationGroup } from './iteration/iteration-group'

export function AgentThread() {
  const agentContext = useAgentContext()

  useAssistantToolUI({
    toolName: PLAN_TOOL,
    render: ({ args }) => {
      if (!isPlanArgs(args)) return null
      return <PlanCard {...args} />
    },
  })
  useAssistantToolUI({
    toolName: DRAFT_TOOL,
    render: ({ args }) => {
      if (!isDraftArgs(args)) return null
      return <DraftCard {...args} />
    },
  })

  return (
    <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
      <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto py-2">
        <ThreadPrimitive.Empty>
          <IdleState
            surface={agentContext?.module ?? 'workspace'}
            contextEntity={agentContext?.entity ?? null}
          />
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
  const message = useMessage()
  const parts = message.content as ReadonlyArray<{
    type: string
    toolName?: string
    args?: unknown
    text?: string
  }>

  const iterationParts: IterationPartArgs[] = []
  for (const p of parts) {
    if (p.type === 'tool-call' && p.toolName === ITERATION_TOOL && isIterationArgs(p.args)) {
      iterationParts.push(p.args)
    }
  }

  return (
    <MessagePrimitive.Root className="flex flex-col gap-2 px-3 py-1">
      {iterationParts.length > 0 && (
        <IterationGroup
          iterations={iterationParts.map((it) => ({
            n: it.n,
            summary: `${it.subAgentDomain} — ${it.selectionReason}`,
            data: it,
          }))}
        >
          {(item) => (
            <IterationStep {...(item as typeof item & { data: IterationPartArgs }).data} />
          )}
        </IterationGroup>
      )}
      <MessagePrimitive.Content
        components={{
          Text: ({ text }) => <AnswerBubble>{text}</AnswerBubble>,
        }}
      />
    </MessagePrimitive.Root>
  )
}
