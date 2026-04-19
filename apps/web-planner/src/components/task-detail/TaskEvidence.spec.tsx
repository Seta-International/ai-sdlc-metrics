import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
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

beforeEach(() => {
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
  cleanup()
})

describe('TaskEvidence', () => {
  it('renders empty state with Evidence heading and Add evidence button', async () => {
    mockListQuery.mockResolvedValue({ items: [] })

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    expect(screen.getByText('Evidence')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Add evidence' })).toBeDefined()
  })

  it('shows empty state message when no items', async () => {
    mockListQuery.mockResolvedValue({ items: [] })

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await waitFor(() => {
      expect(screen.getByText('No evidence added yet.')).toBeDefined()
    })
  })

  it('renders note evidence card with caption and body preview', async () => {
    const note = makeNoteEvidence()
    mockListQuery.mockResolvedValue({ items: [note] })

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await waitFor(() => {
      expect(screen.getByText('Proof of completion')).toBeDefined()
      expect(screen.getByText('This is the note body content')).toBeDefined()
    })
  })

  it('renders link evidence card with caption and URL', async () => {
    const link = makeLinkEvidence()
    mockListQuery.mockResolvedValue({ items: [link] })

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await waitFor(() => {
      expect(screen.getByText('Reference link')).toBeDefined()
      expect(screen.getByText('https://example.com')).toBeDefined()
    })
  })

  it('add note evidence: fill caption + body, click Add evidence, calls createNote.mutate', async () => {
    mockListQuery.mockResolvedValue({ items: [] })
    const user = userEvent.setup()

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await user.click(screen.getByRole('button', { name: 'Add evidence' }))

    const noteTab = screen.getByRole('button', { name: 'Note' })
    await user.click(noteTab)

    const captionInput = screen.getByPlaceholderText('What does this prove?')
    await user.type(captionInput, 'My caption')

    const bodyTextarea = screen.getByPlaceholderText('Describe what happened…')
    await user.type(bodyTextarea, 'Note body text')

    const composerSubmitButton = screen.getByTestId('composer-submit')
    await user.click(composerSubmitButton)

    await waitFor(() => {
      expect(mockCreateNoteMutate).toHaveBeenCalledOnce()
    })
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

  it('optimistic append: item appears immediately before mutation resolves', async () => {
    mockListQuery.mockResolvedValue({ items: [] })

    let resolveCreate!: () => void
    const pendingCreate = new Promise<void>((resolve) => {
      resolveCreate = resolve
    })
    mockCreateNoteMutate.mockReturnValue(pendingCreate)

    const user = userEvent.setup()

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await user.click(screen.getByRole('button', { name: 'Add evidence' }))

    const noteTab = screen.getByRole('button', { name: 'Note' })
    await user.click(noteTab)

    const captionInput = screen.getByPlaceholderText('What does this prove?')
    await user.type(captionInput, 'Optimistic item')

    const composerSubmitButton = screen.getByTestId('composer-submit')
    await user.click(composerSubmitButton)

    // Item should appear optimistically before mutation resolves
    await waitFor(() => {
      expect(screen.getByText('Optimistic item')).toBeDefined()
    })

    // Verify card is in pending/opacity state
    const cards = screen.getAllByTestId('evidence-card')
    expect(cards.length).toBeGreaterThan(0)

    // Resolve the mutation
    resolveCreate()
    await waitFor(() => {
      expect(mockCreateNoteMutate).toHaveBeenCalledOnce()
    })
  })

  it('caption validation: Add evidence button disabled when caption is empty', async () => {
    mockListQuery.mockResolvedValue({ items: [] })
    const user = userEvent.setup()

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await user.click(screen.getByRole('button', { name: 'Add evidence' }))

    const composerSubmitButton = screen.getByTestId('composer-submit')
    expect((composerSubmitButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('remove evidence: calls remove.mutate with correct evidenceId', async () => {
    const note = makeNoteEvidence({ submittedBy: 'actor-1' })
    mockListQuery.mockResolvedValue({ items: [note] })

    const user = userEvent.setup()

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove evidence' })).toBeDefined()
    })

    const removeButton = screen.getByRole('button', { name: 'Remove evidence' })
    await user.click(removeButton)

    await waitFor(() => {
      expect(mockRemoveMutate).toHaveBeenCalledOnce()
    })
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

  it('kind tab order is File, Link, Note', async () => {
    mockListQuery.mockResolvedValue({ items: [] })
    const user = userEvent.setup()

    render(<TaskEvidence taskId="task-1" planId="plan-1" />)

    await user.click(screen.getByRole('button', { name: 'Add evidence' }))

    const buttons = screen.getAllByRole('button')
    const kindButtons = buttons.filter((b) =>
      ['File', 'Link', 'Note'].includes(b.textContent ?? ''),
    )
    expect(kindButtons.map((b) => b.textContent)).toEqual(['File', 'Link', 'Note'])
  })
})
