# 16 — Code-Execution Composition Tier (v1.5 Deferred)

**Design §§:** §2.1 (Runtime Layer), §7 (Tool Layer), §16 (Feature Activation Gates — "Code-execution composition tier (v1.5)" row, GA-gated).

**Status:** **Named + invariants locked; implementation deferred to v1.5.** This plan is an architectural-boundary spec, not an implementation spec. Its load-bearing content is §6 (Requirements) — the invariants any future implementation MUST satisfy. All other sections are placeholders with explicit "deferred" markers until the activation gate (§16) fires.

---

## 1. Scope

### In

- Naming the code-execution composition tier as a distinct architectural boundary within the runtime topology.
- Locking the invariants (§6) that any future implementation must preserve, so the decision to ship in v1.5 does not require late-stage architectural rewrites elsewhere (gateway pipeline, prompt store, audit, span taxonomy).
- Naming the activation gate (§16) that transitions this plan from invariants-only to full spec.

### Out (deferred to v1.5 spike)

- Full data model (no tables defined here).
- Runtime control flow, executor lifecycle, sandbox provisioning.
- Interface contract signatures beyond a single illustrative shape.
- Performance budget numbers, testing matrix, rollout mechanics.
- Language choice, sandbox primitive choice (see §18).

---

## 2. Design Context

**Why named now.** Anthropic's "code execution with MCP" pattern lets an agent author a short sandboxed program (JS or Python) that composes multiple tool calls in a single execution, reducing LLM round-trips for composition-heavy flows (stitching results from N tools, filtering, aggregating). Our current topology (§2.1) offers Tier 0 direct, Tier 1 bounded DAG, Tier 2 iterative, Tier 3 async. Code-execution is **not a fifth tier**; it is a **composition mode available inside Tier 1 or Tier 2** sub-agents — an alternative to emitting a DAG of tool calls back to the LLM and re-prompting per step.

**Why deferred.** No production telemetry yet proves composition cost is a real pain point. Shipping a sandboxed executor carries significant security and operational surface (sandbox escape, resource limits, audit extensions). Deferral is **not risk-blind**: the decision gate (§16) is "measurable composition cost tail in production telemetry". If that tail emerges, this plan transitions from invariants-only to a full spec; if it never emerges, the tier stays named-but-unshipped and the invariants remain as guardrails for any ad-hoc attempts to add one.

**Why named before shipping.** The invariants in §6 touch six other plans (gateway pipeline, prompt store, cost ceilings, observability span taxonomy, kernel audit, canDo/RLS posture). Naming them now locks the architectural boundary so a v1.5 spike can be scoped cleanly rather than requiring cross-plan refactors.

---

## 3. Data Model

_Deferred._ No new tables at this plan's status.

When fully specified, code-execution traces need their own span type (§7) — a `CODE_EXECUTION` span with nested child tool-call spans. The executed code content is content-hashed into the §8 prompt store (layer `'code_execution'`) so replay is deterministic. No dedicated table; reuse `agent_prompt_store`.

---

## 4. Interface Contracts

_Deferred._ Illustrative future shape only:

```
CodeExecutor.run({
  tenantId,
  userId,
  code,            // source text; content-hashed into §8 prompt store
  allowedTools,    // intersects sub-agent toolScope; cannot escalate
}): Promise<CodeExecutionResult>
```

**Invariant preview:** `allowedTools` intersects (never replaces) the caller sub-agent's `toolScope` — see R-16.3.

---

## 5. Control Flow

_Deferred._ At spec time, the flow must thread: sub-agent → gateway (authorize code-exec capability) → executor (content-hash code, register span) → tool calls (each through full gateway pipeline) → result synthesis → parent sub-agent.

---

## 6. Requirements (LOCKED INVARIANTS)

Numbered R-16.x. These MUST hold in any future implementation. This section is the load-bearing content of this plan.

| #       | Invariant                                                                                                                                                                                                           | Design §§ |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| R-16.1  | **Sandboxed executor.** No direct network, file-system, or DB access from inside the sandbox. The only outward surface is `allowedTools`, routed to tRPC procedures via the §7 gateway.                             | §2.1, §7  |
| R-16.2  | **Executor runs as the caller.** JWT inheritance from the invoking sub-agent is unchanged; `canDo` + RLS are still enforced on every tool call via the gateway pipeline. Per §7 Tool #2 invariant: no bypass.       | §7        |
| R-16.3  | **`allowedTools` intersects, never replaces, the caller sub-agent's `toolScope`.** Code-execution cannot escalate the tool surface beyond what the sub-agent itself may invoke.                                     | §2.1, §7  |
| R-16.4  | **Tool calls from within executed code traverse the full §7 gateway pipeline.** No fast-path, no batched-authorization shortcut, no "perf optimization" bypass. Every call = one gateway pass = one audit row.      | §7        |
| R-16.5  | **Taint propagation.** Any tool result bearing `tenantAuthoredFreeText` flips the turn's taint flag even when the call was invoked from inside executed code. Code-execution is not a trust-boundary laundromat.    | §7        |
| R-16.6  | **Cost / wallclock ceilings apply to the executor wallclock**, not just the per-tool-call wallclock. A code-exec span that spends 30s in in-sandbox computation counts toward turn budget identically to tool time. | §13       |
| R-16.7  | **Replay determinism.** Executed code is content-hashed into the §8 prompt store (layer `'code_execution'`); replay from trace re-executes deterministically (same code hash + same inputs → same tool sequence).   | §8, §12   |
| R-16.8  | **Kernel audit.** Each tool call inside executed code emits its usual audit row. The code-execution span itself emits an audit row carrying the executed code's content hash.                                       | §7, §12   |
| R-16.9  | **No `eval`, `Function`, dynamic `import`, or network primitives exposed inside the sandbox.** The sandbox's global surface is deliberately minimal and explicitly enumerated — not inherited from the host.        | §2.1      |
| R-16.10 | **Downward DI ban (Tenet #2 security).** Code running in the sandbox cannot import or instantiate any `modules/*/domain/` or `modules/*/infrastructure/` class. Only `allowedTools` are reachable.                  | §2.1, §7  |

---

## 7. Failure Modes & Recovery

_Deferred._ At spec time, failure modes must cover: sandbox escape attempt (fail-closed, audit, alert), executor OOM / CPU-limit trip, tool-call denial mid-execution (surface error to executed code; do not leak kernel internals), non-determinism in replay (log hash mismatch; do not silently retry).

---

## 8. Observability Surface

_Deferred._ One named extension: span taxonomy gains `CODE_EXECUTION` as a parent span type with child `TOOL_CALL` spans. The code-execution span carries the content hash from R-16.7 as a trace attribute. Plan 07 (span taxonomy) owns the extension when this plan is fully specified.

---

## 9. Security Considerations

This is the section with the most content at this plan's status, because the invariants above are almost entirely security-shaped.

**Primary threat model: sandbox escape.** If executed code escapes the sandbox, it inherits the API JWT context — which means full caller-level authority. Every invariant in §6 exists to contain this threat or its second-order consequences.

**Recommended sandbox primitive.** Isolated-V8 (e.g. an `isolated-vm`-class primitive), not Node's built-in `vm` module. Node's `vm` is not a security boundary — documented as such. A V8 isolate provides genuine heap/context separation. Python subprocess is also viable but heavier; language choice is §18.

**Network-layer containment.** The executor process runs in an egress-less subnet; only the gateway is reachable. Even if the sandbox primitive is compromised, there is no route to arbitrary internet endpoints. This is a second layer below R-16.1.

**Resource limits.** Per-invocation CPU and memory caps enforced by the host (cgroups / container limits), orthogonal to the in-sandbox primitive. Wallclock cap from R-16.6.

**No persistent FS.** The sandbox has no writable persistent state; every invocation starts from a fresh heap. No cross-invocation residue.

**Minimal global surface.** R-16.9 is enforced positively: the sandbox's global object is constructed by enumerating allowed names, not by hiding the forbidden ones. Hiding is fragile; enumeration is auditable.

**Downward DI ban.** R-16.10 restates the §2.1 Tenet #2 boundary for the code-exec case specifically: domain and infrastructure classes are not reachable from the sandbox even via creative module-resolution tricks.

---

## 10. Performance Budget

_Deferred._ One locked constraint: code-execution's value proposition is reducing LLM round-trips, so the latency gain (saved LLM calls × per-call latency) must exceed the sandbox-provisioning overhead + in-sandbox wallclock. If this inequality doesn't hold on measured traffic, the tier is a net loss and should not ship. This is itself an activation-gate input (§16).

---

## 11. Testing Strategy

_Deferred._ One locked constraint from §12: every invariant R-16.1 through R-16.10 has a dedicated security test at v1.5 spike. Tests are load-bearing for acceptance.

---

## 12. Acceptance Criteria

_Deferred, with one locked criterion:_ **R-16.1 through R-16.10 each have a dedicated security test, each failing before the implementation lands and each passing after.** Additional criteria (performance, replay determinism, rollout canary metrics) are defined at v1.5 spike time.

---

## 13. Rollout Plan

_Deferred._ v1.5 spike opens when the §16 activation gate fires: composition-heavy flows in production telemetry accumulate a measurable cost tail (quantified threshold set at spike time — e.g. p95 composition-turn latency, LLM-round-trip count per composition turn, or total LLM spend attributable to composition turns). Until the gate fires, this plan remains architectural-boundary only; no implementation work is in-flight.

---

## 14. Dependencies

- **Plan 01** (gateway processor pipeline + tool registry) — R-16.2, R-16.4, R-16.5 depend on the gateway pipeline being the single enforcement point.
- **Plan 07** (observability + span taxonomy) — `CODE_EXECUTION` span type is a taxonomy extension owned by plan 07 at v1.5.
- **Plan 05** (cost + ceilings) — R-16.6 extends the wallclock accounting model.
- **Plan 00** (prompt store) — R-16.7 reuses `agent_prompt_store` under a new layer label.

No new plan dependencies are introduced; all integration happens through existing plans.

---

## 15. Integration Points

- `modules/agents/infrastructure/code-executor/` — future home of the executor, sandbox primitive, and tool-routing glue. Not present at this plan's status.
- `modules/agents/infrastructure/schema/` — new prompt-store layer `'code_execution'` (no new table).
- Gateway (plan 01) — no change; the gateway is invoked normally per R-16.4.
- Span emitter (plan 07) — one new parent span type.

---

## 16. Activation Gate

**GA-gated** per the §16 activation table row: _"Composition-heavy flows accumulate measurable cost tail in production telemetry."_

Quantified trigger is set at v1.5 spike time, not now — quantifying it now would be a guess. Candidate signals to quantify against: per-turn LLM round-trip count for Tier 1 / Tier 2 sub-agents, p95 composition-turn latency, composition-turn share of total LLM spend. The spike begins with a telemetry review; if the tail is not present, the plan stays in invariants-only state.

Until the gate fires, this plan exists to (a) prevent ad-hoc addition of a composition executor outside these invariants and (b) ensure the gateway / span taxonomy / audit integrations remain compatible with the eventual shape.

---

## 17. Out of Scope

- **User-authored code execution.** This plan is exclusively about agent-authored code inside a sub-agent turn. Tenant-user-authored scripting (e.g. a future "formula field" or customer-authored automation) is a different threat model and a separate plan.
- **Long-running sandbox sessions across turns.** Code-exec is per-invocation; no state survives the turn. Cross-turn sandbox sessions would require additional invariants (state provenance, replay semantics for resumed sessions) and are out of scope.
- **Sandbox as general-purpose RPC substrate.** The sandbox exists to compose `allowedTools` calls, not to host arbitrary business logic that should live in a domain module.

---

## 18. Open Questions

- **Language choice.** JS (isolated-V8) vs Python (subprocess). JS is lighter and aligns with the API runtime; Python is more familiar to analytics-heavy flows. Decision deferred to spike; depends on which sub-agents most plausibly benefit.
- **Per-tenant vs per-turn executor isolation.** Per-turn is safer (fresh isolate every invocation); per-tenant could amortize warm-start cost. Performance budget (§10) informs the choice.
- **Cost attribution.** How is executed-code time attributed in billing / cost telemetry — code wallclock only, tool wallclock only, or both summed? R-16.6 locks that ceilings apply to executor wallclock, but attribution for reporting is a separate decision.
- **Quantified activation threshold.** The §16 trigger is qualitative now ("measurable cost tail"). Spike-time telemetry review converts it to a numeric gate.
