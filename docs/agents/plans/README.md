# Agent Runtime — Production-Ready Implementation Plans

**Source design:** [`docs/architecture/agent-runtime.md`](../../architecture/agent-runtime.md) — the production-ready specification.

**Companion:** [`docs/architecture/agent-runtime-implementation.md`](../../architecture/agent-runtime-implementation.md) — implementation-level class/file conventions.

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

| #   | Plan                                                                                 | Phase   | Design §§             | Status           |
| --- | ------------------------------------------------------------------------------------ | ------- | --------------------- | ---------------- |
| 00  | [Foundation reference](./00-foundation-reference.md)                                 | MVP     | §8 stores + sanitizer | Shipped (PR #73) |
| 01  | [Gateway processor pipeline + tool registry](./01-gateway-pipeline.md)               | MVP     | §7, §4                | Pending          |
| 02  | [Sub-agent declaration + router prompt generation](./02-sub-agents-router-prompt.md) | MVP     | §3, §8                | Pending          |
| 03  | [Two-phase bounded execution + synthesizer](./03-two-phase-execution-synthesizer.md) | MVP     | §3, §9                | Pending          |
| 04  | [Memory L1-L4 + conversation state](./04-memory-conversation.md)                     | MVP     | §5, §6                | Pending          |
| 05  | [Cost + ceilings + tier degradation + rate limits](./05-cost-ceilings.md)            | MVP     | §13                   | Pending          |
| 06  | [Streaming + SSE contract + cancellation](./06-streaming-cancellation.md)            | MVP     | §15                   | Pending          |
| 07  | [Observability + sampling + `trace_id` correlation](./07-observability.md)           | MVP     | §12                   | Pending          |
| 08  | [Drafts + approval + delegation](./08-drafts-approval.md)                            | MVP     | §10                   | Pending          |
| 09  | [Async agents + scheduling (read-only at MVP)](./09-async-agents.md)                 | MVP     | §11                   | Pending          |
| 10  | [Harness + replay + golden-trace CI + quality canary](./10-harness-replay-canary.md) | MVP     | §8, §12, §14          | Pending          |
| 11  | [Shadow-mode traffic + canary rollout mechanics](./11-shadow-mode-rollout.md)        | MVP     | §14                   | Pending          |
| 12  | [Iterative supervisor topology](./12-iterative-topology.md)                          | Beta    | §3.1                  | Activation-gated |
| 13  | [Production readiness validation harness](./13-production-readiness-validation.md)   | GA gate | §18                   | Activation-gated |

Activation-gated plans not yet written (shape depends on MVP operational data): L3.5 agent scratchpad, embeddings / semantic recall, LLM-judge regression scorers, async autonomous writes, agent-proposed L3 writes, self-hosted model tier, sub-agent authoring governance.

---

## Conventions

### Hard rules inherited from `CLAUDE.md`

- **TDD**: every requirement is verifiable. Acceptance criteria = tests + observable traces + metrics.
- **No backward compatibility**: full refactor where touching existing code; no shims, legacy aliases, or dual-shape handling.
- **No `Promise.all` for DB queries** inside handlers (request-bound single connection).
- **No `.js` extensions on relative imports** (NodeNext + CJS in `apps/api`).
- **No `__tests__/` directories** — co-located `.spec.ts`.
- **DDD module boundaries**: cross-module reads via `QueryFacade`, writes via named audit/write facades.
- **Every table carries `tenant_id`** — no exceptions; RLS `relforcerowsecurity=true`.

### Spec-level, not code-level

- Plans describe **what must be true**, not **how to implement it**.
- Interface shapes (TS-ish types) and table intents are in-scope.
- Function bodies, SQL DDL syntax, literal file names, internal variable names are out-of-scope.
- If the plan reaches a level where an AI agent would ask "how do I test this?", the plan is too shallow.

### Mapping to §-sections

Every requirement and acceptance criterion cites the `agent-runtime.md` §-section it derives from. If a plan introduces a requirement not in the design doc, the design doc needs updating first.

### Cross-plan dependencies

Dependencies are hard — out-of-order work produces broken integration. Plans 01-11 ship in MVP order; 12 opens at Beta activation; 13 runs continuously from Beta onward, hard-gating GA.
