import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { QuickAddTask } from './QuickAddTask'

// Mock trpc
vi.mock('../../lib/trpc', () => ({
  trpc: {
    planner: {
      tasks: {
        create: {
          mutate: vi.fn(),
        },
      },
    },
  },
}))

// Mock @future/auth
vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

// Mock crypto.randomUUID
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'test-task-uuid' },
  writable: true,
})

import { trpc } from '../../lib/trpc'
const mockCreate = vi.mocked(
  (trpc.planner.tasks.create as { mutate: ReturnType<typeof vi.fn> }).mutate,
)

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children)
  }
}

const PROPS = {
  bucketId: 'bucket-1',
  planId: 'plan-1',
  actorId: 'actor-1',
  tenantId: 'tenant-1',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('QuickAddTask', () => {
  it('renders Add task button initially', () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })
    expect(screen.getByRole('button', { name: /add task/i })).toBeDefined()
  })

  it('opens input on button click', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    expect(screen.getByTestId('quick-add-task-input')).toBeDefined()
  })

  it('closes on Escape', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('quick-add-task-input')).toBeNull()
  })

  it('creates task on Enter and keeps input open for rapid entry', async () => {
    mockCreate.mockResolvedValue(undefined)
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })

    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input') as HTMLInputElement

    await userEvent.type(input, 'My new task')
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledOnce()
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: 'bucket-1',
        planId: 'plan-1',
        title: 'My new task',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )

    // Input stays open for rapid entry
    await waitFor(() => {
      expect(screen.getByTestId('quick-add-task-input')).toBeDefined()
    })
  })

  it('shows date field on Shift+Enter', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(screen.getByTestId('quick-add-task-due-date')).toBeDefined()
  })

  it('shows character counter at 240+ characters', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    // Type 240 characters
    const longTitle = 'a'.repeat(240)
    await userEvent.type(input, longTitle)

    // Counter should be visible
    expect(screen.getByText('240/255')).toBeDefined()
  })

  it('does NOT show counter below 240 characters', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    await userEvent.type(input, 'Short title')

    expect(screen.queryByText(/\/255/)).toBeNull()
  })

  it('does not create task when title is empty', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: createWrapper() })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockCreate).not.toHaveBeenCalled()
  })
})
