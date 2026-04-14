import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PermissionProvider } from './permission-provider'
import { useCanAccess } from './use-can-access'
import type { TRPCClient } from '@future/api-client'

function TestConsumer({ permission }: { permission?: string }) {
  const canAccess = useCanAccess(permission)
  return <div data-testid="result">{String(canAccess)}</div>
}

function createMockTrpc(permissions: string[]): TRPCClient {
  return {
    kernel: {
      getMyPermissions: {
        query: vi.fn().mockResolvedValue(permissions),
      },
    },
  } as unknown as TRPCClient
}

describe('PermissionProvider', () => {
  it('loads permissions and makes them available via useCanAccess', async () => {
    const mockTrpc = createMockTrpc(['people:profile:read'])

    render(
      <PermissionProvider trpc={mockTrpc}>
        <TestConsumer permission="people:profile:read" />
      </PermissionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('true')
    })
  })

  it('returns false for permissions not in the loaded set', async () => {
    const mockTrpc = createMockTrpc(['people:profile:read'])

    render(
      <PermissionProvider trpc={mockTrpc}>
        <TestConsumer permission="admin:role:manage" />
      </PermissionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('false')
    })
  })

  it('handles fetch failure gracefully', async () => {
    const mockTrpc = {
      kernel: {
        getMyPermissions: {
          query: vi.fn().mockRejectedValue(new Error('Network error')),
        },
      },
    } as unknown as TRPCClient

    render(
      <PermissionProvider trpc={mockTrpc}>
        <TestConsumer permission="people:profile:read" />
      </PermissionProvider>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('false')
    })
  })
})
