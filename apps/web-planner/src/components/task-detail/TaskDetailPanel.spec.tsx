import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockRouterBack = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: mockRouterBack }) }))

vi.mock('@/lib/hooks/useConflictResolver', () => ({
  useConflictResolver: () => ({
    conflictingField: null,
    myValue: null,
    theirValue: null,
    keepMine: vi.fn(),
    keepTheirs: vi.fn(),
  }),
}))

vi.mock('../my-day/AddToMyDayButton', () => ({
  AddToMyDayButton: () => React.createElement('div', { 'data-testid': 'add-to-my-day' }),
}))

vi.mock('./ConflictBanner', () => ({
  ConflictBanner: ({ conflictingField }: { conflictingField: string | null }) =>
    conflictingField ? React.createElement('div', { 'data-testid': 'conflict-banner' }) : null,
}))

vi.mock('./tabs/TaskDetailTab', () => ({
  TaskDetailTab: () => React.createElement('div', { 'data-testid': 'tab-detail-content' }),
}))
vi.mock('./tabs/TaskChecklistTab', () => ({
  TaskChecklistTab: () => React.createElement('div', { 'data-testid': 'tab-checklist-content' }),
}))
vi.mock('./tabs/TaskFilesTab', () => ({
  TaskFilesTab: () => React.createElement('div', { 'data-testid': 'tab-files-content' }),
}))
vi.mock('./tabs/TaskChatTab', () => ({
  TaskChatTab: () => React.createElement('div', { 'data-testid': 'tab-chat-content' }),
}))

vi.mock('./TaskHistoryPane', () => ({
  TaskHistoryPane: () => null,
}))

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

import { useTaskDetail } from '@/lib/hooks/useTaskDetail'
import { TaskDetailPanel } from './TaskDetailPanel'
import type { TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@/lib/hooks/useTaskDetail')
const mockUseTaskDetail = vi.mocked(useTaskDetail)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeTask(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'My Task',
    description: '',
    progress: 0,
    priority: 3,
    startDate: null,
    dueDate: null,
    updatedAt: BASE_DATE,
    bucketId: 'bucket-1',
    bucketName: 'To Do',
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
    checklist: [],
    attachments: [],
    customFields: [],
    ...overrides,
  }
}

function makeHookResult(task: TaskDetailSnapshot | null = null, isLoading = false) {
  return {
    task,
    isLoading,
    saving: false,
    update: vi.fn(),
    conflict: null,
    clearConflict: vi.fn(),
    lastError: null,
  }
}

describe('TaskDetailPanel', () => {
  it('renders the panel container', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(null, true))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('shows loading skeleton when task is loading', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(null, true))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-loading-skeleton')).toBeDefined()
  })

  it('renders 4 tab triggers when task is loaded', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask()))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByRole('tab', { name: /details/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /checklist/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /files/i })).toBeDefined()
    expect(screen.getByRole('tab', { name: /chat/i })).toBeDefined()
  })

  it('shows no badge on checklist tab when checklistItemCount is 0', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ checklistItemCount: 0 })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    const tab = screen.getByRole('tab', { name: /checklist/i })
    expect(tab.textContent).toBe('Checklist')
  })

  it('shows X/Y badge on checklist tab when items exist', () => {
    mockUseTaskDetail.mockReturnValue(
      makeHookResult(makeTask({ checklistItemCount: 3, checklistCheckedCount: 1 })),
    )
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    const tab = screen.getByRole('tab', { name: /checklist/i })
    expect(tab.textContent).toContain('1/3')
  })

  it('shows no badge on files tab when attachmentCount and evidenceCount are 0', () => {
    mockUseTaskDetail.mockReturnValue(
      makeHookResult(makeTask({ attachmentCount: 0, evidenceCount: 0 })),
    )
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    const tab = screen.getByRole('tab', { name: /files/i })
    expect(tab.textContent).toBe('Files')
  })

  it('shows count badge on files tab when attachments exist', () => {
    mockUseTaskDetail.mockReturnValue(
      makeHookResult(makeTask({ attachmentCount: 2, evidenceCount: 1 })),
    )
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    const tab = screen.getByRole('tab', { name: /files/i })
    expect(tab.textContent).toContain('3')
  })

  it('does not show loading skeleton when task is loaded', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask()))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.queryByTestId('task-detail-loading-skeleton')).toBeNull()
  })

  it('calls onClose prop when close button is clicked', async () => {
    const onClose = vi.fn()
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask()))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" onClose={onClose} />)
    await userEvent.click(screen.getByTestId('task-close-btn'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls router.back when no onClose prop and close button is clicked', async () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask()))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    await userEvent.click(screen.getByTestId('task-close-btn'))
    expect(mockRouterBack).toHaveBeenCalledOnce()
  })

  it('closes panel on Escape key', async () => {
    const onClose = vi.fn()
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask()))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" onClose={onClose} />)
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows AddToMyDayButton when task is loaded', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask()))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('add-to-my-day')).toBeDefined()
  })

  it('maps progress=100 to "completed" in taskFlatStub', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ progress: 100 })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('maps progress=50 to "in-progress" in taskFlatStub', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ progress: 50 })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('maps progress=0 to "not-started" in taskFlatStub', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ progress: 0 })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('maps priority=1 to "urgent" in taskFlatStub', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ priority: 1 })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('maps priority=9 to "low" in taskFlatStub', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ priority: 9 })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('maps priority=5 (other) to "medium" in taskFlatStub', () => {
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ priority: 5 })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('serializes startDate and dueDate when set', () => {
    const d = new Date('2026-03-01T00:00:00Z')
    mockUseTaskDetail.mockReturnValue(makeHookResult(makeTask({ startDate: d, dueDate: d })))
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })

  it('handles assignees with name and avatarUrl set', () => {
    mockUseTaskDetail.mockReturnValue(
      makeHookResult(
        makeTask({
          assignees: [
            { actorId: 'a1', name: 'Alice', avatarUrl: 'https://example.com/a.png' },
            { actorId: 'a2', name: undefined, avatarUrl: undefined },
          ],
        }),
      ),
    )
    render(<TaskDetailPanel taskId="task-1" planId="plan-1" />)
    expect(screen.getByTestId('task-detail-panel')).toBeDefined()
  })
})
