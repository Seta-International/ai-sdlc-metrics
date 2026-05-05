import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { TaskChatTab } from './TaskChatTab'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1', displayName: 'Alice' }),
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

interface CommentItem {
  id: string
  authorActorId: string
  authorName?: string
  body: string
  createdAt: Date
  deleted: boolean
}

function makeComment(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    id: 'comment-1',
    authorActorId: 'actor-1',
    authorName: 'Alice',
    body: 'Hello world',
    createdAt: new Date('2026-01-01T00:00:00Z'),
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

describe('TaskChatTab', () => {
  it('renders the chat section container', async () => {
    mockListQuery.mockResolvedValue({ items: [], nextCursor: null })
    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })
    expect(screen.getByTestId('chat-section')).toBeDefined()
  })

  it('renders non-deleted comment with author name and body', async () => {
    const comment = makeComment({ id: 'c1', authorName: 'Alice', body: 'Hello world' })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Hello world')).toBeDefined()
  })

  it('renders deleted comment as tombstone', async () => {
    const comment = makeComment({ id: 'c2', deleted: true, body: 'Should not appear' })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByText('Comment deleted')).toBeDefined()
    expect(screen.queryByText('Should not appear')).toBeNull()
  })

  it('shows "Load more" button when nextCursor is non-null', async () => {
    const comment = makeComment({ id: 'c4', body: 'Some comment' })
    mockListQuery.mockResolvedValueOnce({ items: [comment], nextCursor: 'cursor-abc' })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByRole('button', { name: /load more/i })).toBeDefined()
  })

  it('hides "Load more" button when nextCursor is null', async () => {
    mockListQuery.mockResolvedValue({ items: [], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
  })

  it('shows delete option for own comment via dropdown', async () => {
    const comment = makeComment({ id: 'c3', authorActorId: 'actor-1', body: 'My comment' })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })
    mockDeleteMutate.mockResolvedValue(undefined)

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
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
  })

  it('shows tombstone optimistically after delete', async () => {
    const comment = makeComment({ id: 'c5', authorActorId: 'actor-1', body: 'Delete me' })
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
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    const menuBtn = screen.getByRole('button', { name: /comment options/i })
    await act(async () => {
      await userEvent.click(menuBtn)
    })
    await act(async () => {
      await userEvent.click(screen.getByRole('menuitem', { name: /Delete comment/i }))
    })

    expect(screen.getByText('Comment deleted')).toBeDefined()

    resolveDelete()
  })

  it("does not show delete option for other users' comments", async () => {
    const comment = makeComment({
      id: 'c6',
      authorActorId: 'other-actor',
      body: 'Not mine',
    })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.queryByRole('button', { name: /comment options/i })).toBeNull()
  })

  it('renders the chat composer', async () => {
    mockListQuery.mockResolvedValue({ items: [], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByTestId('chat-composer')).toBeDefined()
  })

  it('loads more comments and appends when load-more is clicked', async () => {
    const comment1 = makeComment({ id: 'c1', body: 'First comment' })
    const comment2 = makeComment({ id: 'c2', body: 'Second comment' })
    mockListQuery
      .mockResolvedValueOnce({ items: [comment1], nextCursor: 'cursor-abc' })
      .mockResolvedValueOnce({ items: [comment2], nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByText('First comment')).toBeDefined()

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /load more/i }))
    })

    expect(screen.getByText('Second comment')).toBeDefined()
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull()
  })

  it('reverts deleted comment if delete mutation fails', async () => {
    const comment = makeComment({ id: 'c7', authorActorId: 'actor-1', body: 'Revert me' })
    mockListQuery.mockResolvedValue({ items: [comment], nextCursor: null })
    mockDeleteMutate.mockRejectedValue(new Error('Network error'))

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    const menuBtn = screen.getByRole('button', { name: /comment options/i })
    await act(async () => {
      await userEvent.click(menuBtn)
    })
    await act(async () => {
      await userEvent.click(screen.getByRole('menuitem', { name: /Delete comment/i }))
    })

    expect(screen.getByText('Revert me')).toBeDefined()
  })

  it('renders multiple comments sorted by received order', async () => {
    const comments = [
      makeComment({ id: 'c1', authorName: 'Alice', body: 'First' }),
      makeComment({ id: 'c2', authorName: 'Bob', body: 'Second' }),
      makeComment({ id: 'c3', authorName: 'Carol', body: 'Third' }),
    ]
    mockListQuery.mockResolvedValue({ items: comments, nextCursor: null })

    await act(async () => {
      render(
        <Wrapper>
          <TaskChatTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    const items = screen.getAllByTestId('comment-item')
    expect(items).toHaveLength(3)
  })
})
