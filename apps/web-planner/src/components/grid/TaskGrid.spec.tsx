import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskGrid } from './TaskGrid'
import type { TaskFlat } from '@future/api-client/planner'
import type { TaskGroup } from '@/lib/task-group'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPatch = vi.fn()
const mockState = {
  view: 'grid' as const,
  groupBy: 'bucket' as const,
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
  })

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
  })

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
  })

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
})
