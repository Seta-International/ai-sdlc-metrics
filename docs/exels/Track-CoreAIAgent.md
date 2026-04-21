# Sheet: Track-CoreAIAgent

> Horizontal track. Foundational AI plumbing: LLM client, prompt store, confidence scoring, HITL routing engine, tool/MCP registry, ToolGateway pipeline, sub-agent runner, SSE contract, Langfuse telemetry. Phase 2 adds prompt-injection defence, permission enforcement at the AI boundary, free-form query router, cost metering, adversarial eval CI. **Planner-specific sub-agents, extraction prompts, conversational executor, and webhook handlers live on the Planner track (W-P10..W-P18, W-P25..W-P27).**

## Block 1 — Purpose

Deliver the foundational AI slice that every Future module will reuse. Phase 1 (W1–W4) locks the primitives; Phase 2 (W5–W8) hardens security and unlocks free-form queries beyond the bounded Phase 1 tool registry.

## Block 2 — Scope

### 2.1 In scope

`03-Scope` Block 1 WBS rows `W-A01` .. `W-A14`, split into two phases.

**Phase 1 — W1–W4 (foundational):**

- LLM client (Vercel AI SDK + OpenAI · model selector · retry · cost accounting).
- Prompt store (versioned templates · env override · fixtures).
- Confidence scoring framework (H/M/L derivation rules · drift harness).
- HITL routing engine (routing matrix · fallback · review window · auto-expiry · backlog alert).
- Tool + MCP registry (bounded, introspection via tRPC meta).
- ToolGateway 10-step pipeline (auth · permission · taint · rate · budget · args-validate · execute · sanitize · log · trace).
- Sub-agent runner pattern (tool-calling loop · max-steps ceiling · SSE events).
- Langfuse telemetry + OTel wiring.
- SSE contract (stream event types · backpressure · cancel).

**Phase 2 — W5–W8 (fine-tuning · security · free-form queries):**

- Prompt-injection defence (tenant-authored-text redaction · delimiter strategy · regression suite).
- Permission enforcement at the AI boundary (result-fetch check · structured-query audit · composition-derived disclosure guard).
- Free-form query router (multi-sub-agent fan-out · synthesizer · disambiguation · query-preview contract).
- Cost metering + budget + circuit breaker + admin dashboard.
- Prompt tuning + eval CI.

### 2.2 Out of scope

- Planner-specific sub-agent for transcript extraction — lives on Planner track as `W-P12`, consumes this track's runner.
- Planner-specific extraction prompts — lives on Planner track; tuned by AI Eng alongside Planner.
- Transcript webhook handler — Core BE track (`W-B14` MS Graph scaffolding) + Planner track (`W-P11`).
- Conversational AI UI — Planner track (`W-P25`) and Core FE (SSE client).
- Conversational query executor for Planner domain — Planner track (`W-P26`), using this track's tool registry + ToolGateway.
- Write-capable agents (Phase 2 drafts + approvals are outside this MVP). Read-only in pilot.
- Module-specific sub-agents for People, Time, Projects, Finance, etc. (deferred to subsequent module tracks).

### 2.3 Dependencies

- OpenAI API key + budget guardrails (D-04).
- Langfuse deployment target confirmed (D-05).
- Core BE: audit log (for tool-call provenance) · pg-boss (for async agent jobs in Phase 2) · permissions engine (for `canDo` calls inside ToolGateway).
- Core FE: SSE client primitive (for streaming sub-agent output).

## Block 3 — Deliverables & Acceptance

### Phase 1 deliverables (must land by M02 / W4)

| #     | Deliverable                       | Acceptance                                                                                             | Evidence                     | Milestone |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------- | --------- |
| D-A01 | LLM client + model selector       | Prompt round-trip; cost per call captured in Langfuse; provider swap is one-file change                | Langfuse trace + unit test   | M01       |
| D-A02 | Prompt store                      | Template change is a migration; every LLM call references a prompt version in its trace                | Migration test + trace proof | M01       |
| D-A03 | Confidence scoring framework      | Confidence band on every proposal; baseline eval vs BA ground-truth passes                             | Eval suite run               | M02       |
| D-A04 | HITL routing engine               | Routing tested against full role matrix; expiry + backlog hooks call deterministic paths               | Integration tests            | M02       |
| D-A05 | Tool + MCP registry + ToolGateway | Unauthorised tool call denied with audit; taint flows end-to-end; sanitisation drops disallowed fields | Integration tests            | M02       |
| D-A06 | Sub-agent runner pattern          | Base runner executes a canned agent; loop terminates at max-steps; SSE contract stable                 | Integration + runner demo    | M02       |
| D-A07 | Langfuse telemetry                | Every LLM + tool call appears; trace navigable end-to-end                                              | Langfuse dashboard proof     | M01       |
| D-A08 | SSE contract                      | Stream events parse round-trip; cancel aborts upstream; backpressure handled                           | Contract tests               | M02       |

### Phase 2 deliverables (must land by M05 / W8)

| #     | Deliverable                              | Acceptance                                                                                                 | Evidence                       | Milestone |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- |
| D-A09 | Prompt-injection defence                 | Adversarial prompts trigger refusal; regression suite gates CI                                             | Red-team suite + CI status     | M05       |
| D-A10 | Permission enforcement at AI boundary    | Penetration test returns zero permission-leak incidents (tied to R-07 / RP-04)                             | PM + BA test report            | M05       |
| D-A11 | Free-form query router                   | Baseline 30-query eval ≥ 80% first-attempt correctness; disambiguation surfaces when router confidence low | Eval suite green               | M05       |
| D-A12 | Cost metering + budget + circuit breaker | Per-tenant daily budget blocks excess calls; breaker short-circuits on breach; dashboard live              | Breaker test + dashboard proof | M05       |
| D-A13 | Prompt tuning + eval CI                  | Eval runs on every prompt change; regression blocks merge                                                  | CI gate status                 | M05       |

## Block 4 — WBS (task-level)

Full WBS on `03-Scope` Block 1 rows `W-A01` .. `W-A14`. Top 5 by effort:

| Rank | ID    | Feature                                         | Effort High (MD) | Confidence | Owner  |
| ---- | ----- | ----------------------------------------------- | ---------------- | ---------- | ------ |
| 1    | W-A12 | Free-form query router (Phase 2)                | 9                | L          | AI Eng |
| 2    | W-A06 | ToolGateway pipeline (Phase 1)                  | 8                | M          | AI Eng |
| 3    | W-A04 | HITL routing engine (Phase 1)                   | 7                | M          | AI Eng |
| 4    | W-A11 | Permission enforcement at AI boundary (Phase 2) | 7                | L          | AI Eng |
| 5    | W-A03 | Confidence scoring framework (Phase 1)          | 6                | L          | AI Eng |

Track totals (indicative): ~48–80 MD across 14 rows.

## Block 5 — Sprint Plan (Core AI)

Each phase has its own exit criterion.

| Sprint     | Phase       | Core AI goal                                                                                           | Exit criterion                                                                                                                         |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| S1 (W1–W2) | **Phase 1** | Install AI stack; ship LLM client + prompt store + tool registry + Langfuse + SSE contract skeleton    | Prompt round-trips; Langfuse trace present; tool registry enumerates; runner scaffolding compiles                                      |
| S2 (W3–W4) | **Phase 1** | Complete ToolGateway pipeline + HITL routing engine + confidence scoring + sub-agent runner end-to-end | **Phase 1 exit:** `D-A01`..`D-A08` green; Planner team can consume runner + registry to build the transcript sub-agent (Planner W-P12) |
| S3 (W5–W6) | **Phase 2** | Prompt-injection defence + permission enforcement at AI boundary + router skeleton                     | Red-team regression suite passes; permission-enforcement unit tests pass; router wiring in place                                       |
| S4 (W7–W8) | **Phase 2** | Free-form router + synthesizer + cost metering + eval CI + pre-pilot adversarial test                  | **Phase 2 exit:** `D-A09`..`D-A13` green; penetration test with PM + BA returns zero permission-leak incidents (M05)                   |

## Block 6 — Track-specific Risks

| ID    | Risk                                                                                    | P   | I   | Mitigation                                                                                                                                                        | Owner       | Status |
| ----- | --------------------------------------------------------------------------------------- | --- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ |
| RA-01 | Confidence scoring rules under-specified; calibration drifts across prompt versions     | M   | M   | Drift harness runs on every prompt change; baseline eval held as regression gate; AI Eng documents derivation rules in prompt-store versioning                    | AI Eng      | Open   |
| RA-02 | Phase 2 router fan-out unbounded → OpenAI cost runaway (also R-11 on `08-Risks-Issues`) | M   | M   | Hard cap on concurrent sub-agent spawn; circuit breaker on per-tenant daily budget (`W-A13`); Admin budget dashboard                                              | AI Eng      | Open   |
| RA-03 | Permission-enforcement at AI boundary misses a composition-derived disclosure path      | M   | H   | Composition-sensitivity test in S3; penetration test in S4; tool-authoring checklist for every tool added                                                         | AI Eng + QA | Open   |
| RA-04 | Single AI Engineer as bus-factor point of failure (also R-06)                           | M   | M   | Pairing with FS#2 on Phase 1 primitives; design decisions captured on `02-Contract` Block 1 + in prompt-store DB versioning; critical logic reviewed by Tech Lead | AI Eng + PM | Open   |
| RA-05 | Langfuse self-hosted ECS deployment slip (if that path is chosen)                       | L   | M   | Managed-cloud Langfuse as fallback; decision (D-05) closed by end W1                                                                                              | CTO         | Open   |
| RA-06 | Phase 2 eval baseline not representative of pilot usage                                 | M   | M   | Baseline built from pilot-shaped queries with BA input in S4; update after pilot W2                                                                               | AI Eng + BA | Open   |

## Block 7 — Definition of Done (track-level)

- All `D-A01` .. `D-A13` deliverables accepted.
- Coverage ≥ 70% on Core AI packages.
- Penetration-style test on AI boundary returns zero permission-leak incidents.
- Red-team adversarial prompt suite green.
- 30-query baseline eval ≥ 80% first-attempt correctness.
- Budget circuit breaker demonstrably short-circuits at per-tenant cap.
- Langfuse traces navigable end-to-end for a representative query (router → sub-agent → synthesiser → tool calls → result).
- Phase 1 primitives reused by Planner transcript sub-agent (Planner W-P12) without core changes.

## Block 8 — Open Questions

| Question                                                                              | Owner         | Needed by |
| ------------------------------------------------------------------------------------- | ------------- | --------- |
| OpenAI API key provisioning path (org-level vs project-level) (D-04)                  | PM + IT       | W1        |
| Langfuse: self-hosted ECS vs managed cloud (D-05)                                     | CTO           | W1        |
| Prompt-store schema — DB column type for long templates (text vs jsonb)               | AI Eng + FS#2 | W1        |
| Confidence-scoring initial thresholds — fixed values vs tuned during pilot?           | AI Eng + BA   | W3        |
| Phase 2 router: start with "pre-built queries only" fallback if router ≤ 80% in eval? | AI Eng + PM   | W6        |
| Per-tenant daily budget default value for `W-A13`                                     | Admin + PM    | W5        |
| Cost-meter granularity (per-call vs per-session)                                      | AI Eng        | W4        |
| Write path (drafts + approvals) — confirm explicitly **out of scope** for this MVP?   | PM + Sponsor  | W1        |
