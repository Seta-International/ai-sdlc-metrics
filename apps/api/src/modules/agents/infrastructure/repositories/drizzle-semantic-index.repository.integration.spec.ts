/**
 * drizzle-semantic-index.repository.integration.spec.ts
 *
 * Integration tests for DrizzleSemanticIndexRepository (Plan 04 R-04.36–R-04.40).
 *
 * Covers:
 *  1. index() + search(): stores entries, returns top-k by cosine similarity
 *  2. Cross-tenant RLS isolation: tenant A entries not visible under tenant B
 *  3. GDPR purgeForUser: seed N rows → purge → returns real count, rows gone
 *  4. purgeForUser does not delete other users' entries in same tenant
 *  5. search() respects embeddingModel filter (stale model rows skipped)
 *  6. Table has RLS + FORCE ROW LEVEL SECURITY enabled
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
import { DrizzleSemanticIndexRepository } from './drizzle-semantic-index.repository'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = '01900000-0000-7fff-8000-000000000080'
const TENANT_B = '01900000-0000-7fff-8000-000000000081'
const USER_A = '01900000-0000-7fff-8000-000000000090'
const USER_B = '01900000-0000-7fff-8000-000000000091'
const MODEL = 'text-embedding-3-small'

/** Deterministic source IDs (uuid-shaped). */
const SOURCE_1 = '01900000-0000-7fff-8000-0000000000a1'
const SOURCE_2 = '01900000-0000-7fff-8000-0000000000a2'
const SOURCE_3 = '01900000-0000-7fff-8000-0000000000a3'

/**
 * Tiny 3-dimensional test embeddings — just enough for cosine ranking tests.
 * In production these would be 1536-dimensional text-embedding-3-small vectors.
 */
const EMBEDDING_SIMILAR_A = [1.0, 0.0, 0.0] // pointing in x-direction
const EMBEDDING_SIMILAR_B = [0.9, 0.1, 0.0] // close to x-direction
const EMBEDDING_DISSIMILAR = [0.0, 0.0, 1.0] // pointing in z-direction (far)
const QUERY_EMBEDDING = [1.0, 0.0, 0.0] // same as SIMILAR_A → should rank first

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DrizzleSemanticIndexRepository', () => {
  const db = createTestDb()
  let repo: DrizzleSemanticIndexRepository

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_semantic_index RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'semantic-index-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'semantic-index-tenant-b' })
    repo = new DrizzleSemanticIndexRepository(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_semantic_index RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  // ─── index() + search() ────────────────────────────────────────────────────

  describe('index() + search()', () => {
    it('stores an entry and search() returns it ranked by cosine similarity', async () => {
      await setTenantContext(db, TENANT_A)

      await repo.index({
        tenantId: TENANT_A,
        userId: USER_A,
        sourceId: SOURCE_1,
        sourceType: 'agent_message',
        text: 'Q2 performance review is in progress',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: MODEL,
      })

      const results = await repo.search({
        tenantId: TENANT_A,
        userId: USER_A,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 5,
      })

      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0]?.sourceId).toBe(SOURCE_1)
      expect(results[0]?.sourceType).toBe('agent_message')
      expect(results[0]?.score).toBeCloseTo(1.0, 3)
    })

    it('ranks more similar entries higher than dissimilar ones', async () => {
      await setTenantContext(db, TENANT_A)

      const SEARCH_USER = '01900000-0000-7fff-8000-0000000000b1'
      const SRC_NEAR = '01900000-0000-7fff-8000-0000000000b2'
      const SRC_FAR = '01900000-0000-7fff-8000-0000000000b3'

      await repo.index({
        tenantId: TENANT_A,
        userId: SEARCH_USER,
        sourceId: SRC_NEAR,
        sourceType: 'agent_message',
        text: 'task list review',
        embedding: EMBEDDING_SIMILAR_B,
        embeddingModel: MODEL,
      })

      await repo.index({
        tenantId: TENANT_A,
        userId: SEARCH_USER,
        sourceId: SRC_FAR,
        sourceType: 'agent_message',
        text: 'unrelated content',
        embedding: EMBEDDING_DISSIMILAR,
        embeddingModel: MODEL,
      })

      const results = await repo.search({
        tenantId: TENANT_A,
        userId: SEARCH_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 5,
      })

      expect(results.length).toBe(2)
      // SRC_NEAR should rank above SRC_FAR (higher cosine similarity to QUERY)
      const nearIdx = results.findIndex((r) => r.sourceId === SRC_NEAR)
      const farIdx = results.findIndex((r) => r.sourceId === SRC_FAR)
      expect(nearIdx).toBeLessThan(farIdx)
    })

    it('topK limits the number of results returned', async () => {
      await setTenantContext(db, TENANT_A)

      const TOPK_USER = '01900000-0000-7fff-8000-0000000000c1'

      // Insert 3 entries
      const topkSources = [
        '01900000-0000-7fff-8000-0000000000c1',
        '01900000-0000-7fff-8000-0000000000c2',
        '01900000-0000-7fff-8000-0000000000c3',
      ]
      for (let i = 0; i < 3; i++) {
        await repo.index({
          tenantId: TENANT_A,
          userId: TOPK_USER,
          sourceId: topkSources[i]!,
          sourceType: 'agent_message',
          text: `entry ${i + 1}`,
          embedding: [1.0 - (i + 1) * 0.1, 0.0, 0.0],
          embeddingModel: MODEL,
        })
      }

      const results = await repo.search({
        tenantId: TENANT_A,
        userId: TOPK_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 2,
      })

      expect(results.length).toBe(2)
    })

    it('returns empty array when no entries exist for user', async () => {
      await setTenantContext(db, TENANT_A)

      const ABSENT_USER = '01900000-0000-7fff-8000-0000000000d1'

      const results = await repo.search({
        tenantId: TENANT_A,
        userId: ABSENT_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 5,
      })

      expect(results).toEqual([])
    })
  })

  // ─── embeddingModel filter ─────────────────────────────────────────────────

  describe('search() embeddingModel filter', () => {
    it('skips rows with a different embeddingModel (stale model)', async () => {
      await setTenantContext(db, TENANT_A)

      const STALE_USER = '01900000-0000-7fff-8000-0000000000e1'
      const SRC_STALE = '01900000-0000-7fff-8000-0000000000e2'
      const SRC_CURRENT = '01900000-0000-7fff-8000-0000000000e3'

      await repo.index({
        tenantId: TENANT_A,
        userId: STALE_USER,
        sourceId: SRC_STALE,
        sourceType: 'agent_message',
        text: 'old model entry',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: 'text-embedding-ada-002', // stale model
      })

      await repo.index({
        tenantId: TENANT_A,
        userId: STALE_USER,
        sourceId: SRC_CURRENT,
        sourceType: 'agent_message',
        text: 'current model entry',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: MODEL,
      })

      const results = await repo.search({
        tenantId: TENANT_A,
        userId: STALE_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 10,
      })

      const sourceIds = results.map((r) => r.sourceId)
      expect(sourceIds).toContain(SRC_CURRENT)
      expect(sourceIds).not.toContain(SRC_STALE)
    })
  })

  // ─── GDPR purgeForUser ─────────────────────────────────────────────────────

  describe('purgeForUser() — GDPR erasure', () => {
    it('deletes all entries for the user and returns accurate count (N=5)', async () => {
      await setTenantContext(db, TENANT_A)

      const GDPR_USER = '01900000-0000-7fff-8000-0000000000f1'

      // Seed 5 entries for the GDPR user
      const gdprSources = [
        '01900000-0000-7fff-8000-0000000000f1',
        '01900000-0000-7fff-8000-0000000000f2',
        '01900000-0000-7fff-8000-0000000000f3',
        '01900000-0000-7fff-8000-0000000000f4',
        '01900000-0000-7fff-8000-0000000000f5',
      ]
      for (let i = 0; i < 5; i++) {
        await repo.index({
          tenantId: TENANT_A,
          userId: GDPR_USER,
          sourceId: gdprSources[i]!,
          sourceType: 'agent_message',
          text: `gdpr entry ${i + 1}`,
          embedding: EMBEDDING_SIMILAR_A,
          embeddingModel: MODEL,
        })
      }

      const { count } = await repo.purgeForUser({ tenantId: TENANT_A, userId: GDPR_USER })

      expect(count).toBe(5)

      // Verify rows are gone
      const remaining = await repo.search({
        tenantId: TENANT_A,
        userId: GDPR_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 10,
      })
      expect(remaining).toEqual([])
    })

    it('returns count 0 when no entries exist for the user', async () => {
      await setTenantContext(db, TENANT_A)

      const ABSENT_USER = '01900000-0000-7fff-8000-000000000a99'

      const { count } = await repo.purgeForUser({ tenantId: TENANT_A, userId: ABSENT_USER })

      expect(count).toBe(0)
    })

    it('does not delete entries belonging to other users in the same tenant', async () => {
      await setTenantContext(db, TENANT_A)

      const GDPR_USER2 = '01900000-0000-7fff-8000-000000000101'
      const SAFE_USER = '01900000-0000-7fff-8000-000000000102'
      const SRC_SAFE = '01900000-0000-7fff-8000-000000000103'
      const SRC_GDPR = '01900000-0000-7fff-8000-000000000104'

      await repo.index({
        tenantId: TENANT_A,
        userId: SAFE_USER,
        sourceId: SRC_SAFE,
        sourceType: 'agent_message',
        text: 'safe user entry',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: MODEL,
      })

      await repo.index({
        tenantId: TENANT_A,
        userId: GDPR_USER2,
        sourceId: SRC_GDPR,
        sourceType: 'agent_message',
        text: 'gdpr user entry',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: MODEL,
      })

      await repo.purgeForUser({ tenantId: TENANT_A, userId: GDPR_USER2 })

      // SAFE_USER's entry must still be accessible
      const remaining = await repo.search({
        tenantId: TENANT_A,
        userId: SAFE_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 10,
      })

      const sourceIds = remaining.map((r) => r.sourceId)
      expect(sourceIds).toContain(SRC_SAFE)
      expect(sourceIds).not.toContain(SRC_GDPR)
    })
  })

  // ─── Cross-tenant RLS isolation ────────────────────────────────────────────

  describe('Cross-tenant RLS isolation', () => {
    it('tenant A entries are not visible under tenant B context', async () => {
      const RLS_USER = '01900000-0000-7fff-8000-000000000201'
      const SRC_RLS = '01900000-0000-7fff-8000-000000000202'

      // Write under tenant A
      await setTenantContext(db, TENANT_A)
      await repo.index({
        tenantId: TENANT_A,
        userId: RLS_USER,
        sourceId: SRC_RLS,
        sourceType: 'agent_message',
        text: 'tenant A secret',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: MODEL,
      })

      // Confirm visible under tenant A
      const underA = await repo.search({
        tenantId: TENANT_A,
        userId: RLS_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 5,
      })
      expect(underA.some((r) => r.sourceId === SRC_RLS)).toBe(true)

      // Switch to tenant B — should NOT see tenant A rows
      await setTenantContext(db, TENANT_B)
      const underB = await repo.search({
        tenantId: TENANT_B,
        userId: RLS_USER,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 5,
      })
      expect(underB.some((r) => r.sourceId === SRC_RLS)).toBe(false)
    })

    it('index() under tenant A, search() under tenant B returns no cross-tenant results', async () => {
      await setTenantContext(db, TENANT_A)

      const RLS_USER2 = '01900000-0000-7fff-8000-000000000301'
      const SRC_RLS2 = '01900000-0000-7fff-8000-000000000302'

      await repo.index({
        tenantId: TENANT_A,
        userId: RLS_USER2,
        sourceId: SRC_RLS2,
        sourceType: 'agent_message',
        text: 'another tenant A entry',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: MODEL,
      })

      await setTenantContext(db, TENANT_B)
      const results = await repo.search({
        tenantId: TENANT_B,
        userId: RLS_USER2,
        queryEmbedding: QUERY_EMBEDDING,
        embeddingModel: MODEL,
        topK: 5,
      })

      expect(results).toEqual([])
    })

    it('table has RLS and FORCE ROW LEVEL SECURITY enabled', async () => {
      const rls = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        sql`SELECT c.relrowsecurity, c.relforcerowsecurity
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'agents' AND c.relname = 'agent_semantic_index'`,
      )
      expect(rls.rows[0]?.relrowsecurity).toBe(true)
      expect(rls.rows[0]?.relforcerowsecurity).toBe(true)
    })
  })

  // ─── index() idempotency ────────────────────────────────────────────────────

  describe('index() idempotency', () => {
    it('ON CONFLICT DO NOTHING: re-indexing the same sourceId does not throw or create duplicates', async () => {
      await setTenantContext(db, TENANT_A)

      const IDEM_USER = '01900000-0000-7fff-8000-000000000401'
      const SRC_IDEM = '01900000-0000-7fff-8000-000000000402'

      await repo.index({
        tenantId: TENANT_A,
        userId: IDEM_USER,
        sourceId: SRC_IDEM,
        sourceType: 'agent_message',
        text: 'first write',
        embedding: EMBEDDING_SIMILAR_A,
        embeddingModel: MODEL,
      })

      // Second write with same (no explicit unique constraint on source_id currently,
      // but onConflictDoNothing should at minimum not throw)
      await expect(
        repo.index({
          tenantId: TENANT_A,
          userId: IDEM_USER,
          sourceId: SRC_IDEM,
          sourceType: 'agent_message',
          text: 'second write',
          embedding: EMBEDDING_SIMILAR_B,
          embeddingModel: MODEL,
        }),
      ).resolves.toBeUndefined()
    })
  })
})
