# Agents Stub Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remediate the 18 silent stubs surfaced by the 2026-04-30 audit. Each stub gets a per-stub decision (implement / convert to explicit-disabled / delete) and a tracked outcome. The unifying invariant after this plan: **no production-wired component silently swallows calls.** Components that aren't yet implemented must either throw, log loudly, or be removed from the production wiring graph.

**Architecture:** Per-stub triage. Tasks are independent — each can ship in its own commit/PR if preferred, but the umbrella plan tracks all of them so nothing is forgotten.

**Tech Stack:** TypeScript / NestJS.

**Triage rubric (applied to each stub):**

| Decision              | When to use                                                  | Concrete pattern                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **IMPLEMENT**         | Real adapter is feasible now and the feature is needed       | Wire actual port adapter; add tests                                                                                                                                            |
| **EXPLICIT-DISABLED** | Feature genuinely deferred; consumers must know it's off     | Throw `FeatureDisabledError` from method; provide `isEnabled(): boolean` so callers can branch; emit a metric `<feature>_disabled_invocation_total` so ops sees usage attempts |
| **DELETE**            | Stub has no real consumer or its absence wouldn't be noticed | Remove the wiring + the file                                                                                                                                                   |
| **TRACK**             | Pending dependency on another in-flight plan                 | Convert TODO comment into a tracked issue with a removal date; leave the stub but DOCUMENT clearly with `// DEFERRED: <issue> — <unblock condition>`                           |

---

## Tasks (one per stub or stub group)

### Task 1: Pre-flight

- [ ] **Step 1: Branch**

```bash
git checkout -b refactor/agents-stub-remediation
```

- [ ] **Step 2: Confirm baseline green**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit
```

---

### Task 2: `Summarizer` empty AiClient — EXPLICIT-DISABLED

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts:517` (Summarizer DI binding)
- Modify or create: an `AiClient` adapter that throws when invoked

**Decision:** Phase-1 design says no-op. But silent empty-string is a production hazard if Phase-4 wiring is forgotten. Replace with a guarded client.

- [ ] **Step 1: Read current `Summarizer` provider entry around line 517**

- [ ] **Step 2: Replace `{ generateText: async () => '' }` with a class**

```ts
// apps/api/src/modules/agents/infrastructure/llm/disabled-summarizer-client.ts
import { Injectable } from '@nestjs/common'
import type { AiClient } from '<existing AiClient port path>'

@Injectable()
export class DisabledSummarizerAiClient implements AiClient {
  async generateText(): Promise<string> {
    throw new Error(
      'Summarizer AiClient is disabled in Phase 1. Wire a real client before invoking Summarizer.',
    )
  }
}
```

- [ ] **Step 3: Replace the inline factory in `agents.module.ts` with `DisabledSummarizerAiClient`**

- [ ] **Step 4: Add a unit test**

```ts
// apps/api/src/modules/agents/infrastructure/llm/disabled-summarizer-client.spec.ts
describe('DisabledSummarizerAiClient', () => {
  it('throws when invoked', async () => {
    const client = new DisabledSummarizerAiClient()
    await expect(client.generateText()).rejects.toThrow(/disabled in Phase 1/)
  })
})
```

- [ ] **Step 5: Verify Summarizer is not invoked anywhere active**

```bash
rg -n 'SUMMARIZER|Summarizer' apps/api/src/modules/agents/ --type ts | grep -v spec
```

If any production code path calls `summarize()`, this task changes from EXPLICIT-DISABLED → IMPLEMENT. Stop and revisit.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/
git commit -m "refactor(agents): disabled Summarizer AiClient throws instead of returning empty"
```

---

### Task 3: `METRICS_QUERY_PORT`, `CI_STATE_PORT`, `GA_METRICS_PORT` — EXPLICIT-DISABLED

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts:666-668`
- Modify: `apps/api/src/modules/agents/infrastructure/metrics/stub-metrics-query.ts`
- Modify: `apps/api/src/modules/agents/infrastructure/ci/stub-ci-state.ts`
- Modify: `apps/api/src/modules/agents/infrastructure/metrics/stub-ga-metrics.ts`

**Decision:** Real adapters require backend infra not yet deployed. Keep ports + stub adapters but make the stubs:

1. Expose `isEnabled(): false`
2. Throw on direct query calls
3. Emit a metric on every blocked call

- [ ] **Step 1: Add `isEnabled()` to each port interface**

`agents/domain/ports/metrics-query.port.ts`, `ci-state.port.ts`, `ga-metrics.port.ts`:

```ts
export interface MetricsQueryPort {
  isEnabled(): boolean;
  sumCounter(...): Promise<number | null>;
  // ... existing methods
}
```

(Repeat shape for the other two.)

- [ ] **Step 2: Update each Stub\*** to throw and report disabled\*\*

```ts
// stub-metrics-query.ts
@Injectable()
export class StubMetricsQuery implements MetricsQueryPort {
  isEnabled(): boolean {
    return false
  }
  async sumCounter(): Promise<number | null> {
    throw new Error('MetricsQueryPort is disabled — backend not yet deployed')
  }
}
```

- [ ] **Step 3: Find every consumer and wrap with `isEnabled()` guard**

```bash
rg -n 'METRICS_QUERY_PORT|CI_STATE_PORT|GA_METRICS_PORT|metricsQuery\.|ciState\.|gaMetrics\.' apps/api/src/modules/agents/ --type ts | grep -v spec | grep -v stub-
```

For each consumer, gate the call:

```ts
if (!this.metricsQuery.isEnabled()) {
  this.logger.debug('metricsQuery disabled — skipping signal');
  return null; // or whatever the consumer's "no data" behavior is
}
const result = await this.metricsQuery.sumCounter(...);
```

- [ ] **Step 4: Add unit tests for each `isEnabled()` and the throwing path**

- [ ] **Step 5: Verify**

```bash
bun run --filter @future/api typecheck && bun run --filter @future/api test:unit
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/
git commit -m "refactor(agents): disabled metrics/ci/ga ports surface isEnabled() and throw on call"
```

---

### Task 4: `NullTenantLister` (conversation retention) — IMPLEMENT

**Files:**

- Modify: `apps/api/src/modules/agents/agents.module.ts:351-354`
- Possibly create: `apps/api/src/modules/agents/infrastructure/adapters/identity-tenant-lister.ts`

**Decision:** This stub silently makes retention scheduler a no-op. There's an `identity` module that owns tenant data — query it via facade.

- [ ] **Step 1: Survey the identity module's exports**

```bash
cat apps/api/src/modules/identity/identity.module.ts
ls apps/api/src/modules/identity/application/facades/
```

Confirm `IdentityQueryFacade` (or similar) has a method like `listActiveTenantIds()`. If not, add it (it's a single-file change in the identity module — domain method + facade method + test).

- [ ] **Step 2: Create the adapter**

```ts
// apps/api/src/modules/agents/infrastructure/adapters/identity-tenant-lister.ts
import { Injectable } from '@nestjs/common'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import type { TenantLister } from '<port path>'

@Injectable()
export class IdentityTenantLister implements TenantLister {
  constructor(private readonly identity: IdentityQueryFacade) {}

  async listActiveTenantIds(): Promise<string[]> {
    return this.identity.listActiveTenantIds()
  }
}
```

- [ ] **Step 3: Replace `NullTenantLister` in `agents.module.ts:351-354`**

- [ ] **Step 4: Test**

```ts
// identity-tenant-lister.spec.ts
it('delegates to IdentityQueryFacade', async () => {
  const facade = { listActiveTenantIds: jest.fn().mockResolvedValue(['t1', 't2']) }
  const lister = new IdentityTenantLister(facade as any)
  expect(await lister.listActiveTenantIds()).toEqual(['t1', 't2'])
})
```

- [ ] **Step 5: Verify retention scheduler now sees tenants**

Add an integration test (or extend an existing one) that boots the module with one tenant and confirms `ConversationRetentionScheduler` enumerates it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/agents/ apps/api/src/modules/identity/
git commit -m "feat(agents): real tenant lister via IdentityQueryFacade for retention scheduler"
```

---

### Task 5: `RegressionSignalMonitor` 3 disabled signals — EXPLICIT-DISABLED

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/regression-signal-monitor.ts:105-120`

**Decision:** Three signals (`cost_delta_pct`, `initiator_approval_drop`, `router_accuracy_signal`) silently return `observed: 0`. Auto-rollback never trips on these. Mark each signal explicitly as `disabled: true` so the monitor's evaluation loop SKIPS them rather than treating their `0` as real evidence.

- [ ] **Step 1: Read `regression-signal-monitor.ts`** and understand the signal evaluation loop.

- [ ] **Step 2: Change signal contract**

Add `disabled?: boolean` to the signal definition. In `evaluate()`, skip disabled signals and emit a metric `agents_regression_signal_disabled_evaluated_total{signal=<name>}` once per evaluation.

- [ ] **Step 3: Mark the 3 stub signals `disabled: true`**

- [ ] **Step 4: Update tests**

Existing tests that asserted these signals returned `0` should now assert they're SKIPPED. Add a test that confirms a disabled signal does not contribute to rollback decisions.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(agents): regression-signal-monitor — explicit-disabled stubs skip evaluation"
```

---

### Task 6: `ConfidenceCalibrationService.correlate()` — EXPLICIT-DISABLED

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/confidence-calibration-service.ts:39`

**Decision:** Same pattern as Task 5. Returning all-zero data corrupts the calibration audit. Add `isEnabled()`; throw on `correlate()` until Plan 08 feedback data is wired.

- [ ] **Step 1: Add `isEnabled(): false` and make `correlate()` throw**
- [ ] **Step 2: Update consumers (find via `rg`) to gate on `isEnabled()`**
- [ ] **Step 3: Test**
- [ ] **Step 4: Commit**

---

### Task 7: `LeakCanaryScheduler` deferred recording — TRACK

**Files:**

- Modify: `apps/api/src/modules/agents/infrastructure/jobs/leak-canary.scheduler.ts:46`

**Decision:** Comment + JSDoc already explain it's deferred. Action: ensure the `'deferred'` value is observable as a metric so ops sees the canary is off.

- [ ] **Step 1: Confirm `recordLeakCanary('deferred')` writes to a metric exporter**
- [ ] **Step 2: If yes, add a comment `// DEFERRED: trace backend exporter — see <issue>` and create a tracking issue**
- [ ] **Step 3: If no, wire the recording into the metrics infrastructure**
- [ ] **Step 4: Commit**

---

### Task 8: `CanaryQueryRotator.ingestFromProduction()` — EXPLICIT-DISABLED

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/canary-query-rotator.ts:59`

**Decision:** Beta-phase feature. Throw on invocation; expose `isEnabled()`.

- [ ] **Step 1: Same pattern as Task 5/6**
- [ ] **Step 2: Test + commit**

---

### Task 9: `AgentsQueryFacade` empty class — DELETE or IMPLEMENT

**Files:**

- Modify or delete: `apps/api/src/modules/agents/application/facades/agents-query.facade.ts`
- Possibly modify: `apps/api/src/modules/agents/agents.module.ts` (exports + providers)

**Decision tree:**

1. Run `rg AgentsQueryFacade apps/api/src/modules/ --type ts | grep -v 'modules/agents/'` to find external consumers.
2. If empty → DELETE the class, remove from `exports`/`providers`. Add it back when there's an actual cross-module read need.
3. If non-empty → IMPLEMENT minimal methods that satisfy what those consumers need.

- [ ] **Step 1: Run the consumer survey**
- [ ] **Step 2: Apply the chosen branch**
- [ ] **Step 3: Test + commit**

---

### Task 10: `definitionRouter` empty tRPC router — DELETE from export

**Files:**

- Modify: `apps/api/src/modules/agents/interface/trpc/definition.router.ts`
- Modify: wherever `agents.router` is composed (likely `agents/interface/trpc/index.ts` or similar)

**Decision:** Empty `router({})` exported on the tRPC tree creates the false impression that endpoints exist. Remove the empty router from the agents router composition. Restore when CRUD procedures are actually written.

- [ ] **Step 1: Find composition site**

```bash
rg -n 'definitionRouter' apps/api/src/modules/agents/ --type ts
```

- [ ] **Step 2: Remove the entry from the router composition; delete the file**

- [ ] **Step 3: Verify tRPC type generation is unaffected**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/web-shell typecheck  # consumes API types
```

- [ ] **Step 4: Commit**

---

### Task 11: `RenderAnswer.collectPermissionKeys()` returns `[]` — INVESTIGATE then decide

**Files:**

- Modify: `apps/api/src/modules/agents/application/services/render-answer.ts:66`

**Decision:** Unclear from audit alone. Read the file to understand intended behavior.

- [ ] **Step 1: Read `render-answer.ts` end-to-end**
- [ ] **Step 2: Find call sites of `collectPermissionKeys`**
- [ ] **Step 3: Decide: IMPLEMENT (extract keys from answer payload) | EXPLICIT-DISABLED (throw) | DELETE (no consumer)**
- [ ] **Step 4: Apply + test + commit**

---

### Task 12: Plan 07 TODO markers — TRACK

**Files (TRACK only — no code change in this plan):**

- `apps/api/src/modules/agents/infrastructure/retrieval/tool-descriptor-embedder.ts:203`
- `apps/api/src/modules/agents/infrastructure/retrieval/tool-retriever.ts:151`
- `apps/api/src/modules/agents/application/services/tool-gateway.ts:978`
- `apps/api/src/modules/agents/application/services/tool-gateway.ts:1090`
- `apps/api/src/modules/agents/application/services/stream-gateway.ts:181`
- `apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry.ts:235` (Plan 02)
- `apps/api/src/modules/agents/interface/http/agent-turn-controller.ts:239` (Plan 18 follow-up)

**Decision:** All are pending dependencies on other in-flight plans. Each TODO becomes a tracking issue.

- [ ] **Step 1: Open one tracking issue per TODO (or one umbrella issue listing all)**
- [ ] **Step 2: Update each TODO comment to reference the issue number, e.g. `// DEFERRED: #<num> — Plan 07 audit emit`**
- [ ] **Step 3: Commit doc-only change**

```bash
git commit -m "docs(agents): convert plan-NN TODOs into tracked issue references"
```

---

### Task 13: Final verification gate

- [ ] **Step 1: Run full test suite**

```bash
bun run --filter @future/api typecheck
bun run --filter @future/api test:unit
bun run --filter @future/api lint
```

- [ ] **Step 2: Confirm no `useValue: {}` or `Stub*` remain in production wiring**

```bash
rg -n 'useValue:\s*\{\s*\}' apps/api/src/modules/agents/ --type ts
rg -n 'useClass:\s*Stub' apps/api/src/modules/agents/ --type ts
```

Each remaining match must have an EXPLICIT-DISABLED guard (`isEnabled()` returning `false`) or a tracked-issue comment.

- [ ] **Step 3: Open PR per task or one umbrella PR**

If shipping incrementally (recommended): each Task is its own PR. If shipping together: one umbrella PR.

```bash
git push -u origin refactor/agents-stub-remediation
gh pr create --title "refactor(agents): stub remediation — eliminate silent placeholders" --body "$(cat <<'EOF'
## Summary

Per CLAUDE.md "no silent stubs in production paths" rule, remediate 18 stubs surfaced by the 2026-04-30 audit. Each stub now either:

- Is fully implemented (NullTenantLister → IdentityTenantLister)
- Throws on invocation with `isEnabled(): false` for callers to gate (Summarizer, MetricsQueryPort, CiStatePort, GaMetricsPort, ConfidenceCalibration, CanaryQueryRotator, RegressionSignalMonitor disabled signals)
- Is removed from production wiring (definitionRouter, AgentsQueryFacade if no consumers)
- Carries a tracked issue reference (Plan-NN TODOs)

After this PR: no production-wired component silently swallows calls.

## Test plan
- [ ] CI green
- [ ] Manual check: `rg useValue:\s*\{\s*\}` in agents/ returns nothing untracked
- [ ] Manual check: every remaining `Stub*` adapter exposes `isEnabled(): false`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
