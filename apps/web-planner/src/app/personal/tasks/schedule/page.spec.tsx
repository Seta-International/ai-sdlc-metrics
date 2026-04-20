import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import SchedulePage from './page'
import { trpc } from '@/lib/trpc'
import { PersonalTasksContext } from '../personal-tasks-context'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/schedule',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock('@future/schedule', () => ({
  ScheduleCalendar: ({ items }: { items: unknown[] }) => (
    <div data-testid="cal">items: {items.length}</div>
  ),
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

describe('Personal tasks / schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('passes the task set to ScheduleCalendar', async () => {
    mockListTasks.mockResolvedValue([
      {
        id: '1',
        planId: 'p',
        planName: 'P',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'T',
        bucketOrderHint: '0|a:',
        title: 't',
        progress: 'in-progress',
        priority: 'medium',
        startDate: new Date().toISOString(),
        dueDate: new Date().toISOString(),
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
    render(<SchedulePage />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByTestId('cal')).toHaveTextContent('items: 1'))
  })

  it('shows empty state when no dated tasks', async () => {
    mockListTasks.mockResolvedValue([
      {
        id: '2',
        planId: 'p',
        planName: 'P',
        planKind: 'team',
        bucketId: 'b',
        bucketName: 'T',
        bucketOrderHint: '0|a:',
        title: 'undated',
        progress: 'not-started',
        priority: 'medium',
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
    render(<SchedulePage />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText(/no dated tasks/i)).toBeInTheDocument())
  })
})
