import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import ChartsPage from './page'

// Mock useFlatTasks
vi.mock('@/lib/hooks/useFlatTasks', () => ({
  useFlatTasks: vi.fn(),
}))
import { useFlatTasks } from '@/lib/hooks/useFlatTasks'
const mockUseFlatTasks = vi.mocked(useFlatTasks)

// Mock session so the useQuery for view flags runs without blowing up
vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

// Mock the tRPC client so we don't hit a network
vi.mock('../../../../lib/trpc', () => ({
  trpc: {
    planner: {
      plans: {
        getViewFlags: { query: vi.fn().mockResolvedValue({ trendsEnabled: false }) },
      },
    },
  },
}))

// Mock ChartsGrid (already tested separately)
vi.mock('@/components/charts/ChartsGrid', () => ({
  ChartsGrid: ({ planId, tasks }: any) => (
    <div data-testid="charts-grid" data-plan-id={planId} data-task-count={tasks.length} />
  ),
}))

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('ChartsPage', () => {
  it('shows skeleton while loading', () => {
    mockUseFlatTasks.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      processed: undefined,
    })
    renderWithClient(<ChartsPage params={{ id: 'plan-1' }} />)
    // Skeleton grid renders without ChartsGrid
    expect(screen.queryByTestId('charts-grid')).not.toBeInTheDocument()
  })

  it('shows error alert on failure', () => {
    mockUseFlatTasks.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('failed'),
      refetch: vi.fn(),
      processed: undefined,
    })
    renderWithClient(<ChartsPage params={{ id: 'plan-1' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i)
  })

  it('renders ChartsGrid with processed rows when loaded', () => {
    mockUseFlatTasks.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      processed: { rows: [], groups: [] },
    })
    renderWithClient(<ChartsPage params={{ id: 'plan-1' }} />)
    expect(screen.getByTestId('charts-grid')).toBeInTheDocument()
    expect(screen.getByTestId('charts-grid')).toHaveAttribute('data-plan-id', 'plan-1')
  })
})
