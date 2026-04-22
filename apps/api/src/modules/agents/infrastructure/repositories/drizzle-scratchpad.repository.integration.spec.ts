/**
 * drizzle-scratchpad.repository.integration.spec.ts
 *
 * Integration tests for DrizzleScratchpadRepository.
 *
 * Covers:
 *  1. write + read: stores value + taint flag
 *  2. write with allowlisted field: succeeds
 *  3. write with non-allowlisted field: throws (field validation via allowedFields param)
 *  4. taint flag is preserved: write tainted=true → read returns tainted=true
 *  5. deleteForUser: removes all entries for user
 *  6. Cross-tenant RLS isolation
 */

import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { KernelAuditFacade } from '../../../kernel/application/facades/kernel-audit.facade'
import { DrizzleScratchpadRepository } from './drizzle-scratchpad.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000073'
const TENANT_B = '01900000-0000-7fff-8000-000000000074'
const USER_A = '01900000-0000-7fff-8000-0000000000e1'
const USER_B = '01900000-0000-7fff-8000-0000000000e2'

const ALLOWED_FIELDS = ['pinned_context', 'last_reviewed_task', 'user_intent_summary']
const SUB_AGENT_KEY = 'planner-assistant'
const TRACE_ID = '01900000-0000-7fff-8000-000000000000'

describe('DrizzleScratchpadRepository', () => {
  const db = createTestDb()
  const recordEvent = vi.fn().mockResolvedValue(undefined)
  const audit = { recordEvent, publishOutboxEvent: vi.fn() } as unknown as KernelAuditFacade
  let repo: DrizzleScratchpadRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_scratchpad RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'scratchpad-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'scratchpad-tenant-b' })
    repo = new DrizzleScratchpadRepository(db as never, audit)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_scratchpad RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  describe('write() + read()', () => {
    it('stores a value and retrieves it', async () => {
      await setTenantContext(db, TENANT_A)

      await repo.write(
        TENANT_A,
        USER_A,
        'pinned_context',
        { summary: 'Q2 review cycle is in progress' },
        {
          tainted: false,
          allowedFields: ALLOWED_FIELDS,
          subAgentKey: SUB_AGENT_KEY,
          traceId: TRACE_ID,
        },
      )

      const result = await repo.read(TENANT_A, USER_A, 'pinned_context')

      expect(result).not.toBeNull()
      expect(result?.value).toEqual({ summary: 'Q2 review cycle is in progress' })
      expect(result?.tainted).toBe(false)
    })

    it('returns null when field is absent', async () => {
      await setTenantContext(db, TENANT_A)

      const result = await repo.read(TENANT_A, USER_A, 'nonexistent_field')

      expect(result).toBeNull()
    })

    it('upserts: second write overwrites the first', async () => {
      await setTenantContext(db, TENANT_A)

      await repo.write(TENANT_A, USER_A, 'last_reviewed_task', 'task-001', {
        tainted: false,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      await repo.write(TENANT_A, USER_A, 'last_reviewed_task', 'task-002', {
        tainted: false,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      const result = await repo.read(TENANT_A, USER_A, 'last_reviewed_task')
      expect(result?.value).toBe('task-002')
    })
  })

  describe('allowedFields validation', () => {
    it('write with allowlisted field succeeds', async () => {
      await setTenantContext(db, TENANT_A)

      await expect(
        repo.write(TENANT_A, USER_B, 'user_intent_summary', 'wants to review pending approvals', {
          tainted: false,
          allowedFields: ALLOWED_FIELDS,
          subAgentKey: SUB_AGENT_KEY,
          traceId: TRACE_ID,
        }),
      ).resolves.toBeUndefined()
    })

    it('write with non-allowlisted field throws', async () => {
      await setTenantContext(db, TENANT_A)

      await expect(
        repo.write(TENANT_A, USER_B, 'not_in_allowlist', 'some value', {
          tainted: false,
          allowedFields: ALLOWED_FIELDS,
          subAgentKey: SUB_AGENT_KEY,
          traceId: TRACE_ID,
        }),
      ).rejects.toThrow(/field.*not.*allowed|unknown.*field|not.*allowlist/i)
    })

    it('write with empty allowedFields rejects any field', async () => {
      await setTenantContext(db, TENANT_A)

      await expect(
        repo.write(TENANT_A, USER_B, 'pinned_context', 'some value', {
          tainted: false,
          allowedFields: [],
          subAgentKey: SUB_AGENT_KEY,
          traceId: TRACE_ID,
        }),
      ).rejects.toThrow()
    })
  })

  describe('taint flag', () => {
    it('preserves tainted=true on write and returns it on read', async () => {
      await setTenantContext(db, TENANT_A)

      const TAINT_USER = '01900000-0000-7fff-8000-0000000000f1'

      await repo.write(
        TENANT_A,
        TAINT_USER,
        'pinned_context',
        { hint: 'derived from suspicious tool result' },
        {
          tainted: true,
          allowedFields: ALLOWED_FIELDS,
          subAgentKey: SUB_AGENT_KEY,
          traceId: TRACE_ID,
        },
      )

      const result = await repo.read(TENANT_A, TAINT_USER, 'pinned_context')

      expect(result).not.toBeNull()
      expect(result?.tainted).toBe(true)
    })

    it('preserves tainted=false on write', async () => {
      await setTenantContext(db, TENANT_A)

      const CLEAN_USER = '01900000-0000-7fff-8000-0000000000f2'

      await repo.write(
        TENANT_A,
        CLEAN_USER,
        'pinned_context',
        { hint: 'safe value' },
        {
          tainted: false,
          allowedFields: ALLOWED_FIELDS,
          subAgentKey: SUB_AGENT_KEY,
          traceId: TRACE_ID,
        },
      )

      const result = await repo.read(TENANT_A, CLEAN_USER, 'pinned_context')

      expect(result?.tainted).toBe(false)
    })

    it('emits kernel audit event agent.scratchpad_written on write', async () => {
      await setTenantContext(db, TENANT_A)
      recordEvent.mockClear()

      const AUDIT_USER = '01900000-0000-7fff-8000-0000000000f3'

      await repo.write(TENANT_A, AUDIT_USER, 'pinned_context', 'some value', {
        tainted: true,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      expect(recordEvent).toHaveBeenCalledOnce()
      expect(recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'agent.scratchpad_written',
          module: 'agents',
          tenantId: TENANT_A,
          payload: expect.objectContaining({
            sub_agent_key: SUB_AGENT_KEY,
            field: 'pinned_context',
            tainted: true,
            trace_id: TRACE_ID,
          }),
        }),
      )
    })
  })

  describe('deleteForUser()', () => {
    it('removes all entries for the user (GDPR path)', async () => {
      await setTenantContext(db, TENANT_A)

      const GDPR_USER = '01900000-0000-7fff-8000-0000000000g1'.replace('g', 'a')

      await repo.write(TENANT_A, GDPR_USER, 'pinned_context', 'some context', {
        tainted: false,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      await repo.write(TENANT_A, GDPR_USER, 'last_reviewed_task', 'task-xyz', {
        tainted: false,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      await repo.deleteForUser(TENANT_A, GDPR_USER)

      const c = await repo.read(TENANT_A, GDPR_USER, 'pinned_context')
      const t = await repo.read(TENANT_A, GDPR_USER, 'last_reviewed_task')

      expect(c).toBeNull()
      expect(t).toBeNull()
    })

    it('does not delete entries for other users in the same tenant', async () => {
      await setTenantContext(db, TENANT_A)

      const GDPR_USER2 = '01900000-0000-7fff-8000-0000000000a3'
      const SAFE_USER = '01900000-0000-7fff-8000-0000000000a4'

      await repo.write(TENANT_A, SAFE_USER, 'pinned_context', 'safe user data', {
        tainted: false,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      await repo.write(TENANT_A, GDPR_USER2, 'pinned_context', 'erased user data', {
        tainted: false,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      await repo.deleteForUser(TENANT_A, GDPR_USER2)

      const safeSurvives = await repo.read(TENANT_A, SAFE_USER, 'pinned_context')
      expect(safeSurvives?.value).toBe('safe user data')
    })
  })

  describe('Cross-tenant RLS isolation', () => {
    it('tenant A scratchpad entries are not visible under tenant B context', async () => {
      const RLS_USER = '01900000-0000-7fff-8000-0000000000h1'.replace('h', 'b')

      // Write under tenant A
      await setTenantContext(db, TENANT_A)
      await repo.write(TENANT_A, RLS_USER, 'pinned_context', 'tenant A secret', {
        tainted: false,
        allowedFields: ALLOWED_FIELDS,
        subAgentKey: SUB_AGENT_KEY,
        traceId: TRACE_ID,
      })

      // Confirm visible under tenant A
      const underA = await repo.read(TENANT_A, RLS_USER, 'pinned_context')
      expect(underA?.value).toBe('tenant A secret')

      // Switch to tenant B — should not see tenant A rows
      await setTenantContext(db, TENANT_B)
      const underB = await repo.read(TENANT_B, RLS_USER, 'pinned_context')
      expect(underB).toBeNull()
    })

    it('table has RLS and FORCE ROW LEVEL SECURITY enabled', async () => {
      const rls = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        sql`SELECT c.relrowsecurity, c.relforcerowsecurity
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'agents' AND c.relname = 'agent_scratchpad'`,
      )
      expect(rls.rows[0]?.relrowsecurity).toBe(true)
      expect(rls.rows[0]?.relforcerowsecurity).toBe(true)
    })
  })
})
