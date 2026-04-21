# 08 — Drafts + Approval + Delegation

**Design §§:** §10 (Writes, Approvals, Drafts), §15.5 (Sideways contract to kernel).

## Revision 2026-04-22

Aligns with `docs/architecture/agent-runtime.md` 2026-04-22 revision.

- **Per-flow approval policy** is MVP: module-local registry entries keyed by `intent_slug` compose with per-tool `approvalFreshness` / `approvalTtl` defaults. Resolution is a gateway pipeline step between `Resolve` and `Ceiling pre-check`; composition is most-strict-wins.
- **Draft rows stamp `flow_id`** (plan 07) so multi-turn flows (draft → approval → execute) carry a single flow identity across multiple `trace_id`s.
- **MVP write scope**: planner + projects writes enabled day 1; `people.*` writes flag-gated behind `feature.agent.people_writes` (default off; enable 2-4 weeks post-MVP).
- **Draft-to-inbox** ships at MVP (day 1). Delegation-signed autonomous writes remain deferred to plan 09 Beta gate.

---

## 1. Scope

### In

- Draft proposal generation by sub-agents during phase execution.
- **Per-flow approval policy**: flow-level rules (keyed by `intent_slug`) that compose with tool-level `approvalFreshness` / `approvalTtl` defaults. Resolved in the gateway pipeline per tool call (see §5).
- Draft rows stamp `flow_id` (plan 07) so multi-turn flows (draft → approval → execute) carry a single flow identity across multiple `trace_id`s.
- MVP write scope: planner + projects writes enabled day 1; `people.*` writes flag-gated 2-4 weeks post-MVP.
- Draft-to-inbox at MVP (day 1). Delegation-signed autonomous writes defer to plan 09 Beta gate.
- `draft.proposed` SSE event shape + always-present provenance block.
- Approval-tier classification: low-risk (autonomous execute) vs high-risk (approval-required).
- Taint → approval-tier bump (turn-scoped taint flag triggers one-tier escalation).
- Notifications-module handoff (drafts surface as inbox items tagged `origin: agent`).
- `execute-approved-draft` pg-boss job with unified delegation model.
- Synthetic execution-delegation minted at draft time for live-session-originated drafts.
- Draft TTL (default 72h; `7d` opt-in per tool; `24h` override for time-sensitive actions).
- Permission envelope at draft time + execute-time comparison (widening emits audit; narrowing fails execution).
- Domain-revalidation contract (`approvalFreshness: 'revalidate' | 'accept-stale'`).
- Approval card presenter component in `@future/ui` (UI contract enforcement).
- Kernel audit events: `agent.draft_proposed`, `agent.draft_approved`, `agent.draft_executed`, `agent.draft_expired`, `agent.draft_rejected`, `permission_widened_between_draft_and_execute`.

### Out

- Notifications-module inbox UI itself (owned by notifications module; this plan handles agent-side emission).
- L3.5 scratchpad write-tool (Beta gate).
- Agent-proposed L3 writes (GA gate).
- Async autonomous writes (GA gate — MVP is read-only + notify + draft-to-inbox for async).
- Custom approval workflows per domain (each domain owns its own; this plan provides the entry point).

---

## 2. Design Context

**The agent produces artifacts; the domain owns workflows** (Tenet #3). Writes requiring approval are drafted by the sub-agent and handed off to existing domain approval flows (HRM leave approval, timesheet manager-sign-off, etc.). The agent does NOT maintain a parallel approval state machine — the notifications module already owns manager-approves-employee workflows; we reuse them unchanged. The approver doesn't know or care that an agent drafted the item.

**Turn termination rule**: the agent's turn always ends at "draft submitted." It never waits for approval mid-turn. This is non-negotiable — blocking on approval would break cost predictability, streaming UX, and the §3.1 iterative topology's bounded iteration cap.

**Unified delegation model for execute-approved-draft.** Every approved-draft execution carries a delegation regardless of origin:

- Async-originated drafts carry the original schedule-creation delegation.
- Live-session-originated drafts mint a synthetic execution-delegation at draft time.

Single code path, single audit shape. Approver is the gate; delegator is the execution authority. The approved artifact executes through the original delegator's authority, not the approver's credentials (delegation-not-impersonation tenet).

**Taint → approval bump** is defense in depth. The gateway tells the model narratively about taint so it proposes approval-ready drafts proactively; the gateway ALSO enforces the bump at draft submission regardless of what the model does. Prompt guidance is UX; gateway enforcement is the security boundary.

**Provenance block is always present** with all fields populated. Empty array or null, never missing. Conditional existence of security-relevant fields is a latent bug class. Approval cards render through an agent-module-owned presenter component exported from `@future/ui` — downstream UIs cannot "forget" to render the block because they do not control the render.

**Permission envelope at draft time**: captures `canDo` result at draft time; compared against execute-time. Strict widening emits audit event `permission_widened_between_draft_and_execute` (does not block — widening is legitimate; invisible widening is the failure mode). Narrowing is not special-cased; execute-time `canDo` fails; standard execution-failure surfaces.

**Domain-revalidation contract.** A domain command receiving `execute-approved-draft` MUST revalidate preconditions against live data. Draft payload is a specification of intent, not a snapshot of ground truth. `approvalFreshness: 'revalidate'` is the default; `'accept-stale'` is explicit opt-out for idempotent no-state actions ("mark as read").

**Default TTL = 72h.** Asymmetric cost rationale: wrong-way-round error on 7d default is a stale-execution incident; wrong-way-round error on 72h is one `.meta` line added. 7d requires explicit opt-in per tool.

**What this is NOT:** a workflow engine. No step chaining, no DAG, no resumable state machines. It's a draft-in, executed-eventually handoff with provenance + delegation + revalidation semantics. Mastra couples this into their workflow engine; we split it (Tenet #3, spike 13).

**Prior-art review — what was adopted and what was rejected.** Claude Code's permission substrate (`hooks/useCanUseTool.tsx`, `PermissionContext.ts`, `services/tools/toolExecution.ts`) was reviewed as prior art. Three patterns are confirmed aligned: (a) **point-in-time permission snapshot** — draft-time `canDo` captured, never cached for reuse (R-08.3); (b) **no session-level "approved for X-type drafts" memory** — each draft is a discrete artifact, re-approval required on re-proposal; (c) **presenter-pattern for approval dialogs** — the agent module owns the render component, downstream UIs cannot inline-render draft payload (R-08.25). Four patterns were explicitly **rejected** because they fit an interactive developer CLI, not an async-inbox multi-tenant SaaS: (i) **Mid-turn synchronous permission dialogs** — Claude Code's dialog races with streaming; in business AaaS the turn ends at "draft submitted" and approval is strictly async via the inbox (R-08.5). (ii) **Raw tool-command-string in approval UI** — Claude Code's bash dialogs show the parsed command; our approval cards render business-intent language ("Approve Jane Doe's leave Apr 15-19"), never raw `{date, duration, employeeId}` args (R-08.25a). (iii) **Developer-risk framing ("dangerous", "destructive", "rm -rf")** — our risk is business-rule-driven (tier, domain_kind, impact), not technical severity. (iv) **Session-local "approved this session for X" memory** — Claude Code's classifier-approval map is per-tool-use-ID and cleared at session exit; our drafts have no equivalent because approval is per-artifact, not per-pattern.

---

## 3. Data Model

### Flow-policy registry

Per-flow approval policy lives in module-local files at `modules/<X>/agent/flow-policies/*.ts`, aggregated at build. Schema:

```
type FlowPolicyEntry = {
  intent_slug: string;                               // unique registry key
  approvalFreshness?: 'revalidate' | 'accept-stale';
  approvalTtl?: Duration;
  requireFresh?: boolean;                            // strengthens to 'revalidate'
  bump?: 'high_risk_approval_required';              // tier bump (upgrade-only)
}
```

Per-flow policy composes with per-tool `.meta({ agent })` policy via the precedence rule in §4 (most-strict-wins). Build fails on duplicate `intent_slug` across the aggregated registry.

### `agent_draft`

- `id UUID PK` — `action_id` surfaced in SSE + notifications.
- `tenant_id UUID` (RLS).
- `trace_id UUID` — correlation.
- `flow_id UUID` — flow identity carried across draft → approval → execute (see plan 07). Inherited by approval + execute events.
- `initiator_user_id UUID` — who kicked off the turn.
- `on_behalf_of UUID?` — delegator (for async) or same as initiator (for live session).
- `via_delegation_id UUID` — always present; synthetic for live-session drafts.
- `via_schedule_id UUID?` — present for async.
- `approver_user_id UUID?` — resolved at draft time from the domain's approval rule (who signs off).
- `tier TEXT` — `'low_risk_auto' | 'high_risk_approval_required'`.
- `status TEXT` — `'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'execution_failed' | 'cancelled'`.
- `tool_name TEXT` — which tool was drafted.
- `args JSONB` — canonicalized args; the draft payload.
- `expected_output_shape TEXT?` — what the sub-agent intended.
- `permission_envelope_at_draft_time JSONB` — snapshot of `canDo` result; always present, empty-but-present if somehow null.
- `approval_freshness TEXT` — copied from tool's `.meta({ agent.approvalFreshness })` at draft time.
- `approval_ttl INTERVAL` — default 72h; per-tool override.
- `drafted_at TIMESTAMPTZ`, `expires_at TIMESTAMPTZ` (generated = `drafted_at + approval_ttl`).
- `approved_at TIMESTAMPTZ?`, `executed_at TIMESTAMPTZ?`, `execution_outcome TEXT?`.
- `provenance JSONB` — always present, all fields populated (see §4 interface).
- `taint_at_draft_time BOOLEAN` — captures turn-state taint flag at draft submit.
- Index: `(tenant_id, status, expires_at)` — for TTL sweeper.
- Index: `(tenant_id, approver_user_id, status)` — for approval-inbox queries.
- Index: `(trace_id)`.

### `agent_delegation` (kernel-owned)

Schema owned by kernel module; relevant columns:

- `id UUID PK`.
- `tenant_id UUID`.
- `delegator_user_id UUID`.
- `delegate TEXT` — `'agent:scheduler' | 'agent:approval-executor' | ...`.
- `scope JSONB` — scope-specific; for approval-executor, the scope is the specific draft action.
- `expires_at TIMESTAMPTZ`.
- `status TEXT` — `'active' | 'expired' | 'revoked'`.
- `created_at TIMESTAMPTZ`.

For approval-executor delegations: minted at draft time; scope pinned to the specific draft; `expires_at = draft.expires_at`.

### `notifications_item` (notifications module; this plan writes to it)

Schema owned by notifications module; relevant fields:

- `origin TEXT` — includes `'agent'` as a tag.
- `trace_id UUID` — set by agent module.
- `draft_id UUID` — FK to `agent_draft`.
- `approver_user_id UUID` — recipient.
- `domain_kind TEXT` — e.g. `'timesheet.entry.create'`.
- `payload JSONB` — agent presenter payload.
- `status TEXT` — notifications-module-internal.

### pg-boss jobs

- `execute-approved-draft` job:

  ```
  {
    draft_id: UUID,
    tenant_id: UUID,
    user_on_behalf_of: UUID,
    delegation_id: UUID,
    tool_name: string,
    args: unknown,
    permission_envelope_at_draft_time: unknown,
    approval_freshness: 'revalidate' | 'accept-stale',
    approved_by: UUID,
    approved_at: timestamp,
    trace_id: UUID
  }
  ```

- `sweep-expired-drafts` job: scheduled cron; scans `agent_draft` for `status = 'pending' AND expires_at < now()`, marks expired, sends notice.

---

## 4. Interface Contracts

### `DraftProvenance` (always-present block)

```
type DraftProvenance = {
  triggered_by: string;              // e.g. "user:alice" — initiator
  user_utterance: string;            // sanitized via project_to_schema(utterance, approver_scope) when approver ≠ initiator; raw when approver = initiator
  drafted_at: timestamp;
  derived_from_tainted_sources: ReadonlyArray<{
    tool: string;
    refs: ReadonlyArray<string>;     // field refs from the tainted tool result
    authored_by: string | null;      // user who authored the tainted content, if known
  }>;                                // always-present array; empty when no taint
}
```

Rendered through agent-module-owned presenter; downstream UIs do NOT render directly.

### `FlowPolicyResolver`

```
resolve(intent_slug: string, tool_meta: AgentToolMeta): EffectivePolicy

type EffectivePolicy = {
  approvalFreshness: 'revalidate' | 'accept-stale';
  approvalTtl: Duration;
  tier_bump?: 'high_risk_approval_required';
}
```

Call-site: gateway pipeline step inserted between `Resolve` (step 1) and `Ceiling pre-check` (step 3). Downstream pipeline decisions (pre-write abort, tier classification, TTL stamping) read the effective policy, not raw `tool_meta`.

**Precedence (most-strict-wins):**

- `approvalFreshness` → `max(flow.approvalFreshness, tool.approvalFreshness)` on the ordering `'accept-stale' < 'revalidate'`. `requireFresh: true` on a flow forces `'revalidate'`.
- `approvalTtl` → `min(flow.approvalTtl, tool.approvalTtl)` — shorter wins.
- `tier_bump` → applied if either side upgrades; downgrade is forbidden.

**Forbidden combination (build-time reject):** a `.mutation()` tool invoked via an `intent_slug` whose flow-policy declares `requireFresh: true` AND whose tool-meta declares `approvalFreshness: 'accept-stale'` fails the build. Flow-policy may only strengthen tool-meta; escalating to `'accept-stale'` is rejected.

### `DraftProposer` (consumed by plan 03 sub-agent runner)

```
propose(opts: {
  turnState: TurnState;
  subAgentKey: string;
  phase: 1 | 2;
  toolName: string;
  args: unknown;
  expectedOutputShape?: AnswerShape;
}): Promise<DraftProposal>

type DraftProposal = {
  actionId: UUID;
  tier: 'low_risk_auto' | 'high_risk_approval_required';
  requiresApproval: boolean;
  summary: string;             // 1-2 sentence description rendered for approver
  provenance: DraftProvenance;
  approvalFreshness: 'revalidate' | 'accept-stale';
  approvalTtl: Duration;
}
```

### `DraftTierClassifier`

```
classify(opts: {
  tool: AgentToolDescriptor;
  args: unknown;
  turnState: TurnState;              // taint flag
  tenantPolicy?: TenantApprovalPolicy;
}): {
  tier: 'low_risk_auto' | 'high_risk_approval_required';
  reason: string;                    // e.g. 'taint_bump', 'high_risk_tool', 'tenant_policy_override'
}
```

Tier classification rules (in priority order):

1. If `tool.meta.agent.approvalRequired === 'always'` → high_risk.
2. If `turnState.tainted === true` AND tool is `.mutation()` → bump any low_risk to high_risk.
3. If `tenantPolicy.tierOverridesByTool[toolName]` present → apply tenant override (can bump to high_risk only; cannot downgrade a globally high_risk tool to low_risk).
4. Else tool's declared default tier.

### `TenantApprovalPolicy`

Lives in admin module's `admin_tenant_config` (same pattern as plan 04 retention config, plan 05 quota, plan 07 trace quota). Consumed by `DraftTierClassifier` and `DraftProposer.resolveApproverFor`. MVP shape (fields may be added at Beta):

```
type TenantApprovalPolicy = {
  tier_overrides_by_tool?: Record<ToolName, 'high_risk_approval_required'>;   // upgrade-only, never downgrade
  approval_ttl_override_hours?: number;                                        // min 1, max 168 (7d)
  approver_escalation_rule?: 'fixed_single' | 'primary_with_delegate';         // MVP: 'fixed_single'
  // Future (Beta+): multi_approver_chain, amount_threshold_rules, domain_specific_policies
}
```

At MVP, only `tier_overrides_by_tool` + `approval_ttl_override_hours` are honored; other fields are placeholders so the JSONB shape doesn't require migration when Beta adds them. Admin UI is product-owned (§17 out of scope).

### `ApprovalExecutorDelegationMinter`

```
mintForDraft(opts: {
  draftId;
  tenantId;
  initiatorUserId;
  toolName;
  expiresAt;
}): Promise<{ delegationId: UUID }>
```

Synthetic delegation `{ delegator: initiator_user_id, delegate: 'agent:approval-executor', scope: draft-specific, expires_at }`. Pinned on the draft row.

### `DraftSink` (consumed at emit time)

```
submit(opts: {
  draft: DraftProposal;
  tenantId; traceId;
  initiatorUserId; approverUserId?;
  delegationId;
  permissionEnvelopeAtDraftTime: unknown;
  tainted: boolean;
}): Promise<void>
```

Persists `agent_draft` row + emits kernel audit `agent.draft_proposed` + posts to notifications module (if `approverUserId` present and `tier === 'high_risk_approval_required'`).

### `ExecuteApprovedDraftWorker` (pg-boss consumer)

```
handle(job: ExecuteApprovedDraftJob): Promise<void>
// Steps (§5 control flow):
//   1. Load draft + verify status = 'approved'.
//   2. Verify delegation still active.
//   3. Revalidate permissions (execute-time canDo).
//   4. Compare against permission_envelope_at_draft_time; if widened, emit audit.
//   5. Invoke tool through gateway with mode: 'execute' AND approvalFreshness passed through.
//   6. Update draft row: status, executed_at, execution_outcome.
//   7. Emit kernel audit agent.draft_executed.
```

### `DraftExpirySweeper` (scheduled pg-boss cron)

```
run(): Promise<{ expiredCount: number }>
// Daily or hourly; scans agent_draft for expired pending rows;
// marks status='expired', emits agent.draft_expired audit,
// notifies initiator via notifications module.
```

### `ApprovalCardPresenter` (React component in `@future/ui`)

```
<AgentDraftCard
  draft={agentDraftPayload}
  onApprove={handler}
  onReject={handler}
/>
```

Behavior (per §10):

- Draft-age indicator renders when `drafted_at > 24h ago`; increasing visual weight past 72h.
- If `derived_from_tainted_sources.length > 0` AND `tier === 'high_risk_approval_required'`:
  - Provenance block renders ABOVE the fold with warning styling.
  - Warning copy: `"This draft was derived from text authored by another user while you asked: '<utterance>'."`
- Downstream UI imports and renders this component; does NOT inline-render draft payload.

---

## 5. Control Flow

### Gateway pipeline ordering (flow-policy placement)

Flow-policy resolution is inserted into the plan 01 gateway pipeline:

1. **Resolve** — permission + authority resolve (`canDo`, delegation check).
2. **Flow-policy resolve** — `FlowPolicyResolver.resolve(intent_slug, tool_meta)` → `EffectivePolicy`. All downstream steps read the effective policy, not raw `tool_meta`.
3. **Ceiling pre-check** — authority ceiling against effective policy.
4. Continues through taint-wrap, tier classify, draft submit, etc.

The `intent_slug` enters the pipeline from the router (plan 02) and is carried on `turnState` for the duration of the sub-agent invocation.

### Draft proposal inside a sub-agent (live session)

1. Sub-agent decides to invoke a write tool (a `.mutation()` with `.meta({ agent })`).
2. Sub-agent runner calls `DraftProposer.propose({ turnState, subAgentKey, phase, toolName, args })`.
3. Proposer runs `DraftTierClassifier.classify(...)`:
   - Check tool default tier.
   - If `turnState.tainted === true` → bump tier.
   - If tenant policy override → apply.
4. Proposer captures `permission_envelope_at_draft_time` (snapshot of `canDo` result for the tool + args).
5. Proposer builds `provenance`:
   - `triggered_by`: `user:<user_id>`.
   - `user_utterance`: if `approver_user_id === initiator_user_id` → raw utterance; else → `project_to_schema(utterance, approver_scope)`.
   - `drafted_at`: now.
   - `derived_from_tainted_sources`: iterate `turnState.taintSources` (plan 01 records when taint flipped + which tool+fields caused it) → build array.
6. Proposer resolves `approver_user_id`:
   - For `low_risk_auto`: null (auto-executes).
   - For `high_risk_approval_required`: query domain's approval rule (e.g. `HrmQueryFacade.getApproverFor({ entityType, entityId })`).
7. If live-session (no `via_schedule_id`): `ApprovalExecutorDelegationMinter.mintForDraft(...)` creates synthetic delegation. If async (`via_schedule_id` present): reuse existing schedule-creation delegation.
8. `DraftSink.submit(...)`:
   a. Insert `agent_draft` row with all fields populated.
   b. Emit kernel audit `agent.draft_proposed` with full context.
   c. If `high_risk_approval_required` and `approver_user_id`: write `notifications_item` for approver.
9. Sub-agent runner emits `DraftProposal` to plan 06 `StreamEmitter` → `draft.proposed` SSE event fires (after `answer.complete` per §15 ordering).
10. Sub-agent returns; no blocking wait.

### Low-risk autonomous execution

1. After draft proposal, if `tier === 'low_risk_auto'`:
   a. Post-synthesizer (turn ending), execute directly through the gateway with `mode: 'execute'`.
   b. Wait — turn ends at draft submitted; autonomous execution enqueues `execute-approved-draft` job too, with `approved_by = 'system:low-risk-auto'`.
2. pg-boss worker picks up the job; runs the same ExecuteApprovedDraftWorker path.
3. Result surfaces via the same notifications path — user sees "Action completed: X".

### High-risk approval flow

1. Approver opens notifications inbox, sees approval card rendered via `<AgentDraftCard>`.
2. Clicks Approve:
   a. Domain tRPC mutation (owned by notifications module) updates `agent_draft.status = 'approved'`, `approved_at`, `approved_by`.
   b. Enqueues pg-boss `execute-approved-draft` job with full payload.
   c. Emits `agent.draft_approved` kernel audit.
3. Clicks Reject:
   a. `agent_draft.status = 'rejected'`, `rejected_reason`.
   b. Emits `agent.draft_rejected` audit.
   c. Notifies initiator.

### `execute-approved-draft` worker

1. Worker receives job with `{ draft_id, tenant_id, ... }`.
2. Reload `agent_draft`: verify `status = 'approved'`.
3. Verify `agent_delegation` still `active` (not expired, not revoked).
4. Run `canDo(delegator_user_id, permission, args)` — revalidate at execute time.
5. Compare execute-time `canDo` result against `permission_envelope_at_draft_time`:
   - Strict widening → emit `permission_widened_between_draft_and_execute` audit event. Does NOT block.
   - Narrowing → execute-time `canDo` already returns false; execution fails with standard error path.
6. If `approval_freshness === 'revalidate'`: domain command revalidates preconditions against live data (e.g. "is the project still open?"). Non-revalidation is explicit `'accept-stale'`.
7. Invoke tool via `ToolGateway.invoke({ mode: 'execute', ... })` with `requestContext` carrying `delegator_user_id` (not approver).
8. Update draft row with `executed_at`, `execution_outcome`.
9. Emit `agent.draft_executed` audit.
10. Notify both initiator (via notifications) and approver ("Action executed: X").

On failure:

- Revalidation fails: update draft `status = 'execution_failed'`, `outcome = 'revalidation_failed'`; notify.
- Delegation expired: `status = 'execution_failed'`, `outcome = 'delegation_expired'`; notify.
- Domain execution error: `status = 'execution_failed'`, retry policy per pg-boss job config (max 3 retries); final failure notifies.

### Draft expiry sweep

1. Cron `sweep-expired-drafts` runs hourly.
2. Query `SELECT * FROM agent_draft WHERE status = 'pending' AND expires_at < now() AND tenant_id = :t` per tenant.
3. For each expired row:
   a. Update `status = 'expired'`.
   b. Emit `agent.draft_expired` audit.
   c. Notify initiator "Draft expired without approval."
4. Metrics: `agent_draft_expired_total{tenant_id, tier}`.

### Taint propagation to draft

1. Turn in progress; plan 01 gateway taint-wrap flips `turnState.tainted = true` when tool result has a `tenantAuthoredFreeText` field.
2. Taint source added to `turnState.taintSources: [{ tool, fields, authored_by? }]`.
3. When `DraftProposer.propose(...)` runs:
   - `DraftTierClassifier.classify(...)` sees `turnState.tainted === true` → bumps low_risk to high_risk.
   - `provenance.derived_from_tainted_sources` populated from `turnState.taintSources`.
4. Kernel audit `agent.draft_proposed` captures `taint_at_draft_time: true`.

### Permission envelope snapshot

1. At draft time: `permissionEnvelopeAtDraftTime = canDo(initiator_user_id, tool_permission_key, args)` → `{ allowed: true, scope: ..., matched_rule: ... }`.
2. Stored on draft row as JSONB, always present (`{}` if somehow empty — never NULL).
3. At execute time: execute-time `canDo` computed; compared structurally.
4. If execute-time scope ⊃ draft-time scope (strict widening): emit audit event. Does not block execution.
5. Narrowing: execute-time denies; standard failure.

---

## 6. Requirements

### Draft proposal

| #      | Requirement                                                                                                                       | Design §§ |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-08.1 | Sub-agent that attempts a `.mutation()` triggers `DraftProposer.propose` rather than direct execute                               | §10       |
| R-08.2 | `DraftProposer` always populates `provenance` fully — empty array for `derived_from_tainted_sources` when no taint, never missing | §10       |
| R-08.3 | `permission_envelope_at_draft_time` always present on draft row — empty-but-present if absent                                     | §10       |
| R-08.4 | `DraftTierClassifier` bumps tier to high_risk when `turnState.tainted === true` AND tool is `.mutation()`                         | §10, §2   |
| R-08.5 | Turn ends at "draft submitted" — never waits for approval mid-turn                                                                | §10       |
| R-08.6 | `draft.proposed` SSE event fires AFTER `answer.complete`, NEVER interleaved with tokens                                           | §15, §10  |

### Approval flow

| #       | Requirement                                                                                                    | Design §§ |
| ------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| R-08.7  | High-risk drafts route through notifications module inbox; approver uses existing manager-approves-employee UX | §10       |
| R-08.8  | Approve action enqueues `execute-approved-draft` pg-boss job carrying full delegation context                  | §10       |
| R-08.9  | Live-session drafts mint synthetic execution-delegation via `ApprovalExecutorDelegationMinter`                 | §10       |
| R-08.10 | Async drafts reuse original schedule-creation delegation                                                       | §10, §11  |
| R-08.11 | Approver is the gate; delegator is the execution authority — tool runs under delegator's `canDo` + identity    | §10       |

### Execution contract

| #       | Requirement                                                                                                      | Design §§ |
| ------- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| R-08.12 | `ExecuteApprovedDraftWorker` revalidates delegation active status before invocation                              | §10       |
| R-08.13 | Worker revalidates `canDo` at execute time against current permissions                                           | §10       |
| R-08.14 | Permission widening (strict superset) emits `permission_widened_between_draft_and_execute` audit; does NOT block | §10       |
| R-08.15 | Permission narrowing fails execution via execute-time `canDo` denial (standard path)                             | §10       |
| R-08.16 | `approvalFreshness: 'revalidate'` domain-revalidates preconditions before mutating                               | §10       |
| R-08.17 | `approvalFreshness: 'accept-stale'` is explicit opt-out for idempotent no-state actions                          | §10       |
| R-08.18 | `.mutation()` procedures exposed as agent tools MUST declare `approvalFreshness` (plan 01 R-01.13 — drift test)  | §7, §10   |

### TTL

| #       | Requirement                                                               | Design §§ |
| ------- | ------------------------------------------------------------------------- | --------- |
| R-08.19 | Default TTL 72h; `expires_at = drafted_at + approvalTtl`                  | §10       |
| R-08.20 | 7d TTL requires explicit `.meta({ agent: { approvalTtl: '7d' } })` opt-in | §10       |
| R-08.21 | Per-tool TTL override may go shorter (24h for time-sensitive)             | §10       |
| R-08.22 | Expiry sweeper marks status + notifies initiator + emits audit            | §10       |

### Provenance + UI contract

| #        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Design §§ |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-08.23  | `provenance` shape per §4 interface, always all fields populated                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §10       |
| R-08.24  | `user_utterance` sanitized via `project_to_schema` when approver ≠ initiator                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | §10       |
| R-08.25  | Approval cards rendered through `<AgentDraftCard>` presenter in `@future/ui` — downstream UIs cannot inline-render                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | §10       |
| R-08.25a | `DraftProposal.summary` is **business-intent language**, never raw args or technical jargon. Acceptable: _"Approve Jane Doe's leave request for Apr 15–19, 2026"_ or _"Create hiring offer for Acme Corp, $85k base"_. Unacceptable: _"Call timesheet.entry.create({date: '2026-04-21', ...})"_ or _"Execute mutation with these params"_. Summary is generated by the proposing sub-agent with knowledge of the domain entity; the sub-agent's `outputSchema` SHOULD constrain the summary field (e.g. min/max length, required entity-name mention). Any draft whose summary contains raw args markup (JSON brackets, tool-name prefixes, parameter keys like `date:`) is a P2 incident surfaced by a scheduled lint job over recent drafts. | §10       |
| R-08.26  | Draft-age indicator renders past 24h with increasing visual weight past 72h                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | §10       |
| R-08.27  | Tainted-source provenance renders above the fold with warning styling on high-risk drafts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | §10       |

### Audit trail

| #        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Design §§       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| R-08.28  | Kernel audit events: `agent.draft_proposed`, `agent.draft_approved`, `agent.draft_rejected`, `agent.draft_executed`, `agent.draft_expired`, `agent.draft_execution_failed`, `permission_widened_between_draft_and_execute`                                                                                                                                                                                                                                                                                                                                                        | §10, §15.5      |
| R-08.29  | Every audit event tagged with `trace_id, on_behalf_of, via_delegation, via_schedule?, approved_by?`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §15.5           |
| R-08.30  | `derived_from_tainted_sources` is a first-class query dimension on audit trail — one query retrieves "all approved drafts from tainted turns in last 30 days"                                                                                                                                                                                                                                                                                                                                                                                                                     | §10             |
| R-08.30a | A read-only `DraftAuditQueryFacade` (RLS-scoped) provides a typed query surface for the compliance module. Required dimensions queryable in any combination: `tenant_id` (implicit), `initiator_user_id`, `approver_user_id`, `tier`, `status`, `domain_kind` (parsed from `tool_name`), `approved_at` time bucket (hour / day / week / month), `taint_at_draft_time`. Example compliance query: "All timesheet.\* drafts in Q1 2026 where status='executed', grouped by approver, with time-to-approval histogram." Consumed by the compliance module's SOC2/HR audit reporting. | §10, compliance |

### Per-flow approval policy + MVP write scope

| #       | Requirement                                                                                                                                                                                                                                                                                 | Design §§                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| R-08.31 | Flow-policy registry is module-local (`modules/<X>/agent/flow-policies/*.ts`), aggregated at build; `intent_slug` is unique across the aggregated registry (EI-8). Duplicate keys fail the build.                                                                                           | runtime §10, §12, §16     |
| R-08.32 | Per-flow policy composes with per-tool policy via the most-strict-wins rule (`max` on `approvalFreshness`, `min` on `approvalTtl`, upgrade-only `tier_bump`). Composition is deterministic and unit-tested.                                                                                 | runtime §10               |
| R-08.33 | Flow-policy resolution runs in the gateway pipeline between `Resolve` and `Ceiling pre-check` (step 2 of §5). Downstream pipeline steps read the effective policy.                                                                                                                          | runtime §10, §16; plan 01 |
| R-08.34 | Draft row carries `flow_id` (plan 07). `agent.draft_proposed` / `_approved` / `_executed` / `_expired` / `_rejected` audit events inherit `flow_id` from the draft.                                                                                                                         | runtime §12               |
| R-08.35 | Build fails if a `.mutation()` tool is invoked via an `intent_slug` whose flow-policy declares `requireFresh: true` AND tool-meta declares `approvalFreshness: 'accept-stale'`. Flow-policy may only strengthen tool-meta defaults; escalating to stale is rejected at build time.          | runtime §10               |
| R-08.36 | MVP write scope enforced by feature flag: `planner.*` and `projects.*` mutations enabled day 1. `people.*` mutations gated behind `feature.agent.people_writes` (default off at MVP; enabled 2-4 weeks post-MVP). Non-whitelisted domains reject at the gateway before tier classification. | runtime §16               |

---

## 7. Failure Modes & Recovery

| Failure                                                                 | Symptom                                                            | Recovery                                                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft proposer can't resolve approver (no matching domain rule)         | Draft creation fails                                               | Sub-agent surfaces structured error to model; model may propose an alternative action. Log as P2 (domain misconfiguration).                                                           |
| Synthetic delegation minting fails (kernel unavailable)                 | Draft creation fails                                               | Turn surfaces `turn.ended.reason: error`; no partial draft written.                                                                                                                   |
| Notification post fails after draft row inserted                        | Draft pending but no approver notice                               | Outbox pattern: scheduled sweeper retries notification post; alert after N failures. Draft is still queryable by approver via inbox refresh.                                          |
| Delegation expires while draft still pending                            | `execute-approved-draft` worker detects at step 3                  | Draft status `execution_failed`, outcome `delegation_expired`; initiator notified; approver notified.                                                                                 |
| Permission narrowed between draft and execute                           | Worker step 4 `canDo` denies                                       | Standard execution failure; notifies both parties.                                                                                                                                    |
| Permission widened                                                      | Worker step 5 emits audit; execution proceeds                      | Audit visible in dashboards; not blocking.                                                                                                                                            |
| Domain revalidation fails (e.g. project closed since draft)             | `approvalFreshness: 'revalidate'` path returns precondition-failed | Draft `execution_failed`, outcome `revalidation_failed`; notifies.                                                                                                                    |
| Worker crashes mid-execution                                            | pg-boss retry policy                                               | Retries up to 3; final failure marks draft failed; alert.                                                                                                                             |
| Partial success: tool executed but draft-row update fails               | Inconsistent state                                                 | Atomic transaction wraps tool execute + draft update; if partition, compensating update job reconciles.                                                                               |
| Taint flag set but proposer misses bump                                 | Low-risk draft auto-executes on tainted turn (SECURITY BUG)        | Gateway re-enforces at draft submission independent of proposer code (R-08.4 defense-in-depth); any slip is a P1 data-handling incident.                                              |
| Double-execute (approved → worker runs twice)                           | Idempotence required                                               | Worker's first action is `UPDATE agent_draft SET status='executed' WHERE id=? AND status='approved'` — single-row-update lock; second worker sees status already-executed and no-ops. |
| Provenance utterance contains sensitive content not in approver's scope | Surfaces in approval card → data exposure                          | R-08.24 sanitization — tested via seed scenario (approver lacks scope on a phrase in utterance → phrase redacted).                                                                    |

---

## 8. Observability Surface

### Spans

- `DRAFT:propose` (entity `DELEGATION` or new `DRAFT`) — child of `SUB_AGENT_TOOL_CALL`; attrs `tier`, `taint_at_draft_time`, `approver_resolved: boolean`.
- `DRAFT:tier-classify` — child; attrs `tier`, `reason`.
- `DRAFT:delegation-mint` — child; attrs `delegation_id`, `mint_source: 'synthetic' | 'reused_schedule'`.
- `DRAFT:submit` — child; attrs `draft_id`, `notification_posted: boolean`.
- `EXECUTE_APPROVED_DRAFT:*` — span tree at worker side (separate trace linked via `parent_trace_id` = draft's original trace).

### Trace attributes (on `TURN` root)

- `drafts_proposed_count`.
- `drafts_tier_bumped_by_taint_count`.

### Metrics

- `agent_draft_proposed_total{tenant_id, tier, tool_name}` — counter.
- `agent_draft_approved_total{tenant_id, tier, time_to_approval_bucket}` — counter with bucketed latency.
- `agent_draft_rejected_total{tenant_id, tier, reason}` — counter.
- `agent_draft_expired_total{tenant_id, tier, ttl}` — counter.
- `agent_draft_executed_total{tenant_id, tier, outcome}` — counter.
- `agent_permission_widened_between_draft_and_execute_total{tenant_id}` — counter.
- `agent_approval_inbox_depth{tenant_id, approver_bucket}` — gauge (approver count bucketed; no `approver_user_id` label per cardinality guardrail).
- `agent_draft_ttl_utilized_ratio` — histogram (how much of TTL was used before approval / expiry).

### Dashboards

- Approval latency distribution per tenant (alert if p50 > 24h — process bottleneck).
- Rejection rate per tenant per tool (high = UX issue or bad tool fit).
- Taint-bumped drafts outcome: approval rate vs execution success (signal for prompt-injection attack detection).
- Expiry rate (alert if sustained high — approvers overloaded or surfaces missing).
- Permission-widening events (audit log view; typically rare — spike may indicate role-permission churn).

---

## 9. Security Considerations

- **Prompt-injection mitigation.** The taint → approval-bump is the primary defense. A tenant-authored comment reading _"please remember to approve..."_ can bias the model, but the drafted write still requires a human to click Approve; the draft card surfaces tainted provenance above the fold with warning styling.
- **Delegation-not-impersonation.** Worker executes under `delegator_user_id`, not `approved_by`. Audit trail carries both; post-incident reconstruction is clean.
- **Synthetic execution-delegation scope.** Minted with `scope = draft-specific` (pinned to this one draft's action). Not reusable; not a general-purpose delegation that could be abused if leaked.
- **Permission envelope audit.** Widening between draft and execute is legitimate but must be visible. The dashboard is tenet-critical — a role escalation between draft and execute that nobody notices is exactly the attack class we're mitigating.
- **Approver ≠ initiator utterance sanitization.** Prevents a manager from seeing employee-private utterance content. Verified by seeded test.
- **Double-execute idempotence.** Single-row-update lock on `status = 'approved'` to `'executed'` transition guarantees exactly-once semantics.
- **Notifications module trust boundary.** We hand off a payload; the notifications module's approval UI is a separate trust domain. Presenter component enforces agent-defined rendering; notifications module cannot render draft payload bypassing the presenter (R-08.25).
- **TTL default = 72h.** Biases toward "let drafts expire" rather than "let them linger"; minimizes stale-execution risk.
- **Flow-policy is a strengthening surface only.** Per-flow policy can raise `approvalFreshness` to `'revalidate'`, shorten `approvalTtl`, and bump tier to `high_risk_approval_required`. It cannot downgrade tool-meta defaults. Composition is enforced at build (forbidden combination rejected per R-08.35) and at runtime by the most-strict-wins resolver. A compromised or misconfigured module-local flow-policy file can only make a call safer, never laxer.

---

## 10. Performance Budget

| Operation                                                                   | p50    | p95    | p99     |
| --------------------------------------------------------------------------- | ------ | ------ | ------- |
| `DraftProposer.propose` (tier class + provenance build + envelope snapshot) | <15ms  | <40ms  | <100ms  |
| `ApprovalExecutorDelegationMinter.mintForDraft`                             | <20ms  | <50ms  | <120ms  |
| `DraftSink.submit` (DB insert + audit + notification post)                  | <30ms  | <80ms  | <200ms  |
| Approve tRPC mutation → pg-boss enqueue                                     | <50ms  | <150ms | <400ms  |
| `ExecuteApprovedDraftWorker` handle (excluding tool execution)              | <100ms | <300ms | <700ms  |
| Draft expiry sweep (1K drafts scanned)                                      | <200ms | <500ms | <1500ms |
| `<AgentDraftCard>` render (client)                                          | <16ms  | <50ms  | <100ms  |

Draft proposal adds < 200ms to turn wallclock p99 per draft.

---

## 11. Testing Strategy

### Unit

- `DraftTierClassifier`: test matrix over (tool default tier, taint flag, tenant policy) → classified tier.
- `DraftProposer.propose`: provenance populated with all fields; empty taint sources array when no taint.
- `ApprovalExecutorDelegationMinter`: synthetic delegation has correct scope pinning; expires_at matches draft TTL.
- `DraftSink.submit`: happy path writes all expected rows + events.
- `ExecuteApprovedDraftWorker`: revalidation + widening-audit + narrowing-fail + idempotence.
- TTL expiry: `expires_at = drafted_at + ttl` computed from default and per-tool overrides.

### Integration

- Happy path low-risk auto: tool invoke → draft → auto-approve → execute → notify. Audit trail has draft_proposed + draft_approved + draft_executed.
- Happy path high-risk: tool invoke → draft → approver inbox → approve → execute. Both parties notified.
- Taint bump: tool returns tenant-authored content → taint flips → sub-agent proposes draft → tier bumped to high_risk → audit captures `taint_at_draft_time: true`.
- Permission widened: draft-time role allows X; between draft and execute, role permission expanded to X+Y; widening audit fires; execution proceeds.
- Permission narrowed: draft-time role allows X; permission removed before execute; `canDo` denies; draft status `execution_failed`, outcome `canDo_denied`.
- Revalidation fail: draft targets project P; project closed before execute; `approvalFreshness: 'revalidate'` → revalidation rejects; outcome `revalidation_failed`.
- TTL expiry: seed draft with 1h TTL; advance clock > 1h; sweeper runs; status `expired`; initiator notified.
- Idempotence: seed pg-boss duplicate delivery of `execute-approved-draft`; second invocation no-ops.
- Utterance sanitization: initiator utterance contains content outside approver's scope; approver's card shows redacted utterance.
- Presenter contract: downstream UI tries to render draft payload without `<AgentDraftCard>` → lint rule (or design-system constraint) blocks at review.
- Business-intent summary (R-08.25a): seed drafts with summaries containing raw args markup (JSON brackets, `tool.*.create({...})`, `date: '2026-04-21'`) → scheduled lint job flags them as P2 incidents; seed drafts with proper business language ("Approve Jane Doe's leave…") → lint passes.
- Compliance query facade (R-08.30a): seed 50 drafts across 3 tenants with varying `tier`, `status`, `approver_user_id`, `domain_kind`; verify `DraftAuditQueryFacade` returns correct row counts for each dimension combination; cross-tenant query for tenant A never returns tenant B rows (RLS).
- Tenant policy override: seed `TenantApprovalPolicy.tier_overrides_by_tool = { 'timesheet.entry.update': 'high_risk_approval_required' }` → a draft that would be `low_risk_auto` by tool default is classified high_risk; seed attempted downgrade (tenant tries to set low_risk for a globally-high_risk tool) → classifier ignores the override (downgrade forbidden by rule).

### Property

- Provenance integrity: for all synthetic combinations of (taint, approver=initiator, async-origin), provenance has all fields populated and correct types.
- Audit-chain integrity: for every `agent.draft_executed`, preceding `agent.draft_approved` exists for same `draft_id` (except auto-approve lineage where approved_by='system:low-risk-auto').

### E2E

- Full flow in `web-planner`: user asks agent to "mark task X as complete" → agent drafts high-risk write (taint scenario) → draft card in notifications → approve → task marked complete; notifications on both sides.
- Cross-tenant: draft in tenant A not visible to tenant B approver.

### Fixtures

- `fixtures/drafts/low-risk-auto.ts`
- `fixtures/drafts/high-risk-taint-bumped.ts`
- `fixtures/drafts/widened-permission.ts`
- `fixtures/drafts/narrowed-permission.ts`
- `fixtures/drafts/revalidation-failed.ts`
- `fixtures/drafts/expired-ttl.ts`
- `fixtures/draft-cards/warning-styled-tainted.tsx` (UI snapshot).

---

## 12. Acceptance Criteria

- All unit + integration + property + E2E tests pass.
- §18.2 security criterion "Taint-propagates-across-approval" end-to-end test passes.
- Provenance block always populated; verified by schema check on every `agent_draft` row.
- Permission-widening audit events fire when expected; 0 false-negatives in seeded scenarios.
- TTL expiry sweeper runs reliably on schedule; metric `agent_draft_expired_total` emits correctly.
- Cross-tenant isolation: no draft visible across tenants.
- Double-execute idempotence: seeded duplicate delivery produces single execution.
- `<AgentDraftCard>` presenter is the only rendering path (lint/review-enforced).
- Summary-lint job verified on seeded corpus: drafts with raw-args summaries flagged P2; business-intent summaries pass clean.
- `DraftAuditQueryFacade` dimensions all queryable in combination; RLS-verified cross-tenant isolation.
- Tenant policy upgrade enforced; downgrade attempts ignored.

---

## 13. Rollout Plan

- **Phase 1** — ship `agent_draft` schema + `DraftProposer` + `DraftSink` with no approval flow; all writes persist to draft but auto-execute via worker (for internal testing).
- **Phase 2** — add approval inbox integration via notifications module; one high-risk write-tool enabled.
- **Phase 3** — taint bump enforcement; tainted-provenance warning styling.
- **Phase 4** — expand to all write tools; permission-widening audit dashboarded.
- **Phase 5** — `<AgentDraftCard>` presenter in `@future/ui`; production rollout.

**Backout:** any bug in the worker's permission revalidation is P1 — disable write tools via registry (remove `.meta({ agent })` from mutations); reverts to read-only agent. Draft proposer code can ship but without active write tools nothing drafts.

---

## 14. Dependencies

- Plan 00 (shipped): sanitizer (for utterance projection).
- Plan 01: gateway pipeline — `FlowPolicyResolver` placement between Resolve and Ceiling pre-check (R-08.33); write path + taint flag.
- Plan 02: router — emits `intent_slug` consumed by flow-policy resolver.
- Plan 03: sub-agent runner (calls `DraftProposer`).
- Plan 04: memory / conversation state.
- Plan 05: approval inbox throttle.
- Plan 06: `draft.proposed` SSE event.
- Plan 07: trace correlation + audit — `flow_id` column on `agent_draft` (R-08.34).
- Plan 09: async agent delegation creation (drafts via schedules reuse delegation); delegation-signed autonomous writes defer to Beta gate.
- Kernel module: `canDo`, delegation grants, audit events.
- Notifications module: approval inbox UI + approve/reject actions + `<AgentDraftCard>` mounting.

## 15. Integration Points

- `@future/db` — `agent_draft` migration.
- `apps/api/src/modules/agents/infrastructure/schema/agent-draft.ts`.
- `apps/api/src/modules/agents/infrastructure/repositories/draft-repository.ts`.
- `apps/api/src/modules/agents/application/services/draft-proposer.ts`.
- `apps/api/src/modules/agents/application/services/draft-tier-classifier.ts`.
- `apps/api/src/modules/agents/application/services/approval-executor-delegation-minter.ts`.
- `apps/api/src/modules/agents/application/services/draft-sink.ts`.
- `apps/api/src/modules/agents/interface/trpc/draft-audit-query-facade.ts` — compliance read surface (R-08.30a).
- Admin module: `admin_tenant_config.approval_policy JSONB` (R-08.25a / §4 `TenantApprovalPolicy`) + `admin.setApprovalPolicy` runbook mutation.
- `apps/api/src/modules/agents/infrastructure/workers/execute-approved-draft.ts`.
- `apps/api/src/modules/agents/infrastructure/workers/sweep-expired-drafts.ts`.
- `packages/ui/src/agent/agent-draft-card.tsx` — `<AgentDraftCard>`.
- Notifications module — inbox write + approve/reject handlers.
- Kernel module — audit events + delegation minting.
- pg-boss — two job types.

## 16. Activation Gate

MVP. First production turn that includes any write tool activates:

- Per-flow approval policy (flow-policy registry + `FlowPolicyResolver` in gateway pipeline).
- Draft-to-inbox (draft → notifications-module approval card → approve → execute).
- Low-risk auto-execute + high-risk approval flow.
- Write scope: `planner.*` and `projects.*` mutations enabled day 1.

`people.*` write activation is deferred 2-4 weeks post-MVP, gated behind `feature.agent.people_writes` (default off). Enable after clean approval data and domain sign-off.

Delegation-signed autonomous writes remain deferred to plan 09 Beta gate.

## 17. Out of Scope

- L3.5 scratchpad write-tool (Beta).
- Agent-proposed L3 writes (GA).
- Async autonomous writes (GA — MVP async is read-only + draft-to-inbox).
- Per-tenant approval policy configuration UI (product concern).
- Custom per-domain approval workflows (each domain owns; this plan provides entry point).

## 18. Open Questions

- **Low-risk auto-execute tool whitelist.** Which write tools ship as `low_risk_auto` at MVP? Recommend: none initially — all writes require approval. Expand after 30 days of clean approval data. Owner: product + security review.
- **Approver resolution for cross-domain drafts.** If a draft spans two domains (rare in bounded), who approves? Defer — two-phase bounded rarely produces cross-domain drafts; iterative topology might. Revisit at plan 12.
- **Approval-card copy + visual design.** Warning styling for tainted provenance — what does "above the fold" look like mobile vs desktop? Owner: design review.
- **Notification module contract.** What's the exact interface for `notifications_item` write + approve/reject hooks? Pre-flight check before plan 08 Phase 2.
- **Rejection reason taxonomy.** Free-text vs enumerated? Recommend: enumerated at MVP (`not_needed`, `wrong_entity`, `wrong_value`, `other_with_note`).
- **`approvalTtl` per-tenant override.** Should tenants configure their own default TTLs? Recommend: not at MVP; add if customer asks. (Now part of `TenantApprovalPolicy.approval_ttl_override_hours` — shape placeholder at MVP, honored from Phase 4.)
- **Approver unavailability / OOO escalation.** What happens if the resolved approver is on leave, terminated, or simply unresponsive past SLA? MVP behavior: draft sits until TTL expiry (72h default), then initiator is notified. This is safe but slow for time-sensitive work. Candidates for post-MVP: (a) query leave module for approver OOO status at resolution time → resolve to delegate if flagged; (b) approver SLA timer → escalate to manager's-manager after N hours; (c) tenant-configured fallback-approver chain. Recommend: (a) first (read-only, domain-integrated). Owner: product + domain owners; defer to Beta.
- **Multi-approver sequencing.** Some business flows (finance > $10k, cross-functional hires, compliance-sensitive terminations) need multiple approvers in sequence or parallel. MVP: single approver per draft. Forward-compat: `agent_draft` schema reserves space — add `approver_chain JSONB?` field at Beta if adopted (array of `{ user_id, status, approved_at? }`). Do NOT add the field at MVP until there's a real use case — unused schema drifts. Owner: product; revisit at Beta when cross-domain drafts appear (plan 12).
- **Revalidation that detects meaningful change but not failure.** Example: draft proposes invoice at unit price $100; at execute time, unit price is $105 (minor change). `'revalidate'` currently returns binary pass/fail. Should there be a third outcome — "proceed with refreshed value" — that notifies the approver for acknowledgment before commit? Recommend: keep binary at MVP; per-domain revalidation functions return pass/fail. If a domain wants refresh-with-ack, it implements that as a fresh draft proposal, not a mid-execution mutation. Owner: domain module authors; document convention in implementation doc.
