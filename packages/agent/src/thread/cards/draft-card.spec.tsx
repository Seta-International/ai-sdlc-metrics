// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftPartArgs } from '../../runtime/agent-message-parts'
import { DraftCard } from './draft-card'

const mockUseDraftRow = vi.fn()
const mockUseCanApproveDrafts = vi.fn(() => true)
const mockUseMutation = vi.fn()
const approveMutateAsync = vi.fn(() => Promise.resolve())
const rejectMutateAsync = vi.fn(() => Promise.resolve())

vi.mock('../../hooks/use-draft-row', () => ({
  useDraftRow: (...args: unknown[]) => mockUseDraftRow(...args),
}))

vi.mock('../../hooks/use-can-approve-drafts', () => ({
  useCanApproveDrafts: () => mockUseCanApproveDrafts(),
}))

vi.mock('@future/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@future/api-client')>()
  return {
    ...actual,
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
  }
})

vi.mock('../../lib/trpc', () => ({
  trpc: {
    agents: {
      draftApproval: {
        approve: { mutate: vi.fn() },
        reject: { mutate: vi.fn() },
      },
    },
  },
}))

const baseArgs: DraftPartArgs = {
  actionId: 'a1',
  summary: 'Approve Jane Doe leave',
  tier: 'high',
  requiresApproval: true,
  provenance: { sub_agent_domain: 'people', trace_id: 't1' },
}

const defaultRow = {
  id: 'a1',
  traceId: 't1',
  flowId: 'f1',
  toolName: 'people.approve_leave',
  args: { person_id: 'p1', dates: '2026-04-15..2026-04-19' },
  tier: 'high_risk_approval_required',
  status: 'pending',
  taintAtDraftTime: false,
  draftedAt: new Date('2026-04-29T12:00:00Z'),
  expiresAt: new Date('2026-05-02T12:00:00Z'),
  approvedAt: null,
  executedAt: null,
  executionOutcome: null,
  executionOutcomeNote: null,
  approverUserId: null,
  initiatorUserId: 'u1',
  onBehalfOf: null,
  viaDelegationId: 'd1',
  viaScheduleId: null,
  expectedOutputShape: null,
  permissionEnvelopeAtDraftTime: {},
  approvalFreshness: 'revalidate',
  approvalTtl: '72 hours',
  provenance: {
    triggered_by: 'user:u1',
    user_utterance: 'approve leave',
    drafted_at: new Date('2026-04-29T12:00:00Z'),
    derived_from_tainted_sources: [],
  },
}

describe('DraftCard', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    let mutationCall = 0

    approveMutateAsync.mockClear()
    rejectMutateAsync.mockClear()
    mockUseDraftRow.mockReset()
    mockUseCanApproveDrafts.mockReset()
    mockUseMutation.mockReset()
    mockUseCanApproveDrafts.mockReturnValue(true)
    mockUseDraftRow.mockReturnValue({ data: defaultRow, isLoading: false })
    mockUseMutation.mockImplementation(() => {
      mutationCall += 1
      return mutationCall % 2 === 1
        ? { mutateAsync: approveMutateAsync, isPending: false }
        : { mutateAsync: rejectMutateAsync, isPending: false }
    })
  })

  it('shows summary, tool name, and tier', () => {
    render(<DraftCard {...baseArgs} />)

    expect(screen.getByText(/Approve Jane Doe leave/)).toBeTruthy()
    expect(screen.getAllByText('people.approve_leave')).toHaveLength(2)
    expect(screen.getByText('high_risk_approval_required')).toBeTruthy()
  })

  it('shows approve and reject buttons when actor has permission', () => {
    render(<DraftCard {...baseArgs} />)

    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reject/ })).toBeTruthy()
  })

  it('shows Sent for approval when actor lacks permission', () => {
    mockUseCanApproveDrafts.mockReturnValue(false)

    render(<DraftCard {...baseArgs} />)

    expect(screen.getByText(/Sent for approval/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  it('hides buttons when status is approved', () => {
    mockUseDraftRow.mockReturnValue({
      data: { ...defaultRow, status: 'approved', approvedAt: new Date('2026-04-29T13:00:00Z') },
      isLoading: false,
    })

    render(<DraftCard {...baseArgs} />)

    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    expect(screen.getAllByText(/approved/i)).toHaveLength(2)
  })

  it('renders tainted warning when taintAtDraftTime is true', () => {
    mockUseDraftRow.mockReturnValue({
      data: { ...defaultRow, taintAtDraftTime: true },
      isLoading: false,
    })

    render(<DraftCard {...baseArgs} />)

    expect(screen.getByText(/tainted at draft time/i)).toBeTruthy()
  })

  it('approve calls the approve mutation with draftId', async () => {
    render(<DraftCard {...baseArgs} />)

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(approveMutateAsync).toHaveBeenCalledWith({ draftId: 'a1' }))
  })

  it('reject opens the picker and sends the chosen reason', async () => {
    render(<DraftCard {...baseArgs} />)

    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    fireEvent.click(screen.getByLabelText('not needed'))
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))

    await waitFor(() =>
      expect(rejectMutateAsync).toHaveBeenCalledWith({ draftId: 'a1', reason: 'not_needed' }),
    )
  })

  it('reject other_with_note sends the note', async () => {
    render(<DraftCard {...baseArgs} />)

    fireEvent.click(screen.getByRole('button', { name: /Reject/ }))
    fireEvent.click(screen.getByLabelText('other (with note)'))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'see ticket' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reject draft' }))

    await waitFor(() =>
      expect(rejectMutateAsync).toHaveBeenCalledWith({
        draftId: 'a1',
        reason: 'other_with_note',
        note: 'see ticket',
      }),
    )
  })
})
