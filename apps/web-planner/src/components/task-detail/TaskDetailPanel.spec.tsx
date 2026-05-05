import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }))

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
})
