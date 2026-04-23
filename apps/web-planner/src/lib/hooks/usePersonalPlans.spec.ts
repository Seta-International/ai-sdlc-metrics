import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import React from 'react'

vi.mock('../trpc', () => ({
  trpc: {
    planner: {
      personal: {
        listPlans: {
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
import { usePersonalPlans } from './usePersonalPlans'

const mockQuery = vi.mocked(
  (trpc.planner.personal.listPlans as { query: ReturnType<typeof vi.fn> }).query,
)

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('usePersonalPlans', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('returns plans on success and calls trpc with actorId + tenantId', async () => {
    sessionMock.mockReturnValue({ actorId: 'actor-1', tenantId: 'tenant-1' })
    const fixture = [
      {
        id: 'plan-1',
        name: 'My personal plan',
        memberCount: 1,
        myRole: 'owner' as const,
        updatedAt: '2026-04-20T00:00:00.000Z',
        ownerActorId: 'actor-1',
      },
    ]
    mockQuery.mockResolvedValue(fixture)

    const { result } = renderHook(() => usePersonalPlans(), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.data).toEqual(fixture)
    })

    expect(mockQuery).toHaveBeenCalledWith({ actorId: 'actor-1', tenantId: 'tenant-1' })
  })

  it('stays disabled when no session: data undefined and query not called', async () => {
    sessionMock.mockReturnValue(null)
    mockQuery.mockResolvedValue([])

    const { result } = renderHook(() => usePersonalPlans(), { wrapper: Wrapper })

    // Give react-query a tick in case it would fire.
    await new Promise((r) => setTimeout(r, 20))

    expect(result.current.data).toBeUndefined()
    expect(mockQuery).not.toHaveBeenCalled()
  })
})
