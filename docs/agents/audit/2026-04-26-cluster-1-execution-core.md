# Cluster 1 — Execution Core Audit

**Date:** 2026-04-26
**Auditor:** Claude Code (read-only)
**Plans audited:** Plan 00 (Foundation), Plan 01 (Gateway Pipeline), Plan 02 (Sub-Agents / Router / Prompt), Plan 02.5 (Tool Retrieval), Plan 03 (Two-Phase Execution + Synthesizer), Plan 12 (Iterative Topology)
**Scope:** Read-only. No source edits. All citations include file:line.

---

## Cluster Summary Table

| ID     | Severity | Plan      | Rule / Section      | File (abbreviated)                  | One-line description                                                 |
| ------ | -------- | --------- | ------------------- | ----------------------------------- | -------------------------------------------------------------------- |
| C1-001 | **P0**   | Plan 00   | §3 Data Model       | 0000_initial.sql:1832               | 27+ tenant-scoped agents tables missing RLS                          |
| C1-002 | **P1**   | Plan 01   | §3 audit schema     | pipeline-steps.ts:452               | auditEmit missing on_behalf_of / via_delegation / via_schedule       |
| C1-003 | **P1**   | Plan 01   | §8 Observability    | tool-gateway.ts:911                 | audit_row_id span attribute is undefined (TODO-plan-07)              |
| C1-004 | **P2**   | Plan 01   | §8 Metrics          | gateway-metrics.ts                  | Cache hit ratio: gauge spec vs counter implementation                |
| C1-005 | **P2**   | Plan 01   | §4 ToolRegistry     | tool-registry.ts:227                | Screen-relevance filter is a TODO stub                               |
| C1-006 | **P1**   | Plan 02.5 | §3 Embedding schema | agent-tool-embedding.schema.ts      | JSONB column, no pgvector, no ANN index                              |
| C1-007 | INFO     | Plan 02   | §4 SubAgentRegistry | sub-agent-registry.ts               | Boot-fail-loud correctly implemented                                 |
| C1-008 | **P1**   | Plan 03   | §4 SubAgentRunner   | sub-agent-runner.ts:160             | usageTotals hardcoded to ZERO_USAGE on completed path                |
| C1-009 | **P1**   | Plan 03   | §4 ReAct loop       | sub-agent-runner-adapter.ts:72      | Vercel AI SDK tool loop not wired — stub output only                 |
| C1-010 | **P1**   | Plan 03   | §9 Synthesizer      | synthesizer-adapter.ts:23           | LLM synthesis not wired — mechanical concatenation only              |
| C1-011 | INFO     | Plan 12   | §4 Permission gate  | router-session-orchestrator.ts:648  | canDo('agent.iterative') gate correctly wired                        |
| C1-012 | INFO     | Plan 12   | §4 R-12.4a          | router-session-orchestrator.ts:351  | Inline surface guard correctly implemented                           |
| C1-013 | INFO     | Plan 12   | §5 Iteration caps   | iterative-orchestrator.ts           | SURFACE_MAX_ITERATIONS = {interactive:10, async:20} correct          |
| C1-014 | **P2**   | Plan 01   | §4 drift-rules      | drift-rules.ts:56                   | R-01.19 aggregate detector uses fixed key set — misses custom shapes |
| C1-015 | **P2**   | Plan 02   | §5 Window builder   | window-builder.ts:107               | Compressed tier is verbatim concat — nano summarizer not wired       |
| C1-016 | **P2**   | Plan 02.5 | §4 ToolRetriever    | tool-retriever.ts:152               | Fallback metric deferred to plan 07 — log-only                       |
| C1-017 | **P2**   | Plan 03   | §11 Test coverage   | (missing file)                      | No bounded two-phase fan-out integration test                        |
| C1-018 | INFO     | Plan 01   | §11 Test coverage   | pipeline-steps.spec.ts              | Pipeline unit tests present and complete                             |
| C1-019 | INFO     | Plan 02   | §11 Test coverage   | router-session-orchestrator.spec.ts | Router orchestrator integration harness present                      |
| C1-020 | INFO     | Plan 12   | §3 agent_iteration  | agent-iteration.schema.ts           | Schema complete, all required fields present                         |

**Total findings: 20** | P0: 1 | P1: 6 | P2: 6 | INFO: 7

---

## Plan 00 — Foundation Reference

### §3 Data Model: RLS (C1-001, P0)

**File:** `packages/db/drizzle/migrations/0000_initial.sql` — lines 1832-1834

Plan 00 §3 requires `ALTER TABLE ... FORCE ROW LEVEL SECURITY` plus a `tenant_id = current_setting('app.tenant_id')::uuid` policy on every tenant-scoped store, explicitly calling out `agent_prompt_store` and `agent_narrative_store`.

Searching the migration:

```
grep -n 'ENABLE ROW LEVEL\|FORCE ROW LEVEL\|CREATE POLICY' 0000_initial.sql
→ lines 1832-1834 only: ALTER TABLE agents.agent_tool_result_cache ENABLE...
                                                                   FORCE...
                         CREATE POLICY agent_tool_result_cache_tenant_isolation
```

Only `agent_tool_result_cache` (plan 14) has RLS. The following tables — created by plans 00, 01, 02, 03, 12 — have `tenant_id` columns but **no RLS**:

`agent_prompt_store`, `agent_narrative_store`, `agent_session`, `agent_stored_sub_agent`, `agent_tool_invocation`, `agent_turn_sampling_decision`, `agent_iteration`, `agent_conversation`, `agent_message`, `agent_chat_session`, `agent_chat_message`, `agent_cost_event`, `agent_draft`, `agent_insight`, `agent_l3_preference`, `agent_scratchpad`, `agent_active_turn`, `agent_tenant_budget`, `agent_user_budget`, `agent_rate_limit_counter`, `agent_rollout_config`, `agent_rollout_event`, `agent_shadow_run`, `agent_canary_query`, `agent_canary_run`, `agent_golden_trace`, `agent_schedule`, `agent_schedule_run`.

This is a **multi-tenant data isolation failure**. Any query executing under a different tenant's RLS context can read or write cross-tenant agent data. CLAUDE.md states "Every table has `tenant_id`. No exceptions" and the standard RLS policy pattern is well-established in the codebase. The absence of `FORCE ROW LEVEL SECURITY` means even superuser-equivalent connections (application service role) bypass isolation.

**Suggested action:** For each agents table containing `tenant_id`, add to `0000_initial.sql`:

```sql
ALTER TABLE agents.<table_name> ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents.<table_name> FORCE ROW LEVEL SECURITY;
CREATE POLICY <table_name>_tenant_isolation
  ON agents.<table_name>
  USING (tenant_id = current_setting('app.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
```

Squash into `0000_initial.sql` per CLAUDE.md migration rules.

---

## Plan 01 — Gateway Pipeline

### §3 Audit Schema: Missing Delegation Fields (C1-002, P1)

**File:** `apps/api/src/modules/agents/application/pipeline/pipeline-steps.ts` — line 452

Plan 01 §3 `agent_tool_invocations` schema includes `on_behalf_of`, `via_delegation_id`, and `via_schedule_id` fields. The `agent_tool_invocation` table has `viaScheduleId` (schema line 417). However, `auditEmit()` (pipeline-steps.ts:452) does not populate these fields:

```typescript
await auditFacade.recordEvent({
  tenantId: requestContext.tenantId,
  actorId: requestContext.userId,
  eventType: 'agent.tool_called',
  payload: {
    permission: descriptor.permission,
    resultStatus,
    resultHash,
    extraAttrs,
    traceId: requestContext.traceId,
    // on_behalf_of, via_delegation_id, via_schedule_id — NOT populated
  },
})
```

`RequestContext` does not carry delegation context. Scheduled or delegated tool invocations are indistinguishable from direct user invocations in the audit log.

### §8 Observability: audit_row_id Span Attribute (C1-003, P1)

**File:** `apps/api/src/modules/agents/application/services/tool-gateway.ts` — lines 911 and 1022

Both the `invoke` and `audit-emit` gateway steps set `audit_row_id: undefined` with explicit TODO markers:

```typescript
// TODO-plan-07: audit_row_id will be available once plan 07 exposes the audit record ID
```

Dashboard queries correlating span to audit row are broken until plan 07 ships.

### §8 Observability: Cache Hit Ratio Metric Shape (C1-004, P2)

**File:** `apps/api/src/modules/agents/infrastructure/observability/gateway-metrics.ts`

Plan 01 §8 specifies a **gauge** `agent_tool_cache_hit_ratio{tenant_id, sub_agent_key}`. Implementation uses a **counter** `agent_tool_cache_lookup_total{tenant_id, tool_name, outcome}`. The `sub_agent_key` label was dropped (cardinality rationale). The deviation is code-documented but not reflected in the plan spec.

### §4 ToolRegistry: Screen-Relevance Stub (C1-005, P2)

**File:** `apps/api/src/modules/agents/infrastructure/tool-registry/tool-registry.ts` — line 227

The `resolveMenuFor` screen-relevance filter has a TODO comment deferring the algorithm to plan 02. Until resolved, all tools satisfying role and module filters appear in every menu regardless of screen context.

### §4 Drift Rules: Aggregate Key Heuristic (C1-014, P2)

**File:** `apps/api/src/modules/agents/infrastructure/tool-registry/drift-rules.ts` — line 56

R-01.19 enforcement relies on the fixed `AGGREGATE_KEYS` set:

```typescript
const AGGREGATE_KEYS = new Set([
  'average',
  'avg',
  'count',
  'counts',
  'max',
  'min',
  'sum',
  'total',
  'totals',
])
```

Domain-specific aggregate keys (e.g. `headcount`, `budget_utilized`, `fte_equivalent`) bypass this check. Tools with such shapes will not have `compositionSensitive.minGroupSize` validated at build time.

---

## Plan 02 — Sub-Agents / Router / Prompt

### §4 SubAgentRegistry (C1-007, INFO)

`SubAgentRegistry.boot()` correctly validates R-02.6..R-02.9 and throws `SubAgentRegistryValidationError` on any invariant violation. Boot-fail-loud pattern is properly implemented. No deviation.

### §5 Window Builder: Compressed Tier Stub (C1-015, P2)

**File:** `apps/api/src/modules/agents/application/services/window-builder.ts` — line 107

```
// MVP compressed tier: concatenation placeholder (Phase 4 will call the nano summarizer).
```

The compressed context tier (messages 4-13) is concatenated verbatim. The gpt-5.4-nano summarizer call is not wired. This inflates router prompt token count for long conversations and can breach the `ROUTER_PROMPT_TOKEN_CEILING`, triggering unnecessary sub-agent retrieval.

### §11 Test Coverage (C1-019, INFO)

`router-session-orchestrator.spec.ts` exists with `InMemoryAgentSessionStore` integration harness. `router-prompt-builder.spec.ts` covers the prompt construction path. Plan 02 unit test requirements are substantially met.

---

## Plan 02.5 — Tool Retrieval

### §3 Embedding Schema: JSONB vs pgvector (C1-006, P1)

**File:** `apps/api/src/modules/agents/infrastructure/schema/agent-tool-embedding.schema.ts`

Plan 02.5 §3 requires: _"vector index appropriate to the driver for ANN nearest-neighbor"_. The schema stores embeddings as `JSONB` (a `number[]` column). The migration contains no `CREATE INDEX ... USING ivfflat` or `hnsw`. At runtime, `tool-retriever.ts` and `tool-descriptor-embedder.ts` use the pure-JS `cosine.ts` linear scan.

For production scale (many tools × many tenants), this is an O(n) linear scan per retrieval vs O(log n) ANN. At <100 tools per tenant the performance impact is acceptable for MVP, but the schema deviation blocks future pgvector migration.

### §4 ToolRetriever: Fallback Metric Stub (C1-016, P2)

**File:** `apps/api/src/modules/agents/infrastructure/retrieval/tool-retriever.ts` — line 152

Fallback on embedding provider outage emits a `logger.warn` only. The `agent_tool_retrieval_fallback_fired_total{cause}` counter is explicitly deferred to plan 07. Fallback events are not observable in metrics dashboards.

---

## Plan 03 — Two-Phase Execution + Synthesizer

### §4 SubAgentRunner: usageTotals Dropped on Completed Path (C1-008, P1)

**File:** `apps/api/src/modules/agents/application/services/sub-agent-runner.ts` — line 160

`buildSubAgentOutput` correctly accepts `usageTotals?: SubAgentUsage` as an input parameter (destructured at line 114 with default ZERO_USAGE). The `ceiling_hit` and `errored` branches correctly return the parameter. The `completed` branch does not:

```typescript
// ceiling_hit branch (line 131) — correct:
usageTotals,

// errored branch (line 147) — correct:
usageTotals,

// completed branch (line 160) — BUG:
usageTotals: ZERO_USAGE,   // hardcoded constant, drops caller's value
```

Every successful sub-agent run reports zero tokens and zero cost. Cost reconciliation and budget tracking are silently wrong for all completed sub-agent runs.

### §4 ReAct Loop: Not Wired (C1-009, P1)

**File:** `apps/api/src/modules/agents/application/services/sub-agent-runner-adapter.ts` — lines 72-88

The Vercel AI SDK tool loop is not connected. `SubAgentRunnerAdapter.run()` synthesizes a fake output:

```typescript
return buildSubAgentOutput({
  rawStructured: {},             // empty — no tool calls
  outputSchema: config.outputSchema,
  signals: {
    toolResultCount: 0,
    retryCount: 0,
    toolFailureCount: 0,
    taintFlippedDuringRun: false,
    ceilingHit: false,
    semanticConflictWithSibling: false,
    circuitBreakerEventOccurred: false,
  },
  summary: `[adapter] ${subAgentKey}`,
  ...
})
```

`rawStructured: {}` fails most output schemas → `kind: 'errored'`. No tool is called. No real data is retrieved. This is the primary production readiness blocker for the agents module.

### §9 Synthesizer: LLM Call Not Wired (C1-010, P1)

**File:** `apps/api/src/modules/agents/application/services/synthesizer-adapter.ts` — lines 23-51

`SynthesizerAdapter.synthesize()` concatenates sub-agent summaries using the deterministic pure functions from `synthesizer.ts`. No LLM call is made. The result is mechanical — `content = summaries.join(' ')`. Plan 03 §9 requires a narrative LLM synthesis pass to produce a coherent, user-facing answer.

This is a second major production readiness blocker: even if ReAct loops were wired, answers would still be raw concatenation rather than synthesized narrative.

### §11 Test Coverage: No Bounded Two-Phase Integration Test (C1-017, P2)

Plan 03 §11 requires an integration test covering the bounded two-phase fan-out (phase-1 parallel fan-out, partial-answer gate, phase-2 spawning, synthesizer). `iterative-orchestrator-integration.spec.ts` covers plan 12's iterative path. No equivalent file exists for the bounded topology with real DB interactions.

---

## Plan 12 — Iterative Topology

### §4 Permission Gate (C1-011, INFO)

**File:** `apps/api/src/modules/agents/application/services/router-session-orchestrator.ts` — line 648

R-12.6 `canDo('agent.iterative')` gate is correctly wired before `iterativeOrchestrator.execute()`. Returns disambiguation with `underlying_reason: 'iterative_permission_denied'` on failure.

### §4 Inline Surface Guard R-12.4a (C1-012, INFO)

**File:** `apps/api/src/modules/agents/application/services/router-session-orchestrator.ts` — line 351

Correctly detects `topology === 'iterative' && surface === 'inline'`, retries with a bounded-hint, and hard-disambiguates if still iterative.

### §5 Iteration Caps (C1-013, INFO)

`SURFACE_MAX_ITERATIONS = { interactive: 10, async: 20 }` matches plan 12 §5 specification.

### §3 agent_iteration Schema (C1-020, INFO)

**File:** `apps/api/src/modules/agents/infrastructure/schema/agent-iteration.schema.ts`

All plan 12 §3 required fields are present: `id`, `traceId`, `tenantId`, `turnId`, `iterationNumber`, `subAgentKey`, `selectionReason`, `completionScorerResults`, `isComplete`, `startedAt`, `endedAt`, `usage`, `taintAtStart`. Index on `(turnId, iterationNumber)` is present.

---

## Cross-Plan Observations

### 1. Production Readiness: Module Cannot Answer User Questions

The combination of C1-009 (no ReAct loop) and C1-010 (no LLM synthesis) means the agents module is a structurally complete scaffold that cannot produce real answers. Every agent turn returns either `kind: 'errored'` (empty structured output fails schema) or mechanical summary concatenation. Plans 01, 02, 02.5, and 12 are well-implemented as infrastructure layers, but plan 03's execution core is not yet wired.

### 2. Security: Tenant Isolation Is Not Enforced

C1-001 is the highest-severity finding in this cluster. The entire agents schema — 27+ tables — is missing `FORCE ROW LEVEL SECURITY`. The RLS middleware (`RlsMiddleware`) sets `app.tenant_id` at request start, which is correct, but without `FORCE ROW LEVEL SECURITY` the policy is advisory, not enforced. A misconfigured or bypassed middleware leaks all agent data across tenants. This must be fixed before any production traffic.

### 3. Cost Accounting Is Silently Zeroed

C1-008 (usageTotals bug in completed branch) means token counts and USD cost are zero for all successful sub-agent completions. Budget checker, cost reconciliation job, and cost dashboards will show dramatically underreported consumption as soon as real tool invocations are wired (C1-009 resolution). Fix C1-008 before wiring C1-009 to avoid silent accounting gaps.

### 4. Observability Gaps Are Bounded and Plan-Tracked

C1-003 (audit_row_id), C1-015 (window builder), and C1-016 (retrieval fallback metric) all have explicit TODO-plan-07 or Phase-4 markers. They are known gaps with cross-plan dependencies, not oversights. The implementation correctly defers rather than silently omits.

### 5. pgvector Migration Path Is Needed

C1-006 (JSONB embeddings) is acceptable at MVP scale (<100 tools) but creates a schema migration obligation when tool count grows. The embedding column type and index should be addressed before beta launch when tenant count multiplies the linear scan cost.
