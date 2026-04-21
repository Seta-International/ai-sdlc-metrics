# Mastra Spike — Findings Index

**Purpose:** Key-by-key investigation of `/Users/canh/Projects/Seta/mastra` (production AI agent framework) to inform improvements to `docs/architecture/agent-runtime.md`.

**Workflow:** Investigate → write finding under `docs/spike/mastra/<key>.md` → review → apply to `agent-runtime.md` → record applied status here.

**Status (2026-04-21):** All 13 findings investigated. Design doc revised to production-ready specification. Next: implementation plans under `docs/agents/plans/2026-04-21-runtime-v1/`.

## Status

| Key                                     | File                                                         | Status  | Applied to agent-runtime.md                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-agent / Orchestrator              | [01-orchestrator.md](./01-orchestrator.md)                   | Applied | §2.1 (two topologies), §3.1 new (iterative supervisor), §16 (iterative activation gate)                                                                                            |
| Multi-user / Identity / Tracking        | [02-identity-tracking.md](./02-identity-tracking.md)         | Applied | §6 (ownership-is-RLS), §15.4 (identity-key write-discipline), §16 (embedding-scope note)                                                                                           |
| Memory (L1/L2/L3/L4 + working-memory)   | [03-memory.md](./03-memory.md)                               | Applied | §5 (L3.5 scratchpad named as Beta activation-gated, save-queue semantics, router-read-surface γ/α-only, L1-cache-is-our-advantage note)                                            |
| Routing (router prompt, decision shape) | [04-routing.md](./04-routing.md)                             | Applied | §3 (registry-generated router prompt, reject `additionalInstructions`), §4 (structured-output parse row)                                                                           |
| RAG / semantic recall                   | [05-rag-semantic-recall.md](./05-rag-semantic-recall.md)     | Applied | §16 (8-question RAG activation tree)                                                                                                                                               |
| Harness / eval / replay                 | [06-harness-eval-replay.md](./06-harness-eval-replay.md)     | Applied | §8 (canonicalization rules, replay-level clarification, fuzzy-fallback anti-pattern named), §14 (SetaScorer.kind discriminator, ≤20-row golden-trace cap)                          |
| Processors (input/output/tool pipeline) | [07-processors.md](./07-processors.md)                       | Applied | §7 (retry disposition, span naming `gateway:<step>`, per-step attribute recording, output-post-processor Beta reconsideration)                                                     |
| Observability / tracing                 | [08-observability-tracing.md](./08-observability-tracing.md) | Applied | §12 (two-dim span taxonomy, typed SamplingConfig with trace-atomicity, TTFT + cache-token attrs, `request_context_keys` auto-stamp, leaf-only usage accumulation)                  |
| Cost / usage tracking                   | [09-cost-usage.md](./09-cost-usage.md)                       | Applied | §13 (cache-read vs cache-write split, `pricing_id`+`priced_at`, adapter validation invariant, `DEFAULT_BLOCKED_LABELS`, `tier_shift` vs `provider_fallback`)                       |
| Streaming / events                      | [10-streaming-events.md](./10-streaming-events.md)           | Applied | §15 (phase column, topology on `turn.started`, iteration event triplet, `metadata` bag on every event, runtime-asserted ordering, extended reason enum, refusal payload extension) |
| Cancellation / abort                    | [11-cancellation-abort.md](./11-cancellation-abort.md)       | Applied | §15.2 (`cancellation_reason` enum, `AbortSignal.any` composition, `usage` in abort payload, active-cancel-via-listener, pre-commit pattern broadened)                              |
| Agent builder / declarative config      | [12-agent-builder-config.md](./12-agent-builder-config.md)   | Applied | §3 (`description`+`whenToUse` split, `memoryScope`, `promptTemplate`, `source: 'code'\|'stored'`, per-sub-agent `model`)                                                           |
| Workflows / execution engine            | [13-workflows-execution.md](./13-workflows-execution.md)     | Applied | No §-edits; rejection enriched in §17 prior-art (confirms Tenet #3 survives strongest counter-example)                                                                             |

## Design doc revision summary (applied 2026-04-21)

- **Status line** reframed from "v1.1 design" to "production-ready specification" with activation-gate phases (MVP / Beta / GA), not deferrals.
- **§2.1** — runtime supports two topologies (bounded + iterative).
- **§3** — sub-agent factory field additions + registry-generated router prompt + `additionalInstructions` rejection.
- **§3.1** (new) — Iterative Supervisor Topology with 7 invariants.
- **§4** — 8 error classes (added structured-output parse; retry disposition on tool-scope ceiling).
- **§5** — L3.5 scratchpad named as Beta-gated, save-queue, router-read-surface invariant.
- **§6** — ownership-is-RLS-not-app-check.
- **§7** — retry disposition, span naming convention, per-step attribute recording.
- **§8** — canonicalization rules, assembly-level replay, fuzzy-fallback anti-pattern named, GA capture extensions.
- **§12** — two-dim span taxonomy, typed SamplingConfig, trace-atomicity, TTFT + cache tokens + reasoning, `request_context_keys` auto-stamp, leaf-only usage.
- **§13** — cache-read vs cache-write split, pricing_id versioning, adapter validation, cardinality guardrail, tier_shift vs provider_fallback.
- **§14** — SetaScorer `kind` discriminator + meta-eval gate, ≤20-row golden-trace cap.
- **§15** — SSE schema extensions (phase column, topology, iteration triplet, metadata bag, runtime-asserted ordering, extended reasons, refusal payload).
- **§15.2** — `AbortSignal.any` composition, typed reason enum, usage-in-payload, active-cancel-via-listener.
- **§15.4** — identity-key write-discipline invariant.
- **§16** — reframed as Feature Activation Gates (no deferrals). Shadow-mode, canary, async-scheduled promoted to MVP.
- **§17** — prior-art review enriched: 27-row borrowed-patterns table mapped to §-sections; 16 explicit rejections.
- **§18** (new) — Production Readiness Criteria with observable thresholds across reliability, security, cost stability, observability, rollout safety, and incident playbook coverage. GA gate defined.

## Convention per finding file

Each `NN-<key>.md` uses this structure:

1. **How mastra does it** — grounded reads with file paths + line numbers. No summaries without citations.
2. **What this tells us** — interpretation relative to our tenets and sections.
3. **Proposed edits** — concrete insertions / rewrites, keyed to §-numbers in `agent-runtime.md`.
4. **What we are not borrowing** — explicit rejections with reason. Prevents future maintainers from re-litigating.
5. **Open questions** — items needing deeper investigation.
