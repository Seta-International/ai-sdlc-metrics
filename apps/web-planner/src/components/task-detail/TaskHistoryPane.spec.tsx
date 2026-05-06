import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'

// jsdom does not implement IntersectionObserver — stub it globally
// Must use `function` keyword so it can be used as a constructor
global.IntersectionObserver = vi.fn().mockImplementation(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }
}) as unknown as typeof IntersectionObserver

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        getHistory: {
          query: vi.fn().mockResolvedValue({
            items: [
              {
                id: 'h-1',
                field: 'priority',
                oldValue: 1,
                newValue: 3,
                actorId: 'a-1',
                changedAt: new Date('2026-05-01T10:00:00Z'),
              },
            ],
            nextCursor: null,
          }),
        },
      },
    },
  },
}))

vi.mock('@future/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/api-client')>()
  return {
    ...actual,
    useInfiniteQuery: vi.fn().mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: 'h-1',
                field: 'priority',
                oldValue: 1,
                newValue: 3,
                actorId: 'a-1',
                changedAt: new Date('2026-05-01T10:00:00Z'),
              },
            ],
            nextCursor: null,
          },
        ],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
    }),
  }
})

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

import { TaskHistoryPane } from './TaskHistoryPane'

describe('TaskHistoryPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders history items when isOpen=true', () => {
    render(
      <TaskHistoryPane
        taskId="task-1"
        planId="plan-1"
        tenantId="tenant-1"
        actorId="actor-1"
        isOpen={true}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/priority/i)).toBeDefined()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <TaskHistoryPane
        taskId="task-1"
        planId="plan-1"
        tenantId="tenant-1"
        actorId="actor-1"
        isOpen={true}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByTestId('history-close-btn'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when isOpen=false', () => {
    render(
      <TaskHistoryPane
        taskId="task-1"
        planId="plan-1"
        tenantId="tenant-1"
        actorId="actor-1"
        isOpen={false}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('history-close-btn')).toBeNull()
  })
})
