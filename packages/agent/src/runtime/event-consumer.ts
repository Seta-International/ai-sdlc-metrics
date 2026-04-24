import { fetchEventSource } from '@microsoft/fetch-event-source'
import { sseEventSchema } from './sse-event-schema'
import type { SseEvent } from './sse-event-schema'

// Handler map: event type → list of handlers
type HandlerMap = {
  [T in SseEvent['type']]?: Array<(event: Extract<SseEvent, { type: T }>) => void>
}

export type AgentEventConsumer = {
  on<T extends SseEvent['type']>(
    type: T,
    handler: (event: Extract<SseEvent, { type: T }>) => void,
  ): AgentEventConsumer
  close(): void
}

/**
 * createAgentEventConsumer — client SDK for subscribing to typed SSE events.
 *
 * Opens an SSE connection to `endpoint` immediately. Use `.on(type, handler)`
 * to subscribe to specific event types. Call `.close()` to abort the stream.
 */
export function createAgentEventConsumer(
  endpoint: string,
  body: unknown,
  signal: AbortSignal,
): AgentEventConsumer {
  const handlers: HandlerMap = {}

  // Internal abort controller so close() can cancel independently of the caller's signal
  const internalController = new AbortController()

  // Combine caller signal with our internal one
  signal.addEventListener('abort', () => internalController.abort(), { once: true })

  fetchEventSource(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: internalController.signal,
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
      const typeHandlers = handlers[event.type] as Array<(e: typeof event) => void> | undefined
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          handler(event)
        }
      }
    },
    onerror(err) {
      // Re-throw so fetchEventSource stops retrying
      throw err
    },
  }).catch(() => {
    // Swallow — caller uses on('turn.ended') or close() to react
  })

  const consumer: AgentEventConsumer = {
    on<T extends SseEvent['type']>(
      type: T,
      handler: (event: Extract<SseEvent, { type: T }>) => void,
    ): AgentEventConsumer {
      if (!handlers[type]) {
        handlers[type] = [] as HandlerMap[typeof type]
      }
      ;(handlers[type] as Array<(e: Extract<SseEvent, { type: T }>) => void>).push(handler)
      return consumer
    },

    close() {
      internalController.abort()
    },
  }

  return consumer
}
