# Agent Demo Blockers — Consolidated Spec

**Date:** 2026-05-07
**Branch:** feat/agent-phase-1-complete
**Goal:** Unblock end-to-end agent chat for any authenticated user by 2026-05-20 demo

---

## Context

Six gaps were implemented to enable agent chat. Three remaining blockers prevent a working demo turn:

1. Employee role has no agent/KB tool permissions → sub-agent dropped at stage (c)
2. `confirmUpload` never enqueues a pg-boss job → documents stay `pending` forever
3. After code changes, dev DB role-permission rows need re-seeding

---

## Blocker 1 — Missing employee-role agent permissions

### Root Cause

`DEFAULT_ROLE_PERMISSIONS` in `apps/api/src/modules/kernel/domain/constants/default-role-permissions.ts` defines the baseline permissions seeded for every tenant's `employee` and `line_manager` roles.

The following four permission keys were added to `PERMISSIONS` (permissions.ts) but were never added to `EMPLOYEE_DEFAULTS`:

| Key constant                  | Value                         |
| ----------------------------- | ----------------------------- |
| `PLANNER_AGENT_LIST_MY_TASKS` | `planner:agent:list-my-tasks` |
| `PLANNER_AGENT_LIST_MY_PLANS` | `planner:agent:list-my-plans` |
| `PLANNER_AGENT_LIST_EVIDENCE` | `planner:agent:list-evidence` |
| `AGENT_KB_RETRIEVE`           | `agent:kb:retrieve`           |

Because `roleAllowedPermissions` does not contain these keys, stage (b) of `SubAgentRegistry.resolveForSession` filters out every tool in the planner sub-agent and KB retrieve tool. Stage (c) then drops the sub-agent entirely (empty effective scope).

### Fix

In `default-role-permissions.ts`, add all four keys to `EMPLOYEE_DEFAULTS` with `isLocked: false`. Also add them to `LINE_MANAGER_DEFAULTS` (line managers should inherit all employee permissions).

### Success Criteria

`SubAgentRegistry.resolveForSession` returns at least one sub-agent for a session with `employee` role and empty `enabledModules`.

---

## Blocker 2 — `confirmUpload` never dispatches KB ingestion job

### Root Cause

`kb.router.ts → confirmUpload` sets the document status to `processing` in the DB but never calls `pgBoss.send('kb-ingestion', ...)`. The `KbIngestionWorker` registered in `onApplicationBootstrap` (agents.module.ts) never receives a job, so documents remain `processing` (or `pending`) with no embeddings written.

`setKbHandlers` currently accepts `(retriever, storage, db)` — it has no reference to `PgBossService`, so `confirmUpload` cannot enqueue the job.

### Fix

**Step 1 — Extend `setKbHandlers` signature:**

```typescript
// kb.router.ts
let _pgBoss: PgBossService
export function setKbHandlers(
  retriever: KbRetriever,
  storage: S3StorageClient,
  db: Db,
  pgBoss: PgBossService,
): void { ... }
```

**Step 2 — Enqueue in `confirmUpload`:**

```typescript
confirmUpload: publicProcedure
  .input(z.object({ documentId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    await _db
      .update(agentKbDocument)
      .set({ status: 'processing' })
      .where(eq(agentKbDocument.id, input.documentId))
    await _pgBoss.send('kb-ingestion', {
      documentId: input.documentId,
      tenantId: ctx.tenantId!,
    })
    return { ok: true }
  }),
```

**Step 3 — Pass `pgBossService` in `agents.module.ts`:**

```typescript
setKbHandlers(this.kbRetriever, this.kbStorage, this.db, this.pgBossService)
```

### Success Criteria

After uploading a document through the UI and confirming, the document transitions from `processing` to `ready` within ~30 seconds (pg-boss polling interval) and the `agentKbDocument.embeddingStatus` column updates accordingly.

---

## Blocker 3 — Dev DB role-permission rows stale

### Root Cause

Blocker 1's code fix only affects new tenant seeding. Existing tenants in the dev DB (including the demo tenant) have role_permission rows seeded from the old `EMPLOYEE_DEFAULTS` that lack the four new keys.

### Fix

After deploying Blocker 1's code change, run the role-permission seed script against the dev DB:

```bash
bun run db:seed-roles
```

If no such command exists, execute the seed handler directly:

```bash
cd apps/api && bun run scripts/seed-role-permissions.ts
```

Alternatively, the platform_admin role-management UI at `/admin/roles` can be used to manually grant the four permissions to the `employee` role for the demo tenant.

### Success Criteria

`SELECT * FROM kernel.role_permission WHERE permission_key IN ('planner:agent:list-my-tasks', 'planner:agent:list-my-plans', 'planner:agent:list-evidence', 'agent:kb:retrieve')` returns rows for the demo tenant's employee role.

---

## Implementation Order

1. **Blocker 1** — code change in `default-role-permissions.ts` (no runtime risk, purely additive)
2. **Blocker 2** — extend `setKbHandlers` + `confirmUpload` + `agents.module.ts` wiring
3. **Blocker 3** — run DB re-seed (manual step after deploying Blockers 1+2)

---

## Out of Scope

- Changing the ingestion worker itself (already implemented in Gap 5)
- Frontend upload UX beyond what Gap 6 delivered
- AI model quality or prompt tuning
