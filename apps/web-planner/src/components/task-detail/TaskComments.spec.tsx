import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskComments } from './TaskComments'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const mockListQuery = vi.fn()
const mockPostMutate = vi.fn()
const mockDeleteMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      comments: {
        list: { query: (...args: unknown[]) => mockListQuery(...args) },
        post: { mutate: (...args: unknown[]) => mockPostMutate(...args) },
        delete: { mutate: (...args: unknown[]) => mockDeleteMutate(...args) },
      },
    },
  },
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

interface CommentItem {
  id: string
  authorActorId: string
  authorName?: string
  body: string
  createdAt: Date
  deletedAt: Date | null
  deleted: boolean
}

function makeComment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    id: 'comment-1',
    authorActorId: 'actor-1',
    authorName: 'Alice',
    body: 'Hello world',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    deleted: false,
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
  mockPostMutate.mockResolvedValue(undefined)
  mockDeleteMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('TaskComments', () => {
  it('renders empty state when no comments', async () => {
    mockListQuery.mockResolvedValue({ items: [], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskComments taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByPlaceholderText(/Add a comment/i)).toBeDefined()
    expect(screen.queryByTestId('comment-item')).toBeNull()
  })

  it('renders non-deleted comment with author name and body', async () => {
    const comment = makeComment({ id: 'c1', authorName: 'Alice', body: 'Hello world' })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskComments taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Hello world')).toBeDefined()
  })

  it('renders deleted comment as tombstone', async () => {
    const comment = makeComment({
      id: 'c2',
      deleted: true,
      deletedAt: new Date('2026-01-02T00:00:00Z'),
      body: 'Should not appear',
    })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskComments taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByText('Comment deleted')).toBeDefined()
    expect(screen.queryByText('Should not appear')).toBeNull()
  })

  it('posts comment on Enter keypress and shows optimistic comment', async () => {
    mockListQuery.mockResolvedValue({ items: [], nextCursor: null })

    let resolvePost!: () => void
    mockPostMutate.mockReturnValue(
      new Promise<void>((r) => {
        resolvePost = r
      }),
    )

    await act(async () => {
      render(
        <Wrapper>
          <TaskComments taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    const textarea = screen.getByPlaceholderText(/Add a comment/i)
    await act(async () => {
      await userEvent.type(textarea, 'My new comment')
    })
    await act(async () => {
      await userEvent.keyboard('{Enter}')
    })

    expect(mockPostMutate).toHaveBeenCalledOnce()
    expect(mockPostMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        body: 'My new comment',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )
    expect(screen.getByText('My new comment')).toBeDefined()

    resolvePost()
  })

  it('opens delete menu on own comment and calls delete.mutate, shows tombstone optimistically', async () => {
    const comment = makeComment({ id: 'c3', authorActorId: 'actor-1', body: 'Delete me' })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })

    let resolveDelete!: () => void
    mockDeleteMutate.mockReturnValue(
      new Promise<void>((r) => {
        resolveDelete = r
      }),
    )

    await act(async () => {
      render(
        <Wrapper>
          <TaskComments taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    const menuBtn = screen.getByRole('button', { name: /comment options/i })
    await act(async () => {
      await userEvent.click(menuBtn)
    })

    const deleteItem = screen.getByRole('menuitem', { name: /Delete comment/i })
    await act(async () => {
      await userEvent.click(deleteItem)
    })

    expect(mockDeleteMutate).toHaveBeenCalledOnce()
    expect(mockDeleteMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        commentId: 'c3',
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )
    expect(screen.getByText('Comment deleted')).toBeDefined()

    resolveDelete()
  })

  it('shows "Load more" button when nextCursor is non-null and hides when null', async () => {
    const comment = makeComment({ id: 'c4', body: 'Some comment' })
    mockListQuery.mockResolvedValueOnce({ items: [comment], nextCursor: 'cursor-abc' })

    await act(async () => {
      render(
        <Wrapper>
          <TaskComments taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByRole('button', { name: /load more/i })).toBeDefined()

    mockListQuery.mockResolvedValueOnce({ items: [], nextCursor: null })
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /load more/i }))
    })

    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
  })
})
