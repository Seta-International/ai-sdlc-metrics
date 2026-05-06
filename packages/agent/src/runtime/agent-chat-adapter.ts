import { fetchEventSource } from '@microsoft/fetch-event-source'
import type {
  ChatModelAdapter,
  ToolCallMessagePart,
  TextMessagePart,
  ThreadAssistantMessagePart,
} from '@assistant-ui/react'
import { sseEventSchema } from './sse-event-schema'
import type { SseEvent, TurnEndReason } from './sse-event-schema'
import type { AgentTurnStore } from './agent-turn-store'
import type { AgentContext } from '../types'
import {
  PLAN_TOOL,
  ITERATION_TOOL,
  DRAFT_TOOL,
  type PlanPartArgs,
  type IterationPartArgs,
  type DraftPartArgs,
} from './agent-message-parts'

export type PartUpdate =
  | { op: 'upsert'; partId: string; toolName: string; args: object }
  | { op: 'merge'; partId: string; args: object }
  | { op: 'append-text'; text: string }
  | { op: 'replace-text'; text: string }
  | { op: 'finalize'; endReason: TurnEndReason }

export function mapEventToPartUpdate(event: SseEvent): PartUpdate[] | null {
  switch (event.type) {
    case 'turn.started':
      return [
        {
          op: 'upsert',
          partId: 'plan',
          toolName: PLAN_TOOL,
          args: {
            traceId: event.payload.trace_id,
            conversationId: event.payload.conversation_id,
            topology: event.payload.topology,
            phase: null,
            subAgents: [],
          } satisfies PlanPartArgs,
        },
      ]
    case 'phase.started':
      return [
        {
          op: 'merge',
          partId: 'plan',
          args: { phase: event.payload.phase, subAgents: event.payload.sub_agents },
        },
      ]
    case 'iteration.started':
      return [
        {
          op: 'upsert',
          partId: `iter-${event.payload.n}`,
          toolName: ITERATION_TOOL,
          args: {
            n: event.payload.n,
            subAgentDomain: event.payload.sub_agent_domain,
            selectionReason: event.payload.selection_reason,
            state: 'running',
          } satisfies IterationPartArgs,
        },
      ]
    case 'iteration.validated':
      return [
        {
          op: 'merge',
          partId: `iter-${event.payload.n}`,
          args: {
            state: event.payload.passed ? 'passed' : 'failed',
            scorerResults: event.payload.scorer_results,
          },
        },
      ]
    case 'iteration.ended':
      return [
        {
          op: 'merge',
          partId: `iter-${event.payload.n}`,
          args: { usage: event.payload.usage, isComplete: event.payload.is_complete },
        },
      ]
    case 'answer.token':
      return [{ op: 'append-text', text: event.payload.text }]
    case 'answer.complete':
      return [
        {
          op: 'replace-text',
          text:
            typeof event.payload.content === 'string'
              ? event.payload.content
              : JSON.stringify(event.payload.content, null, 2),
        },
      ]
    case 'draft.proposed':
      return [
        {
          op: 'upsert',
          partId: `draft-${event.payload.action_id}`,
          toolName: DRAFT_TOOL,
          args: {
            actionId: event.payload.action_id,
            summary: event.payload.summary,
            tier: event.payload.tier,
            requiresApproval: event.payload.requires_approval,
            provenance: event.payload.provenance,
          } satisfies DraftPartArgs,
        },
      ]
    case 'refusal.started':
      return [{ op: 'replace-text', text: `⚠ Refused: ${event.payload.reason}` }]
    case 'turn.ended':
      return [{ op: 'finalize', endReason: event.payload.reason }]
    case 'progress':
    case 'answer.shape_declared':
      return null
  }
}

export interface AgentChatAdapterOptions {
  endpoint: string
  surface: 'panel' | 'inline'
  store: AgentTurnStore
  context?: AgentContext
}

type PartState = {
  text: string
  textActive: boolean
  toolParts: Map<string, { toolName: string; args: object }>
}

function buildContent(state: PartState): ThreadAssistantMessagePart[] {
  const out: ThreadAssistantMessagePart[] = []
  if (state.textActive || state.text) {
    out.push({ type: 'text', text: state.text })
  }
  for (const [partId, part] of state.toolParts) {
    out.push({
      type: 'tool-call',
      toolCallId: partId,
      toolName: part.toolName,
      args: part.args,
      argsText: JSON.stringify(part.args),
    } as ToolCallMessagePart)
  }
  return out
}

export function createAgentChatAdapter(opts: AgentChatAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      opts.store.getState().reset()

      const state: PartState = { text: '', textActive: false, toolParts: new Map() }
      let resolveChunk: (() => void) | null = null
      let done = false
      let capturedError: unknown = null
      const queue: Array<{ content: ReturnType<typeof buildContent> }> = []

      const apply = (updates: PartUpdate[]) => {
        let changed = false
        for (const u of updates) {
          if (u.op === 'append-text') {
            state.text += u.text
            state.textActive = true
            changed = true
          } else if (u.op === 'replace-text') {
            state.text = u.text
            state.textActive = true
            changed = true
          } else if (u.op === 'upsert') {
            state.toolParts.set(u.partId, { toolName: u.toolName, args: u.args })
            changed = true
          } else if (u.op === 'merge') {
            const existing = state.toolParts.get(u.partId)
            if (existing) {
              existing.args = { ...existing.args, ...u.args }
              changed = true
            } else if (process.env.NODE_ENV !== 'production') {
              console.warn(`[agent-chat-adapter] merge: unknown partId "${u.partId}"`)
            }
          }
        }
        if (changed) queue.push({ content: buildContent(state) })
      }

      const body = JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        surface: opts.surface,
        context: opts.context ?? null,
      })

      fetchEventSource(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortSignal,
        onmessage(ev) {
          let raw: unknown
          try {
            raw = JSON.parse(ev.data)
          } catch {
            return
          }
          const parsed = sseEventSchema.safeParse(raw)
          if (!parsed.success) return
          const event = parsed.data

          opts.store.getState().dispatch(event)

          const updates = mapEventToPartUpdate(event)
          if (updates) apply(updates)

          resolveChunk?.()
          resolveChunk = null
        },
        onerror(err) {
          capturedError = err
          done = true
          resolveChunk?.()
          resolveChunk = null
          throw err
        },
      })
        .then(() => {
          done = true
          resolveChunk?.()
          resolveChunk = null
        })
        .catch(() => {})

      while (!done || queue.length > 0) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolveChunk = r
          })
        }
        while (queue.length > 0) {
          yield queue.shift()!
        }
      }

      if (capturedError) throw capturedError
    },
  }
}
