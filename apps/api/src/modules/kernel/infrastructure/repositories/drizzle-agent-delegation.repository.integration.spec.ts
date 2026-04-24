import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { DrizzleAgentDelegationRepository } from './drizzle-agent-delegation.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000101'
const TENANT_B = '01900000-0000-7fff-8000-000000000102'

describe('DrizzleAgentDelegationRepository', () => {
  const db = createTestDb()
  let repo: DrizzleAgentDelegationRepository

  beforeAll(async () => {
    await migrateForTest()
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'ad-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'ad-tenant-b' })
    repo = new DrizzleAgentDelegationRepository(db as never)
  })

  afterAll(async () => {
    await truncateCoreSchema(db)
  })

  describe('insert()', () => {
    it('persists delegation with all fields', async () => {
      await setTenantContext(db, TENANT_A)
      const expiresAt = new Date(Date.now() + 3600_000)

      const { id } = await repo.insert({
        tenantId: TENANT_A,
        delegatorUserId: 'user-aaa',
        delegate: 'agent:approval-executor',
        scope: { draftId: 'draft-001', toolName: 'people.updateSalary' },
        expiresAt,
      })

      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)

      const row = await repo.getById({ tenantId: TENANT_A, delegationId: id })
      expect(row).not.toBeNull()
      expect(row!.delegate).toBe('agent:approval-executor')
      expect(row!.delegatorUserId).toBe('user-aaa')
      expect(row!.scope).toEqual({ draftId: 'draft-001', toolName: 'people.updateSalary' })
      expect(row!.tenantId).toBe(TENANT_A)
    })

    it('sets status to "active" by default', async () => {
      await setTenantContext(db, TENANT_A)
      const expiresAt = new Date(Date.now() + 3600_000)

      const { id } = await repo.insert({
        tenantId: TENANT_A,
        delegatorUserId: null,
        delegate: 'agent:scheduler',
        scope: {},
        expiresAt,
      })

      const row = await repo.getById({ tenantId: TENANT_A, delegationId: id })
      expect(row!.status).toBe('active')
    })
  })

  describe('getById()', () => {
    it('returns delegation for matching tenantId + id', async () => {
      await setTenantContext(db, TENANT_A)
      const expiresAt = new Date(Date.now() + 3600_000)

      const { id } = await repo.insert({
        tenantId: TENANT_A,
        delegatorUserId: 'user-bbb',
        delegate: 'agent:approval-executor',
        scope: { draftId: 'draft-002' },
        expiresAt,
      })

      const row = await repo.getById({ tenantId: TENANT_A, delegationId: id })
      expect(row).not.toBeNull()
      expect(row!.id).toBe(id)
    })

    it('returns null if tenantId does not match (tenant isolation)', async () => {
      await setTenantContext(db, TENANT_A)
      const expiresAt = new Date(Date.now() + 3600_000)

      const { id } = await repo.insert({
        tenantId: TENANT_A,
        delegatorUserId: null,
        delegate: 'agent:approval-executor',
        scope: {},
        expiresAt,
      })

      const row = await repo.getById({ tenantId: TENANT_B, delegationId: id })
      expect(row).toBeNull()
    })
  })

  describe('updateStatus()', () => {
    it('updates only the status field', async () => {
      await setTenantContext(db, TENANT_A)
      const expiresAt = new Date(Date.now() + 3600_000)

      const { id } = await repo.insert({
        tenantId: TENANT_A,
        delegatorUserId: 'user-ccc',
        delegate: 'agent:approval-executor',
        scope: { draftId: 'draft-003' },
        expiresAt,
      })

      await repo.updateStatus({ tenantId: TENANT_A, delegationId: id, status: 'revoked' })

      const row = await repo.getById({ tenantId: TENANT_A, delegationId: id })
      expect(row!.status).toBe('revoked')
      // Other fields remain unchanged
      expect(row!.delegatorUserId).toBe('user-ccc')
      expect(row!.delegate).toBe('agent:approval-executor')
    })
  })
})
