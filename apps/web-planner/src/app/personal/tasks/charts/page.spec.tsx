import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import ChartsPage from './page'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/charts',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// Mock usePersonalCharts to avoid trpc wiring
vi.mock('@/lib/hooks/use-personal-charts', () => ({
  usePersonalCharts: vi.fn(),
}))
import { usePersonalCharts } from '@/lib/hooks/use-personal-charts'
const mockUsePersonalCharts = vi.mocked(usePersonalCharts)

// Mock chart panels to keep tests fast (avoid ECharts rendering)
vi.mock('@/components/charts/panels/ProgressDonut', () => ({
  ProgressDonut: ({ counts }: any) => (
    <div data-testid="progress-donut">Progress: {JSON.stringify(counts)}</div>
  ),
}))
vi.mock('@/components/charts/panels/PriorityBar', () => ({
  PriorityBar: () => <div data-testid="priority-bar" />,
}))
vi.mock('@/components/charts/panels/BucketBar', () => ({
  BucketBar: () => <div data-testid="bucket-bar" />,
}))
vi.mock('@/components/charts/panels/WorkloadByAssignee', () => ({
  WorkloadByAssignee: () => <div data-testid="workload" />,
}))
vi.mock('@/components/charts/panels/LateUpcomingList', () => ({
  LateUpcomingList: () => <div data-testid="late-upcoming" />,
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('Personal tasks / charts', () => {
  it('renders chart panels when getCharts returns data', async () => {
    mockUsePersonalCharts.mockReturnValue({
      data: {
        progress: { 'not-started': 1, 'in-progress': 2, completed: 3 },
        priority: { urgent: 1, important: 1, medium: 2, low: 2 },
        bucket: [{ bucketId: 'b', bucketName: 'B', count: 2, hint: '0|a:' }],
        workload: [],
        lateUpcoming: { late: [], upcoming: [] },
      },
      isLoading: false,
      error: null,
    })
    render(<ChartsPage />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByTestId('progress-donut')).toBeInTheDocument())
    expect(screen.getByTestId('priority-bar')).toBeInTheDocument()
  })

  it('renders empty state when all data is zero', async () => {
    mockUsePersonalCharts.mockReturnValue({
      data: {
        progress: { 'not-started': 0, 'in-progress': 0, completed: 0 },
        priority: { urgent: 0, important: 0, medium: 0, low: 0 },
        bucket: [],
        workload: [],
        lateUpcoming: { late: [], upcoming: [] },
      },
      isLoading: false,
      error: null,
    })
    render(<ChartsPage />, { wrapper: Wrapper })
    await waitFor(() =>
      expect(screen.getByText(/nothing assigned to you yet/i)).toBeInTheDocument(),
    )
  })
})
