import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlanBoardPage from './page'

// Mock heavy dependencies
vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'a1', tenantId: 't1' }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams('filter.priority=urgent'),
  usePathname: () => '/plans/abc/board',
  useParams: () => ({ id: 'abc' }),
}))

// Mock useBoardSnapshot to return controlled data
vi.mock('../../../../lib/hooks/useBoardSnapshot', () => ({
  useBoardSnapshot: () => ({
    data: {
      plan: { id: 'abc', name: 'Test Plan', labels: [], members: [] },
      buckets: [
        {
          id: 'b1',
          name: 'Bucket 1',
          orderHint: 'a',
          tasks: [
            {
              id: 't1',
              title: 'Urgent Task',
              priority: 9,
              progress: 0,
              dueDate: null,
              startDate: null,
              orderHint: 'a',
              assignees: [],
              appliedLabels: [],
              commentCount: 0,
              checklistItemCount: 0,
              checklistCheckedCount: 0,
              attachmentCount: 0,
              evidenceCount: 0,
              description: '',
              completedAt: null,
              completedBy: null,
              coverAttachmentId: null,
              updatedAt: new Date('2026-04-01'),
            },
            {
              id: 't2',
              title: 'Medium Task',
              priority: 3,
              progress: 0,
              dueDate: null,
              startDate: null,
              orderHint: 'b',
              assignees: [],
              appliedLabels: [],
              commentCount: 0,
              checklistItemCount: 0,
              checklistCheckedCount: 0,
              attachmentCount: 0,
              evidenceCount: 0,
              description: '',
              completedAt: null,
              completedBy: null,
              coverAttachmentId: null,
              updatedAt: new Date('2026-04-01'),
            },
          ],
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

vi.mock('@future/api-client', () => ({
  useQuery: vi.fn(),
  useQueryClient: () => ({
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  }),
}))

vi.mock('../../../../lib/trpc', () => ({
  trpc: { planner: { tasks: { move: { mutate: vi.fn() }, setProgress: { mutate: vi.fn() } } } },
}))

vi.mock('../../../../lib/hooks/useOptimisticMove', () => ({
  useOptimisticMove: () => ({ move: vi.fn() }),
}))

// Mock BoardDragContext and BoardColumn to avoid dnd-kit complexity in unit tests
vi.mock('../../../../components/board/BoardDragContext', () => ({
  BoardDragContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../../components/board/BoardColumn', () => ({
  BoardColumn: ({ bucket }: { bucket: { tasks: Array<{ id: string; title: string }> } }) => (
    <div data-testid="board-column">
      {bucket.tasks.map((t) => (
        <div key={t.id} data-testid="task-card">
          {t.title}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../../../../components/board/AddBucketButton', () => ({
  AddBucketButton: () => <button>Add bucket</button>,
}))

describe('PlanBoardPage with view state', () => {
  it('renders only urgent tasks when priority filter is set', () => {
    render(<PlanBoardPage />)
    expect(screen.getByText('Urgent Task')).toBeInTheDocument()
    expect(screen.queryByText('Medium Task')).not.toBeInTheDocument()
  })
})
