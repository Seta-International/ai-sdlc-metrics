import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BoardColumn } from './BoardColumn'
import type { BoardBucketSnapshot, PlanLabel } from '../../lib/board-types'

// Mock dnd-kit hooks to avoid needing a full DndContext
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: {},
}))

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: () => undefined },
  },
}))

const emptyLabels: PlanLabel[] = []

function makeBucket(overrides: Partial<BoardBucketSnapshot> = {}): BoardBucketSnapshot {
  return {
    id: 'bucket-1',
    name: 'To Do',
    orderHint: 'a0',
    tasks: [],
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

describe('BoardColumn', () => {
  it('renders the column name', () => {
    render(<BoardColumn bucket={makeBucket({ name: 'In Review' })} planLabels={emptyLabels} />)
    expect(screen.getByText('In Review')).toBeDefined()
  })

  it('shows task count badge', () => {
    const tasks = [
      {
        id: 'task-1',
        title: 'Task 1',
        description: '',
        progress: 0,
        priority: 3,
        startDate: null,
        dueDate: null,
        orderHint: 'a0',
        completedAt: null,
        completedBy: null,
        checklistItemCount: 0,
        checklistCheckedCount: 0,
        attachmentCount: 0,
        commentCount: 0,
        evidenceCount: 0,
        coverAttachmentId: null,
        appliedLabels: [],
        assignees: [],
        updatedAt: new Date(),
      },
      {
        id: 'task-2',
        title: 'Task 2',
        description: '',
        progress: 0,
        priority: 3,
        startDate: null,
        dueDate: null,
        orderHint: 'a1',
        completedAt: null,
        completedBy: null,
        checklistItemCount: 0,
        checklistCheckedCount: 0,
        attachmentCount: 0,
        commentCount: 0,
        evidenceCount: 0,
        coverAttachmentId: null,
        appliedLabels: [],
        assignees: [],
        updatedAt: new Date(),
      },
    ]

    render(<BoardColumn bucket={makeBucket({ tasks })} planLabels={emptyLabels} />)

    // Count badge shows "2"
    expect(screen.getByText('2')).toBeDefined()
  })

  it('shows 0 count badge for empty column', () => {
    render(
      <BoardColumn
        bucket={makeBucket({ name: 'Empty Column', tasks: [] })}
        planLabels={emptyLabels}
      />,
    )
    // Multiple "0" elements is OK — just check at least one exists
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('renders task titles inside the column', () => {
    const tasks = [
      {
        id: 'task-1',
        title: 'Fix the bug',
        description: '',
        progress: 0,
        priority: 3,
        startDate: null,
        dueDate: null,
        orderHint: 'a0',
        completedAt: null,
        completedBy: null,
        checklistItemCount: 0,
        checklistCheckedCount: 0,
        attachmentCount: 0,
        commentCount: 0,
        evidenceCount: 0,
        coverAttachmentId: null,
        appliedLabels: [],
        assignees: [],
        updatedAt: new Date(),
      },
    ]

    render(<BoardColumn bucket={makeBucket({ tasks })} planLabels={emptyLabels} />)
    expect(screen.getByText('Fix the bug')).toBeDefined()
  })
})
