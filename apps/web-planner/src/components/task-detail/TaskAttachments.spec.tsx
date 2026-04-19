import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskAttachments } from './TaskAttachments'
import type { AttachmentSnapshot, TaskDetailSnapshot } from '@/lib/board-types'

vi.mock('@future/auth', () => ({
  useSession: () => ({ actorId: 'actor-1', tenantId: 'tenant-1' }),
}))

const mockRequestUploadMutate = vi.fn()
const mockFinalizeUploadMutate = vi.fn()
const mockAddLinkMutate = vi.fn()
const mockSetCoverMutate = vi.fn()
const mockRemoveMutate = vi.fn()

vi.mock('@/lib/trpc', () => ({
  trpc: {
    planner: {
      attachments: {
        requestUpload: { mutate: (...args: unknown[]) => mockRequestUploadMutate(...args) },
        finalizeUpload: { mutate: (...args: unknown[]) => mockFinalizeUploadMutate(...args) },
        addLink: { mutate: (...args: unknown[]) => mockAddLinkMutate(...args) },
        setCover: { mutate: (...args: unknown[]) => mockSetCoverMutate(...args) },
        remove: { mutate: (...args: unknown[]) => mockRemoveMutate(...args) },
      },
    },
  },
}))

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeAttachment(overrides: Partial<AttachmentSnapshot> = {}): AttachmentSnapshot {
  return {
    id: 'att-1',
    kind: 'file',
    filename: 'report.pdf',
    contentType: 'application/pdf',
    sizeBytes: 102400,
    url: 'https://example.com/presigned/report.pdf',
    createdBy: 'actor-1',
    createdAt: BASE_DATE,
    ...overrides,
  }
}

function makeTask(overrides: Partial<TaskDetailSnapshot> = {}): TaskDetailSnapshot {
  return {
    id: 'task-1',
    planId: 'plan-1',
    title: 'Task title',
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
    ...overrides,
  }
}

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const QUERY_KEY = ['tasks.getDetail', 'task-1', 'actor-1', 'tenant-1'] as const

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  mockRequestUploadMutate.mockResolvedValue({
    uploadUrl: 'https://s3.example.com/upload',
    storageKey: 'tenants/t1/tasks/task-1/file.pdf',
    expiresAt: new Date(),
  })
  mockFinalizeUploadMutate.mockResolvedValue(undefined)
  mockAddLinkMutate.mockResolvedValue(undefined)
  mockSetCoverMutate.mockResolvedValue(undefined)
  mockRemoveMutate.mockResolvedValue(undefined)
})

afterEach(() => {
  queryClient.clear()
  cleanup()
})

describe('TaskAttachments', () => {
  it('renders empty state when no attachments', () => {
    const task = makeTask({ attachments: [] })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('Attachments')).toBeDefined()
    expect(screen.getByRole('button', { name: /attach file/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /attach link/i })).toBeDefined()
  })

  it('renders file attachment with filename and formatted size', () => {
    const att = makeAttachment({
      id: 'att-1',
      kind: 'file',
      filename: 'report.pdf',
      sizeBytes: 102400,
    })
    const task = makeTask({ attachments: [att] })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('report.pdf')).toBeDefined()
    expect(screen.getByText(/100\.0 KB/)).toBeDefined()
  })

  it('renders link attachment with linkTitle', () => {
    const att = makeAttachment({
      id: 'att-2',
      kind: 'link',
      filename: undefined,
      contentType: undefined,
      sizeBytes: undefined,
      url: 'https://example.com',
      linkTitle: 'Example Site',
    })
    const task = makeTask({ attachments: [att] })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('Example Site')).toBeDefined()
  })

  it('renders link attachment url when no linkTitle', () => {
    const att = makeAttachment({
      id: 'att-3',
      kind: 'link',
      filename: undefined,
      contentType: undefined,
      sizeBytes: undefined,
      url: 'https://example.com/page',
      linkTitle: undefined,
    })
    const task = makeTask({ attachments: [att] })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('https://example.com/page')).toBeDefined()
  })

  it('attach link: fills URL and submits, calls addLink.mutate', async () => {
    const task = makeTask({ attachments: [] })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /attach link/i }))
    })

    const urlInput = screen.getByPlaceholderText('https://...')
    await act(async () => {
      await userEvent.type(urlInput, 'https://example.com')
    })

    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /save/i }))
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

  it('remove: calls remove.mutate with correct attachmentId', async () => {
    const att = makeAttachment({ id: 'att-1', kind: 'file', filename: 'doc.pdf' })
    const task = makeTask({ attachments: [att] })
    queryClient.setQueryData(QUERY_KEY, task)

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    const removeBtn = screen.getByRole('button', { name: /remove att-1/i })
    await act(async () => {
      await userEvent.click(removeBtn)
    })

    expect(mockRemoveMutate).toHaveBeenCalledOnce()
    expect(mockRemoveMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentId: 'att-1',
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )
  })
})
