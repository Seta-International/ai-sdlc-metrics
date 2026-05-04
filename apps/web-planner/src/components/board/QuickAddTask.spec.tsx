import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@future/api-client'
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

let _queryClientRef = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: _queryClientRef }, children)
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
  _queryClientRef = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

describe('QuickAddTask', () => {
  it('renders Add task button initially', () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
    expect(screen.getByRole('button', { name: /add task/i })).toBeDefined()
  })

  it('opens input on button click', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    expect(screen.getByTestId('quick-add-task-input')).toBeDefined()
  })

  it('closes on Escape', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('quick-add-task-input')).toBeNull()
  })

  it('creates task on Enter and keeps input open for rapid entry', async () => {
    mockCreate.mockResolvedValue(undefined)
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })

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
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(screen.getByTestId('quick-add-task-due-date')).toBeDefined()
  })

  it('shows character counter at 240+ characters', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    // Set value directly — avoids per-keystroke overhead that times out at 240 chars
    const longTitle = 'a'.repeat(240)
    fireEvent.change(input, { target: { value: longTitle } })

    // Counter should be visible
    expect(screen.getByText('240/255')).toBeDefined()
  })

  it('does NOT show counter below 240 characters', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    await userEvent.type(input, 'Short title')

    expect(screen.queryByText(/\/255/)).toBeNull()
  })

  it('does not create task when title is empty', async () => {
    render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
    await userEvent.click(screen.getByRole('button', { name: /add task/i }))
    const input = screen.getByTestId('quick-add-task-input')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockCreate).not.toHaveBeenCalled()
  })

  describe('controlled open prop', () => {
    it('is open when open=true is passed', () => {
      render(<QuickAddTask {...PROPS} open={true} onOpenChange={vi.fn()} />, { wrapper: Wrapper })
      expect(screen.getByTestId('quick-add-task-form')).toBeDefined()
    })

    it('is closed when open=false is passed', () => {
      render(<QuickAddTask {...PROPS} open={false} onOpenChange={vi.fn()} />, { wrapper: Wrapper })
      expect(screen.queryByTestId('quick-add-task-form')).toBeNull()
    })

    it('calls onOpenChange(true) when closed button is clicked', async () => {
      const onOpenChange = vi.fn()
      render(<QuickAddTask {...PROPS} open={false} onOpenChange={onOpenChange} />, {
        wrapper: Wrapper,
      })
      await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
      expect(onOpenChange).toHaveBeenCalledWith(true)
    })
  })

  describe('closed-state button style', () => {
    it('renders a full-width button with dashed border style', () => {
      render(<QuickAddTask {...PROPS} />, { wrapper: Wrapper })
      const btn = screen.getByRole('button', { name: 'Add task' })
      const style = btn.style
      expect(style.borderStyle).toBe('dashed')
      expect(style.width).toBe('100%')
    })
  })
})
