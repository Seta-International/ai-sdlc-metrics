import type { AgentClient } from '@seta/agent-sdk'
import { QueryClient } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SetaProvider } from '../provider/SetaProvider'
import { useAgentRun } from './useAgentRun'

function makeStreamResponse(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
}

function frames(...lines: string[]): string {
  return lines.map((l) => `data: ${l}\n\n`).join('')
}

function clientFor(body: string): AgentClient {
  return {
    streamRun: vi.fn().mockResolvedValue(makeStreamResponse(body)),
  } as unknown as AgentClient
}

const wrap = (client: AgentClient) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <SetaProvider client={client} queryClient={qc}>
      {children}
    </SetaProvider>
  )
}

describe('useAgentRun', () => {
  it('starts idle and exposes start()', () => {
    const { result } = renderHook(() => useAgentRun('r1'), { wrapper: wrap(clientFor('')) })
    expect(result.current.status).toBe('idle')
    expect(result.current.chunks).toEqual([])
    expect(typeof result.current.start).toBe('function')
  })

  it('drains chunks and ends with status=completed after stream ends', async () => {
    const body = frames(
      '{"type":"text","delta":"hi"}',
      '{"type":"finish","reason":"stop","usage":{"inputTokens":10,"outputTokens":3}}',
    )
    const { result } = renderHook(() => useAgentRun('r1'), { wrapper: wrap(clientFor(body)) })
    act(() => {
      result.current.start()
    })
    await waitFor(() => expect(result.current.status).toBe('completed'))
    expect(result.current.chunks.map((c) => c.type)).toEqual(['text', 'finish'])
    expect(result.current.tokenUsage).toEqual({ in: 10, out: 3 })
  })

  it('transitions to failed on error chunk', async () => {
    const body = frames(
      '{"type":"text","delta":"working"}',
      '{"type":"error","error":{"id":"e1","code":"TOOL_FAILED","domain":"TOOL","category":"THIRD_PARTY","message":"boom"}}',
    )
    const { result } = renderHook(() => useAgentRun('r1'), { wrapper: wrap(clientFor(body)) })
    act(() => {
      result.current.start()
    })
    await waitFor(() => expect(result.current.status).toBe('failed'))
  })

  it('abort() flips status to aborted', async () => {
    const client = clientFor(frames('{"type":"text","delta":"hi"}'))
    const { result } = renderHook(() => useAgentRun('r1'), { wrapper: wrap(client) })
    act(() => {
      result.current.start()
    })
    act(() => {
      result.current.abort()
    })
    await waitFor(() => expect(result.current.status).toBe('aborted'))
  })
})
