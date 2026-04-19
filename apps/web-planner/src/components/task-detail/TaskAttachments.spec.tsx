import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
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

// Mock useTaskDetail so TaskAttachments gets task data without a real query
let mockTask: TaskDetailSnapshot | null | undefined = null

vi.mock('@/lib/hooks/useTaskDetail', () => ({
  useTaskDetail: () => ({
    task: mockTask,
    isLoading: false,
    saving: false,
    lastError: null,
    conflict: null,
    update: vi.fn(),
    clearConflict: vi.fn(),
  }),
}))

const BASE_DATE = new Date('2026-01-01T00:00:00Z')

function makeFileAttachment(
  overrides: Partial<Extract<AttachmentSnapshot, { kind: 'file' }>> = {},
): AttachmentSnapshot {
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

function makeLinkAttachment(
  overrides: Partial<Extract<AttachmentSnapshot, { kind: 'link' }>> = {},
): AttachmentSnapshot {
  return {
    id: 'att-2',
    kind: 'link',
    url: 'https://example.com',
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

// Reusable XHR mock — resolves onload with status 200
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class XHRMock {
  static lastInstance: XHRMock | null = null
  upload = { onprogress: null as ((e: ProgressEvent) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  status = 200
  open = vi.fn()
  setRequestHeader = vi.fn()
  send = vi.fn().mockImplementation(() => {
    Promise.resolve().then(() => {
      if (this.onload) this.onload()
    })
  })
  constructor() {
    XHRMock.lastInstance = this
  }
}

let queryClient: QueryClient

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.clearAllMocks()
  mockTask = null
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
    mockTask = makeTask({ attachments: [] })

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
    const att = makeFileAttachment({ id: 'att-1', filename: 'report.pdf', sizeBytes: 102400 })
    mockTask = makeTask({ attachments: [att] })

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('report.pdf')).toBeDefined()
    expect(screen.getByText(/100\.0 KB/)).toBeDefined()
  })

  it('renders link attachment with linkTitle', () => {
    const att = makeLinkAttachment({
      id: 'att-2',
      url: 'https://example.com',
      linkTitle: 'Example Site',
    })
    mockTask = makeTask({ attachments: [att] })

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('Example Site')).toBeDefined()
  })

  it('renders link attachment url when no linkTitle', () => {
    const att = makeLinkAttachment({
      id: 'att-3',
      url: 'https://example.com/page',
    })
    mockTask = makeTask({ attachments: [att] })

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    expect(screen.getByText('https://example.com/page')).toBeDefined()
  })

  it('attach link: fills URL and submits, calls addLink.mutate', async () => {
    mockTask = makeTask({ attachments: [] })

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

  it('remove: opens dropdown and clicks Remove, calls remove.mutate', async () => {
    const att = makeFileAttachment({ id: 'att-1', filename: 'doc.pdf' })
    mockTask = makeTask({ attachments: [att] })

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    const optionsBtn = screen.getByRole('button', { name: /options for doc\.pdf/i })
    await act(async () => {
      await userEvent.click(optionsBtn)
    })

    const removeItem = await screen.findByText('Remove')
    await act(async () => {
      await userEvent.click(removeItem)
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

  it('upload flow: file input change calls requestUpload and finalizeUpload', async () => {
    mockTask = makeTask({ attachments: [] })

    const OriginalXHR = globalThis.XMLHttpRequest
    globalThis.XMLHttpRequest = XHRMock as unknown as typeof XMLHttpRequest

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    const fileInput = screen.getByLabelText('File upload input')
    const fakeFile = new File(['hello'], 'test.pdf', { type: 'application/pdf' })

    await act(async () => {
      await userEvent.upload(fileInput, fakeFile)
    })

    await waitFor(() => {
      expect(mockFinalizeUploadMutate).toHaveBeenCalledOnce()
    })

    expect(mockRequestUploadMutate).toHaveBeenCalledOnce()
    expect(mockRequestUploadMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'test.pdf',
        contentType: 'application/pdf',
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )

    expect(mockFinalizeUploadMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: 'tenants/t1/tasks/task-1/file.pdf',
        filename: 'test.pdf',
        contentType: 'application/pdf',
        taskId: 'task-1',
        planId: 'plan-1',
        actorId: 'actor-1',
        tenantId: 'tenant-1',
      }),
    )

    globalThis.XMLHttpRequest = OriginalXHR
  })

  it('upload flow: supports multiple file selection', async () => {
    mockTask = makeTask({ attachments: [] })

    const OriginalXHR = globalThis.XMLHttpRequest
    globalThis.XMLHttpRequest = XHRMock as unknown as typeof XMLHttpRequest

    render(
      <Wrapper>
        <TaskAttachments taskId="task-1" planId="plan-1" />
      </Wrapper>,
    )

    const fileInput = screen.getByLabelText('File upload input')
    const file1 = new File(['a'], 'a.pdf', { type: 'application/pdf' })
    const file2 = new File(['b'], 'b.pdf', { type: 'application/pdf' })

    await act(async () => {
      await userEvent.upload(fileInput, [file1, file2])
    })

    await waitFor(() => {
      expect(mockFinalizeUploadMutate).toHaveBeenCalledTimes(2)
    })

    expect(mockRequestUploadMutate).toHaveBeenCalledTimes(2)

    globalThis.XMLHttpRequest = OriginalXHR
  })
})
