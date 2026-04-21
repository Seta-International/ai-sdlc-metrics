# 01 — Gateway Processor Pipeline + Tool Registry

**Design §§:** §7 (Tool Layer), §4 (Execution Loop & Error Handling), §15.2 (Cancellation single-path).

---

## 1. Scope

### In

- Ordered 6-step gateway processor pipeline for every tool invocation.
- Tripwire mechanism — single implementation site for §15.2 single-abort-path contract.
- Tripwire disposition: `abort | retry`.
- Tool registry discipline via `.meta({ agent: {...} })` on tRPC procedures (opt-in, not opt-out).
- Build-time drift tests enforcing schema / field / agent-block invariants.
- Menu scoping (sub-agent scope → role filter → screen filter) as deterministic pre-LLM steps.
- L1 turn-scoped read cache: key `(tool_name, canonical_args_hash)`, per-sub-agent, no cross-sub-agent sharing.
- Per-pipeline-step child spans with named convention + attribute recording.

### Out

- The sub-agent runner that drives the pipeline (plan 03).
- Router decisions about which tools to surface (plan 02).
- Write tools' approval-tier handling (plan 08).
- Cost ceiling _value_ sourcing and budget enforcement beyond the tripwire (plan 05).
- Cancellation root-signal composition (plan 06; this plan consumes a threaded signal).

---

## 2. Design Context

The gateway is the **security boundary**, per Tenet #1. Every agent tool invocation passes through it; the agent is assumed compromisable and the gateway's job is to ensure a compromised agent cannot exceed its caller's authority.

The pipeline formulation replaces the pre-v1.1 prose list of responsibilities. Each step is a named, ordered operation with a typed tripwire disposition; order is load-bearing (taint-wrap before invoke, abort-check before mutation), and the tripwire mechanism is the single site §15.2's four cancellation sources converge on.

This shape was chosen over (a) a thin wrapper over tRPC directly (too few seams for taint + ceiling + audit), (b) a plugin architecture like mastra's `ProcessorRunner` (over-engineered for a single consumer and opens a security hole via user-extensible steps), and (c) inline checks scattered across tool handlers (§18.2 would be un-auditable; drift inevitable). The pipeline is fixed at MVP; new steps require explicit design changes reviewed against the shadow-ready invariant.

**What this is NOT:** a generic middleware framework. It is a domain-specific pipeline whose steps and order are architectural invariants, not configuration.

---

## 3. Data Model

### Tool registry meta (`TrpcMeta.agent`)

Lives on the tRPC procedure definition, not in a DB table. Persists only via code; changes flow through PR review.

**Fields:**

- `whenToUse: string` — required. Router decision hint. Shown inline in router prompt.
- `whenNotToUse: string` — required. Negative examples for the router.
- `examples: { input: string, callArgs: object }[]` — required, ≥1 entry. Grounds the model in expected usage.
- `tenantAuthoredFreeText?: string[]` — optional. Field names whose content is user-authored; triggers taint flip + delimiter wrap + Langfuse redaction.
- `approvalFreshness?: 'revalidate' | 'accept-stale'` — required on `.mutation()` procedures exposed as agent tools. Drives §10 revalidation contract.
- `approvalTtl?: string` — optional, default 72h. Per-tool override for draft expiry.
- `compositionSensitive?: { minGroupSize: number }` — required on aggregate-returning tools. Author-time k-anonymity declaration.
- `ceilings?: { bytesScanned?: number, wallclockMs?: number }` — optional; required on escape-hatch + bulk tools.

### Kernel audit event schema (per tool call)

Emitted by pipeline step 6 (`audit-emit`). Schema owned by kernel module; consumed here.

- `event_type`: `'agent.tool_called'`
- `trace_id`: UUID
- `tenant_id`: UUID
- `tool_name`: string
- `on_behalf_of`: UUID (user) or NULL (tenant-wide scheduler)
- `via_delegation`: UUID or NULL
- `via_schedule`: UUID or NULL
- `approved_by`: UUID or NULL
- `permission_key`: string (`.meta({ permission })` value)
- `result_status`: `'success' | 'permission_denied' | 'domain_error' | 'ceiling_hit' | 'aborted'`
- `result_hash`: SHA-256 of canonicalized result (for correlation with kernel tool-output audit trail owned by plan 07)
- `ts`: timestamp-tz

No new agent-module tables for this plan; all persistence is via kernel module + trace stores from plan 00.

---

## 4. Interface Contracts

### `ToolGateway` (module boundary consumed by sub-agent runner)

```
invoke(input: {
  toolName: string;
  args: unknown;
  subAgentKey: string;
  requestContext: RequestContext;     // tenant_id, user_id, trace_id, surface, delegation_id?
  abortSignal: AbortSignal;
  turnState: TurnState;               // taint flag, circuit-breaker map, L1 cache
  mode: 'execute' | 'dry-run';
}): Promise<ToolGatewayResult>

type ToolGatewayResult =
  | { kind: 'ok'; result: unknown; fromCache: boolean }
  | { kind: 'tripwire'; variant: TripwireVariant; disposition: 'abort' | 'retry'; context: Record<string, unknown> }

type TripwireVariant =
  | 'procedure_not_agent_exposed'
  | 'procedure_out_of_sub_agent_scope'
  | 'permission_denied'            // fixed disposition: 'abort'
  | 'ceiling_breach_bytes'
  | 'ceiling_breach_wallclock'
  | 'abort_pre_write'              // fixed disposition: 'abort'
  | 'domain_execution_failed'
  | 'transient_provider_error'
```

### `ToolRegistry` (module boundary consumed by router + sub-agent runner)

```
listAgentTools(): ReadonlyArray<AgentToolDescriptor>
getDescriptor(toolName: string): AgentToolDescriptor | undefined
resolveMenuFor(opts: {
  subAgentScope: string[];
  roleAllowedPermissions: ReadonlySet<string>;
  surfaceContext: { screen: string; selection?: unknown };
}): ReadonlyArray<AgentToolDescriptor>

type AgentToolDescriptor = {
  name: string;
  procedure: 'query' | 'mutation';
  permission: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  meta: TrpcMeta['agent'];
}
```

### `TripwireError` (returned, never thrown)

Discriminated-union result type. `throw` of `TripwireError` is a runtime bug that should escalate to `turn.ended.reason: error`. Callers must destructure `result.kind` before use.

---

## 5. Control Flow

### Happy path — read tool invocation

1. Sub-agent runner calls `ToolGateway.invoke({ toolName, args, ... })`.
2. **Step 1 — Resolve.** Gateway calls `ToolRegistry.getDescriptor(toolName)`. If missing or `meta.agent` absent, tripwire `procedure_not_agent_exposed`, disposition `abort`. If outside `subAgentScope`, tripwire `procedure_out_of_sub_agent_scope`, disposition `abort`.
3. **Step 2 — Taint-wrap (result-path).** Deferred to after invocation; registered as a result transformer at this step. Records in span attr: `taint_wrap.fields_to_wrap`.
4. **Step 3 — Ceiling pre-check.** If `meta.ceilings` present, gateway verifies remaining headroom against `turnState.toolCeilingRemaining[toolName]`. Breach → tripwire `ceiling_breach_bytes | ceiling_breach_wallclock`, disposition `retry` (unless this is already a retry round, in which case `abort`). Records `ceiling.bytes_remaining`, `ceiling.wallclock_remaining`.
5. **Step 4 — Pre-write abort-signal check.** Only fires if `descriptor.procedure === 'mutation'`. Reads `abortSignal.aborted`. If true, tripwire `abort_pre_write`, disposition `abort`. Position is load-bearing: after ceiling check, before invocation.
6. **Step 5 — Invoke.** Gateway calls `TrpcCaller.call({ toolName, args, requestContext, mode })`. `mode: 'dry-run'` runs validation + `canDo` but does not execute domain side effects (MVP always `execute`). `canDo` + RLS apply automatically inside tRPC middleware.
7. **Step 5 — Taint-wrap result (deferred from step 2).** If result non-null AND `meta.agent.tenantAuthoredFreeText` present, for each declared field name: wrap value in `<tenant_authored field="NAME">...</tenant_authored>` markers (rendered in the message sent to the LLM, NOT on storage). Flip `turnState.tainted = true`.
8. **Step 6 — Audit emit.** Gateway emits kernel audit event per §3 schema with `result_status: 'success'`. Writes result + args to L1 read cache at key `(toolName, canonical_args_hash)` per plan 04.
9. Return `{ kind: 'ok', result, fromCache: false }`.

### Cache hit path

1-2. Resolve as above. 3. Before step 3 ceiling pre-check, check L1 cache at `(toolName, canonical_args_hash)`. On hit, skip steps 3-5; still run step 6 audit emit (cache hit is still a tool call semantically) with `result_status: 'success'`, `result_hash` from cached entry. Return `{ kind: 'ok', result: cachedResult, fromCache: true }`.

### Permission-denied path

1-6. Resolve → ceiling → pre-write check → invoke. `canDo` inside tRPC raises permission error. 7. Gateway catches, emits audit event with `result_status: 'permission_denied'`. Marks `turnState.circuitBreaker[toolName].permissionDenied = true` (disables for rest of sub-agent). 8. Returns `{ kind: 'tripwire', variant: 'permission_denied', disposition: 'abort', context: { permission_key } }`.

### Ceiling breach + retry disposition

1-2. Resolve. 3. Step 3 breach → tripwire `ceiling_breach_bytes`, disposition `retry`, context includes `budget_remaining`. 4. Sub-agent runner receives tripwire, injects structured feedback to model: "Tool X exceeded byte budget; retry with narrower filter." 5. Model issues a second call. On second ceiling breach → disposition `abort` (retry already used for this breach class in this turn).

### Pre-write abort

1-3. Resolve, taint-wrap setup, ceiling pre-check. 4. Step 4: `abortSignal.aborted === true`. Tripwire `abort_pre_write`, disposition `abort`. 5. Gateway returns without invoking. No audit event (invocation did not occur); the abort-path trace emitted by plan 06 owns the observability surface.

### Retry-counting discipline

- Gateway tracks `turnState.retryCount[toolName]` for ceiling-retry and validation-retry. 2 total retries across the turn → tripwire downgrades to `abort` on subsequent breaches.
- Circuit-breaker (2 total failures of same tool in a sub-agent → disabled) maintained in `turnState.circuitBreaker[toolName]`. Propagates to phase 2 via sanitized summary (per plan 03).

---

## 6. Requirements

### Pipeline shape

| #       | Requirement                                                                                                                                           | Design §§                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| R-01.1  | Every tool invocation traverses 6 named steps in fixed order: Resolve → Taint-wrap → Ceiling pre-check → Pre-write abort-signal → Invoke → Audit emit | §7                                                                                                                                       |
| R-01.2  | Each step may tripwire, returning a structured discriminated-union result; tripwires are NOT thrown                                                   | §7, §4                                                                                                                                   |
| R-01.3  | Tripwire carries `disposition: abort                                                                                                                  | retry`. `retry`valid only for`ceiling*breach*\*`+ soft validation;`abort`valid for all;`permission_denied`+`abort_pre_write`fixed`abort` | §4, §7  |
| R-01.4  | Order is load-bearing — taint-wrap before invoke; pre-write abort-check after ceiling, before invoke                                                  | §7                                                                                                                                       |
| R-01.5  | Pre-write abort-signal check fires only for `.mutation()`                                                                                             | §7, §15.2                                                                                                                                |
| R-01.6  | Invocation goes through server-side `TrpcCaller` only; direct domain service injection banned at lint level                                           | §7, Tenet downward DI                                                                                                                    |
| R-01.7  | Invoke honors `mode: 'execute'                                                                                                                        | 'dry-run'`discriminator; MVP always`execute`; interface must accept both                                                                 | §7, §14 |
| R-01.8  | Audit emit produces a kernel audit event per §3 data-model schema                                                                                     | §7, §15.5                                                                                                                                |
| R-01.9  | Audit emit fires on success AND on domain-execution failure (symmetric audit trail)                                                                   | §7                                                                                                                                       |
| R-01.10 | No plugin seam at MVP — pipeline is fixed                                                                                                             | §7                                                                                                                                       |

### Tool registry

| #       | Requirement                                                                                                  | Design §§    |
| ------- | ------------------------------------------------------------------------------------------------------------ | ------------ |
| R-01.11 | A tRPC procedure is an agent tool iff `.meta({ agent: {...} })` is present — no opt-out                      | §7           |
| R-01.12 | Required `agent` fields: `whenToUse`, `whenNotToUse`, `examples` (≥1)                                        | §7           |
| R-01.13 | `.mutation()` procedures exposed as agent tools MUST declare `approvalFreshness`                             | §7           |
| R-01.14 | Aggregate-returning tools MUST declare `compositionSensitive.minGroupSize`                                   | §7, Tenet #8 |
| R-01.15 | `tenantAuthoredFreeText: string[]` triggers taint wrap + Langfuse redaction + delimiter render (triple duty) | §2, §7       |
| R-01.16 | `ceilings` optional; required on escape-hatch + bulk tools                                                   | §7           |
| R-01.17 | Build fails if an `agent` block references a procedure with mismatched schema field names                    | §7           |
| R-01.18 | Build fails if a `.mutation()` agent tool omits `approvalFreshness`                                          | §7           |
| R-01.19 | Build fails if an aggregate-returning tool omits `compositionSensitive.minGroupSize`                         | §7           |

### Menu scoping

| #       | Requirement                                                                                        | Design §§ |
| ------- | -------------------------------------------------------------------------------------------------- | --------- |
| R-01.20 | Menu = sub-agent-scope ∩ role-allowed ∩ screen-relevant, deterministic + pre-LLM                   | §7        |
| R-01.21 | First `canDo` denial within a sub-agent turn disables the tool for the remainder of that sub-agent | §4        |

### L1 read cache

| #       | Requirement                                                                                                                           | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-01.22 | Cache per-sub-agent, per-turn, dies at turn end                                                                                       | §5, §7    |
| R-01.23 | Canonicalization: deterministic JSON key-sort, `undefined` dropped, `null` preserved, ISO-date re-parse to UTC-Z, no numeric coercion | §7, §8    |
| R-01.24 | No cross-sub-agent sharing, including into phase 2                                                                                    | §7        |
| R-01.25 | Write tool call invalidates reads in same cache partition (domain-scoped invalidation rule pinned in impl doc)                        | §7        |

### Observability

| #       | Requirement                                                                                             | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------- | --------- |
| R-01.26 | Every pipeline step emits child span `gateway:<step-name>`                                              | §7, §12   |
| R-01.27 | Each step records mutations as span attrs (e.g. `taint_wrap.fields_wrapped`, `ceiling.bytes_remaining`) | §7, §12   |
| R-01.28 | Uncaught throws escalate to `turn.ended.reason: error`                                                  | §7, §4    |

---

## 7. Failure Modes & Recovery

| Failure                                              | Observable symptom                                                                                                                                                                                                | Recovery                                                                                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Registry missing descriptor for requested `toolName` | Tripwire `procedure_not_agent_exposed`, `disposition: abort`                                                                                                                                                      | Sub-agent runner surfaces structured error to model; no retry. Indicates a bug (model hallucinated a tool name) — log at warn level.   |
| Tool outside sub-agent scope                         | Tripwire `procedure_out_of_sub_agent_scope`, `disposition: abort`                                                                                                                                                 | Same as above. Indicates the router picked the wrong sub-agent — feeds `router_rechose_after_replan` signal if replan fires next.      |
| `canDo` denial                                       | Tripwire `permission_denied`, disposition `abort`. Tool disabled for rest of sub-agent.                                                                                                                           | Sub-agent proceeds without the tool (§4 "not permitted, proceed without").                                                             |
| Ceiling breach (first in turn)                       | Tripwire `ceiling_breach_*`, disposition `retry`                                                                                                                                                                  | Model receives feedback, may retry with narrower args.                                                                                 |
| Ceiling breach (second in turn)                      | Tripwire `ceiling_breach_*`, disposition `abort`                                                                                                                                                                  | Tool disabled for sub-agent (circuit breaker). Sub-agent proceeds without.                                                             |
| Pre-write abort-signal fired                         | Tripwire `abort_pre_write`, disposition `abort`                                                                                                                                                                   | No invocation. Outer cancellation path (plan 06) emits `turn.ended` with appropriate `cancellation_reason`.                            |
| tRPC timeout                                         | Gateway retries once with jitter (retries live at exactly one layer — Vercel AI SDK retries disabled). Second failure → tripwire `transient_provider_error`, `disposition: retry`. Third failure = circuit-break. | Structured "transient" error to model; sub-agent continues with other tools.                                                           |
| Domain execution error (business rule violation)     | Tripwire `domain_execution_failed`, disposition `abort`                                                                                                                                                           | Model receives structured error; may reformulate approach.                                                                             |
| Kernel audit emit failure                            | Structured log `audit_emit_failed` with `trace_id`. Does NOT tripwire the user-visible path.                                                                                                                      | Async compensating write via outbox pattern; alert after N failures. Missing audit on a successful tool call is a P1 incident (§18.2). |

---

## 8. Observability Surface

### Spans

- `gateway:resolve` — child of the tool-call parent span.
- `gateway:taint-wrap-setup` — fires before invoke even when no taint fields declared (makes "no wrap" observable).
- `gateway:ceiling-check` — attrs `bytes_remaining`, `wallclock_remaining`, `breach: boolean`.
- `gateway:pre-write-abort-check` — only for mutations; attrs `aborted: boolean`.
- `gateway:invoke` — tRPC call span.
- `gateway:taint-wrap-result` — attrs `fields_wrapped: string[]`, `taint_flipped: boolean`.
- `gateway:audit-emit` — attrs `audit_row_id`, `result_status`.
- `gateway:cache-hit` (optional) — fires instead of the invoke tree when L1 hit.

### Span attributes (on `gateway:*` spans)

- `tool_name`, `sub_agent_key`, `retry_count`, `tripwire_variant?`, `disposition?`.
- `cached_args_hash` (on invoke + cache-hit).

### Metrics

- `agent_tool_call_total{tenant_id, tool_name, result_status}` — counter.
- `agent_tool_cache_hit_ratio{tenant_id, sub_agent_key}` — gauge.
- `agent_tool_tripwire_total{tenant_id, variant, disposition}` — counter.
- `agent_gateway_step_duration_ms{step}` — histogram.

Per §13 R-05.30 / R-05.31: metrics MUST NOT carry `user_id` / `conversation_id` / `trace_id` as labels.

### Dashboards

- Per-tool cache-hit ratio (alert if <30% on high-volume tools — possible canonicalizer bug).
- Tripwire distribution (alert on sudden shifts in `procedure_not_agent_exposed` — router decay).
- Circuit-breaker fire rate per tool per tenant (alert if >5% sustained — tool health).

---

## 9. Security Considerations

- **New attack surface:** tRPC procedures exposed as agent tools (via `.meta({ agent })`). Each opt-in is a deliberate expansion of the agent's authority.
- **Defense:** (a) opt-in-only registry; (b) build-time drift tests enforcing required meta fields; (c) `canDo` + RLS enforced inside tRPC middleware, not at gateway layer — gateway is _in addition_ to, not instead of.
- **Tripwire returns not throws** — prevents swallowed-exception silent-success class of bugs.
- **Downward DI ban** — lint rule forbidding domain-service imports from agent module prevents perf-optimization-by-injection bypass.
- **Pre-write abort-check position** — must be after ceiling check so abort cannot race past a ceiling breach into a committed write. Verified by ordering test.
- **Audit emit on failure** — missing audit on a successful tool call is a compliance-critical gap; §18.2 requires zero tool-call spans without matching audit rows.
- **No plugin seam at MVP** — prevents user-extensible pipeline steps that could weaken the security boundary. Beta reconsideration permits output-post-processors only (e.g. PII redaction), never input pre-processors.

---

## 10. Performance Budget

Per tool invocation, measured on p50 / p95 / p99:

| Step                                          | p50      | p95       | p99       |
| --------------------------------------------- | -------- | --------- | --------- |
| Resolve                                       | <1ms     | <2ms      | <5ms      |
| Ceiling pre-check                             | <1ms     | <2ms      | <5ms      |
| Pre-write abort-check                         | <1ms     | <1ms      | <2ms      |
| Invoke (tRPC, local module)                   | <20ms    | <80ms     | <200ms    |
| Invoke (tRPC, cross-module + DB)              | <50ms    | <150ms    | <400ms    |
| Taint-wrap result                             | <1ms     | <3ms      | <10ms     |
| Audit emit (sync path)                        | <2ms     | <5ms      | <15ms     |
| **Total gateway overhead** (excluding invoke) | **<5ms** | **<15ms** | **<35ms** |

L1 cache hit: <2ms p99 (skips invoke entirely).

Gateway overhead budget is **5% of the per-sub-agent wallclock ceiling** (15s default → 750ms gateway, supports 50+ tool calls).

---

## 11. Testing Strategy

### Unit (each step in isolation)

- Resolve: missing descriptor → tripwire; out-of-scope → tripwire; happy case returns descriptor.
- Taint-wrap: no declared fields → no-op; declared field present in result → wrapped in delimiters; taint flag flipped.
- Ceiling pre-check: under budget → passes; breach + no prior retry → tripwire retry; breach + prior retry → tripwire abort.
- Pre-write abort check: query procedure → no-op; mutation + signal not aborted → passes; mutation + signal aborted → tripwire.
- Audit emit: mock kernel facade, verify payload shape + all fields populated.

### Integration (full pipeline)

- Happy-path read: all 6 steps fire in order; span tree matches expected shape.
- Mutation with abort signal already aborted at step 4 → no invocation, no audit row, tripwire returned.
- Permission-denied on first call of tool X → second call of tool X in same sub-agent returns tripwire without invoke (circuit breaker).
- Same `(tool, args)` twice → second call is cache hit; exactly one tRPC invocation in logs.
- Write tool call in sub-agent → subsequent read on same domain returns cache miss.
- Seeded out-of-order drift (re-ordered steps locally) → deterministic ordering test fails the build.
- Seeded PR: adds a `.mutation()` with no `approvalFreshness` → CI build fails.
- Seeded PR: adds an aggregate tool with no `compositionSensitive` → CI build fails.

### Property (canonicalization)

- Fuzz: two JSON inputs with keys in different orders, same values → same canonical hash.
- Fuzz: `null` vs `undefined` distinction preserved through round-trip.
- Fuzz: ISO dates in different timezones → canonical UTC-Z form.

### Cross-tenant isolation seed

- Tenant A's turn uses tool X → tenant B's turn uses same tool X → zero shared state between the two (L1 cache is per-turn, so this is a sanity check that no global cache leaks).

### Fixtures

- `fixtures/tools/planner.get-overdue.ts` — declares `.meta({ agent })` with full field set; used as golden example in drift tests.
- `fixtures/tools/broken-missing-when-to-use.ts` — declares `.meta({ agent })` without `whenToUse`; expected to fail the build-time drift test.

---

## 12. Acceptance Criteria

- All unit + integration tests pass.
- Build fails on seeded violation PRs (drift-test coverage verified).
- Langfuse trace shows 6 `gateway:*` child spans in correct order for every tool call; missing span = P1 bug.
- Cross-tenant seed test passes (no shared L1 state).
- Gateway overhead p99 ≤35ms measured against a baseline 3-tool turn.
- Cache-hit rate ≥30% on second invocation of same tool within a sub-agent turn (simple benchmark).
- Lint rule blocks domain-service imports from agents module (CI-verified).
- Every successful tool call has a matching kernel audit row (audit-trail join test in plan 07).

---

## 13. Rollout Plan

- **Phase 1** — ship gateway wired to NO production tools (no `.meta({ agent })` declarations yet). Drift tests pass (vacuously). Verifies infrastructure.
- **Phase 2** — add `.meta({ agent })` to 3-5 read-only tools in one module (planner is the natural choice given plan 00's shipped infrastructure). Enable for internal-tenant traffic only.
- **Phase 3** — extend to all read tools across modules; canary at 5% tenant rollout.
- **Phase 4** — enable write tools (gated by plan 08 landing).

**Backout:** any fault in the gateway falls back to "no agent tools callable" — user gets a refused turn rather than an unsafe one. Gateway faults are P1; backout by reverting the PR, not by feature-flag bypass (bypass = no gateway = unsafe).

---

## 14. Dependencies

- Plan 00 (shipped): kernel audit facade, `project_to_schema` sanitizer.
- `KernelQueryFacade.getRolePermissions(tenantId, roleId)` must exist (pre-flight check; stub acceptable if not in kernel yet).

## 15. Integration Points

- `apps/api/src/modules/agents/application/services/tool-gateway.ts` — new. Hosts the pipeline orchestrator.
- `apps/api/src/modules/agents/infrastructure/guards/tripwire.ts` — new. Discriminated-union types.
- `apps/api/src/modules/agents/infrastructure/tool-registry/` — new. Walks tRPC app router at startup, builds registry.
- tRPC routers across all domain modules — `.meta({ agent })` annotations added per tool.
- `packages/trpc-meta-types` (or equivalent) — typed `TrpcMeta.agent` shape exported.
- CI drift-test runner — invoked on every PR via turbo task.
- Kernel module — `KernelAuditFacade.emit()` consumed by step 6.
- Langfuse OTel — child span API consumed.
- Plan 06 — `abortSignal` threaded in.
- Plan 04 — L1 cache interface consumed.

## 16. Activation Gate

MVP. Ships with first production turn.

## 17. Out of Scope

- Router classification (plan 02).
- Phase-2 sanitization projection (plan 03).
- Structured-output parse retry (plan 02).
- Shadow-mode live traffic routing (plan 11).
- Output post-processors as plugin seam (Beta reconsideration; capture interface only).
- Approval-tier bump on drafted writes (plan 08).

## 18. Open Questions

- **Canonicalizer version attribute.** Stamp as trace attr from day one? Recommend yes — trivial cost, forward-compatible. Owner: this plan's implementer.
- **Retry-round span cardinality.** If a ceiling-tripwire returns `retry` and the model retries, the same tool-call gets two span trees. Verify Langfuse UI groups legibly; if not, stamp `retry_index` explicitly. Owner: plan 07 integration.
- **Cache invalidation rule scope** on writes — domain-wide or per-entity? Pinned in implementation doc. Owner: implementation doc owner, resolve before MVP ship.
- **Beta `ProcessorProvider`-style output seam.** Capture interface shape (not implementation) at MVP so retrofit is a one-line add later. Shape: `(result: unknown, context) => result`. Open: naming, registration surface. Owner: Beta-phase author.
