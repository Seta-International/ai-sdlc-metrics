import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@future/api-client'
import { TaskFilesTab } from './TaskFilesTab'
import type { AttachmentSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1', displayName: 'Test User' }),
}))

const mockAddLinkMutate = vi.fn()
const mockRemoveMutate = vi.fn()
const mockEvidenceListQuery = vi.fn()
const mockCreateNoteMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      attachments: {
        requestUpload: { mutate: vi.fn() },
        finalizeUpload: { mutate: vi.fn() },
        addLink: { mutate: (...args: unknown[]) => mockAddLinkMutate(...args) },
        setCover: { mutate: vi.fn() },
        remove: { mutate: (...args: unknown[]) => mockRemoveMutate(...args) },
      },
      evidence: {
        list: { query: (...args: unknown[]) => mockEvidenceListQuery(...args) },
        createNote: { mutate: (...args: unknown[]) => mockCreateNoteMutate(...args) },
        createLink: { mutate: vi.fn() },
        requestUpload: { mutate: vi.fn() },
        finalizeUpload: { mutate: vi.fn() },
        remove: { mutate: vi.fn() },
      },
    },
  },
}))

vi.mock('@/lib/hooks/useUpload', () => ({
  useUpload: () => ({ uploadState: {}, uploadFile: vi.fn() }),
}))

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeAttachment(overrides: Partial<AttachmentSnapshot> = {}): AttachmentSnapshot {
  return {
    id: 'att-1',
    kind: 'file',
    filename: 'report.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1024,
    url: 'https://example.com/report.pdf',
    createdBy: 'actor-1',
    createdAt: BASE_DATE,
    msSyncState: 'synced',
    ...overrides,
  } as AttachmentSnapshot
}

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
    customFields: [],
    ...overrides,
  }
}

let queryClient: QueryClient
const QUERY_KEY = ['tasks.getDetail', 'task-1', 'actor-1', 'tenant-1'] as const

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  mockEvidenceListQuery.mockResolvedValue({ items: [], nextCursor: null })
  mockAddLinkMutate.mockResolvedValue(undefined)
  mockRemoveMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('TaskFilesTab', () => {
  it('renders attachments section', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())
    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })
    expect(screen.getByTestId('attachments-section')).toBeDefined()
  })

  it('renders evidence section', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())
    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })
    expect(screen.getByTestId('evidence-section')).toBeDefined()
  })

  it('shows attachment rows for each attachment in the task', async () => {
    const att1 = makeAttachment({ id: 'att-1', filename: 'doc.pdf' })
    const att2 = makeAttachment({ id: 'att-2', filename: 'image.png' })
    queryClient.setQueryData(QUERY_KEY, makeTask({ attachments: [att1, att2] }))

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByTestId('attachment-row-att-1')).toBeDefined()
    expect(screen.getByTestId('attachment-row-att-2')).toBeDefined()
  })

  it('shows no attachment rows when task has no attachments', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask({ attachments: [] }))

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.queryByTestId('attachment-row-att-1')).toBeNull()
  })

  it('shows link form when attach-link button is clicked', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('attach-link-btn'))
    })

    expect(screen.getByTestId('link-url-input')).toBeDefined()
  })

  it('calls addLink.mutate when URL is entered and form submitted', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('attach-link-btn'))
    })
    await act(async () => {
      await userEvent.type(screen.getByTestId('link-url-input'), 'https://example.com')
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('add-link-submit'))
    })

    expect(mockAddLinkMutate).toHaveBeenCalledOnce()
    expect(mockAddLinkMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com',
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )
  })

  it('shows evidence add button', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByTestId('add-evidence-btn')).toBeDefined()
  })

  it('shows evidence composer when add-evidence-btn is clicked', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('add-evidence-btn'))
    })

    expect(screen.getByTestId('evidence-kind-file')).toBeDefined()
    expect(screen.getByTestId('evidence-kind-link')).toBeDefined()
    expect(screen.getByTestId('evidence-kind-note')).toBeDefined()
  })

  it('switches active evidence kind when kind button is clicked', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())
    mockCreateNoteMutate.mockResolvedValue(undefined)

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('add-evidence-btn'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('evidence-kind-note'))
    })

    expect(screen.getByTestId('composer-submit')).toBeDefined()
  })

  it('calls createNote.mutate when note form is submitted', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())
    mockCreateNoteMutate.mockResolvedValue(undefined)

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    await act(async () => {
      await userEvent.click(screen.getByTestId('add-evidence-btn'))
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('evidence-kind-note'))
    })

    const captionInput = screen.getByPlaceholderText(/What does this prove/i)
    await act(async () => {
      await userEvent.type(captionInput, 'Test observation')
    })
    await act(async () => {
      await userEvent.click(screen.getByTestId('composer-submit'))
    })

    expect(mockCreateNoteMutate).toHaveBeenCalledOnce()
    expect(mockCreateNoteMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
        caption: 'Test observation',
      }),
    )
  })

  it('shows evidence items returned by list query', async () => {
    queryClient.setQueryData(QUERY_KEY, makeTask())
    mockEvidenceListQuery.mockResolvedValue({
      items: [
        {
          id: 'ev-1',
          kind: 'note',
          caption: 'An observation',
          submittedBy: 'actor-1',
          submittedAt: new Date('2026-01-01T00:00:00Z'),
        },
      ],
    })

    await act(async () => {
      render(
        <Wrapper>
          <TaskFilesTab taskId="task-1" planId="plan-1" />
        </Wrapper>,
      )
    })

    expect(screen.getByTestId('evidence-card')).toBeDefined()
    expect(screen.getByText('An observation')).toBeDefined()
  })
})
