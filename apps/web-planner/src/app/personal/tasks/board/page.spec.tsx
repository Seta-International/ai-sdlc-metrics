import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import BoardPage from './page'
import { trpc } from '@/lib/trpc'
import { PersonalTasksContext } from '../personal-tasks-context'

vi.mock('@future/auth', () => ({ useSession: () => ({ actorId: 'a', tenantId: 't' }) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/personal/tasks/board',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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

const mockListTasks = vi.mocked(
  // @ts-expect-error mock
  trpc.planner.personal.listTasks.query as ReturnType<typeof vi.fn>,
)

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

describe('Personal tasks / board', () => {
  it('shows the empty state when nothing is returned', async () => {
    mockListTasks.mockResolvedValue([])
    render(<BoardPage />, { wrapper: Wrapper })
    await waitFor(() =>
      expect(screen.getByText(/nothing assigned to you yet/i)).toBeInTheDocument(),
    )
  })

  it('renders task titles in columns', async () => {
    mockListTasks.mockResolvedValue([
      {
        id: '1',
        planId: 'p1',
        planName: 'Alpha',
        planKind: 'team',
        bucketId: 'b1',
        bucketName: 'Todo',
        bucketOrderHint: '0|a:',
        title: 'My board task',
        progress: 'in-progress',
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
    render(<BoardPage />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('My board task')).toBeInTheDocument())
  })
})
