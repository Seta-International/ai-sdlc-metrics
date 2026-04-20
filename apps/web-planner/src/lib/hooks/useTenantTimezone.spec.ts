import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

vi.mock('../trpc', () => ({
  trpc: {
    admin: {
      getTenantTimezone: {
        query: vi.fn(),
      },
    },
  },
}))

const sessionMock = vi.fn()
vi.mock('@future/auth', () => ({
  useSession: () => sessionMock(),
}))

import { trpc } from '../trpc'
import { useTenantTimezone } from './useTenantTimezone'

const mockQuery = vi.mocked(
  (trpc.admin as unknown as { getTenantTimezone: { query: ReturnType<typeof vi.fn> } })
    .getTenantTimezone.query,
)

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useTenantTimezone', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.clearAllMocks()
    sessionMock.mockReturnValue({ actorId: 'actor-1', tenantId: 'tenant-1' })
  })

  afterEach(() => {
    queryClient.clear()
  })

  it('returns the tenant timezone from the tRPC query', async () => {
    mockQuery.mockResolvedValue({ timezone: 'America/Los_Angeles' })

    const { result } = renderHook(() => useTenantTimezone(), { wrapper: Wrapper })

    await waitFor(() => {
      expect(result.current.timezone).toBe('America/Los_Angeles')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('returns the default timezone while loading', () => {
    mockQuery.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useTenantTimezone(), { wrapper: Wrapper })

    expect(result.current.timezone).toBe('Asia/Ho_Chi_Minh')
    expect(result.current.isLoading).toBe(true)
  })
})
