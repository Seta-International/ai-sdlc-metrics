import { sql, and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createTestDb,
  migrateForTest,
  seedTenant,
  setTenantContext,
  truncateCoreSchema,
} from '@future/db/test-helpers'
import { canonicalize } from './canonical-args'
import { agentToolResultCache } from '../schema/agent-tool-result-cache.schema'
import { SemanticResultCache } from './semantic-result-cache'
import { SemanticCacheSweeper } from '../workers/semantic-cache-sweeper'

const TENANT_A = '01900000-0000-7fff-8000-000000000071'
const TENANT_B = '01900000-0000-7fff-8000-000000000072'

describe('SemanticResultCache — integration', () => {
  const db = createTestDb()
  let cache: SemanticResultCache
  let sweeper: SemanticCacheSweeper

  beforeAll(async () => {
    await migrateForTest()
    await db.execute(sql`TRUNCATE agents.agent_tool_result_cache RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
    await seedTenant(db, { id: TENANT_A, slug: 'src-tenant-a' })
    await seedTenant(db, { id: TENANT_B, slug: 'src-tenant-b' })
    // Skip onModuleInit (no API key in test env) — inject db directly
    cache = new SemanticResultCache(db as never)
    sweeper = new SemanticCacheSweeper(db as never)
  })

  afterAll(async () => {
    await db.execute(sql`TRUNCATE agents.agent_tool_result_cache RESTART IDENTITY CASCADE`)
    await truncateCoreSchema(db)
  })

  // ─── Test 1: RLS structural check ─────────────────────────────────────────

  it('agent_tool_result_cache has RLS enabled and forced', async () => {
    const rls = await db.execute<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      sql`SELECT c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'agents' AND c.relname = 'agent_tool_result_cache'`,
    )
    expect(rls.rows[0]?.relrowsecurity).toBe(true)
    expect(rls.rows[0]?.relforcerowsecurity).toBe(true)
  })

  // ─── Test 2: Two-tenant isolation — exact key hit miss ────────────────────

  it('tenant isolation: exact hit for tenant A does NOT return result for tenant B', async () => {
    const args = { filter: 'today' }
    const { hash } = canonicalize(args)
    const toolName = 'time.getAttendance'
    const storedResult = { hours: 8 }

    // Insert a row for TENANT_A (must set tenant context first to satisfy RLS)
    await setTenantContext(db, TENANT_A)
    await db.insert(agentToolResultCache).values({
      tenantId: TENANT_A,
      toolName,
      canonicalArgsHash: hash,
      semanticEmbedding: null,
      embeddingModel: 'text-embedding-3-small',
      result: storedResult as never,
      storedAt: new Date(),
      ttlSeconds: 3600,
    })

    // Switch to TENANT_B — RLS should prevent seeing TENANT_A's row
    await setTenantContext(db, TENANT_B)
    const hit = await cache.get({
      tenantId: TENANT_B,
      toolName,
      args,
      embeddingModel: 'text-embedding-3-small',
      distanceThreshold: 0.97,
    })

    expect(hit).toBeUndefined()
  })

  // ─── Test 3: Tenant A can see its own row ──────────────────────────────────

  it('tenant A can retrieve its own cached result via exact key', async () => {
    const args = { filter: 'this-week' }
    const { hash } = canonicalize(args)
    const toolName = 'time.getWeeklyReport'
    const storedResult = { totalHours: 40 }

    await setTenantContext(db, TENANT_A)
    await db.insert(agentToolResultCache).values({
      tenantId: TENANT_A,
      toolName,
      canonicalArgsHash: hash,
      semanticEmbedding: null,
      embeddingModel: 'text-embedding-3-small',
      result: storedResult as never,
      storedAt: new Date(),
      ttlSeconds: 3600,
    })

    // Still as TENANT_A — should find the row
    const hit = await cache.get({
      tenantId: TENANT_A,
      toolName,
      args,
      embeddingModel: 'text-embedding-3-small',
      distanceThreshold: 0.97,
    })

    expect(hit).toBeDefined()
    expect(hit?.hitKind).toBe('exact')
    expect(hit?.result).toEqual(storedResult)
  })

  // ─── Test 4: Two-tenant isolation — put for A, get for B misses ───────────

  it('tenant isolation: tenant B cannot see tenant A exact-hit result', async () => {
    const args = { projectId: 'proj-abc-123' }
    const { hash } = canonicalize(args)
    const toolName = 'projects.getById'
    const storedResult = { id: 'proj-abc-123', name: 'Alpha' }

    // Insert for TENANT_A
    await setTenantContext(db, TENANT_A)
    await db.insert(agentToolResultCache).values({
      tenantId: TENANT_A,
      toolName,
      canonicalArgsHash: hash,
      semanticEmbedding: null,
      embeddingModel: 'text-embedding-3-small',
      result: storedResult as never,
      storedAt: new Date(),
      ttlSeconds: 3600,
    })

    // Attempt lookup as TENANT_B
    await setTenantContext(db, TENANT_B)
    const hit = await cache.get({
      tenantId: TENANT_B,
      toolName,
      args,
      embeddingModel: 'text-embedding-3-small',
      distanceThreshold: 0.97,
    })

    expect(hit).toBeUndefined()
  })

  // ─── Test 5: Domain invalidation — projects purged, others untouched ──────

  it('domain invalidation: invalidateDomain("projects") purges projects.* but not people.* or planner.*', async () => {
    // Clear table to get a clean slate for this test
    await db.execute(sql`TRUNCATE agents.agent_tool_result_cache RESTART IDENTITY CASCADE`)

    await setTenantContext(db, TENANT_A)

    // Insert 3 rows for different domains
    await db.insert(agentToolResultCache).values([
      {
        tenantId: TENANT_A,
        toolName: 'projects.list',
        canonicalArgsHash: 'hash-projects-list-001',
        semanticEmbedding: null,
        embeddingModel: 'text-embedding-3-small',
        result: { items: [] } as never,
        storedAt: new Date(),
        ttlSeconds: 3600,
      },
      {
        tenantId: TENANT_A,
        toolName: 'people.getMe',
        canonicalArgsHash: 'hash-people-getme-001',
        semanticEmbedding: null,
        embeddingModel: 'text-embedding-3-small',
        result: { name: 'Alice' } as never,
        storedAt: new Date(),
        ttlSeconds: 3600,
      },
      {
        tenantId: TENANT_A,
        toolName: 'planner.getMyTasks',
        canonicalArgsHash: 'hash-planner-tasks-001',
        semanticEmbedding: null,
        embeddingModel: 'text-embedding-3-small',
        result: { tasks: [] } as never,
        storedAt: new Date(),
        ttlSeconds: 3600,
      },
    ])

    // Invalidate only the 'projects' domain
    const { purgedCount } = await cache.invalidateDomain({
      tenantId: TENANT_A,
      domain: 'projects',
    })

    expect(purgedCount).toBe(1)

    // 'projects.list' row must be gone
    await setTenantContext(db, TENANT_A)
    const projectsRows = await db
      .select()
      .from(agentToolResultCache)
      .where(
        and(
          eq(agentToolResultCache.tenantId, TENANT_A),
          eq(agentToolResultCache.toolName, 'projects.list'),
        ),
      )
    expect(projectsRows).toHaveLength(0)

    // 'people.getMe' row must still exist
    const peopleRows = await db
      .select()
      .from(agentToolResultCache)
      .where(
        and(
          eq(agentToolResultCache.tenantId, TENANT_A),
          eq(agentToolResultCache.toolName, 'people.getMe'),
        ),
      )
    expect(peopleRows).toHaveLength(1)

    // 'planner.getMyTasks' row must still exist
    const plannerRows = await db
      .select()
      .from(agentToolResultCache)
      .where(
        and(
          eq(agentToolResultCache.tenantId, TENANT_A),
          eq(agentToolResultCache.toolName, 'planner.getMyTasks'),
        ),
      )
    expect(plannerRows).toHaveLength(1)
  })

  // ─── Test 6 (bonus): TTL expiry — sweeper deletes expired rows ────────────

  it('TTL expiry: SemanticCacheSweeper deletes expired rows and leaves live ones', async () => {
    // Clear table for a clean baseline
    await db.execute(sql`TRUNCATE agents.agent_tool_result_cache RESTART IDENTITY CASCADE`)

    await setTenantContext(db, TENANT_A)

    // Insert one expired row (storedAt 2 s ago, ttl 1 s)
    const expiredHash = 'hash-expired-sweep-001'
    const liveHash = 'hash-live-sweep-001'

    await db.insert(agentToolResultCache).values([
      {
        tenantId: TENANT_A,
        toolName: 'goals.getOkrs',
        canonicalArgsHash: expiredHash,
        semanticEmbedding: null,
        embeddingModel: 'text-embedding-3-small',
        result: { expired: true } as never,
        storedAt: new Date(Date.now() - 2_000), // 2 seconds ago
        ttlSeconds: 1, // already expired
      },
      {
        tenantId: TENANT_A,
        toolName: 'goals.getOkrs',
        canonicalArgsHash: liveHash,
        semanticEmbedding: null,
        embeddingModel: 'text-embedding-3-small',
        result: { live: true } as never,
        storedAt: new Date(),
        ttlSeconds: 3600,
      },
    ])

    const { deletedCount } = await sweeper.handle()
    expect(deletedCount).toBe(1)

    // Expired row must be gone
    // Use superuser-level query (no RLS restriction) to verify at DB level
    const remaining = await db
      .select()
      .from(agentToolResultCache)
      .where(eq(agentToolResultCache.canonicalArgsHash, expiredHash))
    expect(remaining).toHaveLength(0)

    // Live row must still be there
    const liveRemaining = await db
      .select()
      .from(agentToolResultCache)
      .where(eq(agentToolResultCache.canonicalArgsHash, liveHash))
    expect(liveRemaining).toHaveLength(1)
  })
})
