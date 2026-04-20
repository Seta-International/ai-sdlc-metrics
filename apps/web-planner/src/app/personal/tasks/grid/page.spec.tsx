import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import GridPage from './page'
import { trpc } from '@/lib/trpc'
import { PersonalTasksContext } from '../personal-tasks-context'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/grid',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      personal: {
        listTasks: { query: vi.fn() },
      },
    },
  },
}))

const mockListTasks = vi.mocked(trpc.planner.personal.listTasks.query as ReturnType<typeof vi.fn>)

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <PersonalTasksContext.Provider value={{ includeCompleted: false }}>
        {children}
      </PersonalTasksContext.Provider>
    </QueryClientProvider>
  )
}

describe('Personal tasks / grid', () => {
  it('renders a grid row for each task', async () => {
    mockListTasks.mockResolvedValue([
      {
        id: '1',
        planId: 'p1',
        planName: 'Alpha',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'Todo',
        bucketOrderHint: '0|a:',
        title: 'Write plan',
        progress: 'in-progress',
        priority: 'urgent',
        startDate: null,
        dueDate: null,
        assignees: [],
        labels: [],
        orderHint: '0|a:',
        commentCount: 0,
        attachmentCount: 0,
        checklistCount: { total: 0, completed: 0 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ] as any)
    render(<GridPage />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('Write plan')).toBeInTheDocument())
    // PersonalPlanBadge: planName 'Alpha' should appear
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('shows empty state when no tasks', async () => {
    mockListTasks.mockResolvedValue([])
    render(<GridPage />, { wrapper: Wrapper })
    await waitFor(() =>
      expect(screen.getByText(/nothing assigned to you yet/i)).toBeInTheDocument(),
    )
  })
})
