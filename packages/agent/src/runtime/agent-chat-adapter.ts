import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { sseEventSchema } from './sse-event-schema'
import type { AgentTurnStore } from './agent-turn-store'
import type { AgentContext } from '../types'
import type { ExecutionMode } from '../hooks/use-agent-state'

export interface AgentChatAdapterOptions {
  endpoint: string
  surface: 'panel' | 'inline'
  store: AgentTurnStore
  context?: AgentContext
  /** Called at turn-start to read the current execution mode from React state. */
  getExecutionMode: () => ExecutionMode
  /** Called at turn-start to read the current conversation ID (for message persistence). */
  getConversationId?: () => string | null
}

export function createAgentChatAdapter(opts: AgentChatAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      opts.store.getState().reset()

      let accumulatedText = ''
      const chunks: Array<{ content: [{ type: 'text'; text: string }] }> = []
      let resolveChunk: (() => void) | null = null
      let done = false
      let capturedError: unknown = null

      // Extract the last user message text — the backend expects user_utterance: string,
      // not the full messages array from @assistant-ui/react.
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      const userUtterance =
        lastUserMsg?.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('') ?? ''

      const conversationId = opts.getConversationId?.() ?? null
      const body = JSON.stringify({
        user_utterance: userUtterance,
        surface: opts.surface,
        context: opts.context ?? null,
        execution_mode: opts.getExecutionMode(),
        ...(conversationId ? { conversation_id: conversationId } : {}),
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

          if (event.type === 'answer.token') {
            accumulatedText += event.payload.text
            chunks.push({ content: [{ type: 'text', text: accumulatedText }] })
          } else {
            opts.store.getState().dispatch(event)
          }

          if (event.type === 'turn.ended') {
            done = true
          }

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
        .catch(() => {
          // onerror already set capturedError and done; .catch() prevents unhandled rejection
        })

      while (!done || chunks.length > 0) {
        if (chunks.length === 0) {
          await new Promise<void>((resolve) => {
            resolveChunk = resolve
          })
        }
        while (chunks.length > 0) {
          yield chunks.shift()!
        }
      }

      if (capturedError) throw capturedError
    },
  }
}
