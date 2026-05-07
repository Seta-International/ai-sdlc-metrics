# Agent Demo Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock end-to-end agent chat for any authenticated employee by verifying code fixes, adding regression tests, re-seeding the dev DB, and confirming a working turn.

**Architecture:** Three targeted fixes already applied to the branch — (1) 4 agent permission keys added to `EMPLOYEE_DEFAULTS` and `line_manager`, (2) `setKbHandlers` extended to accept `PgBossService` and `confirmUpload` now enqueues a `kb-ingestion` job, (3) dev DB role rows need re-seeding. This plan adds regression tests and validates the full flow.

**Tech Stack:** NestJS, tRPC, pg-boss, Drizzle ORM, Vitest, TypeScript, Bun

---

## File Map

| File                                                                            | Action                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts`      | Already modified — 4 keys added to `EMPLOYEE_DEFAULTS` and `line_manager` |
| `apps/api/src/modules/kernel/domain/constants/default-role-permissions.spec.ts` | **Create** — unit tests asserting the 4 keys are present                  |
| `apps/api/src/modules/agents/interface/trpc/kb.router.ts`                       | Already modified — `setKbHandlers` + `confirmUpload` wired to pg-boss     |
| `apps/api/src/modules/agents/interface/trpc/kb.router.spec.ts`                  | **Create** — unit test asserting `confirmUpload` enqueues the pg-boss job |
| `apps/api/src/modules/agents/agents.module.ts`                                  | Already modified — `setKbHandlers` receives `this.pgBossService`          |

---

### Task 1: Regression test for employee permission defaults (Blocker 1)

**Files:**

- Create: `apps/api/src/modules/kernel/domain/constants/default-role-permissions.spec.ts`

- [ ] **Step 1: Write the tests**

Create `apps/api/src/modules/kernel/domain/constants/default-role-permissions.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { DEFAULT_ROLE_PERMISSIONS } from './default-role-permissions'

const AGENT_PERMISSION_KEYS = [
  'planner:agent:list-my-tasks',
  'planner:agent:list-my-plans',
  'planner:agent:list-evidence',
  'agent:kb:retrieve',
] as const

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  describe('employee', () => {
    const employeeKeys = DEFAULT_ROLE_PERMISSIONS.employee.map((e) => e.permissionKey)

    for (const key of AGENT_PERMISSION_KEYS) {
      it(`includes ${key}`, () => {
        expect(employeeKeys).toContain(key)
      })

      it(`grants ${key} with isLocked: false`, () => {
        const entry = DEFAULT_ROLE_PERMISSIONS.employee.find((e) => e.permissionKey === key)
        expect(entry?.isLocked).toBe(false)
      })
    }
  })

  describe('line_manager', () => {
    const lineManagerKeys = DEFAULT_ROLE_PERMISSIONS.line_manager.map((e) => e.permissionKey)

    for (const key of AGENT_PERMISSION_KEYS) {
      it(`includes ${key}`, () => {
        expect(lineManagerKeys).toContain(key)
      })
    }
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd apps/api && bun run test:unit --reporter=verbose default-role-permissions.spec.ts
```

Expected: 12 tests pass (4 keys × 2 assertions for employee + 4 presence checks for line_manager).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/kernel/domain/constants/default-role-permissions.spec.ts \
        apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts
git commit -m "feat(kernel): add agent/kb permission keys to employee and line_manager defaults"
```

---

### Task 2: Regression test for KB confirmUpload job dispatch (Blocker 2)

**Files:**

- Create: `apps/api/src/modules/agents/interface/trpc/kb.router.spec.ts`

- [ ] **Step 1: Write the test**

Create `apps/api/src/modules/agents/interface/trpc/kb.router.spec.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setKbHandlers, kbRouter } from './kb.router'
import type { KbRetriever } from '../../infrastructure/retrieval/kb-retriever'
import type { S3StorageClient } from '@future/storage'
import type { PgBossService } from '../../../../common/jobs/pg-boss.service'
import type { Db } from '@future/db'

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makePgBossService(): PgBossService {
  return {
    enqueue: vi.fn().mockResolvedValue('job-id-abc'),
    registerWorker: vi.fn(),
    registerScheduledWorker: vi.fn(),
    schedule: vi.fn(),
    onApplicationBootstrap: vi.fn(),
    onApplicationShutdown: vi.fn(),
  } as unknown as PgBossService
}

function makeDb(): Db {
  return {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Db
}

const DOCUMENT_ID = '01900000-0000-7000-8000-000000000099'
const TENANT_ID = '01900000-0000-7000-8000-000000000001'

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('kbRouter.confirmUpload', () => {
  let pgBoss: PgBossService
  let db: Db

  beforeEach(() => {
    pgBoss = makePgBossService()
    db = makeDb()
    setKbHandlers({} as KbRetriever, {} as S3StorageClient, db, pgBoss)
  })

  it('returns { ok: true } and enqueues a kb-ingestion job', async () => {
    const caller = kbRouter.createCaller({
      tenantId: TENANT_ID,
      actorId: 'user-1',
    } as never)

    const result = await caller.confirmUpload({ documentId: DOCUMENT_ID })

    expect(result).toEqual({ ok: true })
    expect(pgBoss.enqueue).toHaveBeenCalledOnce()
    expect(pgBoss.enqueue).toHaveBeenCalledWith('kb-ingestion', {
      documentId: DOCUMENT_ID,
      tenantId: TENANT_ID,
    })
  })

  it('updates document status to processing before enqueueing', async () => {
    const whereStub = vi.fn().mockResolvedValue(undefined)
    const setStub = vi.fn().mockReturnValue({ where: whereStub })
    const updateStub = vi.fn().mockReturnValue({ set: setStub })
    setKbHandlers(
      {} as KbRetriever,
      {} as S3StorageClient,
      { update: updateStub } as unknown as Db,
      pgBoss,
    )

    const caller = kbRouter.createCaller({ tenantId: TENANT_ID, actorId: 'user-1' } as never)
    await caller.confirmUpload({ documentId: DOCUMENT_ID })

    expect(setStub).toHaveBeenCalledWith({ status: 'processing' })
    expect(pgBoss.enqueue).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd apps/api && bun run test:unit --reporter=verbose kb.router.spec.ts
```

Expected: both tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/agents/interface/trpc/kb.router.spec.ts \
        apps/api/src/modules/agents/interface/trpc/kb.router.ts \
        apps/api/src/modules/agents/agents.module.ts
git commit -m "feat(agents): wire kb-ingestion pg-boss job dispatch in confirmUpload"
```

---

### Task 3: Re-seed dev DB role permissions (Blocker 3)

**Context:** The `employee` role rows in the dev DB were seeded before the 4 new permission keys were added to `EMPLOYEE_DEFAULTS`. The seed script must be re-run so existing tenants get the new rows.

**Files:** No code changes — manual DB operation only.

- [ ] **Step 1: Run the seed script**

```bash
cd apps/api && bun run seed
```

Watch stdout for errors. Expected: no errors, logs show permission inserts completing.

- [ ] **Step 2: Verify the rows exist**

Connect to the dev PostgreSQL database and run:

```sql
SELECT role_key, permission_key, is_locked
FROM kernel.role_permission
WHERE permission_key IN (
  'planner:agent:list-my-tasks',
  'planner:agent:list-my-plans',
  'planner:agent:list-evidence',
  'agent:kb:retrieve'
)
ORDER BY role_key, permission_key;
```

Expected: rows for `employee` (and `line_manager`) with `is_locked = false`. If zero rows, the seed did not run against the right DB — check `DATABASE_URL` env var.

---

### Task 4: End-to-end smoke test

**Goal:** Confirm a chat turn completes without `sub-agent dropped` in the API logs.

- [ ] **Step 1: Start the API**

```bash
cd apps/api && bun run dev
```

Watch for:

```
SubAgentRegistry booted successfully. N sub-agent(s) registered: planner.read-only, ...
```

If you see `SubAgentRegistry boot validation failed`, do not proceed — fix the error first.

- [ ] **Step 2: Send a test turn as an employee user**

Using an HTTP client (curl, Postman, or the web-shell UI), authenticate as an `employee`-role user and POST:

```http
POST /api/agents/turn
Authorization: Bearer <employee-jwt>
Content-Type: application/json

{
  "message": "What tasks do I have this week?",
  "conversationId": "01900000-0000-7000-8000-000000000099"
}
```

Or open the app in a browser, log in as the employee test user, and type the message in the agent panel.

- [ ] **Step 3: Verify logs show no dropped sub-agents**

In the API stdout, confirm the following line does NOT appear:

```
resolveForSession: sub-agent "planner.read-only" dropped — no tools permitted by role
```

The turn response must be HTTP 200 with a non-empty message in the body.

- [ ] **Step 4: Final TypeScript check**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: no output (zero errors).
