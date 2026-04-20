import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      personal: {
        myDay: {
          get: { query: vi.fn() },
        },
      },
    },
  },
}))

vi.mock('@future/auth', () => ({
  useSession: vi.fn(() => ({ actorId: 'actor-1', tenantId: 'tenant-1' })),
}))

import { trpc } from '../trpc'
import { useMyDay, myDayQueryKey } from './use-my-day'

const mockGet = vi.mocked(
  (trpc.planner.personal.myDay as unknown as { get: { query: ReturnType<typeof vi.fn> } }).get
    .query,
)

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMyDay', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('fetches entries for the given date scoped by actor + tenant', async () => {
    mockGet.mockResolvedValue([])
    const { result } = renderHook(() => useMyDay('2026-04-20'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledWith({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      date: '2026-04-20',
    })
  })

  it('refetches when the date prop changes', async () => {
    mockGet.mockResolvedValue([])
    const { result, rerender } = renderHook(({ date }) => useMyDay(date), {
      wrapper,
      initialProps: { date: '2026-04-20' },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    rerender({ date: '2026-04-21' })
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2))
    const lastCall = mockGet.mock.calls.at(-1)?.[0] as { date: string }
    expect(lastCall.date).toBe('2026-04-21')
  })

  it('is disabled when session is missing actor or tenant', async () => {
    const { useSession } = await import('@future/auth')
    vi.mocked(useSession).mockReturnValueOnce(null)
    mockGet.mockResolvedValue([])
    const { result } = renderHook(() => useMyDay('2026-04-20'), { wrapper })
    // give React Query a tick to settle
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.fetchStatus).toBe('idle')
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('exports a stable query key factory', () => {
    expect(myDayQueryKey('a', 't', '2026-04-20')).toEqual([
      'personal.myDay',
      'a',
      't',
      '2026-04-20',
    ])
  })
})
