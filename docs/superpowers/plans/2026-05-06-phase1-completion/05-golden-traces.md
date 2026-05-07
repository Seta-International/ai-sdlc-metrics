# Golden Trace Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declare two missing planner intents (`planner.get-plan-status`, `planner.list-at-risk-plans`), then seed four golden-trace rows so the existing `GoldenTraceRunner` CI gate passes before the May 19 demo-prep deadline.

**Architecture:** Intent files are standalone TypeScript modules under `apps/api/src/modules/planner/agent/intents/` — identical in shape to the existing `list-my-tasks.ts`. The seed script is a standalone Node script (not a migration) that uses Drizzle's insert helpers to upsert four rows into `agents.agent_golden_trace` against the SETA pilot tenant. The `GoldenTraceRunner` (already wired into `readiness.router.ts`) picks up new rows automatically — no runner changes needed.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL 16, NestJS intent pattern

---

## File Map

| File                                                                    | Action | Purpose                                             |
| ----------------------------------------------------------------------- | ------ | --------------------------------------------------- |
| `apps/api/src/modules/planner/agent/intents/get-plan-status.ts`         | Create | Intent for `planner.get-plan-status` slug           |
| `apps/api/src/modules/planner/agent/intents/get-plan-status.spec.ts`    | Create | Unit test for the new intent                        |
| `apps/api/src/modules/planner/agent/intents/list-at-risk-plans.ts`      | Create | Intent for `planner.list-at-risk-plans` slug        |
| `apps/api/src/modules/planner/agent/intents/list-at-risk-plans.spec.ts` | Create | Unit test for the new intent                        |
| `apps/api/src/modules/planner/agent/intents/index.ts`                   | Modify | Export both new intents                             |
| `apps/api/src/modules/planner/agent/intents/index.spec.ts`              | Create | Barrel export test                                  |
| `apps/api/src/modules/agents/fixtures/seed-golden-traces.ts`            | Create | Standalone seed script + exported fixture constants |
| `apps/api/src/modules/agents/fixtures/seed-golden-traces.spec.ts`       | Create | Unit test for fixture data shape                    |

---

## Task 1: `planner.get-plan-status` intent declaration

**Files:**

- Create: `apps/api/src/modules/planner/agent/intents/get-plan-status.ts`
- Create: `apps/api/src/modules/planner/agent/intents/get-plan-status.spec.ts`

- [ ] **Step 1: Read the existing intent pattern**

```bash
cat -n apps/api/src/modules/planner/agent/intents/list-my-tasks.ts
```

Confirm the `IntentDescriptor` import path:

```bash
grep -n "IntentDescriptor" apps/api/src/modules/planner/agent/intents/list-my-tasks.ts
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/modules/planner/agent/intents/get-plan-status.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getPlanStatusIntent } from './get-plan-status'

describe('getPlanStatusIntent', () => {
  it('has the correct slug', () => {
    expect(getPlanStatusIntent.slug).toBe('planner.get-plan-status')
  })

  it('has domain planner', () => {
    expect(getPlanStatusIntent.domain).toBe('planner')
  })

  it('has a non-empty description', () => {
    expect(getPlanStatusIntent.description.length).toBeGreaterThan(10)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /home/vietanh/Future
bun run --filter @future/api test apps/api/src/modules/planner/agent/intents/get-plan-status.spec.ts
```

Expected: FAIL — module `./get-plan-status` not found.

- [ ] **Step 4: Create `get-plan-status.ts`**

```typescript
import type { IntentDescriptor } from '../../../agents/declare'

export const getPlanStatusIntent: IntentDescriptor = {
  slug: 'planner.get-plan-status',
  domain: 'planner',
  description:
    'User is asking about the current status, progress, or health of a specific plan or project.',
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun run --filter @future/api test apps/api/src/modules/planner/agent/intents/get-plan-status.spec.ts
```

Expected: PASS — all 3 assertions green.

- [ ] **Step 6: Commit**

```bash
git add \
  apps/api/src/modules/planner/agent/intents/get-plan-status.ts \
  apps/api/src/modules/planner/agent/intents/get-plan-status.spec.ts
git commit -m "feat(planner): add planner.get-plan-status intent declaration"
```

---

## Task 2: `planner.list-at-risk-plans` intent declaration

**Files:**

- Create: `apps/api/src/modules/planner/agent/intents/list-at-risk-plans.ts`
- Create: `apps/api/src/modules/planner/agent/intents/list-at-risk-plans.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/planner/agent/intents/list-at-risk-plans.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { listAtRiskPlansIntent } from './list-at-risk-plans'

describe('listAtRiskPlansIntent', () => {
  it('has the correct slug', () => {
    expect(listAtRiskPlansIntent.slug).toBe('planner.list-at-risk-plans')
  })

  it('has domain planner', () => {
    expect(listAtRiskPlansIntent.domain).toBe('planner')
  })

  it('has a non-empty description', () => {
    expect(listAtRiskPlansIntent.description.length).toBeGreaterThan(10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --filter @future/api test apps/api/src/modules/planner/agent/intents/list-at-risk-plans.spec.ts
```

Expected: FAIL — module `./list-at-risk-plans` not found.

- [ ] **Step 3: Create `list-at-risk-plans.ts`**

```typescript
import type { IntentDescriptor } from '../../../agents/declare'

export const listAtRiskPlansIntent: IntentDescriptor = {
  slug: 'planner.list-at-risk-plans',
  domain: 'planner',
  description:
    'User is asking which plans or projects are at risk of missing their deadline or are blocked.',
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --filter @future/api test apps/api/src/modules/planner/agent/intents/list-at-risk-plans.spec.ts
```

Expected: PASS — all 3 assertions green.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/src/modules/planner/agent/intents/list-at-risk-plans.ts \
  apps/api/src/modules/planner/agent/intents/list-at-risk-plans.spec.ts
git commit -m "feat(planner): add planner.list-at-risk-plans intent declaration"
```

---

## Task 3: Export both new intents from the barrel

**Files:**

- Modify: `apps/api/src/modules/planner/agent/intents/index.ts`
- Create: `apps/api/src/modules/planner/agent/intents/index.spec.ts`

Current content of `index.ts`:

```typescript
export { listMyTasksIntent } from './list-my-tasks'
export { listMyPlansIntent } from './list-my-plans'
export { listEvidenceIntent } from './list-evidence'
```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/planner/agent/intents/index.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import * as intents from './index'

describe('planner intents barrel', () => {
  it('exports getPlanStatusIntent with correct slug', () => {
    expect(intents.getPlanStatusIntent).toBeDefined()
    expect(intents.getPlanStatusIntent.slug).toBe('planner.get-plan-status')
  })

  it('exports listAtRiskPlansIntent with correct slug', () => {
    expect(intents.listAtRiskPlansIntent).toBeDefined()
    expect(intents.listAtRiskPlansIntent.slug).toBe('planner.list-at-risk-plans')
  })

  it('still exports all pre-existing intents', () => {
    expect(intents.listMyTasksIntent).toBeDefined()
    expect(intents.listMyPlansIntent).toBeDefined()
    expect(intents.listEvidenceIntent).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun run --filter @future/api test apps/api/src/modules/planner/agent/intents/index.spec.ts
```

Expected: FAIL — `getPlanStatusIntent` and `listAtRiskPlansIntent` are not exported.

- [ ] **Step 3: Update `index.ts`**

Replace the full file `apps/api/src/modules/planner/agent/intents/index.ts` with:

```typescript
/**
 * Barrel — re-exports all planner intent declarations.
 *
 * Convention: add a new file in this directory and re-export it here.
 * agents.module.ts aggregates from this barrel; no changes to agents.module.ts
 * are needed when adding more planner intents.
 */

export { listMyTasksIntent } from './list-my-tasks'
export { listMyPlansIntent } from './list-my-plans'
export { listEvidenceIntent } from './list-evidence'
export { getPlanStatusIntent } from './get-plan-status'
export { listAtRiskPlansIntent } from './list-at-risk-plans'
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun run --filter @future/api test apps/api/src/modules/planner/agent/intents/index.spec.ts
```

Expected: PASS — all 3 describe cases pass.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/src/modules/planner/agent/intents/index.ts \
  apps/api/src/modules/planner/agent/intents/index.spec.ts
git commit -m "feat(planner): export new intents from barrel"
```

---

## Task 4: Seed golden-trace fixtures

**Files:**

- Create: `apps/api/src/modules/agents/fixtures/seed-golden-traces.ts`
- Create: `apps/api/src/modules/agents/fixtures/seed-golden-traces.spec.ts`

This is a standalone script run once against the SETA pilot database:

```bash
SETA_PILOT_DB_URL=<dsn> SETA_TENANT_ID=<uuid> SETA_ADMIN_USER_ID=<uuid> \
  bun run apps/api/src/modules/agents/fixtures/seed-golden-traces.ts
```

Re-running is safe — uses `onConflictDoUpdate` on the primary key `id`.

- [ ] **Step 1: Check how other seed scripts connect to the database**

```bash
grep -rn "getSeedDatabaseUrl\|SEED_DATABASE_URL\|drizzle\|Pool" \
  apps/api/src/database/seed*.ts 2>/dev/null | head -10
```

Also verify the `agentGoldenTrace` export path:

```bash
grep -rn "export.*agentGoldenTrace" apps/api/src/modules/agents/infrastructure/schema/ | head -5
```

- [ ] **Step 2: Write the failing unit test**

Create `apps/api/src/modules/agents/fixtures/seed-golden-traces.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { GOLDEN_TRACE_FIXTURES } from './seed-golden-traces'

describe('GOLDEN_TRACE_FIXTURES', () => {
  it('has exactly 4 fixtures', () => {
    expect(GOLDEN_TRACE_FIXTURES).toHaveLength(4)
  })

  it('all fixtures have required non-empty fields', () => {
    for (const f of GOLDEN_TRACE_FIXTURES) {
      expect(f.title).toBeTruthy()
      expect(f.userUtterance).toBeTruthy()
      expect(f.expectedToolCalls.length).toBeGreaterThan(0)
      expect(['short-answer', 'list', 'table', 'narrative', 'chart', 'refusal']).toContain(
        f.expectedShape,
      )
      expect(f.taintExpectation).toBe(false)
      expect(f.adversarialCategory).toBeNull()
    }
  })

  it('covers planner and kb tool slugs', () => {
    const allToolCalls = GOLDEN_TRACE_FIXTURES.flatMap((f) => [...f.expectedToolCalls])
    expect(allToolCalls).toContain('planner.list-my-tasks')
    expect(allToolCalls).toContain('planner.get-plan-status')
    expect(allToolCalls).toContain('planner.list-at-risk-plans')
    expect(allToolCalls).toContain('kb.retrieve')
  })

  it('answerShapeContract is a non-empty object for every fixture', () => {
    for (const f of GOLDEN_TRACE_FIXTURES) {
      expect(typeof f.answerShapeContract).toBe('object')
      expect(Object.keys(f.answerShapeContract).length).toBeGreaterThan(0)
    }
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun run --filter @future/api test apps/api/src/modules/agents/fixtures/seed-golden-traces.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `seed-golden-traces.ts`**

```typescript
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

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { sql } from 'drizzle-orm'
import { agentGoldenTrace } from '../infrastructure/schema/agents.schema'

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
        expectedShape: fixture.expectedShape,
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
```

- [ ] **Step 5: Run unit test to verify it passes**

```bash
bun run --filter @future/api test apps/api/src/modules/agents/fixtures/seed-golden-traces.spec.ts
```

Expected: PASS — all 4 assertions green.

- [ ] **Step 6: Verify type check passes**

```bash
bun run --filter @future/api typecheck
```

Expected: zero type errors in the new files.

- [ ] **Step 7: Commit**

```bash
git add \
  apps/api/src/modules/agents/fixtures/seed-golden-traces.ts \
  apps/api/src/modules/agents/fixtures/seed-golden-traces.spec.ts
git commit -m "feat(agents): add golden trace seed script with 4 happy-path fixtures"
```

---

## Task 5: Full test pass and CI gate verification

- [ ] **Step 1: Run all planner intent tests**

```bash
bun run --filter @future/api test apps/api/src/modules/planner/agent/intents/
```

Expected: all 5 spec files green (3 existing + 2 new intent specs + barrel spec).

- [ ] **Step 2: Run all agents fixture tests**

```bash
bun run --filter @future/api test apps/api/src/modules/agents/fixtures/
```

Expected: PASS.

- [ ] **Step 3: TypeScript type check**

```bash
bun run --filter @future/api typecheck
```

Expected: zero type errors.

- [ ] **Step 4: Confirm `GoldenTraceRunner` requires no code changes**

The runner queries `agent_golden_trace WHERE removed_at IS NULL` for the tenant. New rows are picked up automatically. Verify:

```bash
grep -n "agent_golden_trace\|goldenTrace\|GoldenTrace" \
  apps/api/src/modules/agents/application/services/readiness-validator.ts | head -20
```

Expected: the runner references `agentGoldenTrace` table directly — no code changes needed.

- [ ] **Step 5: Final commit for any lint fixes**

```bash
git add -p
git commit -m "chore(planner): lint fixes after golden trace additions"
```

---

## Post-implementation: run the seed against SETA pilot tenant

After all 5 plans are merged and migrations applied:

```bash
SETA_PILOT_DB_URL=<connection string> \
SETA_TENANT_ID=<pilot tenant uuid> \
SETA_ADMIN_USER_ID=<admin user uuid> \
bun run apps/api/src/modules/agents/fixtures/seed-golden-traces.ts
```

Then verify via the readiness endpoint that all 4 traces pass before May 19.
