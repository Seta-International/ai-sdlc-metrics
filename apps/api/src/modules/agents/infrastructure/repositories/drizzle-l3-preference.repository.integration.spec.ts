/**
 * drizzle-l3-preference.repository.integration.spec.ts
 *
 * Integration tests for DrizzleL3PreferenceRepository.
 *
 * Covers:
 *  1. set + get: stores value, retrieves it
 *  2. getAll: returns all keys as Record
 *  3. delete with key: removes specific key
 *  4. delete without key: removes all
 *  5. Cross-tenant RLS: tenant A preferences not visible under tenant B
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
import { DrizzleL3PreferenceRepository } from './drizzle-l3-preference.repository'

const TENANT_A = '01900000-0000-7fff-8000-000000000071'
const TENANT_B = '01900000-0000-7fff-8000-000000000072'
const USER_A = '01900000-0000-7fff-8000-0000000000b1'
const USER_B = '01900000-0000-7fff-8000-0000000000b2'

describe('DrizzleL3PreferenceRepository', () => {
  const db = createTestDb()
  const recordEvent = vi.fn().mockResolvedValue(undefined)
  const audit = { recordEvent, publishOutboxEvent: vi.fn() } as unknown as KernelAuditFacade
  let repo: DrizzleL3PreferenceRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_l3_preference RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'l3-pref-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'l3-pref-tenant-b' })
    repo = new DrizzleL3PreferenceRepository(db as never, audit)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_l3_preference RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  describe('set() + get()', () => {
    it('stores a value and retrieves it', async () => {
      await setTenantContext(db, TENANT_A)

      await repo.set({
        tenantId: TENANT_A,
        userId: USER_A,
        key: 'theme',
        value: 'dark',
        updatedBy: USER_A,
      })

      const result = await repo.get({ tenantId: TENANT_A, userId: USER_A, key: 'theme' })

      expect(result).toBe('dark')
    })

    it('returns null when key is absent', async () => {
      await setTenantContext(db, TENANT_A)

      const result = await repo.get({ tenantId: TENANT_A, userId: USER_A, key: 'language' })

      expect(result).toBeNull()
    })

    it('upserts: second set overwrites the first', async () => {
      await setTenantContext(db, TENANT_A)

      await repo.set({
        tenantId: TENANT_A,
        userId: USER_A,
        key: 'display_format',
        value: 'table',
        updatedBy: USER_A,
      })

      await repo.set({
        tenantId: TENANT_A,
        userId: USER_A,
        key: 'display_format',
        value: 'grid',
        updatedBy: USER_A,
      })

      const result = await repo.get({ tenantId: TENANT_A, userId: USER_A, key: 'display_format' })
      expect(result).toBe('grid')
    })
  })

  describe('getAll()', () => {
    it('returns all keys as a Record', async () => {
      await setTenantContext(db, TENANT_A)

      // Set up multiple preferences for user B under tenant A
      await repo.set({
        tenantId: TENANT_A,
        userId: USER_B,
        key: 'language',
        value: 'vi',
        updatedBy: USER_B,
      })

      await repo.set({
        tenantId: TENANT_A,
        userId: USER_B,
        key: 'theme',
        value: 'light',
        updatedBy: USER_B,
      })

      const all = await repo.getAll({ tenantId: TENANT_A, userId: USER_B })

      expect(all).toMatchObject({
        language: 'vi',
        theme: 'light',
      })
    })

    it('returns empty record when no preferences set for user', async () => {
      await setTenantContext(db, TENANT_A)

      const FRESH_USER = '01900000-0000-7fff-8000-0000000099ff'
      const all = await repo.getAll({ tenantId: TENANT_A, userId: FRESH_USER })

      expect(all).toEqual({})
    })
  })

  describe('delete()', () => {
    it('removes a specific key when key is provided', async () => {
      await setTenantContext(db, TENANT_A)

      const DELETE_USER = '01900000-0000-7fff-8000-0000000000c1'

      await repo.set({
        tenantId: TENANT_A,
        userId: DELETE_USER,
        key: 'theme',
        value: 'dark',
        updatedBy: DELETE_USER,
      })

      await repo.set({
        tenantId: TENANT_A,
        userId: DELETE_USER,
        key: 'language',
        value: 'en',
        updatedBy: DELETE_USER,
      })

      await repo.delete({ tenantId: TENANT_A, userId: DELETE_USER, key: 'theme' })

      const theme = await repo.get({ tenantId: TENANT_A, userId: DELETE_USER, key: 'theme' })
      const language = await repo.get({ tenantId: TENANT_A, userId: DELETE_USER, key: 'language' })

      expect(theme).toBeNull()
      expect(language).toBe('en')
    })

    it('removes all preferences when key is absent', async () => {
      await setTenantContext(db, TENANT_A)

      const DELETE_ALL_USER = '01900000-0000-7fff-8000-0000000000c2'

      await repo.set({
        tenantId: TENANT_A,
        userId: DELETE_ALL_USER,
        key: 'theme',
        value: 'dark',
        updatedBy: DELETE_ALL_USER,
      })

      await repo.set({
        tenantId: TENANT_A,
        userId: DELETE_ALL_USER,
        key: 'language',
        value: 'fr',
        updatedBy: DELETE_ALL_USER,
      })

      await repo.delete({ tenantId: TENANT_A, userId: DELETE_ALL_USER })

      const all = await repo.getAll({ tenantId: TENANT_A, userId: DELETE_ALL_USER })
      expect(all).toEqual({})
    })
  })

  describe('Cross-tenant RLS isolation', () => {
    it('tenant A preferences are not visible under tenant B context', async () => {
      const RLS_USER = '01900000-0000-7fff-8000-0000000000d1'

      // Write under tenant A
      await setTenantContext(db, TENANT_A)
      await repo.set({
        tenantId: TENANT_A,
        userId: RLS_USER,
        key: 'currency_display',
        value: 'USD',
        updatedBy: RLS_USER,
      })

      // Confirm visible under tenant A
      const underA = await repo.get({
        tenantId: TENANT_A,
        userId: RLS_USER,
        key: 'currency_display',
      })
      expect(underA).toBe('USD')

      // Switch to tenant B — should not see tenant A rows
      await setTenantContext(db, TENANT_B)
      const underB = await repo.get({
        tenantId: TENANT_B,
        userId: RLS_USER,
        key: 'currency_display',
      })
      expect(underB).toBeNull()

      const allUnderB = await repo.getAll({ tenantId: TENANT_B, userId: RLS_USER })
      expect(allUnderB).toEqual({})
    })

    it('table has RLS and FORCE ROW LEVEL SECURITY enabled', async () => {
      const rls = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        sql`SELECT c.relrowsecurity, c.relforcerowsecurity
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'agents' AND c.relname = 'agent_l3_preference'`,
      )
      expect(rls.rows[0]?.relrowsecurity).toBe(true)
      expect(rls.rows[0]?.relforcerowsecurity).toBe(true)
    })
  })
})
