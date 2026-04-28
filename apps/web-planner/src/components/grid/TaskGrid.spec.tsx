import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskGrid } from './TaskGrid'
import type { TaskFlat } from '@future/api-client/planner'
import type { TaskGroup } from '@/lib/task-group'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@future/auth', () => ({
  useSession: () => ({
    actorId: 'actor-1',
    tenantId: 'tenant-1',
    roles: [],
    displayName: 'Test User',
    email: 'test@example.com',
    provider: 'google',
  }),
}))

const mockTrpc = vi.hoisted(() => ({
  planner: {
    tasks: {
      setProgress: { mutate: vi.fn().mockResolvedValue(undefined) },
      setPriority: { mutate: vi.fn().mockResolvedValue(undefined) },
      setDates: { mutate: vi.fn().mockResolvedValue(undefined) },
      assign: { mutate: vi.fn().mockResolvedValue(undefined) },
      applyLabel: { mutate: vi.fn().mockResolvedValue(undefined) },
      removeLabel: { mutate: vi.fn().mockResolvedValue(undefined) },
      delete: { mutate: vi.fn().mockResolvedValue(undefined) },
    },
  },
}))

vi.mock('../../lib/trpc', () => ({ trpc: mockTrpc }))

const mockPatch = vi.fn()
const mockState: {
  view: 'grid'
  groupBy: 'bucket'
  sort: { field: string; dir: 'asc' | 'desc' } | undefined
  filter: {
    due: undefined
    priority: never[]
    labels: never[]
    buckets: never[]
    assignees: never[]
  }
  scale: undefined
  trendRange: undefined
} = {
  view: 'grid',
  groupBy: 'bucket',
  sort: undefined,
  filter: { due: undefined, priority: [], labels: [], buckets: [], assignees: [] },
  scale: undefined,
  trendRange: undefined,
}

vi.mock('@/lib/hooks/useViewState', () => ({
  useViewState: () => ({
    state: mockState,
    patch: mockPatch,
    reset: vi.fn(),
    commit: vi.fn(),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/plans/abc/grid',
}))

// Mock useVirtualizer to return a stable window of rows in jsdom (no layout engine)
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => {
    // Simulate a virtual window of up to 40 rows starting at index 0
    const windowSize = Math.min(count, 40)
    const items = Array.from({ length: windowSize }, (_, i) => ({
      index: i,
      key: String(i),
      start: i * 48,
      end: (i + 1) * 48,
      size: 48,
      lane: 0,
    }))
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * 48,
    }
  },
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<TaskFlat> & { id: string }): TaskFlat {
  return {
    planId: 'plan-abc',
    bucketId: 'bucket-1',
    bucketName: 'Bucket',
    bucketOrderHint: 'a',
    title: `Task ${overrides.id}`,
    progress: 'not-started',
    priority: 'medium',
    startDate: null,
    dueDate: null,
    assignees: [],
    labels: [],
    orderHint: 'a',
    commentCount: 0,
    checklistCount: { total: 0, completed: 0 },
    attachmentCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const fixture200: TaskFlat[] = Array.from({ length: 200 }, (_, i) => makeTask({ id: `task-${i}` }))

const fixture10: TaskFlat[] = Array.from({ length: 10 }, (_, i) =>
  makeTask({ id: `task-${i}`, bucketId: i < 5 ? 'bucket-a' : 'bucket-b' }),
)

const groups2: TaskGroup[] = [
  { key: 'group-a', label: 'Group A', tasks: fixture10.slice(0, 5) },
  { key: 'group-b', label: 'Group B', tasks: fixture10.slice(5) },
]

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TaskGrid', () => {
  beforeEach(() => {
    mockPatch.mockReset()
    // Reset mockState sort to undefined before each test
    mockState.sort = undefined
  })

  it('virtualizes a large dataset — only ~40 rows in DOM for 200 fixture tasks', () => {
    render(
      <TaskGrid
        planId="abc"
        data={fixture200}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )
    // getAllByRole('row') finds header row + rendered data rows
    const rows = screen.getAllByRole('row')
    // 1 header row + up to 40 data rows from mock virtualizer
    expect(rows.length).toBeLessThan(60)
    // Must have rendered some rows (not zero)
    expect(rows.length).toBeGreaterThan(1)
  }, 15_000)

  it('renders group section headers when groups provided', () => {
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={groups2}
        context={{ members: [], labels: [] }}
      />,
    )
    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('Group B')).toBeInTheDocument()
  })

  it('clicking a sortable column header updates view state', async () => {
    const user = userEvent.setup()
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    // Find the sortable "Title" column header button
    const sortButton = screen.getByRole('button', { name: /title/i })
    await user.click(sortButton)

    expect(mockPatch).toHaveBeenCalledWith({
      sort: { field: 'title', dir: 'asc' },
    })
  }, 15_000)

  it('clicking a sorted column header cycles to desc', async () => {
    const user = userEvent.setup()
    // Pre-set sort to asc on title
    mockState.sort = { field: 'title', dir: 'asc' }

    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    const sortButton = screen.getByRole('button', { name: /title/i })
    await user.click(sortButton)

    expect(mockPatch).toHaveBeenCalledWith({
      sort: { field: 'title', dir: 'desc' },
    })
  }, 15_000)

  it('clicking a desc-sorted column header clears sort', async () => {
    const user = userEvent.setup()
    mockState.sort = { field: 'title', dir: 'desc' }

    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    const sortButton = screen.getByRole('button', { name: /title/i })
    await user.click(sortButton)

    expect(mockPatch).toHaveBeenCalledWith({ sort: undefined })
  })

  it('renders sticky table header with column names', () => {
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    // Check column headers are present by finding them inside <th> elements
    const headerCells = screen.getAllByRole('columnheader')
    const headerTexts = headerCells.map((th) => th.textContent?.trim() ?? '')
    expect(headerTexts.some((t) => /bucket/i.test(t))).toBe(true)
    expect(headerTexts.some((t) => /progress/i.test(t))).toBe(true)
    expect(headerTexts.some((t) => /priority/i.test(t))).toBe(true)
  })

  it('renders empty table body when data is empty', () => {
    render(
      <TaskGrid planId="abc" data={[]} groups={undefined} context={{ members: [], labels: [] }} />,
    )

    // Only the header row should be present
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(1)
  })

  // ── BulkActionsBar integration ────────────────────────────────────────────

  it('does not show BulkActionsBar when no rows are selected', () => {
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )
    expect(screen.queryByTestId('bulk-set-progress')).not.toBeInTheDocument()
    expect(screen.queryByTestId('bulk-delete')).not.toBeInTheDocument()
  })

  it('shows BulkActionsBar with correct count when a row checkbox is checked', async () => {
    const user = userEvent.setup()
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    // Check first row checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    // First checkbox is the "select all" in the header; second is first data row
    const firstRowCheckbox = checkboxes[1]!
    await user.click(firstRowCheckbox)

    expect(screen.getByTestId('bulk-set-progress')).toBeInTheDocument()
    expect(screen.getByTestId('bulk-delete')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('clears BulkActionsBar when clear selection button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1]!)

    // BulkActionsBar is visible
    expect(screen.getByTestId('bulk-set-progress')).toBeInTheDocument()

    // Click the X / clear button in DataTableBulkActions
    const clearBtn = screen.getByRole('button', { name: /clear selection/i })
    await user.click(clearBtn)

    // Bar disappears
    expect(screen.queryByTestId('bulk-set-progress')).not.toBeInTheDocument()
  })

  it('opens progress popover and calls setProgress mutation for selected task', async () => {
    const user = userEvent.setup()
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1]!)

    // Open progress popover
    await user.click(screen.getByTestId('bulk-set-progress'))
    expect(screen.getByTestId('bulk-progress-popover')).toBeInTheDocument()

    // Click "Completed"
    await user.click(screen.getByTestId('bulk-progress-option-completed'))

    expect(mockTrpc.planner.tasks.setProgress.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ progress: 100, expectedVersion: expect.any(String) }),
    )
  })

  it('shows delete confirmation dialog and calls delete mutation', async () => {
    const user = userEvent.setup()
    render(
      <TaskGrid
        planId="abc"
        data={fixture10}
        groups={undefined}
        context={{ members: [], labels: [] }}
      />,
    )

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[1]!)

    await user.click(screen.getByTestId('bulk-delete'))

    // Confirmation dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/delete 1 task/i)).toBeInTheDocument()

    await user.click(screen.getByTestId('bulk-delete-confirm'))

    expect(mockTrpc.planner.tasks.delete.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-abc' }),
    )
  })
})
