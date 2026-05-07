import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { DateField } from './DateField'
import type { TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const mockSetDatesMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        setDates: { mutate: (...args: unknown[]) => mockSetDatesMutate(...args) },
      },
    },
  },
}))

vi.mock('../../pickers/DatePicker', () => ({
  DatePicker: ({
    value,
    onChange,
    onClose,
  }: {
    value: Date | null
    onChange: (d: Date | null) => void
    onClose: () => void
    label?: string
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'date-picker' },
      React.createElement('span', null, value ? value.toISOString().slice(0, 10) : 'no-date'),
      React.createElement(
        'button',
        { onClick: () => onChange(new Date('2026-07-01')) },
        'Pick date',
      ),
      React.createElement('button', { onClick: () => onChange(null) }, 'Clear'),
      React.createElement('button', { onClick: onClose }, 'Close'),
    ),
}))

const BASE_DATE = new Date('2026-01-01T00:00:00Z')
const START_DATE = new Date('2026-03-01T00:00:00Z')
const DUE_DATE = new Date('2026-04-15T00:00:00Z')

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

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  mockSetDatesMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('DateField (start)', () => {
  it('renders start-date-field with "Not set" when no startDate', () => {
    render(
      <Wrapper>
        <DateField kind="start" taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.getByTestId('start-date-field')).toBeDefined()
    expect(screen.getByText('Not set')).toBeDefined()
  })

  it('renders formatted date when startDate is set', () => {
    render(
      <Wrapper>
        <DateField
          kind="start"
          taskId="task-1"
          planId="plan-1"
          task={makeTask({ startDate: START_DATE })}
        />
      </Wrapper>,
    )
    expect(screen.queryByText('Not set')).toBeNull()
  })

  it('opens date picker when button is clicked', async () => {
    render(
      <Wrapper>
        <DateField kind="start" taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Start date/i }))
    expect(screen.getByTestId('date-picker')).toBeDefined()
  })

  it('closes picker when onClose is called', async () => {
    render(
      <Wrapper>
        <DateField kind="start" taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Start date/i }))
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('date-picker')).toBeNull()
  })

  it('calls setDates.mutate with new startDate when date is picked', async () => {
    render(
      <Wrapper>
        <DateField kind="start" taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Start date/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Pick date' }))
    })
    expect(mockSetDatesMutate).toHaveBeenCalledOnce()
    expect(mockSetDatesMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        startDate: expect.any(Date),
        dueDate: null,
      }),
    )
  })

  it('calls setDates.mutate with null startDate when date is cleared', async () => {
    render(
      <Wrapper>
        <DateField
          kind="start"
          taskId="task-1"
          planId="plan-1"
          task={makeTask({ startDate: START_DATE })}
        />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Start date/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    })
    expect(mockSetDatesMutate).toHaveBeenCalledWith(expect.objectContaining({ startDate: null }))
  })

  it('closes picker on outside click', async () => {
    render(
      <Wrapper>
        <DateField kind="start" taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Start date/i }))
    fireEvent.mouseDown(document.body)
    expect(screen.queryByTestId('date-picker')).toBeNull()
  })
})

describe('DateField (due)', () => {
  it('renders due-date-field', () => {
    render(
      <Wrapper>
        <DateField kind="due" taskId="task-1" planId="plan-1" task={makeTask()} />
      </Wrapper>,
    )
    expect(screen.getByTestId('due-date-field')).toBeDefined()
  })

  it('calls setDates.mutate with correct dueDate, preserving startDate', async () => {
    render(
      <Wrapper>
        <DateField
          kind="due"
          taskId="task-1"
          planId="plan-1"
          task={makeTask({ startDate: START_DATE, dueDate: DUE_DATE })}
        />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Due date/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Pick date' }))
    })
    expect(mockSetDatesMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        dueDate: expect.any(Date),
        startDate: START_DATE,
      }),
    )
  })
})
