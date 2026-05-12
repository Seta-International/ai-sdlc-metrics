import { logger } from '@seta/observability'
import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import { kernelErrorOf } from '../errors'
import { isAbortError } from '../errors/classify'
import { safeEnqueue } from '../run/safe-stream'
import type { KernelChunk } from '../types'

const KEEPALIVE_MS = 15_000

export function streamKernelSSE(c: Context, run: AsyncIterable<KernelChunk>): Response {
  return streamSSE(
    c,
    async (sse) => {
      const iter = run[Symbol.asyncIterator]()

      sse.onAbort(() => {
        void iter.return?.(undefined)
      })

      const keepalive = setInterval(() => {
        void safeEnqueue(sse, { event: 'ping', data: '' })
      }, KEEPALIVE_MS)

      try {
        while (true) {
          const { value, done } = await iter.next()
          if (done) break
          await safeEnqueue(sse, { event: value.type, data: JSON.stringify(value) })
        }
      } finally {
        clearInterval(keepalive)
      }
    },
    async (err, sse) => {
      if (isAbortError(err)) {
        logger.debug({ err }, 'kernel SSE aborted')
        await safeEnqueue(sse, { event: 'abort', data: '{}' })
      } else {
        logger.error({ err }, 'kernel SSE failed')
        await safeEnqueue(sse, {
          event: 'error',
          data: JSON.stringify(kernelErrorOf(err).toJSON()),
        })
      }
    },
  )
}
