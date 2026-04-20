import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { ChatModelAdapter } from '@assistant-ui/react'
import { sseEventSchema } from './sse-event-schema'
import type { AgentTurnStore } from './agent-turn-store'
import type { AgentContext } from '../types'

export interface AgentChatAdapterOptions {
  endpoint: string
  surface: 'panel' | 'inline'
  store: AgentTurnStore
  context?: AgentContext
}

export function createAgentChatAdapter(opts: AgentChatAdapterOptions): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      opts.store.getState().reset()

      let accumulatedText = ''
      const chunks: Array<{ content: [{ type: 'text'; text: string }] }> = []
      let resolveChunk: (() => void) | null = null
      let done = false

      const body = JSON.stringify({
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        surface: opts.surface,
        context: opts.context ?? null,
      })

      fetchEventSource(opts.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: abortSignal,
        onmessage(ev) {
          const parsed = sseEventSchema.safeParse(JSON.parse(ev.data))
          if (!parsed.success) return

          const event = parsed.data

          if (event.type === 'answer.delta') {
            accumulatedText += event.text
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
          done = true
          resolveChunk?.()
          resolveChunk = null
          throw err
        },
      }).then(() => {
        done = true
        resolveChunk?.()
        resolveChunk = null
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
    },
  }
}
