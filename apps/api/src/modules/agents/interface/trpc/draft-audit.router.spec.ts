/**
 * draft-audit.router.spec.ts — Plan 08 T7 draft audit tRPC router
 *
 * Unit tests: mocks IDraftRepository and verifies the router passes the correct
 * filter opts through. tenantId always comes from tRPC context (security boundary).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { draftAuditRouter, setDraftRepository } from './draft-audit.router'
import type { IDraftRepository } from '../../domain/repositories/draft.repository'
import type { Draft } from '../../application/services/draft-types'

const TENANT_A = '01900000-0000-7000-8000-000000000001'
const TENANT_B = '01900000-0000-7000-8000-000000000002'
const USER_ID = '01900000-0000-7000-8000-000000000010'
const APPROVER_ID = '01900000-0000-7000-8000-000000000020'
const DRAFT_ID = '01900000-0000-7000-8000-000000000099'

function makeCtx(tenantId = TENANT_A) {
  return {
    req: { headers: {} as Record<string, string | undefined> },
    tenantId,
    actorId: USER_ID,
  }
}

function makeDraft(overrides?: Partial<Draft>): Draft {
  return {
    id: DRAFT_ID,
    tenantId: TENANT_A,
    traceId: '01900000-0000-7000-8000-000000000030',
    flowId: '01900000-0000-7000-8000-000000000031',
    initiatorUserId: USER_ID,
    onBehalfOf: null,
    viaDelegationId: '01900000-0000-7000-8000-000000000032',
    viaScheduleId: null,
    approverUserId: APPROVER_ID,
    tier: 'high_risk_approval_required',
    status: 'approved',
    toolName: 'timesheet.entry.create',
    args: { hours: 8 },
    expectedOutputShape: null,
    permissionEnvelopeAtDraftTime: {},
    approvalFreshness: 'revalidate',
    approvalTtl: '72 hours',
    draftedAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: new Date('2026-01-04T00:00:00Z'),
    approvedAt: new Date('2026-01-02T00:00:00Z'),
    executedAt: null,
    executionOutcome: null,
    provenance: {
      triggered_by: 'user',
      user_utterance: 'log 8 hours',
      drafted_at: new Date('2026-01-01T00:00:00Z'),
      derived_from_tainted_sources: [],
    },
    taintAtDraftTime: false,
    ...overrides,
  }
}

function makeRepo(): IDraftRepository {
  return {
    insert: vi.fn(),
    getById: vi.fn(),
    updateStatus: vi.fn(),
    atomicTransitionToExecuted: vi.fn(),
    listPendingExpired: vi.fn(),
    listAllPendingExpired: vi.fn(),
    listForApprover: vi.fn(),
    listAuditDrafts: vi.fn().mockResolvedValue({ items: [makeDraft()], total: 1 }),
  } as unknown as IDraftRepository
}

describe('draftAuditRouter', () => {
  let repo: IDraftRepository

  beforeEach(() => {
    repo = makeRepo()
    setDraftRepository(repo)
  })

  // ── tenantId from context ──────────────────────────────────────────────────

  it('list — always passes tenantId from context, never from user input', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx(TENANT_A))
    await caller.list({})

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_A }),
    )
  })

  it('list — tenant B context yields tenant B query', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx(TENANT_B))
    await caller.list({})

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_B }),
    )
  })

  // ── filter dimensions ─────────────────────────────────────────────────────

  it('list — passes tier filter when provided', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ tier: 'high_risk_approval_required' })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'high_risk_approval_required' }),
    )
  })

  it('list — passes statuses filter when provided', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ statuses: ['approved', 'executed'] })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['approved', 'executed'] }),
    )
  })

  it('list — passes domainKind filter when provided', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ domainKind: 'timesheet' })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ domainKind: 'timesheet' }),
    )
  })

  it('list — passes approverUserId filter when provided', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ approverUserId: APPROVER_ID })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ approverUserId: APPROVER_ID }),
    )
  })

  it('list — passes initiatorUserId filter when provided', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ initiatorUserId: USER_ID })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ initiatorUserId: USER_ID }),
    )
  })

  it('list — passes taintAtDraftTime filter when provided', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ taintAtDraftTime: true })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ taintAtDraftTime: true }),
    )
  })

  it('list — passes approvedAtFrom and approvedAtTo when provided', async () => {
    const from = new Date('2026-01-01T00:00:00Z')
    const to = new Date('2026-01-31T23:59:59Z')
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ approvedAtFrom: from, approvedAtTo: to })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ approvedAtFrom: from, approvedAtTo: to }),
    )
  })

  // ── pagination ────────────────────────────────────────────────────────────

  it('list — passes page and pageSize to repository', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({ page: 2, pageSize: 10 })

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 }),
    )
  })

  it('list — defaults page=1 and pageSize=20 when not provided', async () => {
    const caller = draftAuditRouter.createCaller(makeCtx())
    await caller.list({})

    expect(repo.listAuditDrafts).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
    )
  })

  // ── output shape ──────────────────────────────────────────────────────────

  it('list — returns items and total from repository', async () => {
    const draft = makeDraft()
    ;(repo.listAuditDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [draft],
      total: 42,
    })

    const caller = draftAuditRouter.createCaller(makeCtx())
    const result = await caller.list({})

    expect(result.total).toBe(42)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe(DRAFT_ID)
  })

  it('list — returns empty result when repository returns nothing', async () => {
    ;(repo.listAuditDrafts as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [],
      total: 0,
    })

    const caller = draftAuditRouter.createCaller(makeCtx())
    const result = await caller.list({})

    expect(result.total).toBe(0)
    expect(result.items).toHaveLength(0)
  })

  // ── no agent meta ─────────────────────────────────────────────────────────

  it('procedures have no agent meta (audit surface is not agent-invokable)', () => {
    const def = draftAuditRouter._def
    for (const [name, proc] of Object.entries(def.procedures)) {
      const meta = (proc as { _def?: { meta?: { agent?: unknown } } })._def?.meta
      expect(meta?.agent, `${name} must not have agent meta`).toBeUndefined()
    }
  })
})
