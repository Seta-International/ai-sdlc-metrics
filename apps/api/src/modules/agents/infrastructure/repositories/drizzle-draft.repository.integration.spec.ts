/**
 * drizzle-draft.repository.integration.spec.ts
 *
 * Integration tests for DrizzleDraftRepository.
 *
 * Covers:
 *  1. insert(): persists all fields; expires_at = drafted_at + ttl; returns row with generated id
 *  2. getById(): returns draft for matching tenantId; null for wrong tenantId (isolation)
 *  3. updateStatus(): sets status; approvedAt and executionOutcome when provided
 *  4. listPendingExpired(): returns only pending drafts past their expires_at
 *  5. listForApprover(): returns drafts for specific approver + tenant
 */

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleDraftRepository } from './drizzle-draft.repository'
import type { NewDraft } from '../../application/services/draft-types'

const TENANT_A = '01900000-0000-7fff-8000-0000000000d1'
const TENANT_B = '01900000-0000-7fff-8000-0000000000d2'
const USER_A = '01900000-0000-7fff-8000-0000000000e1'
const USER_B = '01900000-0000-7fff-8000-0000000000e2'
const APPROVER = '01900000-0000-7fff-8000-0000000000f1'
const DELEGATION_ID = '01900000-0000-7fff-8000-000000000001'
const TRACE_ID = '01900000-0000-7fff-8000-000000000002'
const FLOW_ID = '01900000-0000-7fff-8000-000000000003'

function makeDraft(overrides: Partial<NewDraft> = {}): NewDraft {
  const now = new Date()
  return {
    tenantId: TENANT_A,
    traceId: TRACE_ID,
    flowId: FLOW_ID,
    initiatorUserId: USER_A,
    onBehalfOf: null,
    viaDelegationId: DELEGATION_ID,
    viaScheduleId: null,
    approverUserId: null,
    tier: 'low_risk_auto',
    toolName: 'planner.createTask',
    args: { title: 'Write tests', assignee: USER_A },
    expectedOutputShape: null,
    permissionEnvelopeAtDraftTime: { roles: ['planner:task:write'] },
    approvalFreshness: 'accept-stale',
    approvalTtlHours: 72,
    draftedAt: now,
    expiresAt: new Date(now.getTime() + 72 * 3600_000),
    provenance: {
      triggered_by: `user:${USER_A}`,
      user_utterance: '',
      drafted_at: now,
      derived_from_tainted_sources: [],
    },
    taintAtDraftTime: false,
    ...overrides,
  }
}

describe('DrizzleDraftRepository', () => {
  const db = createTestDb()
  let repo: DrizzleDraftRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_draft RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'draft-repo-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'draft-repo-tenant-b' })
    repo = new DrizzleDraftRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_draft RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  // ─── insert ───────────────────────────────────────────────────────────────

  describe('insert()', () => {
    it('persists all fields and returns a draft with generated id', async () => {
      await setTenantContext(db, TENANT_A)

      const now = new Date()
      const expiresAt = new Date(now.getTime() + 72 * 3600_000)
      const draft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          draftedAt: now,
          expiresAt,
        }),
      )

      expect(draft.id).toBeTruthy()
      expect(draft.tenantId).toBe(TENANT_A)
      expect(draft.traceId).toBe(TRACE_ID)
      expect(draft.flowId).toBe(FLOW_ID)
      expect(draft.initiatorUserId).toBe(USER_A)
      expect(draft.toolName).toBe('planner.createTask')
      expect(draft.tier).toBe('low_risk_auto')
      expect(draft.status).toBe('pending')
      expect(draft.approvalFreshness).toBe('accept-stale')
      expect(draft.taintAtDraftTime).toBe(false)
      expect(draft.permissionEnvelopeAtDraftTime).toEqual({ roles: ['planner:task:write'] })
      expect(draft.args).toEqual({ title: 'Write tests', assignee: USER_A })
      expect(draft.approvedAt).toBeNull()
      expect(draft.executedAt).toBeNull()
      expect(draft.executionOutcome).toBeNull()
    })

    it('sets expires_at correctly (drafted_at + ttl hours)', async () => {
      await setTenantContext(db, TENANT_A)

      const draftedAt = new Date('2026-04-01T00:00:00.000Z')
      const expiresAt = new Date('2026-04-04T00:00:00.000Z') // +72h

      const draft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          approvalTtlHours: 72,
          draftedAt,
          expiresAt,
        }),
      )

      expect(draft.expiresAt.getTime()).toBe(expiresAt.getTime())
    })

    it('stores approverUserId and tier=high_risk_approval_required', async () => {
      await setTenantContext(db, TENANT_A)

      const draft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          tier: 'high_risk_approval_required',
          approverUserId: APPROVER,
        }),
      )

      expect(draft.tier).toBe('high_risk_approval_required')
      expect(draft.approverUserId).toBe(APPROVER)
    })
  })

  // ─── getById ─────────────────────────────────────────────────────────────

  describe('getById()', () => {
    it('returns the draft for the correct tenantId', async () => {
      await setTenantContext(db, TENANT_A)

      const inserted = await repo.insert(makeDraft({ tenantId: TENANT_A }))

      const found = await repo.getById({ tenantId: TENANT_A, draftId: inserted.id })

      expect(found).not.toBeNull()
      expect(found!.id).toBe(inserted.id)
    })

    it('returns null for wrong tenantId (tenant isolation)', async () => {
      await setTenantContext(db, TENANT_A)
      const inserted = await repo.insert(makeDraft({ tenantId: TENANT_A }))

      await setTenantContext(db, TENANT_B)
      const found = await repo.getById({ tenantId: TENANT_B, draftId: inserted.id })

      expect(found).toBeNull()
    })

    it('returns null when draftId does not exist', async () => {
      await setTenantContext(db, TENANT_A)
      const found = await repo.getById({
        tenantId: TENANT_A,
        draftId: '01900000-0000-7fff-8000-000000000099',
      })

      expect(found).toBeNull()
    })
  })

  // ─── updateStatus ─────────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('updates status to approved', async () => {
      await setTenantContext(db, TENANT_A)

      const inserted = await repo.insert(makeDraft({ tenantId: TENANT_A }))

      await repo.updateStatus({
        tenantId: TENANT_A,
        draftId: inserted.id,
        status: 'approved',
      })

      const found = await repo.getById({ tenantId: TENANT_A, draftId: inserted.id })
      expect(found!.status).toBe('approved')
    })

    it('sets approvedAt and executionOutcome from extra', async () => {
      await setTenantContext(db, TENANT_A)

      const inserted = await repo.insert(makeDraft({ tenantId: TENANT_A }))
      const approvedAt = new Date('2026-04-02T10:00:00.000Z')

      await repo.updateStatus({
        tenantId: TENANT_A,
        draftId: inserted.id,
        status: 'executed',
        extra: {
          approvedAt,
          executedAt: new Date('2026-04-02T10:01:00.000Z'),
          executionOutcome: JSON.stringify({ result: 'success' }),
        },
      })

      const found = await repo.getById({ tenantId: TENANT_A, draftId: inserted.id })
      expect(found!.status).toBe('executed')
      expect(found!.approvedAt).not.toBeNull()
      expect(found!.executionOutcome).toBe(JSON.stringify({ result: 'success' }))
    })
  })

  // ─── listPendingExpired ────────────────────────────────────────────────────

  describe('listPendingExpired()', () => {
    it('returns only pending drafts whose expiresAt is before now', async () => {
      await setTenantContext(db, TENANT_A)

      const past = new Date('2025-01-01T00:00:00.000Z')
      const future = new Date('2030-01-01T00:00:00.000Z')

      const expiredDraft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          draftedAt: new Date('2024-12-31T00:00:00.000Z'),
          expiresAt: past,
        }),
      )

      await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          draftedAt: new Date(),
          expiresAt: future,
        }),
      )

      const now = new Date()
      const expired = await repo.listPendingExpired({ tenantId: TENANT_A, now })

      const ids = expired.map((d) => d.id)
      expect(ids).toContain(expiredDraft.id)
      expect(expired.every((d) => d.status === 'pending')).toBe(true)
      expect(expired.every((d) => d.expiresAt < now)).toBe(true)
    })

    it('does not return approved or rejected drafts', async () => {
      await setTenantContext(db, TENANT_A)

      const past = new Date('2025-01-01T00:00:00.000Z')
      const approvedDraft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          draftedAt: new Date('2024-12-31T00:00:00.000Z'),
          expiresAt: past,
        }),
      )

      await repo.updateStatus({
        tenantId: TENANT_A,
        draftId: approvedDraft.id,
        status: 'approved',
      })

      const expired = await repo.listPendingExpired({ tenantId: TENANT_A, now: new Date() })
      const ids = expired.map((d) => d.id)
      expect(ids).not.toContain(approvedDraft.id)
    })
  })

  // ─── listForApprover ─────────────────────────────────────────────────────

  describe('listForApprover()', () => {
    it('returns drafts assigned to the specific approver in the tenant', async () => {
      await setTenantContext(db, TENANT_A)

      const future = new Date(Date.now() + 72 * 3600_000)
      const approverDraft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          tier: 'high_risk_approval_required',
          approverUserId: APPROVER,
          expiresAt: future,
        }),
      )

      const result = await repo.listForApprover({ tenantId: TENANT_A, approverId: APPROVER })

      const ids = result.map((d) => d.id)
      expect(ids).toContain(approverDraft.id)
    })

    it('filters by statuses when provided', async () => {
      await setTenantContext(db, TENANT_A)

      const future = new Date(Date.now() + 72 * 3600_000)

      const pendingDraft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          approverUserId: APPROVER,
          expiresAt: future,
        }),
      )

      const rejectedDraft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          approverUserId: APPROVER,
          expiresAt: future,
        }),
      )

      await repo.updateStatus({
        tenantId: TENANT_A,
        draftId: rejectedDraft.id,
        status: 'rejected',
      })

      const pendingOnly = await repo.listForApprover({
        tenantId: TENANT_A,
        approverId: APPROVER,
        statuses: ['pending'],
      })

      const pendingIds = pendingOnly.map((d) => d.id)
      expect(pendingIds).toContain(pendingDraft.id)
      expect(pendingIds).not.toContain(rejectedDraft.id)
    })

    it('does not return drafts for a different approver', async () => {
      await setTenantContext(db, TENANT_A)

      const OTHER_APPROVER = '01900000-0000-7fff-8000-0000000000f2'
      const future = new Date(Date.now() + 72 * 3600_000)

      const otherDraft = await repo.insert(
        makeDraft({
          tenantId: TENANT_A,
          approverUserId: OTHER_APPROVER,
          expiresAt: future,
        }),
      )

      const result = await repo.listForApprover({ tenantId: TENANT_A, approverId: APPROVER })
      const ids = result.map((d) => d.id)
      expect(ids).not.toContain(otherDraft.id)
    })
  })
})
