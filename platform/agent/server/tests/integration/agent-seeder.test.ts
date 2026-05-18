import { createPool, runMigrations } from '@seta/db'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type AgentProfileSeed, seedAgentProfiles } from '../../src/agent-seeder'

declare const process: { env: Record<string, string | undefined> }

const TEST_DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://seta:dev@localhost:5432/seta'

function repoRoot(): string {
  // platform/agent/server/tests/integration → up 4
  return new URL('../../../../../', import.meta.url).pathname
}

const SEED: AgentProfileSeed = {
  slug: 'planner',
  name: 'Planner Agent',
  description: 'Task management',
  instructions: 'You are a planner.',
  model: 'gpt-4o',
  toolIds: ['list_tasks', 'mark_done'],
  workingMemoryTemplate: null,
}

beforeAll(async () => {
  await runMigrations({ url: TEST_DATABASE_URL, roleName: 'platform_admin', repoRoot: repoRoot() })
})

beforeEach(async () => {
  const admin = createPool(TEST_DATABASE_URL, { max: 1 })
  try {
    await admin`DELETE FROM agent.agent_profiles WHERE tenant_id IS NULL AND slug = ${SEED.slug}`
  } finally {
    await admin.end()
  }
})

describe('seedAgentProfiles', () => {
  it('inserts text[] toolIds on a fresh connection (regression: postgres.js typeArrayMap)', async () => {
    // Bug: when seedAgentProfiles ran as the first query on a pooled connection,
    // postgres.js had not yet fetched array type OIDs, so sql.array() serialized
    // text[] as a text scalar and Postgres rejected the INSERT.
    //
    // Drizzle-builder insert bypasses typeArrayMap entirely (serializes the
    // array literal as '{"x","y"}' with type=0 and lets Postgres parse it).
    //
    // This test must use a fresh pool so the seed runs as the very first query.
    const sql = createPool(TEST_DATABASE_URL)
    try {
      await seedAgentProfiles(sql, [SEED])
      const rows = (await sql`
        SELECT tool_ids FROM agent.agent_profiles
        WHERE tenant_id IS NULL AND slug = ${SEED.slug}
      `) as Array<{ tool_ids: string[] }>
      expect(rows).toHaveLength(1)
      expect(rows[0]?.tool_ids).toEqual(['list_tasks', 'mark_done'])
    } finally {
      await sql.end()
    }
  })

  it('is idempotent — second call with same slug does not throw or duplicate', async () => {
    const sql = createPool(TEST_DATABASE_URL)
    try {
      await seedAgentProfiles(sql, [SEED])
      await seedAgentProfiles(sql, [SEED])
      const rows = (await sql`
        SELECT count(*)::int AS n FROM agent.agent_profiles
        WHERE tenant_id IS NULL AND slug = ${SEED.slug}
      `) as Array<{ n: number }>
      expect(rows[0]?.n).toBe(1)
    } finally {
      await sql.end()
    }
  })
})
