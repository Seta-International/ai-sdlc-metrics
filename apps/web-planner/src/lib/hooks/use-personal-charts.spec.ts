import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      personal: {
        getCharts: {
          query: vi.fn(),
        },
      },
    },
  },
}))

const sessionMock = vi.fn()
vi.mock('@future/auth', () => ({
  useSession: () => sessionMock(),
}))

import { trpc } from '../trpc'
import { usePersonalCharts } from './use-personal-charts'

const mockQuery = vi.mocked(
  (trpc.planner.personal.getCharts as { query: ReturnType<typeof vi.fn> }).query,
)

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('usePersonalCharts', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('returns PlannerChartsData from personal.getCharts', async () => {
    sessionMock.mockReturnValue({ actorId: 'a1', tenantId: 't1' })
    const payload = {
      progress: { 'not-started': 0, 'in-progress': 1, completed: 0 },
      priority: { urgent: 1, important: 0, medium: 0, low: 0 },
      bucket: [],
      workload: [],
      lateUpcoming: { late: [], upcoming: [] },
    }
    mockQuery.mockResolvedValue(payload)

    const { result } = renderHook(() => usePersonalCharts(), { wrapper: Wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data!.progress['in-progress']).toBe(1)
    expect(mockQuery).toHaveBeenCalledWith({ actorId: 'a1', tenantId: 't1' })
  })

  it('stays disabled when no session: data undefined and query not called', async () => {
    sessionMock.mockReturnValue(null)
    mockQuery.mockResolvedValue({} as any)

    const { result } = renderHook(() => usePersonalCharts(), { wrapper: Wrapper })

    await new Promise((r) => setTimeout(r, 20))

    expect(result.current.data).toBeUndefined()
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
