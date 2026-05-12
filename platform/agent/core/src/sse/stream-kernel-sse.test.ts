import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { LlmError } from '../errors'
import type { KernelChunk } from '../types'
import { streamKernelSSE } from './stream-kernel-sse'

function makeApp(produce: () => AsyncIterable<KernelChunk>): Hono {
  const app = new Hono()
  app.get('/stream', (c) => streamKernelSSE(c, produce()))
  return app
}

async function readSse(res: Response, max = 50): Promise<string[]> {
  const reader = res.body
  if (!reader) return []
  const stream = reader.getReader()
  const decoder = new TextDecoder()
  const frames: string[] = []
  let buf = ''
  while (frames.length < max) {
    const { value, done } = await stream.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx = buf.indexOf('\n\n')
    while (idx >= 0) {
      frames.push(buf.slice(0, idx))
      buf = buf.slice(idx + 2)
      idx = buf.indexOf('\n\n')
    }
  }
  return frames
}

describe('streamKernelSSE', () => {
  it('emits one SSE frame per chunk with event=<chunk.type>', async () => {
    async function* run(): AsyncIterable<KernelChunk> {
      yield { type: 'text', delta: 'hi' }
      yield { type: 'finish', reason: 'stop' }
    }
    const app = makeApp(run)
    const res = await app.request('/stream')
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const frames = await readSse(res, 3)
    expect(frames.some((f) => f.includes('event: text') && f.includes('"delta":"hi"'))).toBe(true)
    expect(frames.some((f) => f.includes('event: finish'))).toBe(true)
  })

  it('emits an error SSE frame when run yields type:error', async () => {
    const err = new LlmError({ code: 'X', category: 'THIRD_PARTY', message: 'boom' })
    async function* run(): AsyncIterable<KernelChunk> {
      yield { type: 'error', error: err }
    }
    const app = makeApp(run)
    const res = await app.request('/stream')
    const frames = await readSse(res, 3)
    expect(frames.some((f) => f.includes('event: error') && f.includes('"code":"X"'))).toBe(true)
  })

  // Skipped: Hono's in-process request transport does not propagate
  // AbortController.signal to streamSSE's onAbort callback. The wiring in
  // stream-kernel-sse.ts is structurally correct; covered end-to-end by the
  // MSW recording testkit's integration suite against a real HTTP listener.
  it.skip('calls iter.return() to interrupt the generator on client abort', async () => {
    const returnSpy = vi.fn()
    let consumed = 0
    const iter: AsyncIterator<KernelChunk> = {
      async next() {
        consumed++
        if (consumed === 1) return { value: { type: 'text', delta: 'a' }, done: false }
        await new Promise((r) => setTimeout(r, 1000))
        return { value: undefined as never, done: true }
      },
      async return(value?: unknown) {
        returnSpy(value)
        return { value: undefined as never, done: true }
      },
    }
    const fakeIterable: AsyncIterable<KernelChunk> = { [Symbol.asyncIterator]: () => iter }
    const app = new Hono()
    app.get('/stream', (c) => streamKernelSSE(c, fakeIterable))
    const ctrl = new AbortController()
    const reqP = app.request('/stream', { signal: ctrl.signal })
    setTimeout(() => ctrl.abort(), 50)
    try {
      await (await reqP).text()
    } catch {
      // abort throws on the client side
    }
    await new Promise((r) => setTimeout(r, 50))
    expect(returnSpy).toHaveBeenCalled()
  })
})
