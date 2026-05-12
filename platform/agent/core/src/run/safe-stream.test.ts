import type { SSEStreamingApi } from 'hono/streaming'
import { describe, expect, it, vi } from 'vitest'
import { safeClose, safeEnqueue } from './safe-stream'

function fakeStream(opts?: { throwOnWrite?: boolean; throwOnClose?: boolean }): SSEStreamingApi {
  return {
    writeSSE: vi.fn(async () => {
      if (opts?.throwOnWrite) throw new Error('controller closed')
    }),
    close: vi.fn(async () => {
      if (opts?.throwOnClose) throw new Error('controller closed')
    }),
    closed: false,
  } as unknown as SSEStreamingApi
}

describe('safeEnqueue', () => {
  it('returns true on successful write', async () => {
    const s = fakeStream()
    const ok = await safeEnqueue(s, { event: 'text', data: 'hi' })
    expect(ok).toBe(true)
    expect(s.writeSSE).toHaveBeenCalledWith({ event: 'text', data: 'hi' })
  })

  it('returns false when the stream throws', async () => {
    const s = fakeStream({ throwOnWrite: true })
    const ok = await safeEnqueue(s, { event: 'x', data: '' })
    expect(ok).toBe(false)
  })

  it('does not throw on closed stream', async () => {
    const s = fakeStream({ throwOnWrite: true })
    await expect(safeEnqueue(s, { event: 'x', data: '' })).resolves.toBe(false)
  })
})

describe('safeClose', () => {
  it('returns true on successful close', async () => {
    const s = fakeStream()
    expect(await safeClose(s)).toBe(true)
  })

  it('returns false when close throws', async () => {
    const s = fakeStream({ throwOnClose: true })
    expect(await safeClose(s)).toBe(false)
  })
})
