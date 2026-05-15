import { parseSseStream } from '@seta/agent-sdk'
import { useCallback, useRef, useState } from 'react'
import { appendChunk, type SetaUIMessage } from '../lib/chunksToUIMessages'

interface UseChatOptions {
  /**
   * Consumer-supplied streamer. Called per sendMessage with the just-sent user text.
   * Must return a ReadableStream<Uint8Array> of an SSE response body (containing
   * KernelChunk frames). Receives an AbortSignal for cancellation.
   */
  stream: (
    input: { text: string; messages: readonly SetaUIMessage[] },
    opts: { signal: AbortSignal },
  ) => Promise<ReadableStream<Uint8Array>>
}

export interface UseChatResult {
  messages: SetaUIMessage[]
  sendMessage: (text: string) => void
  cancel: () => void
  isRunning: boolean
}

export function useChat({ stream }: UseChatOptions): UseChatResult {
  const [messages, setMessages] = useState<SetaUIMessage[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const ctrlRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  const sendMessage = useCallback(
    (text: string) => {
      if (ctrlRef.current) return

      const userMsg: SetaUIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      }

      // Snapshot current messages so we can pass them to the streamer, then
      // append the user message before starting the stream.
      setMessages((prev) => {
        const next = [...prev, userMsg]

        const ctrl = new AbortController()
        ctrlRef.current = ctrl
        setIsRunning(true)

        void stream({ text, messages: prev }, { signal: ctrl.signal })
          .then((body) =>
            parseSseStream(
              body,
              (chunk) => {
                if (!mountedRef.current) return
                setMessages((cur) => appendChunk(cur, chunk))
              },
              { signal: ctrl.signal },
            ),
          )
          .then(() => {
            if (!mountedRef.current) return
            setIsRunning(false)
          })
          .catch((err: unknown) => {
            if (!mountedRef.current) return
            const name = (err as { name?: string }).name
            if (name !== 'AbortError') {
              // Non-abort errors: mark last assistant message as errored
              setMessages((cur) => {
                if (cur.length === 0) return cur
                const last = cur[cur.length - 1]
                if (!last || last.role !== 'assistant') return cur
                return cur.map((m, i) =>
                  i === cur.length - 1
                    ? {
                        ...m,
                        metadata: {
                          status: 'error' as const,
                          error: { code: 'STREAM_ERROR', message: String(err) },
                        },
                      }
                    : m,
                )
              })
            }
            setIsRunning(false)
          })
          .finally(() => {
            ctrlRef.current = null
          })

        return next
      })
    },
    [stream],
  )

  const cancel = useCallback(() => {
    ctrlRef.current?.abort()
  }, [])

  return { messages, sendMessage, cancel, isRunning }
}
