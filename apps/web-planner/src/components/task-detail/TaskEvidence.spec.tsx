import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskEvidence } from './TaskEvidence'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1', displayName: 'Test User' }),
}))

const mockListQuery = vi.fn()
const mockCreateNoteMutate = vi.fn()
const mockCreateLinkMutate = vi.fn()
const mockRemoveMutate = vi.fn()
const mockRequestUploadMutate = vi.fn()
const mockFinalizeUploadMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      evidence: {
        list: { query: (...args: unknown[]) => mockListQuery(...args) },
        createNote: { mutate: (...args: unknown[]) => mockCreateNoteMutate(...args) },
        createLink: { mutate: (...args: unknown[]) => mockCreateLinkMutate(...args) },
        remove: { mutate: (...args: unknown[]) => mockRemoveMutate(...args) },
        requestUpload: { mutate: (...args: unknown[]) => mockRequestUploadMutate(...args) },
        finalizeUpload: { mutate: (...args: unknown[]) => mockFinalizeUploadMutate(...args) },
      },
    },
  },
}))

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeNoteEvidence(overrides = {}) {
  return {
    id: 'ev-1',
    kind: 'note' as const,
    caption: 'Proof of completion',
    body: 'This is the note body content',
    submittedBy: 'actor-1',
    submittedAt: BASE_DATE,
    ...overrides,
  }
}

function makeLinkEvidence(overrides = {}) {
  return {
    id: 'ev-2',
    kind: 'link' as const,
    caption: 'Reference link',
    url: 'https://example.com',
    submittedBy: 'actor-2',
    submittedAt: BASE_DATE,
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
  mockListQuery.mockResolvedValue({ items: [] })
  mockCreateNoteMutate.mockResolvedValue(undefined)
  mockCreateLinkMutate.mockResolvedValue(undefined)
  mockRemoveMutate.mockResolvedValue(undefined)
  mockRequestUploadMutate.mockResolvedValue({
    uploadUrl: 'https://s3.example.com/upload',
    storageKey: 'key-123',
    expiresAt: new Date(),
  })
  mockFinalizeUploadMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('TaskEvidence', () => {
  it('renders empty state with Evidence heading and Add evidence button', async () => {
    mockListQuery.mockResolvedValue({ items: [] })

    render(
      <Wrapper>
        <TaskEvidence taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('Evidence')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Add evidence' })).toBeDefined()
  })

  it('renders note evidence card with caption and body preview', async () => {
    const note = makeNoteEvidence()
    mockListQuery.mockResolvedValue({ items: [note] })

    render(
      <Wrapper>
        <TaskEvidence taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('Proof of completion')).toBeDefined()
    expect(screen.getByText('This is the note body content')).toBeDefined()
  })

  it('renders link evidence card with caption and URL', async () => {
    const link = makeLinkEvidence()
    mockListQuery.mockResolvedValue({ items: [link] })

    render(
      <Wrapper>
        <TaskEvidence taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText('Reference link')).toBeDefined()
    expect(screen.getByText('https://example.com')).toBeDefined()
  })

  it('add note evidence: fill caption + body, click Add evidence, calls createNote.mutate', async () => {
    mockListQuery.mockResolvedValue({ items: [] })
    const user = userEvent.setup()

    render(
      <Wrapper>
        <TaskEvidence taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Add evidence' }))
    })

    const noteTab = screen.getByRole('button', { name: 'Note' })
    await act(async () => {
      await user.click(noteTab)
    })

    const captionInput = screen.getByPlaceholderText('What does this prove?')
    await act(async () => {
      await user.type(captionInput, 'My caption')
    })

    const bodyTextarea = screen.getByPlaceholderText('Describe what happened…')
    await act(async () => {
      await user.type(bodyTextarea, 'Note body text')
    })

    const allAddButtons = screen.getAllByRole('button', { name: 'Add evidence' })
    const composerSubmitButton = allAddButtons[allAddButtons.length - 1]!
    await act(async () => {
      await user.click(composerSubmitButton)
    })

    expect(mockCreateNoteMutate).toHaveBeenCalledOnce()
    expect(mockCreateNoteMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        caption: 'My caption',
        body: 'Note body text',
      }),
    )
  })

  it('caption validation: Add evidence button disabled when caption is empty', async () => {
    mockListQuery.mockResolvedValue({ items: [] })
    const user = userEvent.setup()

    render(
      <Wrapper>
        <TaskEvidence taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Add evidence' }))
    })

    const submitButtons = screen.getAllByRole('button', { name: 'Add evidence' })
    const composerSubmitButton = submitButtons.find((btn) => (btn as HTMLButtonElement).disabled)
    expect(composerSubmitButton).toBeDefined()
    expect((composerSubmitButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('remove evidence: calls remove.mutate with correct evidenceId', async () => {
    const note = makeNoteEvidence({ submittedBy: 'actor-1' })
    mockListQuery.mockResolvedValue({ items: [note] })

    const user = userEvent.setup()

    render(
      <Wrapper>
        <TaskEvidence taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    await act(async () => {
      await Promise.resolve()
    })

    const removeButton = screen.getByRole('button', { name: 'Remove evidence' })
    await act(async () => {
      await user.click(removeButton)
    })

    expect(mockRemoveMutate).toHaveBeenCalledOnce()
    expect(mockRemoveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        evidenceId: 'ev-1',
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )
  })
})
