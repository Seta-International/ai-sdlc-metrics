# Agent Runtime — Production-Ready Implementation Plans

**Source design:** [`docs/architecture/agent-runtime.md`](../../architecture/agent-runtime.md) — the production-ready specification.

**Purpose:** Plans here are the contract between the design spec and the implementation. An AI coding agent should be able to read one plan end-to-end and have **full context** for implementation — data model intent, interface shapes, control flow, failure handling, observability surface, security considerations, performance budget, testing strategy, rollout. Plans do **not** contain code (no function bodies, no SQL, no literal class definitions); they contain the design that code must satisfy.

**Audience:** Engineers and AI coding agents doing implementation. Stakeholders verifying coverage. Reviewers validating security / cost / reliability claims against §18 production-readiness criteria.

---

## Plan layout (per file)

Every plan file follows this structure. Sections marked _optional_ are present where applicable; other sections are required.

| #   | Section                      | Intent                                                                    |
| --- | ---------------------------- | ------------------------------------------------------------------------- |
| 1   | **Scope**                    | What this plan covers; what it explicitly does not                        |
| 2   | **Design Context**           | Why this shape; what it replaces; why _not_ alternatives                  |
| 3   | **Data Model**               | Tables, columns, indexes, RLS, constraints — intent, not SQL              |
| 4   | **Interface Contracts**      | Type shapes at module boundaries — contracts, not implementation          |
| 5   | **Control Flow**             | Key sequences as numbered steps; happy path + primary error paths         |
| 6   | **Requirements**             | Numbered, mapped to §-sections of the design doc                          |
| 7   | **Failure Modes & Recovery** | What breaks, the observable symptom, the recovery path                    |
| 8   | **Observability Surface**    | Spans, attributes, metrics, dashboards specific to this plan              |
| 9   | **Security Considerations**  | Attack surface introduced + defenses required                             |
| 10  | **Performance Budget**       | Latency / throughput / memory / cost per op                               |
| 11  | **Testing Strategy**         | Layer-by-layer (unit / integration / e2e / property), fixtures, seed data |
| 12  | **Acceptance Criteria**      | Observable outcomes (tests pass, traces produced, metrics emit)           |
| 13  | **Rollout Plan**             | How to ship: flag, gradual, cutover; backout path                         |
| 14  | **Dependencies**             | Which plans must land first                                               |
| 15  | **Integration Points**       | Modules / packages / external services + the interface touched            |
| 16  | **Activation Gate**          | When this turns on in production (per §16)                                |
| 17  | **Out of Scope**             | Explicit non-goals to prevent scope creep                                 |
| 18  | **Open Questions**           | Decisions still needed, named owners where known                          |

**Sections 9 (Security) and 10 (Performance) may be short** for plans where the concern is already fully named in the design spec; they must be present regardless — "no new attack surface" is itself a valid security claim.

---

## Plan set

**Revision 2026-04-22:** reframed to production-ready-comprehensive target. MVP integrates 3 modules (planner / people / projects — see design §2.3) but core is designed to serve all 13 modules without runtime changes (Extensibility Invariants EI-1..EI-10, design §2.2). Items previously deferred to Beta/GA that are load-bearing at the 200-flow / 12-module target have been promoted to MVP: iterative topology (plan 12), L3.5 agent scratchpad + semantic recall (plan 04), tool retrieval (plan 02.5, new), sub-agent retrieval (plan 02), semantic result cache (plan 14, new), governance lints (plan 15, new), 12-module scale probe (plan 13). Code-execution composition tier (plan 16, new) is named with invariants locked but implementation deferred to v1.5.

| #    | Plan                                                                                                                | Phase                | Design §§                    | Status            |
| ---- | ------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------- | ----------------- |
| 00   | [Foundation reference](./00-foundation-reference.md)                                                                | MVP                  | §8 stores + sanitizer        | Shipped (PR #73)  |
| 01   | [Gateway processor pipeline + tool registry](./01-gateway-pipeline.md)                                              | MVP                  | §7, §4                       | Shipped           |
| 02   | [Sub-agent declaration + router prompt + intent classifier + sub-agent retrieval](./02-sub-agents-router-prompt.md) | MVP                  | §3, §8, §2.2 EI-3/EI-4       | Shipped           |
| 02.5 | [Tool retrieval inside sub-agents](./02.5-tool-retrieval.md)                                                        | MVP                  | §7, §2.2 EI-5                | Shipped           |
| 03   | [Bounded DAG (Tier 0 direct + Tier 1 Phase-2 fan-out) + synthesizer](./03-two-phase-execution-synthesizer.md)       | MVP                  | §3, §9                       | Shipped           |
| 04   | [Memory L1-L4 + L3.5 scratchpad + semantic recall + conversation state](./04-memory-conversation.md)                | MVP                  | §5, §6, §2.2 EI-9            | In Progress       |
| 05   | [Cost + ceilings + tier degradation + graceful-degradation ladder + rate limits](./05-cost-ceilings.md)             | MVP                  | §13                          | Shipped           |
| 06   | [Streaming + SSE contract + cancellation](./06-streaming-cancellation.md)                                           | MVP                  | §15                          | In Progress       |
| 07   | [Observability + sampling + flow_id + intent_slug + composition-attack monitor](./07-observability.md)              | MVP                  | §12, §2.2 EI-7               | Shipped           |
| 08   | [Drafts + approval + delegation + per-flow approval policy](./08-drafts-approval.md)                                | MVP                  | §10, §2.2 EI-8               | In Progress       |
| 09   | [Async agents (MVP: read-only + draft-to-inbox)](./09-async-agents.md)                                              | MVP                  | §11                          | In Progress       |
| 10   | [Harness + replay + drift scorer + LLM-judge framework + quality canary](./10-harness-replay-canary.md)             | MVP                  | §8, §12, §14                 | In Progress       |
| 11   | [Shadow-mode traffic + canary rollout mechanics](./11-shadow-mode-rollout.md)                                       | MVP                  | §14                          | Pending           |
| 12   | [Iterative supervisor topology (Tier 2)](./12-iterative-topology.md)                                                | MVP                  | §3.1                         | In Progress       |
| 13   | [Production readiness validation + 12-module scale probe + EI audit](./13-production-readiness-validation.md)       | MVP (CI) / GA (gate) | §18, §2.2                    | In Progress       |
| 14   | [Semantic result cache](./14-semantic-result-cache.md)                                                              | MVP                  | §7                           | Pending           |
| 15   | [Governance — authoring lints + PR review protocol](./15-governance-authoring-lints.md)                             | MVP                  | §2.2 EI-10, §7, §17          | In Progress       |
| 16   | [Code-execution composition tier](./16-code-execution-composition.md)                                               | GA                   | §2.1, §7 (invariants locked) | Named; v1.5 spike |

**Beta expansions (no new plans — each is a per-feature activation within an existing plan):**

- **Modules 4-13 integration.** Module-local PRs under the EI-1..EI-10 contract (§2.2). No runtime change required.
- **Async delegation-signed writes** (plan 09, Beta gate: 4 weeks incident-free draft-to-inbox + approval-rate ≥95%).
- **LLM-judge scorer activation** (plan 10, Beta gate: `SetaGoldenCorpus` ≥100 rows + meta-eval ≥95%).
- **L4 pre-injection** (plan 04, performance opt-in when lazy-fetch p95 exceeds budget).
- **Multi-region / cross-provider failover** (plan 05, Beta gate: 3+ live tenants OR single-region outage).
- **Per-iteration synthesizer (live narration)** (plan 12 addition, Beta gate: UX demand signal from iterative turns).

**GA-gated (beyond §18 thresholds):**

- **Full-fleet prompt capture** (beyond stratified sampling) — plan 07.
- **Agent-proposed L3 writes** — plan 04, thumbs-down corpus + eval coverage required.
- **Self-hosted model tier** — plan 05, cost or sovereignty constraint.
- **Code-execution composition tier** — plan 16, measurable composition cost tail in production telemetry.

---

## Conventions

### Hard rules inherited from `CLAUDE.md`

- **TDD**: every requirement is verifiable. Acceptance criteria = tests + observable traces + metrics.
- **No backward compatibility**: full refactor where touching existing code; no shims, legacy aliases, or dual-shape handling.
- **No `Promise.all` for DB queries** inside handlers (request-bound single connection).
- **No `.js` extensions on relative imports** (NodeNext + CJS in `apps/api`).
- **No `__tests__/` directories** — co-located `.spec.ts`.
- **DDD module boundaries**: cross-module reads via `QueryFacade`, writes via named audit/write facades.
- **Every table carries `tenant_id`** — no exceptions; RLS `relforcerowsecurity=true`. (Plan 02.5's tool-embedding store is a documented exception: descriptor-only content, tenant-neutral by design.)

### Spec-level, not code-level

- Plans describe **what must be true**, not **how to implement it**.
- Interface shapes (TS-ish types) and table intents are in-scope.
- Function bodies, SQL DDL syntax, literal file names, internal variable names are out-of-scope.
- If the plan reaches a level where an AI agent would ask "how do I test this?", the plan is too shallow.

### Mapping to §-sections

Every requirement and acceptance criterion cites the `agent-runtime.md` §-section it derives from. If a plan introduces a requirement not in the design doc, the design doc needs updating first.

### 12-module extensibility invariants (EI-1..EI-10)

Design §2.2 defines the 12-module contract: adding modules 4-13 post-MVP must be a PR inside the target module, never a change to the agent runtime. Each extensibility invariant is tested in plan 13's scale probe + EI audit suite on every CI run.

### Cross-plan dependencies

Dependencies are hard — out-of-order work produces broken integration. MVP ordering:

1. **Foundation** (00 shipped).
2. **Core runtime** in parallel: 01 (gateway) — 02 + 02.5 (sub-agents + retrieval) — 03 (topology) — 04 (memory).
3. **Operations** layered on core: 05 (cost), 06 (streaming), 07 (observability + flow_id), 08 (drafts), 09 (async), 14 (semantic cache), 15 (governance).
4. **Verification** alongside operations: 10 (harness + drift scorer), 11 (shadow-mode), 12 (iterative), 13 (scale probe + EI audit — runs in CI from day 1, GA-gates §18).
5. **Deferred v1.5**: 16 (code-execution) — invariants locked, implementation deferred to in-production trigger.
