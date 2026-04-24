// @ts-expect-error -- test-only dependency is not installed in apps/web-admin in this workspace
import { render, screen } from '@testing-library/react'
// @ts-expect-error -- test-only dependency is not installed in apps/web-admin in this workspace
import userEvent from '@testing-library/user-event'
// @ts-expect-error -- test-only dependency is not installed in apps/web-admin in this workspace
import { describe, expect, it, vi, beforeEach } from 'vitest'
import MicrosoftIntegrationPage from './page'
import { useSession } from '@future/auth'
import { useMutation, useQuery } from '@future/api-client'

vi.mock('@future/auth', () => ({
  useSession: vi.fn(),
}))

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}))

const mockedUseSession = vi.mocked(useSession)
const mockedUseQuery = vi.mocked(useQuery)
const mockedUseMutation = vi.mocked(useMutation)

function mockMutations() {
  mockedUseMutation.mockReturnValue({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useMutation>)
}

describe('<MicrosoftIntegrationPage />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseSession.mockReturnValue({
      actorId: '01900000-0000-7000-8000-00000000aa01',
      tenantId: '01900000-0000-7000-8000-00000000bb01',
      roles: ['tenant_admin'],
      displayName: 'Admin',
      email: 'admin@example.com',
      provider: 'microsoft',
    })
    mockMutations()
  })

  it('renders disconnected state with connect button', () => {
    mockedUseQuery.mockReturnValue({
      data: {
        connected: false,
        status: null,
        tenantAdId: null,
        clientId: null,
        connectedAt: null,
        lastError: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>)

    render(<MicrosoftIntegrationPage />)

    expect(screen.getByRole('button', { name: /Connect Microsoft 365/i })).toBeInTheDocument()
  })

  it('renders invalid banner state', () => {
    mockedUseQuery.mockReturnValue({
      data: {
        connected: true,
        status: 'invalid',
        tenantAdId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        connectedAt: '2026-04-24T08:00:00.000Z',
        lastError: 'Token invalid',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>)

    render(<MicrosoftIntegrationPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('Token invalid')
    expect(screen.getByRole('button', { name: /Reconnect Microsoft 365/i })).toBeInTheDocument()
  })

  it('invalid-state reconnect destroys credential first and opens reconnect dialog', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    const connectMutate = vi.fn()
    const pauseMutate = vi.fn()
    const destroyMutate = vi.fn((_value: unknown, options?: { onSuccess?: () => void }) => {
      options?.onSuccess?.()
    })

    mockedUseMutation
      .mockReturnValueOnce({
        mutate: connectMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      } as unknown as ReturnType<typeof useMutation>)
      .mockReturnValueOnce({
        mutate: pauseMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      } as unknown as ReturnType<typeof useMutation>)
      .mockReturnValueOnce({
        mutate: destroyMutate,
        mutateAsync: vi.fn(),
        isPending: false,
      } as unknown as ReturnType<typeof useMutation>)

    mockedUseQuery.mockReturnValue({
      data: {
        connected: true,
        status: 'invalid',
        tenantAdId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        connectedAt: '2026-04-24T08:00:00.000Z',
        lastError: 'Token invalid',
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useQuery>)

    render(<MicrosoftIntegrationPage />)

    await user.click(screen.getByRole('button', { name: /Reconnect Microsoft 365/i }))

    expect(destroyMutate).toHaveBeenCalledTimes(1)
    expect(refetch).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText(/Tenant \(directory\) ID/i)).toBeInTheDocument()
  })

  it('renders connected status card state', () => {
    mockedUseQuery.mockReturnValue({
      data: {
        connected: true,
        status: 'active',
        tenantAdId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        connectedAt: '2026-04-24T08:00:00.000Z',
        lastError: null,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>)

    render(<MicrosoftIntegrationPage />)

    expect(screen.getByText(/Microsoft 365 integration/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Disconnect/i })).toBeInTheDocument()
  })

  it('renders coming-soon message when feature flag is disabled', () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Planner is not enabled for this tenant'),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useQuery>)

    render(<MicrosoftIntegrationPage />)

    expect(screen.getByText(/Coming soon for this tenant/i)).toBeInTheDocument()
    expect(screen.getByText(/planner.ms_sync.enabled/i)).toBeInTheDocument()
  })
})
