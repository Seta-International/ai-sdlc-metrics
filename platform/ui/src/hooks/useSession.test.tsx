import type { AgentClient, Me } from '@seta/agent-sdk'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SetaProvider } from '../provider/SetaProvider'
import { useSession } from './useSession'

const me: Me = {
  id: 'u1',
  email: 'a@b.com',
  name: 'A',
  tenants: [{ id: 't1', name: 'Acme', role: 'admin' }],
}

function makeClient(): AgentClient {
  return { getMe: vi.fn().mockResolvedValue(me) } as unknown as AgentClient
}

describe('useSession', () => {
  it('returns the session principal via AgentClient.getMe', async () => {
    const client = makeClient()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { result } = renderHook(() => useSession(), {
      wrapper: ({ children }) => (
        <SetaProvider client={client} queryClient={qc}>
          {children}
        </SetaProvider>
      ),
    })
    await waitFor(() => expect(result.current.data).toEqual(me))
    expect(client.getMe).toHaveBeenCalledTimes(1)
  })
})
