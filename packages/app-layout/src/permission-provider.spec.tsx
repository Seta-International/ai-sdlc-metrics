import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PermissionProvider } from './permission-provider'
import { useCanAccess } from './use-can-access'
import type { PermissionTrpcClient } from './permission-provider'

function TestConsumer({ permission }: { permission?: string }) {
  const canAccess = useCanAccess(permission)
  return <div data-testid="result">{String(canAccess)}</div>
}

function createMockTrpc(permissions: string[]): PermissionTrpcClient {
  return {
    kernel: {
      getMyPermissions: {
        query: vi.fn().mockResolvedValue(permissions),
      },
    },
  } as unknown as PermissionTrpcClient
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
    } as unknown as PermissionTrpcClient

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
