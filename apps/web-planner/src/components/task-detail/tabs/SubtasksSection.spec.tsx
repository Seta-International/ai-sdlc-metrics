import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SubtasksSection } from './SubtasksSection'

const mockCreate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      subtasks: {
        list: {
          query: vi
            .fn()
            .mockResolvedValue({ subtasks: [{ id: 'sub-1', title: 'Child Task', progress: 0 }] }),
        },
        create: { mutate: vi.fn() },
      },
    },
  },
}))

vi.mock('@future/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/api-client')>()
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({
      data: { subtasks: [{ id: 'sub-1', title: 'Child Task', progress: 0 }] },
      isLoading: false,
    }),
    useQueryClient: vi.fn().mockReturnValue({ invalidateQueries: vi.fn() }),
  }
})

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

import { trpc } from '@/lib/trpc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreateMutate = (trpc.planner as any).subtasks.create.mutate as ReturnType<typeof vi.fn>

describe('SubtasksSection', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    mockCreateMutate.mockReset()
    mockCreateMutate.mockResolvedValue(undefined)
  })

  it('renders existing subtasks from query', () => {
    render(<SubtasksSection taskId="task-1" planId="plan-1" bucketId="bucket-1" />)
    expect(screen.getByText('Child Task')).toBeDefined()
  })

  it('creates subtask on Enter key in input', async () => {
    render(<SubtasksSection taskId="task-1" planId="plan-1" bucketId="bucket-1" />)
    const input = screen.getByTestId('new-subtask-input')
    fireEvent.change(input, { target: { value: 'New Subtask' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Wait for async mutation
    await vi.waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Subtask',
          parentTaskId: 'task-1',
          planId: 'plan-1',
          bucketId: 'bucket-1',
        }),
      )
    })
  })
})
