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
- **AI SDK v7 `WorkflowAgent`.** Depends on Vercel Workflows as its durable runtime — not used in this stack. pg-boss is the committed durable runtime for async work and approval execution (§10, §11). Independent of that, `WorkflowAgent`'s `needsApproval` flag suspends and resumes the agent loop with LLM re-entry, which conflicts with the spec's turn-ends-at-draft model.
- **AI SDK v7 memory providers** (Letta, Mem0, Supermemory, Hindsight, Anthropic Memory Tool). All are tool-based agent-invoked memory interfaces; §5 L3 deliberately rejects agent-proposed writes for v1 on prompt-injection grounds. Custom Postgres + RLS per L1–L4 per CLAUDE.md.
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

Full v1 spec delivered across 7 phases. **Honest estimate: 19–23 weeks for one senior engineer, or ~11–13 weeks for a team of three with parallel tracks.** Phases have intermediate demos. Sequencing favors: security boundary first, observability Day 1, writes after reads, compliance (GDPR) before cost/eval work, async and moderation late, replay last.

**Production access is internal/pilot-only through Phase 6.** Full external GA requires Phase 7 (content moderation).

### Phase 1 — Runtime foundation (weeks 1–4)

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

### Phase 2 — Streaming contract + synthesizer (weeks 5–7)

**Ships:** §15.3 SSE event schema complete, synthesizer with all five shapes, citations.

- `StreamBroker` — enforces §15.3 ordering invariants via a type-state machine (event transitions validated at emit time; invalid transitions throw).
- `SynthesizerService` — picks shape, derives confidence from trace signals per §7, emits `answer.shape_declared` before token stream.
- Citation extraction — structured provenance mapping; UI renders inline icons.
- `web-chat` zone: shape-aware rendering (table columns, chart data). Phase stepper deferred to Phase 3 (no multi-phase flow exists yet).
- Cancellation: `POST /agent/turn/:trace_id/cancel`, single abort path, pre-write abort check verified.

**Exit criterion:** a partial-answer ceiling-hit turn renders "partial — limit reached" with correct shape; refusal renders as distinct state; cancel mid-stream leaves zero drafted writes.

### Phase 3 — Router + multi-sub-agent + Tier 2 structured-query (weeks 8–10)

**Ships:** full §3 routing topology with people + projects sub-agents.

- `RouterService` — plan as classifier: disambiguate | fan-out (≤3) | analyst (deferred until v1.5). Emits phase events.
- `PhaseExecutor` — Phase 1 `Promise.all` fan-out, optional Phase 2, one re-plan on schema mismatch then disambiguation.
- Cross-turn summary pipeline: post-turn async nano summarizer (pg-boss `cross-turn-summary.worker`), re-filter per target sub-agent's permission scope at inject time.
- `peopleSubAgent`, `projectsSubAgent` configs + their domain tools exposed via `.meta({ agent })`.
- Circuit-breaker state propagation phase 1 → phase 2 via sanitized context note.
- Router-accuracy signals dashboarded: user-corrects-mid-conversation, sub-agent-returns-empty-handoff, initiator-thumbs-down within N.

**Exit criterion:** "Who's on Project X with overdue tasks?" fans out to 3 sub-agents and synthesizes a coherent answer with citations to 3 distinct domains.

### Phase 4 — Writes, approvals, drafts, L3 memory (weeks 11–14)

**Ships:** §10 end-to-end (draft proposal, permission envelope, taint bump, approval inbox, execute-approved-draft) + §5 L3 memory.

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
- **L3 memory** — user-initiated CRUD endpoints; tRPC mutations deliberately omit `.meta({ agent })` (enforced invariant, not convention).

**Exit criterion:** drafting a task from a tainted turn produces an approval-required draft; manager approves; job executes against live data via domain command; all audit events present; permission widening (tested by synthetic scenario) emits audit event without blocking; L3 preference read and written via user-initiated API.

### Phase 5 — GDPR erasure + async agents (weeks 15–17)

**Ships:** §6 right-to-erasure pipeline + §11 async agents (personal + tenant-wide schedules, full delegation lifecycle).

**Why GDPR here:** data paths that erasure touches (L3, agent_message content, Langfuse traces) all exist by end of Phase 4. Shipping erasure before async keeps compliance ahead of any production access.

- `erasure-pipeline.service` — transactional DB hard-delete (content fields only; structural shell survives) + Langfuse `purgeByUserId` + L3 delete; compensating action on partial failure logs compliance incident.
- Erasure drift test: every table holding user-origin content has a deletion path covered by the pipeline.
- `DelegationLimitsService` — max 10 active default; 180d auto-expire; admin UI listing.
- Personal + tenant-wide grant creation paths (Phase 4 only minted synthetic execution-delegations at draft time; Phase 5 adds the user-initiated `grant` path).
- Rate limit: `schedule_or_delegation_creations_per_user_per_day = 5`.
- `async-turn.worker` (pg-boss) — version pinning across retries, taint seeding from trigger content, per-delegation cost + invocation ceilings enforced pre-spawn.
- Tenant-wide scheduler principal `agent:scheduler` with narrow admin-granted scopes.
- Read-only + notify + draft-to-inbox policy enforced in async turn runner (no autonomous writes in v1).
- Admin UI: active schedules, active delegations, per-schedule metrics.

**Exit criterion:** right-to-erasure request completes end-to-end across DB + Langfuse + L3, with compliance-incident logging on a synthetic partial-failure; a scheduled personal agent runs weekly, drafts to inbox under the delegator's authority, pauses when delegation expires, and fails gracefully when per-delegation cost ceiling trips.

### Phase 6 — Cost control, canary, eval CI (weeks 18–20)

**Ships:** §13 full cost control + §12 canary + §14 eval CI gate.

- `CostMeter` — dollar denomination with cached-token accounting; pre-turn refusal with minimum-balance check; mid-turn abort on ceiling; distinct `turn.ended.reason` for `refused` vs `budget`.
- Tenant tiered degradation: 80% pauses async, 95% drops to nano, 100% hard refuse. Admin notifications rate-limited.
- Rate limits: 3 limits per §13.
- Refusal trace captures expected-cost estimate.
- `QualityCanaryService` — rolling probe per tier, canary queries rotated quarterly from production, frozen fixture tenant, degraded-flag, budget-independent fallback, both-tiers fallback with elevated notice.
- Per-turn anomaly dashboards: validation-error rate spike, iteration-count distribution anomaly.
- Confidence calibration dashboard (spec §12) — query over existing thumbs/approval signals.
- Golden-trace CI gate: Langfuse Datasets + Experiments; small hand-curated set; adversarial sanitization-projection subset.

**Exit criterion:** CI gate blocks a PR that regresses on the golden trace set; quality-canary catches a synthetic model degradation and fails over to the other tier; tenant hitting 95% silently drops to nano-only with visible user banner.

### Phase 7 — Moderation, replay, polish, nightly consistency check (weeks 21–23)

**Ships:** content moderation (§18), replay harness, nightly consistency check, dev-mode affordances, remaining polish. External GA gate.

- **Content moderation (§18):** `OutputModerator` port + `OpenAIModerationAdapter`; wired on input (pre-router) and output (pre-stream-complete); `turn.ended.reason = 'moderation'` when flagged; content-hash caching within a turn.
- `ReplayHarness` — CLI tool + HTTP endpoint for dev users; given `trace_id`, reconstructs full message array via hash stores; errors-on-miss with no silent fallback.
- **Nightly prompt-hash consistency check (§6)** — Inngest daily function asserts that every `content_hash` referenced by a Langfuse trace in the last 24h exists in `agents.prompt_store` / `agents.narrative_store`. Mismatch → kernel audit event `agent.prompt_hash_missing` + page on-call.
- Dev-mode UI deep-linking: conversation message → Langfuse trace + replay tool for 100%-captured turns.
- End-user deep-link to redacted-safe audit-trail summary.
- L4 lazy fetch pattern finalized (`AdminQueryFacade.getCurrencyPreference` etc.).
- Documentation pass; runbook for common incidents; alert playbook.

**Exit criterion:** moderation flags a synthetic harmful utterance and fires `turn.ended.reason = 'moderation'`; a replay of a production trace_id reconstructs the exact message array; dev-mode deep-link lands on the Langfuse trace; nightly consistency check runs without mismatches on a seeded-inconsistency test.

---

## 13. Open seams remaining after this pass

These do not block Phase 1 start and are carried forward explicitly:

- **Confidence rule table refinement (§17 item 6).** Default table ships in §7 above; observed regressions will inform adjustments. Tracked in a `docs/runbooks/confidence-rules.md` log post-v1.
- **Confidence feedback loop.** Post-v1: pipeline from Langfuse thumbs-down Scores + trace postmortem → proposed rule-table refinements. Human-gated review before rule changes; avoid closed-loop that self-biases. Trigger: two consecutive quarters with >5% thumbs-down on `high`-confidence answers.
- **Analyst tier (§3 ambiguity ladder item 3).** Replaced by embedded BI via Metabase + Cube — see §14.3. LLM-generated parameterized SQL removed from the design (previous plan deferred to v1.5; current plan defers indefinitely in favor of semantic-layer BI).
- **Shadow-mode traffic.** Gateway is shadow-ready from Phase 1 via `mode: 'execute' | 'dry-run'`; traffic routing deferred to v1.5.
- **Sub-agent governance machinery** (declared review process, example-query gates). Trigger-based adoption per §16; not in v1 unless sustained router-accuracy regression fires or sub-agent headcount passes ~7.
- **Sub-agent ownership distribution.** Currently sub-agents live in `modules/agents/application/sub-agents/*` — owned by the runtime team. If domain teams eventually own their sub-agent prompts (more natural once domain headcount grows), the factory-in-module-layout needs a split: keep `SubAgentRunner` + registry in agents module, move per-domain configs to `modules/<domain>/agent/*.sub-agent.ts`. Escape hatch documented here; not blocking v1.

---

## 14. Flexible data access — beyond curated tools

Users want to ask novel questions that don't map cleanly onto curated tools — _"show me tasks from projects owned by Alice's team where the assignee is in engineering and the due date is past 7 days"_, or _"what's our PTO carry-over policy"_, or _"list revenue by region last quarter"_. Adding a curated tool per combination is unbounded. Adding unfettered SQL access is a security hole. This section walks through the tiered surface that closes the gap safely.

Spec §7 defines three tiers; this section makes them concrete, adds MCP as a fourth, and pins down the guardrails per tier.

### 14.1 Four tiers of data access

| Tier                                | What it is                                                                   | Expressiveness                                             | When the router picks it                                     | Cost of abuse                         |
| ----------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| **1 — Curated tools**               | tRPC procedures with `.meta({ agent })`                                      | Narrow, per-operation                                      | Intent matches a named tool (90%+ of queries)                | Low — tool authored with intent       |
| **2 — Structured query per domain** | Generic `<domain>.query({ where, select, orderBy, limit })` tool             | Medium — any filter within one domain's whitelisted schema | Novel filter combination inside one domain                   | Medium — bounded by schema            |
| **3 — Analyst escape hatch**        | Parameterized SQL against read-replica views                                 | High — any read within allowed views                       | Cross-domain complex read; `canDo('agent.analyst')` required | High — must be constrained at DB role |
| **4 — MCP external sources**        | Remote MCP servers exposing tools (Notion, Confluence, internal wikis, etc.) | Variable — shaped by the server                            | User asks about data not in your domain tables               | High — external trust boundary        |

All four flow through the same `ToolGateway.execute` path. Same `canDo` + RLS + audit + abort-check + taint handling. **A tool's tier does not affect its enforcement envelope** — only its declaration and its guardrail surface.

### 14.2 Tier 2 — Structured query per domain (Phase 3)

**Shape.** One tool per domain, declared exactly like any other tool via `.meta({ agent })`:

```ts
// modules/planner/interface/trpc/planner.router.ts
export const plannerRouter = router({
  query: protectedProcedure
    .meta({
      permission: 'planner:task:read',
      agent: {
        whenToUse:
          'Answer novel planner questions where no curated tool fits: complex filter combinations, custom sort orders, cross-project rollups within the planner domain.',
        whenNotToUse:
          'Cross-domain queries (use analyst escape hatch). Writes (drafts only via curated draft tools).',
        examples: [
          {
            input: 'tasks due this week for Project X',
            callArgs: {
              where: { projectId: '...', dueAt: { lte: '2026-04-27' } },
              orderBy: { dueAt: 'asc' },
              limit: 50,
            },
          },
          {
            input: 'tasks with no assignee in Open projects',
            callArgs: { where: { assigneeId: null, project: { status: 'Open' } }, limit: 100 },
          },
        ],
        compositionSensitive: { minGroupSize: 5 },
        ceilings: { bytesScanned: 50_000_000, wallclockMs: 3_000 },
      },
    })
    .input(plannerQuerySchema) // zod — see guardrails below
    .query(async ({ input, ctx }) => {
      /* ... */
    }),
})
```

**Guardrails baked into `plannerQuerySchema`:**

- **Field whitelist.** `select` may only include declared-safe columns. Private fields (internal IDs, PII, financial) never appear in the whitelist. Drift test: every whitelisted field must have a CODEOWNERS sign-off tag.
- **Filter operator whitelist.** `=`, `!=`, `<`, `<=`, `>`, `>=`, `IN`, `NOT IN`, `LIKE '%...%'`. No raw expressions, no `OR` across unrelated fields, no subqueries.
- **Row ceiling.** `limit` max 500, default 50. Cannot be overridden by input.
- **Join ceiling.** Joins only to domain-local tables (planner → planner). Cross-domain joins require tier 3.
- **`compositionSensitive.minGroupSize` enforcement.** For aggregate queries (`count`, `sum`, `avg`), the domain implementation applies k-anonymity: any bucket with fewer than `minGroupSize` rows is dropped or merged into "Other."
- **Bytes-scanned ceiling** per query via the gateway's `ceilings` (§7). Enforced by issuing `EXPLAIN (FORMAT JSON)` first; if estimated rows × avg row size > ceiling, return a distinct error to the model ("query too expensive — refine filters").
- **RLS enforces everything** underneath. The structured query tool runs against tenant-scoped tables; the `app.tenant_id` session GUC is set by middleware. No row from another tenant is reachable.

**Declaration on the sub-agent:**

```ts
toolScope: {
  domains: ['planner'],
  structuredQueryEnabled: true,        // includes planner.query in the menu
  roleFilter: 'inherit-caller',
},
```

Sub-agents opt in. By default `structuredQueryEnabled: false` — the curated tool surface is all they see.

### 14.3 Tier 3 — Analyst escape hatch (v1.5)

**Deferred per spec §16**, but the architecture is pinned here so Phase 7 doesn't accidentally make it harder.

**Shape.** `analyst.query({ sql, params })` — parameterized SQL, read-only, route-gated by `canDo('agent.analyst')`.

**Stack of guardrails** (defense in depth):

1. **Read-only Postgres role** at the connection level. `ALTER ROLE analyst_agent SET default_transaction_read_only = on;` Revoke all INSERT/UPDATE/DELETE/TRUNCATE. Even if the LLM generates a write statement, the DB refuses.
2. **Read replica only.** Separate physical replica; no contention on primary; writes are physically impossible from this path.
3. **Schema allowlist at the role level.** The `analyst_agent` role sees only a dedicated `analytics` schema containing **views**, not raw tables. Raw tables are `GRANT`-denied at the Postgres level.
4. **Per-role views with column + row filtering.** Views like `analytics.manager_view_tasks`, `analytics.ic_view_projects` — each selects only safe columns, applies RLS predicates (`WHERE tenant_id = current_setting('app.tenant_id')`), and bakes in k-anonymity on aggregates (`HAVING count(*) >= 5`). View definitions are code-reviewed like schemas.
5. **Parameterized SQL only.** Tool input:

   ```ts
   analyst.query({
     sql: 'SELECT project_id, count(*) FROM analytics.manager_view_tasks WHERE status = $1 GROUP BY project_id HAVING count(*) >= $2',
     params: ['Open', 5],
   })
   ```

   The LLM is forbidden from concatenating strings into `sql`; zod validates that `sql` contains `$n` placeholders matching `params.length` and contains no `;`, no `--`, no multi-statement markers.

6. **Explain-before-execute.** Gateway runs `EXPLAIN (FORMAT JSON, BUFFERS false)` on every tier-3 query before dispatching. Rejects with distinct error if estimated cost > threshold OR estimated rows > 10,000.
7. **Hard timeout.** `SET statement_timeout = '5s'; SET work_mem = '64MB';` at session level. A runaway query dies, not the app.
8. **100% trace capture.** Every tier-3 invocation fires `analyst_query_executed` in trace metadata — not sampled at 1%. Langfuse retention rule keeps them indefinitely.
9. **Audit event shape.** `agent.analyst_query_executed` with `{ tenant_id, caller_user_id, trace_id, sql_template_hash, params, row_count, duration_ms, bytes_scanned }`. The SQL template is hashed for audit deduplication; params are kept in the clear (they're already audit-loggable).
10. **Route-gated in the router.** `analyst` sub-agent only visible when `canDo('agent.analyst')` and the query was not resolvable by tier-1 or tier-2 tools. Default off for most roles.

**What tier 3 does NOT grant:** write access (role-prevented), cross-tenant access (RLS + view predicate), PII access (view column whitelist), or aggregate-disclosure attacks (k-anonymity in views). Tier 3 is strictly "more expressive READ," not "more privileged."

### 14.4 Tier 4 — MCP external sources (v1.5+)

**Rationale.** Some data legitimately lives outside your Postgres — company wiki, Confluence, Notion, Salesforce, Google Drive. Rebuilding those as curated tools is impractical. MCP is the industry-standard protocol for exposing external tools to agents (now Linux-Foundation-owned).

**Shape.** Tenant admin registers an MCP server URL in `web-admin` → server capabilities discovered and registered under `agent.external.<server_id>.<tool>` permissions → granted to roles per tenant policy.

**Critical invariants (security posture):**

- **Gateway wraps every MCP call identically to tRPC calls.** Permission check, audit event, abort check, taint handling. MCP tools are not a backdoor — they ride the same rails.
- **Taint-by-default.** External tool output is treated as `tenantAuthoredFreeText` unless the MCP server marks specific fields as structured-safe. A wiki search result that contains _"ignore previous instructions"_ doesn't reach the prompt unwrapped.
- **Admin-approved registration.** Tenant admins register MCP servers through a curated flow in `web-admin`. Self-service would create a DoS vector (malicious MCP server slowing every turn) and an exfiltration vector (data leaks through attacker-controlled MCP).
- **Rate limit per MCP server.** Separate from per-user rate limits. A misbehaving server cannot starve the agent for other tenants.
- **Permission separation.** `agent.external.*` is a distinct permission class; role authors grant it explicitly, not by default.
- **Read-only classification.** For v1.5 launch, only MCP `read` tools are enabled. MCP `write` tools require a second explicit admin grant (`agent.external.<server>.writes-allowed`) and route through the same §10 approval flow. No unattended external writes.
- **Payload size ceiling.** MCP responses capped at 100KB or configurable — the LLM doesn't consume a 50MB PDF dump.

**Not a Phase 1 deliverable.** v1 surface is tRPC `.meta({ agent })` only. Tier 4 enters in a dedicated phase after v1.

### 14.5 How the router picks a tier

The router's `planSchema` includes a `selectedTier` field per sub-agent directive:

```ts
const planSchema = z.object({
  phase1: z
    .array(
      z.object({
        subAgent: subAgentKeySchema,
        directive: directiveSchema,
        selectedTier: z.enum(['curated', 'structured-query', 'analyst']),
      }),
    )
    .max(3),
  phase2: z
    .object({
      /* ... */
    })
    .optional(),
  disambiguate: z.object({ question: z.string() }).optional(),
})
```

Router prompt guidance (excerpt):

```
When a user question matches a curated tool's whenToUse, pick 'curated'.
When the question is a filter combination inside one domain that no curated tool covers, pick 'structured-query' for that domain's sub-agent.
When the question requires cross-domain joins or SQL-expressive filtering, AND the caller has 'agent.analyst', route the analyst sub-agent with 'analyst'.
When external data is needed (wiki, Confluence), route a sub-agent with 'curated' and menu including external MCP tools (if enabled for the tenant).
```

**Escalation path.** If tier-2 returns `escalation_hint: { needs_info: 'requires cross-domain join' }`, the router's one-bounded re-plan may escalate to tier-3 (if the caller has `agent.analyst`). If still no fit, disambiguation question back to the user.

### 14.6 UX — what the user sees

- **Tier 1 / 2 transparent.** Message stream feels identical. Phase stepper shows domain names, not tier.
- **Tier 3 visible.** _"Running a custom analysis — may take a few seconds"_ progress message. Optionally shows the parameterized template (not the values) for transparency. Dev mode exposes the full query + explain output via deep-link.
- **Tier 4 cited.** External MCP results cite the source (_"from Confluence: …"_) and carry the taint wrapper visibly if the field is free-text. Operators can tell at a glance when an answer traversed the external boundary.

### 14.7 Phase alignment

- **Phase 3** ships tier 2 (structured query tools on planner, people, projects) alongside the router.
- **Phase 7 (post-v1)** ships tier 3 (analyst escape hatch) and tier 4 (MCP ingestion). Not blocking Phase 1–6; architectural hooks are present so adding them does not retrofit the gateway.

---

## 15. Context compaction

Compaction is **split by scope.** The spec's §6 γ window is cross-turn; in-turn compaction inside a single ReAct loop is not in the spec and ships as an AI SDK built-in.

**In-turn (within one sub-agent's ReAct loop):**

- Use AI SDK v7 `pruneMessages()` inside `prepareStep` callback to drop older reasoning and intermediate tool calls as the message array grows.
- Default pruning: `toolCalls: 'before-last-2-messages'`, `reasoning: 'before-last-message'`, `emptyMessages: 'remove'`. Preserve the last two tool exchanges verbatim; summarize older ones if the sub-agent exceeds ~15 messages.
- Heavy tool results (large table rows) get per-result compression in `prepareStep` — keep schema + row count + representative rows; drop the full payload from prior iterations.

```ts
// sub-agent-runner.service.ts (sketch)
const agent = new ToolLoopAgent({
  model,
  tools,
  stopWhen: stepCountIs(cfg.budgets.maxIterations),
  prepareStep: async ({ messages, stepNumber }) => {
    const pruned = pruneMessages({
      messages,
      reasoning: 'before-last-message',
      toolCalls: 'before-last-2-messages',
      emptyMessages: 'remove',
    });
    if (pruned.length > 15) {
      const summary = await nanoSummarize(pruned.slice(0, -6), tenantId);
      return { messages: [pruned[0], { role: 'system', content: `[prior context]\n${summary}` }, ...pruned.slice(-6)] };
    }
    return { messages: pruned };
  },
  experimental_telemetry: { isEnabled: true, metadata: {...} },
});
```

**Provider-side compaction (belt-and-suspenders):**

- **Anthropic:** `providerOptions.anthropic.contextManagement` — native context management, already wired in `@ai-sdk/anthropic`. Enable for sub-agents that may run hot with large tool outputs.
- **OpenAI:** [server-side compaction (Feb 2026)](https://developers.openai.com/api/docs/guides/compaction) via Responses API. Enable when `@ai-sdk/openai` exposes it (tracked in vercel/ai#12486).

**Cross-turn (conversation):**

Unchanged from spec §6 — γ window (3 verbatim + 10 compressed + rolling summary) for global chat, α for inline. Computed post-turn by async nano summarizer via pg-boss (`cross-turn-summary.worker`).

**Never compact:** taint-tripped tool results within the same turn until taint is consumed by the synthesizer. Compacting away the taint source erases the audit chain.

**Phase:** in-turn ships in Phase 1 alongside `SubAgentRunner`. Cross-turn summary worker is already in Phase 3.

---

## 16. Knowledge retrieval (RAG) — deferred, not blocked

**Scope statement:** planner / people / projects sub-agents have **no RAG requirement**. Domain data is structured; answers come from tools, not retrieval.

**Spec §5 softening (proposal for a follow-up PR on `agent-runtime.md`):** the current language _"vector indexes shared across tenants are a cross-tenant leak vector"_ is weaker than the kernel invariant would enforce. Industry consensus in 2026 (Timescale, Nile, AWS Aurora, pgvector guide) is that **single shared table + `tenant_id` column + RLS + HNSW** is the multi-tenant RAG pattern that matches your existing invariants exactly. Recommend softening §5 to: _"No embeddings in v1 — recency + L3 suffice for expected session lengths. FAQ / policy / onboarding-doc RAG is out of scope for v1 but is not architecturally blocked; a tenant-scoped pgvector table with RLS fits the existing multi-tenant invariants."_

**When RAG enters the stack (v1.5+ sketch):**

| Decision             | Pick                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Extension            | `pgvector` on existing Postgres                                                                                   |
| Schema               | `admin` (owns the corpus)                                                                                         |
| Table                | `admin.knowledge_chunk(tenant_id, doc_id, chunk_id, content, embedding vector(1536), metadata jsonb, updated_at)` |
| Index                | HNSW on `embedding` with `WHERE tenant_id = current_setting('app.tenant_id')` via RLS                             |
| Isolation            | `tenant_id` column + `relforcerowsecurity=true` (existing pattern per CLAUDE.md)                                  |
| Embedding model      | `text-embedding-3-small` (already in stack)                                                                       |
| Chunking             | Markdown-aware, 500–800 tokens, 50-token overlap                                                                  |
| Admin sub-agent tool | `admin.knowledge.search({ query, topK })` — read-only, respects RLS                                               |
| Cost guard           | Per-tenant daily embed budget; reindex throttled                                                                  |

**Non-goals remain:** no embeddings over L2 conversation history (spec §5 stands on this — L2 has no k-anonymity model, per Tenet #8). RAG is for authored corpora, not conversation recall.

---

## 17. Caching layers

Seven layers, each with an explicit invalidation rule. Previously scattered; pinned here so the surface is reviewable.

| #   | Layer                      | Scope                             | Key                                                        | Invalidation                                        | Location                               | Phase |
| --- | -------------------------- | --------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | -------------------------------------- | ----- |
| 1   | **OpenAI prompt cache**    | 5-min TTL at provider             | Prefix match on stable content                             | Automatic; passive                                  | N/A — rely on §8 ordering              | P1    |
| 2   | **Anthropic prompt cache** | Persistent while ref'd            | Explicit `cacheControl: { type: 'ephemeral' }` breakpoints | On content change                                   | Set on system + tool catalog blocks    | P1    |
| 3   | **`narrative_store`**      | Persistent                        | `(tenant_id, role_id) → content_hash → content`            | On role change; old hash remains for replay         | `agents.narrative_store` + index table | P1    |
| 4   | **`prompt_store`**         | Persistent                        | `(tenant_id, content_hash) → content`                      | **Never** (append-only by construction)             | `agents.prompt_store`                  | P1    |
| 5   | **L1 read cache**          | Turn-scoped                       | `(tool_name, args_canonical_hash) → result`                | On same-domain mutation in same sub-agent; turn-end | Request-scoped NestJS provider         | P1    |
| 6   | **Tool catalog cache**     | Boot + per (tenant, role, screen) | Menu-scoping output                                        | 5-min TTL OR on `tool_meta_version` bump            | In-memory + version watcher            | P1    |
| 7   | **Compiled prompt cache**  | Per (sub_agent_key, version)      | System prompt rendered with stable tenant context          | On config version bump                              | In-memory, boot-warmed                 | P1    |

**Anthropic `cacheControl` matters.** Unlike OpenAI's opaque 5-min cache, Anthropic's prompt cache requires explicit breakpoint markers and pays up to 90% off cached tokens. For any sub-agent using a Claude model, mark the system prompt and static tool catalog as ephemeral. Without the markers, cache hit rate is ~zero.

**Cross-cache consistency:** a `tool_meta_version` bump invalidates tool catalog cache (#6) and evicts any compiled prompt (#7) whose tool catalog slice no longer matches. Narrative/prompt stores (#3/#4) are hash-keyed so they do not require invalidation — old hashes remain reachable for replay even after new content supersedes them.

---

## 18. Guardrails

Guardrails split by layer: **structural defenses ship Phase 1–2** (they _are_ the security boundary); **content moderation ships Phase 6** alongside cost control and eval CI.

**18.1 Structural defenses — Phase 1–2 (the defense you can't buy)**

Taint model (§2), structural prompt delimiters (§8), gateway `canDo` + RLS, `tenantAuthoredFreeText` delimiter wrapping + trace redaction, approval-required drafts on tainted turns, zod-validated synthesizer output shapes (§9), zod-validated tool inputs via AI SDK `tool({ inputSchema })`. These cover prompt-injection-shaped attacks, unauthorized-write abuse, and hallucinated-structure responses. Part of runtime core; not gated on a moderation ship.

**18.2 Content moderation port — Phase 6**

```ts
// application/guardrails/moderation.port.ts
export interface OutputModerator {
  check(
    text: string,
    direction: 'input' | 'output',
  ): Promise<{ flagged: boolean; categories: string[]; provider: string }>
}
```

Port lives in `domain/ports/`. Adapters live in `infrastructure/moderation/`. Port-based abstraction means replacing OpenAI Moderation with Llama Guard in v1.5 is a routing change via the AI Gateway, not a code change in the orchestrator.

**18.3 Phase 6 adapter: `OpenAIModerationAdapter`**

- One HTTP call per direction per turn: **input pre-router**, **output pre-stream-complete**. Stateless, sub-100ms, free.
- Results cached by content hash within a turn.
- Categories covered: hate, violence, sexual, self-harm.

**Flow integration:**

- **Input flagged** → `turn.ended.reason = 'moderation'`, refusal event with distinct reason, no router invocation, audit event, trace tag `refused: moderation`.
- **Output flagged** → synthesizer output replaced with safe fallback; audit event; stream already released is labeled for operators only (not user-visible).
- No persistent strikes counter. Users rephrase; next turn runs cleanly.

**18.4 v1.5 upgrade path — Llama Guard / Lakera Guard**

- Add `LlamaGuardAdapter` implementing `OutputModerator`. Host behind the AI Gateway so swapping per-tenant is a routing change, not a code change.
- Feature flag per tenant selects adapter. Test on one tenant before broadening rollout.
- Gated on observed abuse data from v1 — not speculative infrastructure.

**18.5 Explicit non-goals (Tenets #8, #9)**

- **No intent detection** — agents do not attempt to classify "is this user trying to misuse the system?" Intent detection is unwinnable at this layer (Tenet #9). Infrastructure defense is observability + rate limiting.
- **No composition-disclosure detection** — k-anonymity / small-group suppression is a tool-authoring responsibility (Tenet #8), enforced at the domain via `compositionSensitive` declarations; the runtime does not attempt to detect composed-disclosure attacks in real time.
- **No DSL-based guardrail framework** — NeMo Guardrails (Colang) and Guardrails AI (Python) add a dependency axis and do not materially beat zod + OpenAI Moderation for this stack. Revisit only if observed abuse data demonstrates a gap zod + moderation cannot close.

**18.6 Why Phase 6, not Phase 1, for content moderation**

Structural defenses (§18.1) are the security boundary and must be in Phase 1. OpenAI Moderation is one HTTP call per direction — cheap to add when "production hardening" is already being built in Phase 6, trivial to retrofit if abuse data arrives earlier. Shipping Llama Guard in Phase 6 would trade 3 weeks of model-hosting infra for 85% of what OpenAI Moderation already delivers. Defer model-based moderation until production data justifies it.

---

## 19. Inter-agent communication

This section formalizes the patterns the spec already implies, documents the deliberate non-supports, and sketches the v1.5+ expansion surface.

**19.1 Internal topology — the supervisor pattern**

The spec's Router → ≤3 sub-agents → optional Phase 2 → Synthesizer is the **supervisor pattern** (2026 industry-standard term for what LangGraph, OpenAI Agents SDK, LlamaIndex, and the AI SDK v7 workflow patterns all converge on). Compared to alternatives:

| Pattern                                                 | Used here?                | Reason                                                                                                                                                                                               |
| ------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supervisor (router-mediated)**                        | **Yes**                   | Central audit, bounded topology, analyzable security boundary. Matches §3 two-phase bounded invariant.                                                                                               |
| **Dynamic handoff (agents pick peers at runtime)**      | **No**                    | Unbounded topology; router loses authoritative plan view; audit trail fragments. Violates §3.                                                                                                        |
| **Peer-to-peer (phase-1 sub-agents talking directly)**  | **No**                    | Would leak one sub-agent's context into another, violating §3 sanitization contract. If a real cross-sub-agent data dependency exists, the answer is Phase 2 with sanitized handoff, not peer calls. |
| **Swarm / self-organizing**                             | **No**                    | Same as dynamic handoff + no central planner for ambiguity resolution.                                                                                                                               |
| **Hierarchical (sub-agents with their own sub-agents)** | **No in v1, not blocked** | Would re-introduce the planning depth that §3's two-phase bound explicitly caps. Revisit only if router-accuracy regression data suggests necessity.                                                 |

The industry-observed failure modes of dynamic / swarm topologies — context drift, re-asking for resolved info, fragmented audit — are precisely what the spec's supervisor-with-sanitized-handoff structure was designed to avoid.

**19.2 Handoff contract — typed, not freeform**

The router-to-sub-agent handoff is a strictly typed payload, never concatenated prose:

```ts
// directive.schema.ts (shared)
export const directiveSchema = z.object({
  goal: z.string(),
  constraints: z.array(z.string()),
  expected_output_shape: shapeSchema,
  quote: z.string(), // router-selected narrow slice of user utterance
})

// sub-agent-result.schema.ts (shared)
export const subAgentResultSchema = z.object({
  summary: z.string(),
  semantics: z.string(),
  confidence: z.enum(['high', 'med', 'low']),
  source_tool_provenance: z.array(toolCallSchema),
  escalation_hint: z
    .object({
      // NEW — see §19.4
      needs_domain: z.string().optional(),
      needs_info: z.string().optional(),
    })
    .optional(),
})
```

Industry practice (LangGraph "typed state channels", OpenAI Agents SDK "handoff tools") validates this design: typed handoff + reducer is materially more reliable than freeform message-passing.

**Why `quote` is a narrow slice, not the raw utterance:** raw user input is a prompt-injection surface. A full-text forward lets a ticket comment embedded in an earlier turn reach a sub-agent that would otherwise never see it. The router controls the slice; sanitization becomes authorship rather than filtering.

**19.3 Inter-phase sanitization — a reducer, not a pipe**

Phase-1 results fan into the synthesizer; Phase-2 input is derived from Phase-1 output. Both paths run through `projectToSchema()`, which is a **pure field-drop reducer** over zod schemas. No value transformation. No coercion. Mismatch → one re-plan, then disambiguation.

This matches LangGraph's reducer pattern but narrower by construction: you cannot write a reducer that invents fields or rewrites values, because the function is pure field-drop only. The surface area for "creative" merges that leak data is zero.

**Synthesizer as a weighted reducer:** the synthesizer is itself a reducer over sibling sub-agent results — its job is to merge `SubAgentResult[]` into a single shaped answer. Cross-sibling semantic divergence demotes confidence (§7), never promotes. Contradictions render as definitional clarity (§9), never as "disagreement."

**19.4 Escalation hint (new minor enhancement)**

Current spec: a sub-agent that concludes it cannot satisfy the directive signals via the `sub-agent-returns-empty-handoff` observability signal (§12). This is a router-accuracy dashboard input, not a runtime re-plan input.

**Addition:** sub-agents may include an optional `escalation_hint` in their result. Fields:

- `needs_domain` — the domain whose tools would be needed to complete the directive (e.g., `'people'` when planner sub-agent realizes it needs a user-id resolution).
- `needs_info` — a freeform description of what's missing.

**Runtime use:** when Phase-1 includes an `escalation_hint`, the router's one-bounded-replan opportunity (§3) may use the hint to compose the Phase-2 sub-agent selection and directive. This is cheaper than blindly disambiguating back to the user. If still unresolved after one re-plan, disambiguation fires as today.

**Boundary:** the hint is **advisory**, not directive. Router retains planning authority; sub-agents cannot force cross-domain calls. Preserves the supervisor pattern.

**19.5 Agent Card — formalize for future A2A compatibility**

The `defineSubAgent` config **is** an agent card in A2A terms. In Phase 1 ship a serializer:

```ts
// application/sub-agents/base/serialize-agent-card.ts
export function serializeAgentCard(cfg: SubAgentConfig): AgentCard {
  return {
    name: cfg.key,
    domain: cfg.domain,
    version: cfg.version,
    capabilities: describeTools(cfg.toolScope),
    inputModes: ['application/json+directive/v1'],
    outputModes: ['application/json+sub-agent-result/v1'],
    constraints: {
      maxIterations: cfg.budgets.maxIterations,
      costUsd: cfg.budgets.costUsd,
    },
  }
}
```

**Not exposed publicly in v1.** Emitted to Langfuse trace metadata + logged at boot. This buys: (a) an audit-friendly capability surface for security review, (b) a cheap path to [A2A protocol v1.0](https://a2a-protocol.org/latest/) compatibility later — expose `/.well-known/agent-card.json` off `apps/api` when cross-org agent integration becomes a requirement (not in v1 scope).

**19.6 MCP tool ingestion — v1.5 seam**

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is now Linux Foundation-owned and increasingly the standard for exposing external tools to agents. AI SDK v7 has first-class MCP client support.

**Not in v1.** Your tool surface is tRPC `.meta({ agent })` — internal, typed, permission-colocated. MCP ingestion would add external tools that do not go through your `canDo`/RLS/audit chain; that is a security-posture expansion requiring explicit policy. Not a v1 concern.

**v1.5+ seam:** if MCP ingestion is added, it must route through the same `ToolGateway` — wrapped, audited, `canDo`-gated against a new `agent.external.<server>.<tool>` permission class. External tools never bypass the gateway.

**19.7 Outbound A2A — not in v1**

Exposing sub-agents to external orgs via A2A (partner agents calling YOUR planner agent) is a product decision, not a runtime decision. When that becomes a requirement: the Agent Card serializer (§19.5) + an A2A HTTP/JSON-RPC endpoint off `apps/api` wired to the same `TurnOrchestrator`. Still gated by `canDo`, tenant-scoped, audited. No runtime rewrite required.

**19.8 Mapping to AI SDK v7 primitives**

Concretely how this design renders in AI SDK v7 code, confirmed against [v7 subagents doc](https://ai-sdk.dev/v7/docs/agents/subagents), [v7 workflow patterns](https://ai-sdk.dev/v7/docs/agents/workflows), and [v7 memory](https://ai-sdk.dev/v7/docs/agents/memory).

- **No dedicated `Subagent` class in v7.** Per the v7 subagents doc: _"subagents are regular agents invoked through tools."_ Each of our sub-agents is a `ToolLoopAgent` instance parametrized by its `SubAgentConfig`. The router does not invoke them as tool calls (see next bullet), but the underlying primitive is the same one the docs describe.
- **`toModelOutput` maps directly to sanitized-summary.** V7's subagent-as-tool pattern uses `toModelOutput` to decouple what the user sees from what the model consumes — _"the subagent might use 100,000 tokens exploring and reasoning, but the main agent only consumes the summary."_ This is spec §3 sanitization in AI SDK terminology. Phase 2 and the synthesizer consume `projectToSchema()` output; the effect is identical to `toModelOutput` at the subagent-as-tool boundary.
- **Router is a classifier, not a `ToolLoopAgent` with subagent tools.** The v7 doc demonstrates a pattern where a parent agent holds subagent tools and the ReAct loop picks them dynamically. We deliberately **do not** use this pattern for the router because:
  1. Dynamic subagent selection inside a ReAct loop cannot enforce the §3 two-phase bounded invariant at the type level — a ReAct loop is free to invoke a fourth sub-agent call in a fifth step.
  2. An explicit `planSchema` output from `generateText({ output: ... })` gives us a structured plan we can audit, attach to the trace, and feed to the PhaseExecutor deterministically. The LLM decides _which_ sub-agents; the code decides _how many_ and _in what shape_.
  3. Cost: a classifier is one LLM call; a ToolLoopAgent-as-router is potentially many. For the router step, the extra expressiveness doesn't pay.
- **`WorkflowAgent` not used** — rejected in §1.
- **No native memory providers used** — rejected in §1. Memory stays custom on Postgres + RLS.

---

## 20. Success criteria (v1 exit)

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
