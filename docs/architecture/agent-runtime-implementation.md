# Agent Runtime — Implementation Design Addendum

**Status:** Implementation pass for [agent-runtime.md](./agent-runtime.md) v1 spec.
**Scope:** Closes §17 open seams where possible; locks stack, module layout, sub-agent shape, prompt store, and phased build sequence. Does not revisit the v1 spec — architectural `why` lives there; this document is the `how`.
**Audience:** Engineers implementing the agent runtime. Read after `agent-runtime.md`.

---

## 1. Stack (locked)

| Layer                                                  | Pick                                                                                                       | Notes                                                                                                                                                                |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent loop, tools, streaming, abort                    | **AI SDK v7** (`ToolLoopAgent`, `tool`, `streamText`, `prepareStep`, `stopWhen`, `experimental_telemetry`) | Orchestration uses v7 workflow _patterns_ (plain TS composition), no `Workflow` class. Two-phase invariant enforced by code shape.                                   |
| Schema validation                                      | **zod**                                                                                                    | Single validator end-to-end: tool inputs, sub-agent input/output schemas, SSE event payloads.                                                                        |
| Model providers                                        | **`@ai-sdk/openai`**, **`@ai-sdk/anthropic`** direct                                                       | Cached-token metadata via `providerMetadata.openai.cachedPromptTokens` consumed by CostMeter.                                                                        |
| Observability + prompt capture + cost metering + evals | **Langfuse (self-hosted ECS)** — wired Day 1                                                               | Content-hash prompt store stays local (§6 below); Langfuse authoritative for trace search, cost rollup, dataset/experiments.                                         |
| Tool registry source of truth                          | **tRPC `.meta({ agent })`** on existing procedures                                                         | Required by spec §7; tool registry adapter converts meta to AI SDK `tool()` at boot.                                                                                 |
| Gateway                                                | **Custom NestJS module** (in `modules/agents`)                                                             | Wraps `tool.execute`; enforces `canDo` + RLS + audit write + taint flip + pre-write abort check. No library provides this.                                           |
| Async durable execution                                | **pg-boss** (existing)                                                                                     | Single durable runtime. `execute-approved-draft` (§10) and async-agent schedules (§11) both pg-boss jobs.                                                            |
| Conversation / L2 / L3 / L4 storage                    | **Postgres + Drizzle + RLS** (schema-per-module: `agents`)                                                 | Every table `tenant_id`-keyed per CLAUDE.md.                                                                                                                         |
| Frontend (global chat surface)                         | **Fork of Vercel Chatbot template** into a new zone `web-chat`                                             | Replaces template auth with web-shell SSO cookie; replaces UIMessage handling with §15.3 SSE schema; keeps message list, streaming, citations, artifact scaffolding. |
| Frontend transport                                     | **`@microsoft/fetch-event-source`**                                                                        | Custom SSE schema (§15.3 ordering invariants load-bearing); `useChat` is not the right primitive.                                                                    |
| Inline copilot transport                               | Same SSE contract, simpler stream (§3: single sub-agent, no phase stepper)                                 |                                                                                                                                                                      |

**Explicitly rejected:**

- **Mastra.** Without Studio, its incremental value over AI SDK v7 is suspend-UX + workflow scaffolding. Suspend-UX conflicts with §10 (approval re-enters Mastra's LLM loop; spec wants direct domain-command execution). Memory shape (thread/working/semantic-recall) doesn't map to L1–L4. Net negative.
- **AI SDK Flows / Vercel Workflow.** pg-boss already committed; second durable runtime is duplication.
- **`useChat` / AI SDK UIMessage for the SSE transport.** §15.3 ordering invariants (refusal before answer, draft.proposed after answer.complete, exactly-one turn.ended) are stronger than UIMessage's type story. Custom schema wins.

---

## 2. Frontend — `web-chat` zone

New zone, added to the 11 existing zones + shell (CLAUDE.md). Dedicated service, ECR repo, CI pipeline.

**Why a zone rather than code inside `web-shell`:** web-shell owns SSO and SSO only. Hosting the global chat there would break the autonomy tenet — a chat outage would take down session entry; an SSO change would risk chat. Separate zone preserves isolation.

**Fork surgery on Vercel Chatbot template:**

1. Rip out NextAuth; consume the web-shell httpOnly session cookie.
2. Replace AI SDK UIMessage handling with `@microsoft/fetch-event-source` wired to `POST /agent/turn`.
3. Implement `useAgentTurn` hook locally — consumes §15.3 events, exposes `{ phase, tokens, answer, drafts, ended }` state.
4. Keep: message list, markdown renderer, streaming animation, citation footnotes UI, artifact/structured-shape rendering. Adapt for the five declared shapes (§9).
5. Add: phase stepper (prod: domain-only; dev: sub-agent + tool), refusal banner state, draft approval cards (via presenter component from `@future/ui`, per §10).

**Inline copilot surfaces** live inside their originating zone (e.g., `web-projects`), consume the same `POST /agent/turn` but pass `surface: 'inline'` and a target screen context. Shared hook + shared presenter components.

---

## 3. Module internal structure (closes §17 open seam: "Agent module internal structure")

Single NestJS module `modules/agents/`, following hexagonal + DDD layout per CLAUDE.md.

```
modules/agents/
  domain/
    ports/
      tool-gateway.port.ts           interface ToolGateway
      stream-broker.port.ts          interface StreamBroker
      prompt-store.port.ts           interface PromptStore, NarrativeStore
      cost-meter.port.ts             interface CostMeter
      replay-harness.port.ts         interface ReplayHarness
    repositories/
      agent-conversation.repo.ts
      agent-message.repo.ts
      prompt-store.repo.ts
      narrative-store.repo.ts
      delegation.repo.ts
      l3-memory.repo.ts
    entities/
      turn.ts                        trace_id, taint, budgets, phase-state
      directive.ts                   { goal, constraints, expected_output_shape, quote }
      sub-agent-result.ts            { summary, semantics, confidence, provenance }
      draft.ts                       action payload + provenance + permission envelope
      delegation.ts
    value-objects/
      trace-id.ts
      taint.ts
      provenance.ts
      shape.ts                       discriminated union over 5 shapes
      content-hash.ts

  application/
    turn-orchestrator/               owns one turn end-to-end
      turn-orchestrator.service.ts
      phase-executor.service.ts      Phase 1 fan-out, Phase 2, synthesizer sequencing
    router/
      router.service.ts              plan → disambiguate | fan-out | analyst
      plan.schema.ts
    sub-agents/
      base/
        sub-agent-runner.service.ts  ReAct loop (AI SDK ToolLoopAgent), budgets,
                                     circuit-breaker, L1 cache, error-class handling
        sub-agent-registry.service.ts registers all sub-agent configs at boot
        define-sub-agent.ts          factory function (see §5)
      planner/
        planner.sub-agent.ts         config only
      people/
        people.sub-agent.ts
      projects/
        projects.sub-agent.ts
    synthesizer/
      synthesizer.service.ts         shape, confidence, citations, contradiction rendering
      confidence-rules.ts            rule table (see §7)
    context/
      context-assembler.service.ts   system prompt, γ/α window, L3 inject, taint
                                     narrative, permission narrative (cached), circuit-
                                     breaker state, cross-turn summary
      permission-narrative.service.ts generated from canDo rules, cached by
                                     (tenant_id, role_id) → content-hash
    gateway/
      tool-gateway.service.ts        the security boundary — canDo + RLS + audit +
                                     abort-check + taint-flip; shadow-ready mode flag
      tool-registry-adapter.service.ts tRPC .meta({ agent }) → AI SDK tool()
      menu-scoping.service.ts        sub-agent + role + screen filter
    sanitizer/
      project-to-schema.ts           pure function, field-drop only
    cost/
      cost-meter.service.ts          dollar, cached-token aware, tiered degradation
      budget.service.ts              per-turn, per-user, per-tenant, per-delegation
      rate-limiter.service.ts        3 limits per §13
    canary/
      quality-canary.service.ts      rolling probe per tier; fixture tenant
      degraded-flag.service.ts       per-tier boolean, drives fallback routing
    replay/
      replay-harness.service.ts      trace_id → reconstructed message arrays
    delegation/
      delegation.service.ts          grant, expire, revoke, max-active, rate-limit
      delegation-limits.service.ts   180d auto-expire, 10 active default
    stream/
      stream-broker.service.ts       §15.3 SSE emitter; enforces event ordering
      sse-events.schema.ts           zod schemas for every event
    drafts/
      draft.service.ts               draft creation, permission envelope capture,
                                     provenance assembly, taint → approval-tier bump
      approval-executor.service.ts   execute-approved-draft pg-boss handler
      approval-throttle.service.ts   two complementary thresholds (§13)
    async/
      async-agent.service.ts         schedule creation, delegation binding
      async-turn-runner.service.ts   pg-boss handler; version pin, taint seed, ceilings
    gdpr/
      erasure-pipeline.service.ts    transactional DB + Langfuse + L3 purge
    drift-tests/                     run as part of `bun test` (unit), CI gate
      write-tool-approval-freshness.spec.ts
      aggregate-composition-sensitive.spec.ts
      agent-block-procedure-resolution.spec.ts

  infrastructure/
    drizzle/
      schema/                        agent_conversation, agent_message,
                                     agent_prompt_store, agent_narrative_store,
                                     agent_delegation, agent_l3_memory
      migrations/
      repos/                         implementations of domain/repositories
    langfuse/
      telemetry-wiring.ts            registerOTel + LangfuseExporter with sampling
      trace-metadata.ts              stamps per-layer hashes + version strings
      pre-capture-redactor.ts        tenantAuthoredFreeText redaction at write time
      purge-by-user.ts               GDPR user-id purge against Langfuse API
      dataset-experiments.ts         CI harness wrapper (§14 golden trace)
    pg-boss/
      async-turn.worker.ts
      execute-approved-draft.worker.ts
      cross-turn-summary.worker.ts   async nano summarizer off critical path
    trpc/
      trpc-caller.service.ts         server-side caller used by gateway
    cache/
      turn-scoped-cache.ts           NestJS request-scoped provider; L1 read dedup

  interface/
    http/
      agent-turn.controller.ts       POST /agent/turn, POST /cancel
      agent-conversations.controller.ts
      agent-memory.controller.ts     L3 user-initiated only
    trpc/
      agent.router.ts                minimal surface; exposes AgentQueryFacade
    events/
      langfuse-capture.listener.ts   kernel audit events → Langfuse tag linking

  agents.module.ts                   exports: [AgentQueryFacade] ONLY
```

**Downward DI invariant (enforced):** `modules/agents/*` imports `TrpcCaller` only; no imports from another module's `domain/` or `infrastructure/`. Lint rule per CLAUDE.md.

**Sub-agents live inside the agents module**, not inside their domain modules. They consume domain tools via `TrpcCaller`; they are part of the runtime, not the domain.

---

## 4. Database schemas

New schema `agents` (per CLAUDE.md schema-per-module rule), RLS-partitioned on `tenant_id`.

| Table                    | Purpose                                     | Key columns                                                               | RLS                         |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------- | --------------------------- |
| `agents.conversation`    | Global + inline conversation roots          | `tenant_id`, `user_id`, `surface`, `updated_at`, `archived_at`            | `tenant_id = app.tenant_id` |
| `agents.message`         | Turns and user utterances                   | `conversation_id`, `trace_id`, `role`, `content`, `summary`, `created_at` | via conversation            |
| `agents.prompt_store`    | Content-hash-keyed rendered prompts (§8)    | `content_hash PK`, `layer`, `content`, `first_seen_at`                    | tenant-scoped? see below    |
| `agents.narrative_store` | Permission narrative cache                  | `content_hash PK`, `content`, `first_seen_at`                             | tenant-scoped               |
| `agents.delegation`      | Kernel-owned delegations (mirror for query) | `delegator_user_id`, `delegate`, `scope`, `expires_at`, `max_fires`       | `tenant_id`                 |
| `agents.l3_memory`       | User preferences (§5)                       | `(tenant_id, user_id, key)`, `value`, `updated_at`                        | `tenant_id`                 |

**`prompt_store` tenant scoping note:** the _rendered_ prompt may include tenant-specific context (tenant name, role narrative). So the row IS tenant-scoped: primary key is `(tenant_id, content_hash)`. Two tenants rendering the same template produce the same hash if and only if the rendered content is identical — which is legitimately rare and safe to share across tenants. Default: tenant-scoped for RLS cleanliness and audit separation.

**`narrative_store`:** keyed on `(tenant_id, role_id) → content_hash` in a separate index table; `(content_hash → content)` is the append-only table. Role changes regenerate; content-hash identity deduplicates where content overlaps.

---

## 5. Sub-agent definition shape (closes §17 open seams: sub-agent definition interface + input-schema site)

Pure config factory + NestJS registry. Static data only; behavior in the shared `SubAgentRunner`.

```ts
// application/sub-agents/base/define-sub-agent.ts
export interface SubAgentConfig<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  key: string // 'planner' | 'people' | 'projects' | ...
  domain: DomainKey // which tRPC .meta({ agent }) namespace to admit
  version: string // semantic version, human-legible
  prompt: {
    system: string // hashed at runtime; written to prompt_store on first use
    examples: Array<{ input: string; callArgs: Record<string, unknown> }>
  }
  inputSchema: TInput // §3 sanitization target — extends directiveSchema
  outputSchema: TOutput // shared sub-agent-result shape
  toolScope: {
    domains: DomainKey[] // usually [self]; analyst sub-agent = []
    extraTools?: ToolKey[] // explicit whitelist beyond domain scope
    roleFilter: 'inherit-caller' // §7 menu scoping invariant
  }
  budgets: {
    maxIterations: number // 4–5 per §4
    wallclockMs: number
    costUsd: number // dollar-denominated per §13
  }
  confidence?: Partial<ConfidenceRuleOverrides> // optional per-sub-agent tweaks on §7 rule table
}

export function defineSubAgent<TI extends z.ZodTypeAny, TO extends z.ZodTypeAny>(
  cfg: SubAgentConfig<TI, TO>,
): SubAgentConfig<TI, TO> {
  assertSubAgentShape(cfg) // runtime validation at boot
  return cfg
}
```

Example:

```ts
// application/sub-agents/planner/planner.sub-agent.ts
export const plannerSubAgent = defineSubAgent({
  key: 'planner',
  domain: 'planner',
  version: '1.0.0',
  prompt: {
    system: `You are the planner sub-agent. You answer questions about tasks and evidence,
and draft task creates/updates when asked. You never confirm writes — you draft them
for the user to approve.
...`,
    examples: [
      {
        input: "what's overdue on Project X?",
        callArgs: {
          /* ... */
        },
      },
      {
        input: 'draft a task for Alice on Project X due Friday',
        callArgs: {
          /* ... */
        },
      },
    ],
  },
  inputSchema: directiveSchema.extend({
    referenced_project_ids: z.array(z.string().uuid()).optional(),
    referenced_task_ids: z.array(z.string().uuid()).optional(),
  }),
  outputSchema: subAgentResultSchema,
  toolScope: { domains: ['planner'], roleFilter: 'inherit-caller' },
  budgets: { maxIterations: 5, wallclockMs: 15_000, costUsd: 0.5 },
})
```

Registration:

```ts
// application/sub-agents/sub-agents.module.ts
@Module({
  providers: [
    SubAgentRegistry,
    SubAgentRunner,
    {
      provide: SUB_AGENT_CONFIGS,
      useValue: [
        plannerSubAgent,
        peopleSubAgent,
        projectsSubAgent,
        // 7 more domains join here as they ship
      ],
    },
  ],
  exports: [SubAgentRegistry],
})
export class SubAgentsModule {}
```

**Phase-2 sanitization resolves here:** `projectToSchema(phase1Output, targetSubAgent.inputSchema)` is a pure field-drop using the target's zod schema as the projection template. Mismatch: one re-plan, then disambiguation per §3.

---

## 6. Prompt-store strategy (reaffirms §8; not using Langfuse Prompt Management)

Local `agent_prompt_store` and `agent_narrative_store` remain authoritative for replay. Langfuse Prompt Management is **not** used in v1.

**Rationale (complements §8's arguments):**

- Content-hash identity is a spec invariant; Langfuse versions are sequential integers + labels.
- Spec §8 requires prompt-store writes emit kernel audit events (same discipline as admin budget top-ups). Langfuse writes do not. A wrapper to emit audit events around Langfuse writes would duplicate most of the local store's responsibility.
- Multi-tenant partitioning is RLS-by-construction locally; Langfuse uses labels/project per convention.
- Replay must error on lookup miss with no fallback. Local tables with RLS + tenant-keyed content-hash give this by construction; Langfuse Prompt Management does not guarantee availability SLAs appropriate for a replay dependency.

**Langfuse is still used for trace attributes** — each trace stamps the six content hashes + four version strings (§8) via `experimental_telemetry.metadata`. Langfuse becomes the search index; the local stores are the authoritative content source.

---

## 7. Confidence rule table (closes §17 open seam 6)

Rule-based, computed from trace signals by `SubAgentRunner` — never asked of the LLM (§9).

| Condition                                                                                              | Confidence       | Computed by                                   |
| ------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------- |
| Answer corroborated by ≥1 tool result; zero tool failures; zero retries; no taint flip during run      | `high`           | `SubAgentRunner`                              |
| Single-source answer, OR retry occurred, OR circuit-breaker tripped during run, OR partial tool result | `med`            | `SubAgentRunner`                              |
| Taint flipped during sub-agent's run                                                                   | `low`            | `SubAgentRunner`                              |
| Ceiling (iteration/wallclock/cost) hit during run                                                      | `low`            | `SubAgentRunner`                              |
| Declared semantics differ from a sibling sub-agent's summary (cross-sibling)                           | `low` (demotion) | `SynthesizerService` (post-hoc demotion only) |

Sub-agent confidence ships with the `SubAgentResult`. Synthesizer may demote to `low` when it detects cross-sibling semantic divergence at merge time; never promotes.

Sub-agent configs may override individual rows via `confidence` field. Overrides are audited at boot (logged; drift test flags silent changes across deploys).

**Open seam preserved:** refining thresholds as observed regressions inform it (§17 item 6). Not a blocker — default table ships.

---

## 8. Tool-result caching semantics (closes §17 open seam 3)

**L1 read cache (turn-scoped):**

- Request-scoped NestJS provider. Key: `(tool_name, args_canonical_hash)`. Value: structured tool result.
- Scope: one turn (router → all sub-agents → synthesizer). Dies at turn end.
- Cross-sub-agent sharing within phase 1: **disabled.** Each sub-agent gets a private cache. Reason: sharing across sub-agents leaks one sub-agent's context into another's menu, violating the sanitized-summary-only rule. Performance cost is accepted (tools chosen by different sub-agents rarely overlap; when they do, it's a routing mistake to be caught by router-accuracy signals).
- Phase 2 cache: fresh. Does not inherit phase-1 cache entries; phase-2 operates on sanitized phase-1 summary, not raw results.

**Write invalidation:** a mutation tool call in the sub-agent clears cache entries whose tool name is in the same domain. E.g., `planner.tasks.create` clears `planner.*` reads in the same sub-agent's cache. Cross-domain invalidation: none — different domain, different cache partition anyway.

---

## 9. Kernel integration points (closes §17 open seam 4)

**Facade imports:** agent module consumes these kernel facades only (via `TrpcCaller` where possible; direct facade injection where the operation is not tool-exposed):

- `KernelAuditFacade` — write audit events (tool call, prompt-store write, narrative-store write, delegation event, permission widening, GDPR erasure, admin top-up, canary-triggered degradation).
- `DelegationFacade` — create / expire / revoke / query delegations. Owned by kernel; agents module is a consumer.
- `CanDoFacade` — sync permission check (not via tRPC; hot path).

**Audit event shapes (new, kernel-defined):**

- `agent.tool_called` — fields: `trace_id, tool_name, args_hash, result_hash, byte_count, on_behalf_of, via_delegation?, via_schedule?, approved_by?, tenant_id, caller_user_id, duration_ms, permission_key`.
- `agent.prompt_stored` — `content_hash, layer, tenant_id, trace_id`.
- `agent.narrative_stored` — `content_hash, tenant_id, role_id`.
- `agent.delegation_minted` / `agent.delegation_expired` / `agent.delegation_revoked` — per §11.
- `agent.permission_widened_between_draft_and_execute` — per §10.
- `agent.gdpr_erasure_completed` — per §6; emits on DB + Langfuse + L3 all successful.
- `agent.canary_degraded_flag_flipped` — per §12 (tier, rate, threshold).
- `agent.budget_top_up` — admin-initiated, per §13.

**Tool-authoring review checklist addendum (per §17 adversarial pass):** PR template for any tRPC procedure adding `.meta({ agent })` must include: "Is this tool aggregate-returning? If yes, does it enforce k-anonymity / small-group suppression, and what is `minGroupSize`?"

---

## 10. Langfuse wiring — Day 1

**Boot-time integration:**

```ts
// infrastructure/langfuse/telemetry-wiring.ts
registerOTel({
  serviceName: 'future-agents',
  traceExporter: new LangfuseExporter({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
    // Stratified sampling: always-capture decided by runtime, emitted as tags
    sampleRate: 1.0,
  }),
})
```

**Every LLM call tagged:**

```ts
experimental_telemetry: {
  isEnabled: true,
  metadata: {
    tenant_id, trace_id, phase, sub_agent_key,
    router_prompt_hash, sub_agent_prompt_hash, system_prompt_hash,
    permission_narrative_hash, tool_catalog_hash, directive_schema_hash,
    router_version, sub_agent_version, tool_meta_version, model_id,
  },
}
```

**Stratified sampling at ingest**, not at capture (addresses the mid-turn-trigger concern raised in brainstorming):

- Runtime always captures (`sampleRate: 1.0`) but tags each trace with boolean trigger fields: `err`, `taint_flipped`, `ceiling_hit`, `approval_required`, `composition_amplification`.
- Langfuse retention rules keep 100% of traces with any trigger tag = true; sample 1% of the rest at ingest via ingestion filter.
- Cost of always-submit vs. always-retain: submission bandwidth is negligible at this scale; retention is the cost driver; retention rules handle it.

**Pre-capture redaction:** middleware wraps every tool result; fields declared in `tenantAuthoredFreeText` are replaced with a placeholder token before the trace is emitted. One declaration (§2), triple duty (§2 taint render + §2 prompt wrapper + §12 redaction).

**Dataset + Experiments wiring (Phase 6):** golden-trace suite ingests into a Langfuse dataset; CI runs `experiment.run(dataset, agent)` and fails build on regression. Thumbs-down feedback posts as Langfuse `Score` on the trace.

**GDPR purge:** `purgeByUserId(user_id)` calls Langfuse API alongside DB hard-delete and L3 purge, inside the single transactional pipeline.

---

## 11. First implementation scope: planner, people, projects

**Domain coverage in first cut:**

| Sub-agent  | Read tools (via tRPC `.meta({ agent })` added in this cut)                                              | Write tools                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `planner`  | `tasks.list`, `tasks.getById`, `tasks.getEvidence`, `tasks.searchByAssignee`, `tasks.overdueForProject` | `tasks.draftCreate`, `tasks.draftUpdate` — both approval-required by default in v1; taint bump is a no-op at this tier |
| `people`   | `profiles.getByUserId`, `profiles.searchByName`, `org.getPlacement`, `org.listDirectReports`            | — (read-only in v1)                                                                                                    |
| `projects` | `projects.list`, `projects.getById`, `assignments.listByProject`, `assignments.listByUser`              | — (read-only in v1)                                                                                                    |

**Cross-domain exercises proven by first cut:**

- Phase-1 fan-out ≤3: _"Who's on Project X with overdue tasks?"_ → people + projects + planner.
- Phase-2 sanitization: _"Summarize Alice's active work"_ → people (resolve user) → projects (her projects) + planner (her tasks) in Phase 2.
- Taint + approval path: _"Draft a task for @alice on Project X"_ where project has a description field declared in `tenantAuthoredFreeText`.
- Disambiguation: _"tell me about Alice"_ → two Alices → clarifying question.

**Other 7 domains (finance, hiring, time, goals, performance, admin, insights)** slot in via the same `defineSubAgent` pattern post-v1.

---

## 12. Phased implementation sequence

Full v1 spec delivered across 7 phases over ~13–14 weeks for a senior engineer, with intermediate demos. Sequencing favors: security boundary first, observability from Day 1, write surface after reads, async last.

### Phase 1 — Runtime foundation (weeks 1–3)

**Ships:** the gateway, one sub-agent (planner, read-only), end-to-end security boundary, Langfuse wired.

- Drizzle schemas + migrations: `agents.conversation`, `agents.message`, `agents.prompt_store`, `agents.narrative_store`, `agents.l3_memory`.
- Kernel audit event shapes finalized and emitted.
- `ToolGateway` — `canDo` + RLS + audit + abort-check + taint-flip + shadow-ready mode flag.
- Tool registry adapter: tRPC `.meta({ agent })` → AI SDK `tool()`. Drift tests gating build.
- `SubAgentRunner` — ReAct via `ToolLoopAgent`; budgets, circuit-breaker, L1 cache, per-error-class handling, retry-at-one-layer discipline (disable AI SDK internal retry).
- `ContextAssembler` — system prompt cache ordering, generated permission narrative with kernel integration and narrative-store caching, taint narrative rendering.
- `SubAgentRegistry` + `defineSubAgent` factory + `plannerSubAgent` (read-only tools only).
- `project_to_schema` sanitizer (pure function).
- Langfuse: `registerOTel` + `LangfuseExporter`, `experimental_telemetry` metadata on every LLM call, pre-capture `tenantAuthoredFreeText` redaction.
- Single SSE stream from a minimal `POST /agent/turn` endpoint; no router yet — directly invokes plannerSubAgent.
- Minimal `web-chat` zone fork: streaming text only, no drafts, no phase stepper.

**Exit criterion:** a user in web-chat can ask "what's overdue on Project X?" and the planner sub-agent answers, with `canDo` + RLS verified by security test, Langfuse trace captured, kernel audit events emitted.

### Phase 2 — Streaming contract + synthesizer (weeks 4–5)

**Ships:** §15.3 SSE event schema complete, synthesizer with all five shapes, citations.

- `StreamBroker` — enforces §15.3 ordering invariants via a type-state machine (event transitions validated at emit time; invalid transitions throw).
- `SynthesizerService` — picks shape, derives confidence from trace signals per §7, emits `answer.shape_declared` before token stream.
- Citation extraction — structured provenance mapping; UI renders inline icons.
- `web-chat` zone: shape-aware rendering (table columns, chart data). Phase stepper deferred to Phase 3 (no multi-phase flow exists yet).
- Cancellation: `POST /agent/turn/:trace_id/cancel`, single abort path, pre-write abort check verified.

**Exit criterion:** a partial-answer ceiling-hit turn renders "partial — limit reached" with correct shape; refusal renders as distinct state; cancel mid-stream leaves zero drafted writes.

### Phase 3 — Router + multi-sub-agent (weeks 6–7)

**Ships:** full §3 routing topology with people + projects sub-agents.

- `RouterService` — plan as classifier: disambiguate | fan-out (≤3) | analyst (deferred until v1.5). Emits phase events.
- `PhaseExecutor` — Phase 1 `Promise.all` fan-out, optional Phase 2, one re-plan on schema mismatch then disambiguation.
- Cross-turn summary pipeline: post-turn async nano summarizer (pg-boss `cross-turn-summary.worker`), re-filter per target sub-agent's permission scope at inject time.
- `peopleSubAgent`, `projectsSubAgent` configs + their domain tools exposed via `.meta({ agent })`.
- Circuit-breaker state propagation phase 1 → phase 2 via sanitized context note.
- Router-accuracy signals dashboarded: user-corrects-mid-conversation, sub-agent-returns-empty-handoff, initiator-thumbs-down within N.

**Exit criterion:** "Who's on Project X with overdue tasks?" fans out to 3 sub-agents and synthesizes a coherent answer with citations to 3 distinct domains.

### Phase 4 — Writes, approvals, drafts (weeks 8–9)

**Ships:** §10 end-to-end — draft proposal, permission envelope, taint bump, approval inbox, execute-approved-draft.

- `DraftService` — draft creation, permission envelope at draft time, provenance assembly, taint → approval-tier bump enforced at gateway (independent of model narrative).
- Draft TTL: 72h default, per-tool override via `approvalTtl`.
- Approval inbox integration — drafts emitted as notification-inbox items tagged `origin: agent`. Domain approval workflows consume unchanged.
- **`DelegationService` — mint + revoke subset.** Synthetic execution-delegation minted at draft time for live-session-originated drafts; pinned on the draft row; consumed at execute-approved-draft time. Full lifecycle (limits, expiry, admin UI) lands in Phase 5.
- `execute-approved-draft` pg-boss worker — unified delegation model for both async-originated and live-session-originated drafts.
- Domain-revalidation contract enforced via drift test: every non-read tool must declare `approvalFreshness`.
- Approval inbox throttle (two complementary thresholds); initiator notice.
- Draft provenance presenter component in `@future/ui`; web-chat renders via it.
- `permission_widened_between_draft_and_execute` audit event; strict widening detection.
- `planner.tasks.draftCreate` + `draftUpdate` tools go live.

**Exit criterion:** drafting a task from a tainted turn produces an approval-required draft; manager approves; job executes against live data via domain command; all audit events present; permission widening (tested by synthetic scenario) emits audit event without blocking.

### Phase 5 — Async agents (weeks 10–11)

**Ships:** §11 — personal schedules + tenant-wide schedules + full delegation lifecycle (mint + revoke already live from Phase 4).

- `DelegationLimitsService` — max 10 active default; 180d auto-expire; admin UI listing.
- Personal + tenant-wide grant creation paths (Phase 4 only minted synthetic execution-delegations at draft time; Phase 5 adds the user-initiated `grant` path).
- Rate limit: `schedule_or_delegation_creations_per_user_per_day = 5`.
- `async-turn.worker` (pg-boss) — version pinning across retries, taint seeding from trigger content, per-delegation cost + invocation ceilings enforced pre-spawn.
- Tenant-wide scheduler principal `agent:scheduler` with narrow admin-granted scopes.
- Read-only + notify + draft-to-inbox policy enforced in async turn runner (no autonomous writes in v1).
- Admin UI: active schedules, active delegations, per-schedule metrics.

**Exit criterion:** a scheduled personal agent runs weekly, drafts to inbox under the delegator's authority, pauses when delegation expires, and fails gracefully when per-delegation cost ceiling trips.

### Phase 6 — Cost control, canary, eval (weeks 12–13)

**Ships:** §13 full cost control + §12 canary + §14 eval CI gate.

- `CostMeter` — dollar denomination with cached-token accounting; pre-turn refusal with minimum-balance check; mid-turn abort on ceiling; distinct `turn.ended.reason` for `refused` vs `budget`.
- Tenant tiered degradation: 80% pauses async, 95% drops to nano, 100% hard refuse. Admin notifications rate-limited.
- Rate limits: 3 limits per §13.
- Refusal trace captures expected-cost estimate.
- `QualityCanaryService` — rolling probe per tier, canary queries rotated quarterly from production, frozen fixture tenant, degraded-flag, budget-independent fallback, both-tiers fallback with elevated notice.
- Per-turn anomaly dashboards: validation-error rate spike, iteration-count distribution anomaly.
- Golden-trace CI gate: Langfuse Datasets + Experiments; small hand-curated set; adversarial sanitization-projection subset.
- L3 memory (`user-initiated writes only`); CRUD endpoints; tRPC mutations deliberately omit `.meta({ agent })`.

**Exit criterion:** CI gate blocks a PR that regresses on the golden trace set; quality-canary catches a synthetic model degradation and fails over to the other tier; tenant hitting 95% silently drops to nano-only with visible user banner.

### Phase 7 — Replay, GDPR, polish (week 14)

**Ships:** replay harness, GDPR erasure, dev-mode affordances, remaining polish.

- `ReplayHarness` — CLI tool + HTTP endpoint for dev users; given `trace_id`, reconstructs full message array via hash stores; errors-on-miss with no silent fallback.
- `erasure-pipeline.service` — transactional DB hard-delete + Langfuse `purgeByUserId` + L3 delete; compensating action on partial failure logs compliance incident.
- Dev-mode UI deep-linking: conversation message → Langfuse trace + replay tool for 100%-captured turns.
- End-user deep-link to redacted-safe audit-trail summary.
- L4 lazy fetch pattern finalized (`AdminQueryFacade.getCurrencyPreference` etc.).
- Documentation pass; runbook for common incidents; alert playbook.

**Exit criterion:** right-to-erasure request completes end-to-end; a replay of a production trace_id reconstructs the exact message array; dev-mode deep-link lands on the Langfuse trace.

---

## 13. Open seams remaining after this pass

These do not block Phase 1 start and are carried forward explicitly:

- **Confidence rule table refinement (§17 item 6).** Default table ships in §7 above; observed regressions will inform adjustments. Tracked in a `docs/runbooks/confidence-rules.md` log post-v1.
- **Analyst tier (§3 ambiguity ladder item 3).** Deferred to v1.5 per spec §16. Parameterized SQL on read replica, `canDo('agent.analyst')` gated.
- **Shadow-mode traffic.** Gateway is shadow-ready from Phase 1 via `mode: 'execute' | 'dry-run'`; traffic routing deferred to v1.5.
- **Sub-agent governance machinery** (declared review process, example-query gates). Trigger-based adoption per §16; not in v1 unless sustained router-accuracy regression fires or sub-agent headcount passes ~7.

---

## 14. Success criteria (v1 exit)

The v1 runtime is complete when all of the following hold:

- All 10 domain modules can add `.meta({ agent })` to any tRPC procedure and the procedure becomes a tool without central review. Drift tests gate.
- A user turn on global chat completes end-to-end (router + ≤3 sub-agents + synthesizer + streaming) within 30s p50 wallclock for two-phase cross-domain queries.
- A draft from a tainted turn requires explicit approval 100% of the time, enforced at the gateway independent of model narrative.
- `canDo` and RLS are never bypassed; cross-module imports of domain services are banned at lint level.
- Every LLM call emits a Langfuse trace with 6 content hashes + 4 version strings + `trace_id` + `tenant_id`.
- GDPR erasure runs transactionally across DB + Langfuse + L3.
- Cost refusal distinguishes `refused` (pre-turn) from `budget` (mid-turn) with distinct UX.
- Quality canary detects synthetic degradation and flips fallback within a configurable window.
- Golden-trace CI gate passes on main and fails on a deliberate regression PR.
- Replay harness reconstructs any 100%-captured turn deterministically, errors on any miss.

---

## Appendix A — Glossary additions

- **Turn orchestrator** — application-layer service owning one turn end-to-end; composes router → phase executor → synthesizer → stream broker.
- **Phase executor** — pure composition of `Promise.all` (Phase 1) + optional sequential step (Phase 2). Not a DAG engine.
- **Sub-agent config** — pure data declared via `defineSubAgent`. Zero behavior; zero DI. Behavior lives in the shared `SubAgentRunner`.
- **Tool registry adapter** — boot-time service that discovers tRPC procedures carrying `.meta({ agent })` and produces AI SDK `tool()` instances scoped per sub-agent.
- **Shadow-ready** — gateway interface accepts `mode: 'execute' | 'dry-run'` from v1; no shadow traffic routed in v1, but any tool handler can be invoked in dry-run without retrofit.
- **Drift test** — build-time unit test (colocated) that validates metadata invariants: every write tool declares `approvalFreshness`, every aggregate tool declares `compositionSensitive`, every `.meta({ agent })` block resolves to an existing procedure with matching schema fields.
