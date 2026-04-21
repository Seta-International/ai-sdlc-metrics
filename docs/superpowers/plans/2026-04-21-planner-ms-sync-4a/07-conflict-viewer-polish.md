# Plan 4.7 — Conflict Viewer + Force Re-Sync + Polish + E2E Rollout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out Sub-project #4a. Ship the admin conflict viewer, per-task force re-sync, sync-state badges on plans and tasks in `web-planner`, the nightly contract test against SETA's sandbox MS tenant, the full E2E Playwright suite, CI-enforced performance budgets, and the internal-tenant rollout watch-window.

**Architecture:** No new modules. UI build-outs on `ms_sync_conflict` read surface (Plan 4.3 wrote the rows), new `force-resync` one-shot command, status-badge components, Playwright coverage extension.

**Tech Stack:** React, tRPC, Playwright, GitHub Actions.

**Source spec:** [`2026-04-21-planner-ms-sync-4a-design.md`](../../specs/2026-04-21-planner-ms-sync-4a-design.md) §7, §8, §9.3–9.5, §10.2 (Plan 4.7).

**Depends on:** Plan 4.4 (core sync), Plan 4.5 (attachments), Plan 4.6 (rosters) all merged.

---

## Task 1: Conflict viewer backend — tRPC + queries

**Files:**

- Modify: `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts`
- Create: `apps/api/src/modules/planner/application/queries/ms-sync/list-conflicts.handler.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/retry-conflict.handler.ts` (+ `.spec.ts`)
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/accept-ms-state-for-conflict.handler.ts` (+ `.spec.ts`)

- [ ] **Step 1: tRPC surface**

```typescript
conflicts: router({
  list: tenantAdminProcedure
    .input(z.object({
      resolved: z.enum(['open', 'all']).default('open'),
      limit: z.number().int().min(1).max(200).default(100),
      cursor: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      return ctx.queryBus.execute(new ListConflictsQuery(ctx.tenantId, input))
    }),
  retry: tenantAdminProcedure
    .input(z.object({ conflictId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.commandBus.execute(new RetryConflictCommand(ctx.tenantId, ctx.actorId, input.conflictId))
    }),
  acceptMsState: tenantAdminProcedure
    .input(z.object({ conflictId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.commandBus.execute(new AcceptMsStateForConflictCommand(ctx.tenantId, ctx.actorId, input.conflictId))
    }),
}),
```

- [ ] **Step 2: `ListConflictsQuery` handler**

Reads `ms_sync_conflict` filtered by resolved/all with cursor pagination ordered by `created_at DESC`. Returns `{ conflicts: ConflictDto[], nextCursor: string | null }`.

`ConflictDto` includes: id, kind, createdAt, task snippet (id, title, planTitle) joined via repo, field, mineValue, theirsValue, limitCode (parsed from raw_error), resolution.

- [ ] **Step 3: `RetryConflictHandler`**

```typescript
@CommandHandler(RetryConflictCommand)
export class RetryConflictHandler implements ICommandHandler<RetryConflictCommand> {
  async execute(cmd: RetryConflictCommand): Promise<void> {
    const conflict = await this.conflictRepo.get(cmd.conflictId)
    if (!conflict || conflict.tenantId !== cmd.tenantId) throw new Error('Not found')
    if (conflict.resolvedAt) throw new Error('Already resolved')

    switch (conflict.kind) {
      case 'push_412_exhausted':
      case 'push_failed':
      case 'push_403_quota':
        if (conflict.taskId) {
          await this.boss.send(
            'ms-sync-push-task',
            { tenantId: cmd.tenantId, taskId: conflict.taskId },
            {
              singletonKey: `push-task:${conflict.taskId}`,
              startAfter: 0,
            },
          )
        }
        break
      case 'attachment_upload_failed':
        await this.boss.send(
          'ms-sync-push-attachment',
          {
            tenantId: cmd.tenantId,
            attachmentId: (conflict.rawError as any)?.attachmentId,
          },
          { startAfter: 0 },
        )
        break
      default:
        // field_lww and pull_unresolved_assignee can't be "retried" directly
        throw new Error(`Cannot retry conflict kind=${conflict.kind}`)
    }

    // Mark resolved optimistically; if the retry fails, a new conflict row will appear
    await this.conflictRepo.markResolved(conflict.id, cmd.actorId, 'applied_mine')
  }
}
```

- [ ] **Step 4: `AcceptMsStateForConflictHandler`**

Reads conflict's `theirsValue`; writes it into the local task via `taskRepo.applyMsWonFields` with `origin='ms-sync-pull'`. Marks conflict `resolution='applied_theirs'`.

- [ ] **Step 5: Tests for each**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(planner): conflicts tRPC + list/retry/accept-ms-state handlers"
```

---

## Task 2: web-admin conflict viewer UI

**Files:**

- Create: `apps/web-admin/src/app/integrations/microsoft/conflicts/page.tsx`
- Create: `apps/web-admin/src/app/integrations/microsoft/conflicts/conflict-table.tsx` (+ `.spec.tsx`)
- Create: `apps/web-admin/src/app/integrations/microsoft/conflicts/conflict-detail-drawer.tsx` (+ `.spec.tsx`)
- Create: `apps/web-admin/src/app/integrations/microsoft/conflicts/conflict-row.tsx` (+ `.spec.tsx`)

- [ ] **Step 1: `/conflicts/page.tsx`** — uses `<DataTable>` and `<Tabs>` from `@future/ui`. Tabs: "Open" (default, reads `resolved=open`), "History" (`resolved=all`).

- [ ] **Step 2: `ConflictTable`** — columns: Created (relative time), Kind (badge), Resource (task title → link), Actions.

Kind → badge mapping:

- `field_lww` → gray "Field overwrite" (info)
- `push_412_exhausted` → orange "Push retry exhausted" (warning)
- `push_403_quota` → red "Quota limit" (danger)
- `push_failed` → red "Push failed" (danger)
- `pull_unresolved_assignee` → gray "Assignee pending" (info)
- `credential_invalidated` → red "Credential invalid" (danger)
- `attachment_upload_failed` → orange "Attachment upload failed" (warning)

Use `status/info`, `status/warning`, `status/danger` DESIGN.md tokens — no hardcoded colors.

- [ ] **Step 3: `ConflictDetailDrawer`** — opens on row click. Shows:

- Created at (absolute)
- Resource link (hard `<a>` to `web-planner`)
- Field name (if present)
- Side-by-side "Your change" / "Microsoft 365 change" for `field_lww`
- Raw error JSON (collapsible) for non-field kinds
- Action buttons per kind:
  - `push_412_exhausted` / `push_failed` → **Retry** and **Accept MS state**
  - `push_403_quota` → **Open in MS** (hard `<a>` to MS Planner) + **Retry** (disabled until admin resolves in MS; tooltip explains)
  - `field_lww` → view-only (already resolved as `applied_theirs`)
  - `pull_unresolved_assignee` → view-only ("Resolves automatically on next identity sync")
  - `credential_invalidated` → "Reconnect" (hard `<a>` to `integrations/microsoft`)
  - `attachment_upload_failed` → **Retry upload**

- [ ] **Step 4: Hook into Conflicts tab from the main page (Plan 4.1 stub)**

Update the Integrations page tab row: "Linked Groups" | "Rosters" | "Conflicts (3)" with the live open-count from `msSync.conflicts.list({ resolved: 'open' }).length`.

- [ ] **Step 5: Tests**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web-admin): conflict viewer with retry + accept-ms-state"
```

---

## Task 3: Force re-sync on individual task

**Files:**

- Create: `apps/api/src/modules/planner/application/commands/ms-sync/force-resync-task.command.ts`
- Create: `apps/api/src/modules/planner/application/commands/ms-sync/force-resync-task.handler.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/modules/planner/interface/trpc/ms-sync.router.ts`
- Modify: `apps/web-planner/src/components/task-detail/ms-sync-section.tsx`

- [ ] **Step 1: Command + handler**

```typescript
@CommandHandler(ForceResyncTaskCommand)
export class ForceResyncTaskHandler implements ICommandHandler<ForceResyncTaskCommand> {
  constructor(
    @Inject(TASK_REPOSITORY) private readonly taskRepo: ITaskRepository,
    @Inject(PLAN_REPOSITORY) private readonly planRepo: IPlanRepository,
    private readonly graph: MsGraphClient,
    private readonly identityFacade: IdentityQueryFacade,
  ) {}

  async execute(cmd: ForceResyncTaskCommand): Promise<void> {
    const task = await this.taskRepo.get(cmd.taskId)
    if (!task || !task.msTaskId) throw new Error('Task not MS-linked')

    // Fetch fresh plannerTask + taskDetails, overwrite local state
    const [taskRes, detailsRes] = [
      await this.graph.get<any>(
        cmd.tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId)}`,
      ),
      await this.graph.get<any>(
        cmd.tenantId,
        `/planner/tasks/${encodeURIComponent(task.msTaskId)}/details`,
      ),
    ]
    // Sequential (no Promise.all per CLAUDE.md)

    if (!taskRes.body || !detailsRes.body) throw new Error('Failed to refresh from MS')

    // Use the same mappers + repo writes as pull path
    const mappedTask = mapMsTaskToDomain(taskRes.body, { tenantId: cmd.tenantId })
    await this.taskRepo.upsertFromMs(
      { ...mappedTask, localPlanId: task.planId, assigneeActorIds: [], pendingMsAssignments: [] },
      { origin: 'ms-sync-pull' },
    )
    // Resolve assignees...
    const mappedDetails = mapMsTaskDetailsToDomain(detailsRes.body)
    await this.taskRepo.upsertDetailsFromMs(
      { taskId: task.id, ...mappedDetails },
      { origin: 'ms-sync-pull' },
    )
  }
}
```

Force re-sync is destructive to any in-flight Future edits on that task — if a user has unsaved changes, they're lost. Admin-only; destructive confirmation in UI.

- [ ] **Step 2: tRPC** — add `msSync.forceResyncTask({ taskId })` mutation guarded by `planner.ms_sync.force_resync` permission.

- [ ] **Step 3: `MsSyncSection`** — new section in task detail panel. Visible only for MS-linked plans to tenant_admins.

```tsx
'use client'

import { Button, Card, ConfirmDialog } from '@future/ui'
import { trpc } from '@/lib/trpc'
import { useState } from 'react'

export function MsSyncSection({
  task,
}: {
  task: { id: string; msTaskId: string; msTaskEtag: string; lastPushedAt: string | null }
}) {
  const force = trpc.planner.msSync.forceResyncTask.useMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <Card>
      <h3 className="text-sm font-semibold">Microsoft 365 sync</h3>
      <dl className="text-sm text-muted-foreground space-y-1">
        <div>
          <dt className="inline">Last synced:</dt>{' '}
          <dd className="inline ml-1">{task.lastPushedAt ?? 'Never'}</dd>
        </div>
        <div>
          <dt className="inline">MS Task ID:</dt>{' '}
          <dd className="inline ml-1 font-mono text-xs">{task.msTaskId}</dd>
        </div>
      </dl>
      <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
        Force re-sync from MS
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Force re-sync from Microsoft 365?"
        description="This overwrites local changes on this task with the latest MS version. Unsaved edits will be lost."
        confirmLabel="Force re-sync"
        onConfirm={() => force.mutate({ taskId: task.id })}
      />
    </Card>
  )
}
```

- [ ] **Step 4: Tests**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(planner): force re-sync task (admin-gated, destructive)"
```

---

## Task 4: Plan header + task card sync badges

**Files:**

- Create: `apps/web-planner/src/components/plan-header/ms-sync-badge.tsx` (+ `.spec.tsx`)
- Create: `apps/web-planner/src/components/task-card/assignee-blocked-indicator.tsx` (+ `.spec.tsx`)
- Modify: `apps/web-planner/src/components/plan-header/plan-header.tsx`
- Modify: `apps/web-planner/src/components/task-card/task-card.tsx`

- [ ] **Step 1: `MsSyncBadge`**

Renders based on `planHeader.msSync` data: `{ state: 'synced' | 'paused' | 'error' | 'none', lastSyncedAt?: string, lastError?: string }`.

- `none` (future_only plan) → render nothing
- `synced` → small green dot + tooltip "Last synced Xm ago"
- `paused` → yellow dot + tooltip "Sync paused by admin"
- `error` → red dot + tooltip with lastError

Use `status/success|warning|danger` tokens.

- [ ] **Step 2: `AssigneeBlockedIndicator`**

Shown on task card when any assignee has `pendingSync=true` (derivable from task state). Tooltip: "This assignee isn't in Microsoft 365 yet. Sync is paused on this task."

- [ ] **Step 3: Thread data through `plans.get` / `tasks.getBoard` queries**

Add `msSync: { state, lastSyncedAt, lastError }` to plan DTOs. Add `syncBlockedByAssignee: boolean` to task DTOs. Handler layer reads from `ms_plan_sync_state` + assignee resolution.

- [ ] **Step 4: Tests**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(web-planner): plan header + task card sync state badges"
```

---

## Task 5: Platform_admin per-tenant sync health row

**Files:**

- Modify: `apps/web-admin/src/app/(platform-admin)/tenants/tenants-table.tsx` (or wherever platform admin lists tenants)
- Create: `apps/api/src/modules/planner/application/queries/ms-sync/get-tenant-sync-health.handler.ts` (+ `.spec.ts`)

- [ ] **Step 1: Query handler**

Returns `{ tenantId, status: 'active'|'invalid'|'paused'|'disconnected', openConflicts: number, linkedGroups: number, lastSuccessfulPoll: string | null }` for each tenant.

- [ ] **Step 2: Platform admin UI column**

Adds "MS Sync" column with status dot + numeric badge for open conflicts. Click → open `/integrations/microsoft/conflicts` with tenant context.

- [ ] **Step 3: Tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(web-admin): platform_admin per-tenant ms_sync health column"
```

---

## Task 6: Performance budget CI tests

**Files:**

- Create: `apps/api/src/modules/planner/__perf__/poll-tenant.perf.spec.ts`
- Create: `apps/api/src/modules/planner/__perf__/push-task.perf.spec.ts`
- Modify: CI workflow

- [ ] **Step 1: `poll-tenant` perf test**

```typescript
describe.skipIf(!process.env.PERF_BUDGETS_ENABLED)('poll-tenant performance', () => {
  it('p95 under 60s for a tenant with 100 plans × 100 tasks', async () => {
    // Seed DB with 100 plans each having 100 tasks, all ms-linked
    // Seed mock Graph to respond with 304 for every plan (no changes)
    const samples: number[] = []
    for (let i = 0; i < 20; i++) {
      const start = Date.now()
      await handler.execute(new PollTenantCommand('t1'))
      samples.push(Date.now() - start)
    }
    const p95 = percentile(samples, 95)
    expect(p95).toBeLessThan(60_000)
  })
})
```

- [ ] **Step 2: `push-task` latency test**

Event-to-ACK latency under 5 s p95 on happy path.

- [ ] **Step 3: CI workflow**

Separate job (`perf.yml`) that runs on PR touches to `apps/api/src/modules/planner/**`. Fails PR if budgets exceeded.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(planner): performance budget specs + CI gate"
```

---

## Task 7: Full E2E Playwright coverage

**Files:**

- Create: `apps/e2e/tests/ms-sync-full-flow.spec.ts`
- Modify: `apps/e2e/playwright.config.ts` to include the new spec in CI

- [ ] **Step 1: E2E scenario**

```typescript
test('end-to-end bidirectional sync against test MS tenant', async ({ page, msPlanner }) => {
  // Setup: connect Future to test tenant (fixture handles this in beforeAll)
  // Setup: link one Group with 1 plan, 0 tasks (fixture)

  // Step 1: Create task in Future, expect it in MS within 10s
  await page.goto('/plans/<linked-plan-id>/board')
  await page.getByRole('button', { name: 'Add task' }).click()
  await page.getByLabel('Title').fill('E2E Sync Task')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(async () => {
    const msTasks = await msPlanner.listTasks(linkedPlanMsId)
    expect(msTasks.map((t) => t.title)).toContain('E2E Sync Task')
  }).toPass({ timeout: 15_000 })

  // Step 2: Edit title in MS, expect Future update within 4 min
  await msPlanner.patchTask(msTaskId, { title: 'Edited in MS' })
  await page.reload()
  await expect(page.getByText('Edited in MS')).toBeVisible({ timeout: 4 * 60_000 })

  // Step 3: Attach file in Future, expect reference in MS
  // ...

  // Step 4: Force re-sync clears local drift
  // ...
})
```

- [ ] **Step 2: `msPlanner` fixture** — a thin wrapper around the same `MsGraphClient` used by API, configured from env.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(e2e): full bidirectional ms-sync flow"
```

---

## Task 8: Contract test — nightly against SETA sandbox

This task finalizes the contract-test harness started in Plan 4.3.

**Files:**

- Modify: `apps/api/src/modules/planner/infrastructure/ms-graph/__contract__/*.spec.ts`
- Modify: `.github/workflows/contract-tests.yml`

- [ ] **Step 1: Expand contract coverage**

Add specs that exercise push + attachments + roster flows (not only poll from Plan 4.3):

- POST plannerPlan, plannerTask, plannerBucket
- PATCH plannerTask with If-Match; assert etag rotates predictably
- Upload attachment via drives + PATCH references; download back
- Mint roster + delete roster cleanup
- Order-hint round-trip on reordered tasks

- [ ] **Step 2: Failure routing — filed issue + Slack ping**

```yaml
- name: Create issue on failure
  if: failure()
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: `[contract] MS sync contract test failure on ${new Date().toISOString().split('T')[0]}`,
        body: `Run: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
        labels: ['ms-sync', 'contract-test'],
      })
- name: Slack notify
  if: failure()
  run: curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"MS sync contract test failed\"}" $SLACK_WEBHOOK
  env:
    SLACK_WEBHOOK: ${{ secrets.SLACK_CONTRACT_ALERTS_WEBHOOK }}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(planner): expand contract suite + CI failure routing"
```

---

## Task 9: Internal tenant rollout + 2-week watch

- [ ] **Step 1: Ensure all flags are on for SETA internal**

```
planner.ms_sync.enabled                      = true (set in Plan 4.2)
planner.ms_sync.attachments.enabled          = true (Plan 4.5)
planner.ms_sync.rosters.enabled              = true (Plan 4.6, optional)
```

- [ ] **Step 2: Daily health report cron**

Add a `SendDailySyncHealthReportCommand` that each morning emails the SETA ops list with:

- Per-tenant: open conflicts, linked groups, last poll age, push queue depth.

This is a short-term operational tool for the watch window; keep it off by default and enable only during rollout.

- [ ] **Step 3: Dashboard bookmarks**

Document in `apps/api/docs/ms-sync-rollout-watch.md`:

- Grafana queries (if available) for `ms_sync.poll.duration_ms`, `ms_sync.push.412_total`, `ms_sync.conflicts.open_total`.
- DB queries for debugging a stuck tenant.
- Common conflict triage flow.

- [ ] **Step 4: Invite first external pilot tenant**

After the internal 2-week window closes with acceptable open-conflict count (target: < 10), identify one external pilot tenant, walk through connect, observe for 1 additional week.

- [ ] **Step 5: Close-out commit**

```bash
git add -A
git commit -m "docs(planner): ms-sync rollout watch runbook + daily health report"
```

---

## Task 10: Sub-project #4a ship notes + briefing update

**Files:**

- Modify: `docs/superpowers/plans/2026-04-18-planner-future-sub-projects.md` — add "Sub-project #4a SHIPPED" block at the bottom of the #4 section, mirroring the shape used for #3.
- Modify: `CLAUDE.md` if new patterns emerged (e.g., new stack entries for MS Graph, SharePoint).

- [ ] **Step 1: Ship notes**

```markdown
## Sub-project #4 — MS 365 Two-Way Sync Engine — #4a SHIPPED

- Shipped date: 2026-MM-DD (fill at Plan 4.7 merge).
- PRs: Plan 4.0 #NN, 4.1 #NN, ..., 4.7 #NN.
- Feature flags: `planner.ms_sync.enabled`, `planner.ms_sync.attachments.enabled`, `planner.ms_sync.rosters.enabled` (all scoped per-tenant).
- Out-of-scope deferred items: task comments (#4b), guest-user sync (blocked on identity).
- Known follow-ups:
  - <any issues surfaced during the 2-week watch window>
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs(planner): Sub-project #4a shipping notes"
```

---

## Task 11: PR + merge

- [ ] **Step 1: PR** — `feat/planner-ms-sync-polish-and-rollout`.
- [ ] **Step 2: Coverage review** — whole `ms-sync` surface ≥ 70%.
- [ ] **Step 3: Merge** after review + green CI + contract test green on most recent run.

## Completion criteria

- Admin conflict viewer with Retry / Accept MS state / detail drawer.
- Force re-sync from task detail (admin-gated).
- Plan header + task card sync-state badges.
- Platform_admin per-tenant sync health row.
- Performance budget CI tests green.
- Full E2E Playwright flow against a test MS tenant green.
- Contract test expanded + CI routes failures to issues + Slack.
- SETA internal 2-week watch window complete with < 10 open conflicts.
- One external pilot tenant invited.
- Briefing book + CLAUDE.md updated with shipping notes.
- Sub-project #4a declared shipped.
