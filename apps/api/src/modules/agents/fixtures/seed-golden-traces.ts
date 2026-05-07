/**
 * Seed script — upserts four golden-trace rows for the SETA pilot tenant.
 *
 * Run once against the pilot database:
 *   SETA_PILOT_DB_URL=<dsn> \
 *   SETA_TENANT_ID=<uuid> \
 *   SETA_ADMIN_USER_ID=<uuid> \
 *   bun run apps/api/src/modules/agents/fixtures/seed-golden-traces.ts
 *
 * Re-running is safe — onConflictDoUpdate on primary key id.
 */

// ── Exported fixture constants (also used by the spec) ────────────────────────

export const GOLDEN_TRACE_FIXTURES = [
  {
    id: '11111111-0001-4000-8000-000000000001',
    title: 'planner.list-my-tasks',
    userUtterance: 'What are my open tasks this week?',
    expectedToolCalls: ['planner.list-my-tasks'] as string[],
    expectedShape: 'list',
    expectedPermissionKeys: ['planner:read'] as string[],
    taintExpectation: false,
    answerShapeContract: { items: 'array', each: { title: 'string', status: 'string' } } as Record<
      string,
      unknown
    >,
    adversarialCategory: null,
  },
  {
    id: '11111111-0002-4000-8000-000000000002',
    title: 'planner.plan-status',
    userUtterance: "What's the status of Project Alpha?",
    expectedToolCalls: ['planner.get-plan-status'] as string[],
    expectedShape: 'narrative',
    expectedPermissionKeys: ['planner:read'] as string[],
    taintExpectation: false,
    answerShapeContract: { summary: 'string', health: 'string' } as Record<string, unknown>,
    adversarialCategory: null,
  },
  {
    id: '11111111-0003-4000-8000-000000000003',
    title: 'planner.role-analysis',
    userUtterance: 'Which plans are at risk?',
    expectedToolCalls: ['planner.list-at-risk-plans'] as string[],
    expectedShape: 'table',
    expectedPermissionKeys: ['planner:read'] as string[],
    taintExpectation: false,
    answerShapeContract: { rows: 'array', each: { planName: 'string', risk: 'string' } } as Record<
      string,
      unknown
    >,
    adversarialCategory: null,
  },
  {
    id: '11111111-0004-4000-8000-000000000004',
    title: 'kb.leave-policy',
    userUtterance: 'What is our annual leave policy?',
    expectedToolCalls: ['kb.retrieve'] as string[],
    expectedShape: 'short-answer',
    expectedPermissionKeys: [] as string[],
    taintExpectation: false,
    answerShapeContract: { answer: 'string' } as Record<string, unknown>,
    adversarialCategory: null,
  },
] as const

// ── Main (only runs when invoked directly) ────────────────────────────────────

async function main() {
  const dbUrl = process.env.SETA_PILOT_DB_URL
  if (!dbUrl) {
    console.error('SETA_PILOT_DB_URL env var is required')
    process.exit(1)
  }

  const tenantId = process.env.SETA_TENANT_ID
  const adminUserId = process.env.SETA_ADMIN_USER_ID
  if (!tenantId || !adminUserId) {
    console.error('SETA_TENANT_ID and SETA_ADMIN_USER_ID env vars are required')
    process.exit(1)
  }

  // Dynamic imports keep DB deps out of the module graph when the spec
  // imports only GOLDEN_TRACE_FIXTURES from this file.
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { Pool } = await import('pg')
  const { sql } = await import('drizzle-orm')
  const { agentGoldenTrace } = await import('../infrastructure/schema/agents.schema')

  const pool = new Pool({ connectionString: dbUrl })
  const db = drizzle(pool)

  console.log(`Seeding ${GOLDEN_TRACE_FIXTURES.length} golden traces for tenant ${tenantId}`)

  for (const fixture of GOLDEN_TRACE_FIXTURES) {
    await db
      .insert(agentGoldenTrace)
      .values({
        id: fixture.id,
        title: fixture.title,
        tenantId,
        seedUserId: adminUserId,
        userUtterance: fixture.userUtterance,
        expectedToolCalls: [...fixture.expectedToolCalls],
        expectedShape: fixture.expectedShape as string,
        expectedPermissionKeys: [...fixture.expectedPermissionKeys],
        taintExpectation: fixture.taintExpectation,
        answerShapeContract: fixture.answerShapeContract,
        adversarialCategory: fixture.adversarialCategory,
        createdBy: adminUserId,
      })
      .onConflictDoUpdate({
        target: agentGoldenTrace.id,
        set: {
          title: sql`excluded.title`,
          userUtterance: sql`excluded.user_utterance`,
          expectedToolCalls: sql`excluded.expected_tool_calls`,
          expectedShape: sql`excluded.expected_shape`,
          expectedPermissionKeys: sql`excluded.expected_permission_keys`,
          taintExpectation: sql`excluded.taint_expectation`,
          answerShapeContract: sql`excluded.answer_shape_contract`,
          adversarialCategory: sql`excluded.adversarial_category`,
        },
      })

    console.log(`  ✓ ${fixture.title}`)
  }

  console.log('Done.')
  await pool.end()
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
