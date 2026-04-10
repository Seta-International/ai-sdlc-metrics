# Future — Testing Strategy

**Date:** 2026-04-09
**Status:** Agreed
**Project:** Seta Future AaaS

---

## Philosophy

Tests are not optional. They are part of implementation. You do not write a feature and then write tests — you write them together or the feature is not done.

Three rules:
1. Every command handler has a test covering the happy path + at least one error path.
2. Every cross-module interaction has an integration test hitting a real database.
3. Every user-visible flow on a critical path (leave approval, payroll submission, agent conversation) has an E2E test.

The cost of tests with AI-assisted coding is near-zero. There is no "we'll add tests later." Later does not exist.

---

## Test Pyramid

```
         ┌───────────────┐
         │    E2E (Playwright)    │  ← ~20 tests, critical user flows
         │  (slow, confidence++)  │
         ├───────────────────────┤
         │  Integration (Vitest)  │  ← ~200 tests, real DB, real NestJS
         │  (medium, real deps)   │
         ├───────────────────────┤
         │    Unit (Vitest)       │  ← ~1000 tests, pure functions, fast
         │  (fast, isolated)      │
         └───────────────────────┘
```

---

## Test Frameworks

| Layer | Framework | Command |
|-------|-----------|---------|
| Unit | Vitest `^4.x` (current: 4.1.3) | `bun vitest run` |
| Integration | Vitest `^4.x` + real PostgreSQL | `bun vitest run --project integration` |
| E2E | Playwright `^1.59` (current: 1.59.1) | `bun playwright test` |
| Agent evals | Custom eval harness + Anthropic API | `bun run evals` |

### Why Vitest, not Jest?

Vitest runs natively with Bun, shares TypeScript config, and is 5-10x faster than Jest. No transform config, no Babel, no `moduleNameMapper` hacks. Unit tests for a 10-module NestJS app should run in under 10 seconds.


### Why not Supertest for integration?

Supertest tests the HTTP layer. We test one level deeper — the application service / command handler — against a real database. This tests the actual business logic without HTTP overhead and without mocking Drizzle.

---

## Unit Tests

**What to unit test:** domain entities, value objects, pure business rules, command handlers (with all dependencies mocked), query handlers, utility functions.

**What NOT to unit test:** Drizzle repositories (use integration tests), NestJS modules (use integration tests), tRPC routers (covered by integration).

**Location:** co-located with source file.

```
modules/people/application/commands/
  create-employment-contract.handler.ts
  create-employment-contract.handler.spec.ts   ← unit test here
```

**Pattern — command handler unit test:**

```ts
// create-employment-contract.handler.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CreateEmploymentContractHandler } from './create-employment-contract.handler'
import { KernelQueryFacade } from '../../kernel/kernel-query.facade'
import { EmploymentContractRepository } from '../infrastructure/repositories/employment-contract.repository'

describe('CreateEmploymentContractHandler', () => {
  let handler: CreateEmploymentContractHandler
  let kernelQuery: KernelQueryFacade
  let contractRepo: EmploymentContractRepository

  beforeEach(() => {
    kernelQuery = {
      getActor: vi.fn(),
    } as unknown as KernelQueryFacade

    contractRepo = {
      insert: vi.fn(),
    } as unknown as EmploymentContractRepository

    handler = new CreateEmploymentContractHandler(kernelQuery, contractRepo)
  })

  it('creates a contract when the actor exists and is active', async () => {
    vi.mocked(kernelQuery.getActor).mockResolvedValue({
      id: 'actor-1',
      status: 'active',
      tenantId: 'tenant-1',
    })
    vi.mocked(contractRepo.insert).mockResolvedValue({ id: 'contract-1' })

    const result = await handler.execute({
      actorId: 'actor-1',
      tenantId: 'tenant-1',
      startDate: new Date('2026-05-01'),
      type: 'full_time',
    })

    expect(result.id).toBe('contract-1')
    expect(contractRepo.insert).toHaveBeenCalledOnce()
  })

  it('throws ActorNotFoundException when actor does not exist', async () => {
    vi.mocked(kernelQuery.getActor).mockResolvedValue(null)

    await expect(
      handler.execute({ actorId: 'missing', tenantId: 'tenant-1', startDate: new Date(), type: 'full_time' })
    ).rejects.toThrow('ActorNotFoundException')
  })

  it('throws when actor is archived', async () => {
    vi.mocked(kernelQuery.getActor).mockResolvedValue({ id: 'actor-1', status: 'archived', tenantId: 'tenant-1' })

    await expect(
      handler.execute({ actorId: 'actor-1', tenantId: 'tenant-1', startDate: new Date(), type: 'full_time' })
    ).rejects.toThrow()
  })
})
```

**Coverage target:** 100% branch coverage on command and query handlers.

---

## Integration Tests

**What to integration test:** Drizzle repositories against a real database, cross-module event flows, outbox delivery, tenant RLS isolation.

**Test database:** a local PostgreSQL 16 instance (Docker or native). Each integration test **file** gets its own dedicated PostgreSQL schema (e.g. `test_people_abc123`), created fresh at `beforeAll`, migrations applied via `MigrationRunner`, fixtures seeded, then dropped at `afterAll`. This mirrors the production schema-per-module pattern exactly and ensures full isolation — no shared state, no truncate races between parallel files.

**Why per-file schema, not transaction rollback:** transaction rollback cannot test code that itself opens transactions (e.g. outbox writes, which must commit before the relay can see them). Per-file schema handles all cases correctly.

```ts
// employment-contract.repository.integration.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { EmploymentContractRepository } from './employment-contract.repository'
import { createTestSchema, dropTestSchema } from '@future/db/test-helpers'

const TENANT_A = 'tenant-aaaa-0000'
const TENANT_B = 'tenant-bbbb-0000'

describe('EmploymentContractRepository', () => {
  let pool: Pool
  let db: ReturnType<typeof drizzle>
  let schemaName: string
  let repo: EmploymentContractRepository

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL })
    db = drizzle(pool)
    schemaName = await createTestSchema(db)  // creates isolated schema, runs migrations
    repo = new EmploymentContractRepository(db, schemaName)
  })

  afterAll(async () => {
    await dropTestSchema(db, schemaName)
    await pool.end()
  })

  it('inserts and retrieves a contract within tenant scope', async () => {
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
    const actor = await seedActor(db, { tenantId: TENANT_A, schemaName })
    const contract = await repo.insert({ actorId: actor.id, tenantId: TENANT_A, type: 'full_time', startDate: new Date() })
    const found = await repo.findById(contract.id)
    expect(found?.actorId).toBe(actor.id)
  })

  it('CRITICAL: RLS prevents Tenant A from reading Tenant B data', async () => {
    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_B}, false)`)
    const actorB = await seedActor(db, { tenantId: TENANT_B, schemaName })
    await repo.insert({ actorId: actorB.id, tenantId: TENANT_B, type: 'full_time', startDate: new Date() })

    await db.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, false)`)
    const contracts = await repo.findAll()
    expect(contracts).toHaveLength(0)  // Tenant A must see zero Tenant B records
  })
})

**Critical integration test: tenant RLS isolation.** Every module with data tables must have a test that seeds data for Tenant B, switches to Tenant A context, and asserts zero rows are returned. This is non-negotiable.

**Vitest project config:**

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      {
        name: 'unit',
        include: ['**/*.spec.ts'],
        exclude: ['**/*.integration.spec.ts', '**/*.e2e.spec.ts'],
      },
      {
        name: 'integration',
        include: ['**/*.integration.spec.ts'],
        poolOptions: { threads: { singleThread: true } },  // DB tests must be serial
        testTimeout: 30_000,
      },
    ]
  }
})
```

---

## E2E Tests (Playwright)

**What to E2E test:** critical user flows that span frontend + backend + database. Not every user flow — only the ones where a silent failure would cause real harm.

**Mandatory E2E tests:**

| Flow | Why |
|------|-----|
| Leave request → approval workflow | Touches 3+ services, decision_case kernel, notification |
| Payroll reconciliation export | Finance data + tenant isolation |
| Agent conversation (Q&A) | LLM + MCP tool + RLS + audit_event |
| SSO login via Microsoft Entra | Auth flow, cross-zone session handoff |
| Employee onboarding (people + time + hiring modules) | Cross-module data creation |

**Location:** `apps/e2e/` — a separate app in the monorepo.

```
apps/e2e/
  playwright.config.ts
  fixtures/            → test tenant setup, seed helpers
  tests/
    auth.spec.ts
    leave-approval.spec.ts
    payroll.spec.ts
    agent-conversation.spec.ts
    onboarding.spec.ts
```

**Pattern:**

```ts
// leave-approval.spec.ts
import { test, expect } from '@playwright/test'
import { seedTestTenant, teardownTestTenant } from '../fixtures/tenant'

test.describe('Leave approval workflow', () => {
  let tenantId: string

  test.beforeEach(async () => {
    tenantId = await seedTestTenant()
  })

  test.afterEach(async () => {
    await teardownTestTenant(tenantId)
  })

  test('employee submits leave, manager approves, balance decrements', async ({ page }) => {
    await page.goto('/time/leave/new')
    await page.fill('[data-testid="leave-start-date"]', '2026-06-01')
    await page.fill('[data-testid="leave-end-date"]', '2026-06-05')
    await page.click('[data-testid="submit-leave-request"]')

    // Verify pending state
    await expect(page.getByText('Pending approval')).toBeVisible()

    // Switch to manager session
    await page.goto('/api/test/login?role=manager&tenantId=' + tenantId)
    await page.goto('/time/approvals')
    await page.click('[data-testid="approve-leave"]')

    // Switch back to employee — verify balance
    await page.goto('/api/test/login?role=employee&tenantId=' + tenantId)
    await page.goto('/time/leave/balance')
    await expect(page.getByTestId('remaining-days')).toContainText('7')  // started with 12, used 5
  })
})
```

**E2E runs:** staging environment only. Never against production. Triggered on every staging deploy.

---

## Agent Evals

Agent evals are separate from functional tests. They measure **accuracy** — whether the agent's output contains correct facts.

**Eval definition:** accuracy = % of queries where the agent output (a) contains no factual errors verifiable against canonical data and (b) covers ≥80% of the requested information. Measured by human review of a stratified random sample.

**Automated eval harness:**

```ts
// evals/leave-policy-qa.eval.ts
import { runEval } from '@future/evals'

runEval({
  name: 'leave-policy-qa',
  model: 'claude-sonnet-4-6',
  cases: [
    {
      input: 'How many days of annual leave do I have left this year?',
      expectedFacts: ['exact_remaining_balance', 'correct_leave_type'],
      fixtures: { employee: 'seed-employee-10-days-remaining' },
    },
    {
      input: 'What is the policy for carrying over unused leave?',
      expectedFacts: ['carryover_cap', 'expiry_date'],
      fixtures: { policy: 'seed-leave-policy-5day-carryover' },
    },
  ],
})
```

**Eval gates:**

| Phase | Gate to progress |
|-------|-----------------|
| Phase A launch | >50% accuracy on 30 real queries from user research |
| Phase B launch | >60% accuracy on stratified 50-query sample |
| Phase C launch | >80% accuracy on stratified 50-query sample |

When upgrading an Anthropic model, the eval suite runs before the change merges.

**Eval triggers:**
- Any change to a system prompt or tool definition
- Any change to RAG retrieval logic
- Any model version bump

---

## Test Data and Fixtures

**Use a dedicated test tenant.** Never seed test data into `tenant_id = '00000000-...'` or any shared namespace. Every integration and E2E test creates its own `tenant_id` (UUID v7) and cleans it up after.

**Seed helpers live in `packages/db/test-helpers/`:**

```ts
// packages/db/test-helpers/index.ts
export async function seedActor(db: Database, overrides: Partial<Actor> & { schemaName?: string } = {}): Promise<Actor> {
  const actor = {
    id: uuidv7(),
    tenantId: overrides.tenantId ?? uuidv7(),
    type: 'person',
    status: 'active',
    ...overrides,
  }
  await db.insert(actorTable).values(actor)
  return actor
}

export async function createTestSchema(db: Database): Promise<string> {
  const schemaName = `test_${uuidv7().replace(/-/g, '').slice(0, 12)}`
  await db.execute(sql`CREATE SCHEMA ${sql.identifier(schemaName)}`)
  await new MigrationRunner(db, schemaName).runAll()
  return schemaName
}

export async function dropTestSchema(db: Database, schemaName: string): Promise<void> {
  await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(schemaName)} CASCADE`)
}
```

**Do not use shared fixtures** that persist across test runs. Every test that needs data creates it and owns its teardown.

---

## Module Boundary Tests

`eslint-plugin-boundaries` catches boundary violations at compile time in CI. Configuration lives in `.eslintrc.js` at the monorepo root:

```js
// .eslintrc.js
module.exports = {
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'domain', pattern: 'modules/*/domain/**' },
      { type: 'application', pattern: 'modules/*/application/**' },
      { type: 'infrastructure', pattern: 'modules/*/infrastructure/**' },
      { type: 'interface', pattern: 'modules/*/interface/**' },
    ],
  },
  rules: {
    'boundaries/element-types': ['error', {
      default: 'disallow',
      rules: [
        // infrastructure can import domain
        { from: 'infrastructure', allow: ['domain'] },
        // application can import domain
        { from: 'application', allow: ['domain'] },
        // interface can import application (facades only, enforced by DI)
        { from: 'interface', allow: ['application'] },
        // domain cannot import anything from this list (it is pure)
      ],
    }],
  },
}
```

In addition to eslint, NestJS DI enforces the boundary at runtime: each module only exports `[PeopleQueryFacade]`. Attempting to inject a repository from outside the module fails at startup.

---

## CI Test Matrix

```
On pull request:
  1. bun turbo lint --filter='[HEAD^1]'          → lint changed packages
  2. bun turbo typecheck --filter='[HEAD^1]'     → tsc across all
  3. bun vitest run --project unit               → unit tests (< 30s target)
  4. bun vitest run --project integration        → integration tests (< 3 min target)

On merge to main (staging deploy):
  5. bun playwright test                         → E2E against staging (< 10 min target)
  6. bun run evals --changed                     → run evals for changed prompts only

Weekly (scheduled):
  7. bun run evals --all                         → full eval suite, accuracy baseline report
```

**Gate policy:**
- Steps 1-4 are required to merge. PR is blocked if any fail.
- Step 5 blocks promotion to production. Staging deploy proceeds; production deploy waits for E2E green.
- Steps 6-7 never block deploys. They produce a report. If accuracy drops below the gate threshold, a follow-up sprint is triggered (not a revert).

---

## What We Do NOT Test

- **Drizzle's query generation.** We trust the library. We test that our repositories produce correct results against a real DB, not that Drizzle generated the right SQL.
- **NestJS DI wiring.** The framework wires modules. We test behavior, not that `@Injectable()` works.
- **AWS service internals.** We do not test that SQS delivers messages or that S3 stores files. We mock these in unit tests and trust them in integration tests.
- **Third-party auth.** Microsoft Entra OIDC is mocked in E2E tests via a test login endpoint that bypasses SSO and sets a session cookie directly.
