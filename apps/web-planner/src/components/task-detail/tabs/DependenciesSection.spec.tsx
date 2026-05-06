import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { DependenciesSection } from './DependenciesSection'

// Use vi.fn() directly in the factory — can't reference outer variables due to hoisting
vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      dependencies: {
        add: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
      },
      tasks: {
        getFlat: {
          query: vi.fn().mockResolvedValue([{ id: 'tx-1', title: 'Task X' }]),
        },
      },
    },
  },
}))

vi.mock('@future/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/api-client')>()
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: [{ id: 'tx-1', title: 'Task X' }] }),
  }
})

vi.mock('@future/auth', () => ({
  useSession: vi.fn(() => ({
    actorId: 'actor-1',
    tenantId: 'tenant-1',
  })),
}))

import { trpc } from '@/lib/trpc'

const mockAddMutate = vi.mocked(trpc.planner.dependencies.add.mutate)
const mockRemoveMutate = vi.mocked(trpc.planner.dependencies.remove.mutate)

describe('DependenciesSection', () => {
  const defaultProps = {
    taskId: 'task-1',
    planId: 'plan-1',
    tenantId: 'tenant-1',
    actorId: 'actor-1',
    predecessors: [{ taskId: 'pred-1', title: 'Predecessor Task', kind: 'finish_to_start' }],
    successors: [],
  }

  beforeEach(() => {
    mockAddMutate.mockReset()
    mockRemoveMutate.mockReset()
  })

  it('renders predecessor tasks', () => {
    render(<DependenciesSection {...defaultProps} />)
    expect(screen.getByText('Predecessor Task')).toBeInTheDocument()
  })

  it('renders remove button for each predecessor with correct test id', () => {
    render(<DependenciesSection {...defaultProps} />)
    expect(screen.getByTestId('remove-dep-pred-1')).toBeInTheDocument()
  })

  it('calls remove mutation when remove button is clicked', async () => {
    render(<DependenciesSection {...defaultProps} />)
    fireEvent.click(screen.getByTestId('remove-dep-pred-1'))
    await waitFor(() => {
      expect(mockRemoveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          fromTaskId: 'pred-1',
          toTaskId: 'task-1',
        }),
      )
    })
  })

  it('renders empty state when no dependencies exist', () => {
    render(<DependenciesSection {...defaultProps} predecessors={[]} successors={[]} />)
    expect(screen.getByText(/no dependencies/i)).toBeInTheDocument()
  })
})
