# Agent Runtime — Phase 1 Design

**Date:** 2026-04-20
**Status:** Brainstorming output. Supersedes `agent-runtime-implementation.md` §12 Phase 1 where they disagree.
**Scope:** End-to-end runtime-foundation slice: gateway, one read-only sub-agent (planner), SSE contract, Langfuse Day 1, security boundary, inside the existing `apps/api/src/modules/agents` module and the existing `packages/agent` frontend package.
**Out of scope:** router, multi-sub-agent, synthesizer shapes, writes/approvals, async, cost metering, canary, eval CI, moderation, replay. Each has a dedicated later phase.

---

## 1. Why this doc exists

The implementation doc's Phase 1 assumes a fresh start (fork Vercel Chatbot into a new `web-chat` zone, build from zero). The codebase has moved past that:

- `packages/agent` was migrated to `@assistant-ui/react` in commit `84374ffe` (4 days before this writing), with panel, thread, composer, inline copilot, ambient components, zustand store, SSE adapter, and tests already in place.
- `apps/api/src/modules/agents` already scaffolds sessions, messages, insights, an early tool executor, an early permission service, MCP auth guard, exposure-contract guard, tool-permission decorator + guard, and Drizzle schema.
- `AgentProvider` is mounted at `apps/web-planner/src/app/layout-client.tsx:29`.

Phase 1 is a **refactor + completion** pass against this codebase — not a greenfield build. This doc pins what the Phase-1 slice looks like after it, following the rule that changes are full refactors (no shims, no legacy aliases, no dual-shape handling — `CLAUDE.md` "No Backward Compatibility").

---

## 2. End-to-end slice

One turn, one sub-agent, one surface:

```
user types in <AgentPanel> mounted in web-planner
  ↓  POST /agent/turn (SSE)
agent-turn controller
  ↓  RunTurnCommand
SubAgentRunner (plannerSubAgent, read-only)
  ↓  ToolGateway.invoke per tool call
  ↓    canDo + RLS + audit + abort-check + taint-flip + shadow-mode flag
  ↓  AI SDK ToolLoopAgent, maxRetries: 0
tokens stream back as SSE answer.token events
trace flushed to Langfuse; kernel audit events written per tool call
```

No router, no synthesizer shape declaration, no writes. The router-plans-code-executes invariant (§3 spec) still holds trivially: Phase 1's "plan" is the constant `{ subAgent: planner }`; phases 2+ replace that constant with a real LLM plan.

---

## 3. Backend module layout

Inside `apps/api/src/modules/agents/`, following hexagonal + DDD layout per `CLAUDE.md`. Refactors are full; no parallel trees.

```
domain/
  ports/
    tool-gateway.port.ts
    stream-broker.port.ts
    prompt-store.port.ts
    narrative-store.port.ts
  value-objects/
    trace-id.ts
    taint.ts
  entities/
    (existing: agent-session, agent-message, agent-insight — kept)

application/
  services/
    tool-gateway.service.ts            — refactor of agent-tool-executor.ts
    sub-agent-runner.service.ts
    context-assembler.service.ts
    sub-agent-registry.service.ts
    project-to-schema.ts               — pure function; sanitization projector
  sub-agents/
    define-sub-agent.ts                — config factory with runtime shape check
    planner.sub-agent.ts               — planner sub-agent config
  commands/
    run-turn.command.ts                — replaces send-message.command
    run-turn.handler.ts
    (existing create-session, dismiss-insight — kept)

infrastructure/
  schema/
    agents.schema.ts                   — extend: prompt_store, narrative_store (conversation, message, insight, L3 already present or extended)
  repositories/
    prompt-store.repo.ts
    narrative-store.repo.ts
    (existing session/message/insight repos — kept)
  telemetry/
    langfuse-wiring.ts                 — registerOTel + LangfuseExporter + redaction
  tool-registry/
    meta-to-ai-sdk-tool.ts
    registry-builder.ts

interface/
  http/
    agent-turn.controller.ts           — POST /agent/turn (SSE)
  trpc/
    (existing session, insight, definition routers — kept; send-message removed)
```

**Removed in this refactor (per no-back-compat rule):** `send-message.command` / `send-message.handler` — replaced by `run-turn` + the SSE endpoint. `AgentToolExecutor` file removed; its contract becomes `ToolGateway`.

---

## 4. Data flow

```
Client: user submits utterance in <AgentPanel>
  ↓ fetch-event-source to POST /agent/turn
  ↓ body: { messages, surface: 'panel', context: { planId? } }
  ↓ httpOnly session cookie carries JWT

Server:
  - session middleware resolves { actorId, tenantId } from JWT
  - RlsMiddleware sets app.tenant_id for the pg request
  - agent-turn.controller:
      * mint trace_id (UUID)
      * open SSE stream
      * emit turn.started { trace_id, conversation_id }
      * dispatch RunTurnCommand
  - RunTurnCommand:
      * load or create agent_session
      * persist user agent_message (role=user, trace_id)
      * ContextAssembler.build(plannerSubAgent, TurnContext, conversation)
      * SubAgentRunner.run(plannerSubAgent, context, streamBroker)
  - SubAgentRunner loop (≤5 iter, ≤15s wallclock, ≤$0.50):
      * LLM call via AI SDK ToolLoopAgent (maxRetries: 0)
      * Langfuse span captures prompt hashes, model id, tokens, cached_tokens
      * LLM emits tokens → streamBroker.answer_token(text)
      * LLM requests tool → ToolGateway.invoke(inv, ctx)
            1. override args.{actorId, tenantId} from ctx
            2. L1 cache lookup (toolName, canonical_json_hash(args))
            3. abort-signal pre-check
            4. AgentPermissionService.checkToolPermission — canDo
            5. shadow-mode branch (dry-run returns typed marker)
            6. procedure invocation via TrpcCaller
            7. abort-signal post-check
            8. kernel audit write (agent.tool_called)
            9. taint flip if result contains declared tenantAuthoredFreeText field
           10. cache write
      * circuit breaker: 2 same-tool failures → disable for rest of run
  - loop exit:
      * emit answer.complete { shape: 'narrative', content, citations: [] }
      * persist assistant agent_message (role=assistant, trace_id)
      * emit turn.ended { reason: 'completed' | 'refused' | 'error' | 'cancelled' | 'ceiling' }
  - Langfuse OTel exporter flushes async; pre-capture redaction strips tenantAuthoredFreeText
```

---

## 5. SSE contract — Phase 1 subset of §15.3

**Full refactor of `packages/agent/src/runtime/sse-event-schema.ts`.** No shim, no back-compat with the existing `answer.delta`.

| Event             | Payload                                                                       | When                    | Ordering                                     |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------- | -------------------------------------------- |
| `turn.started`    | `{ trace_id, conversation_id }`                                               | First, exactly once     | Always first                                 |
| `answer.token`    | `{ text }`                                                                    | Streaming tokens        | Between `turn.started` and `answer.complete` |
| `answer.complete` | `{ shape: 'narrative', content, citations }`                                  | After last token        | Before `turn.ended`                          |
| `refusal.started` | `{ reason }`                                                                  | Model-initiated refusal | Replaces `answer.*` sequence entirely        |
| `turn.ended`      | `{ reason: 'completed' \| 'refused' \| 'error' \| 'cancelled' \| 'ceiling' }` | Last, exactly once      | Always last                                  |

**Not emitted in Phase 1 (wired in later phases):** `phase.started`, `progress`, `answer.shape_declared`, `draft.proposed`.

**Callers updated in the same change:**

- `packages/agent/src/runtime/agent-chat-adapter.ts` — dispatches by new event types (`answer.token` replaces `answer.delta` accumulation logic).
- `packages/agent/src/runtime/agent-turn-store.ts` — zustand reducer rewritten for the new schema.
- All `.spec.ts` siblings updated.
- `packages/agent/src/panel/agent-panel.tsx`, `thread/agent-thread.tsx`, `thread/agent-composer.tsx`, `inline/*`, `ambient/*` — wherever they consume the SSE state.

---

## 6. Core component contracts

### 6.1 `ToolGateway`

```ts
// domain/ports/tool-gateway.port.ts
export interface ToolInvocation<TArgs extends object, TResult> {
  toolName: string
  permission: string
  args: TArgs // LLM-supplied; actorId/tenantId stripped
  procedure: (args: TArgs & CallerIdentity) => Promise<TResult>
  meta: AgentToolMeta // from .meta({ agent })
}

export interface ToolGateway {
  invoke<TArgs extends object, TResult>(
    inv: ToolInvocation<TArgs, TResult>,
    ctx: TurnContext,
  ): Promise<TResult>
}
```

`TurnContext` fields: `traceId`, `actorId`, `tenantId`, `subAgentKey`, `abortSignal`, `taintFlag` (mutable), `l1Cache`, `circuitBreakerState`, `mode: 'execute' | 'dry-run'`.

Pipeline order is load-bearing and each step is independently testable (see §9).

### 6.2 `SubAgentRunner`

```ts
runTurn(
  subAgent: SubAgentConfig,
  ctx: TurnContext,
  broker: StreamBroker,
): Promise<TurnResult>
```

Wraps AI SDK `ToolLoopAgent`. Sets `maxRetries: 0` — retries are the gateway's job (§4 "retry lives at exactly one layer").

Enforces per-sub-agent `budgets` (iterations, wallclock, costUsd). Classifies errors per the Phase-1 subset of §4 (see §7 below). Tracks circuit-breaker state and per-call L1 cache on `ctx`. Drives the stream-broker event sequence.

### 6.3 `ContextAssembler`

```ts
build(
  subAgent: SubAgentConfig,
  ctx: TurnContext,
  conversation: AgentConversation,
): AssembledPrompt
```

Three prompt layers per §8 of the spec:

- **System (stable-first, prompt-cache-friendly):** role, trust tenet, lazy tenant context, generated permission narrative (resolved via `narrative_store` by hash), static filtered tool catalog.
- **Developer/context (turn-stable):** taint narrative — Phase 1 always "no tainted sources in this turn" because reads only; wiring is present for Phase 4 to flip when taint sets.
- **User:** raw user utterance wrapped `<user_message>…</user_message>`.

Phase-1 simplifications: no cross-turn summary (conversation-bound to one turn for Phase 1 demos), no L3 facts (Phase 4), no L4 lazy fetch (Phase 7).

### 6.4 `defineSubAgent` + `SubAgentRegistry` + `plannerSubAgent`

```ts
export interface SubAgentConfig<TI extends z.ZodTypeAny, TO extends z.ZodTypeAny> {
  key: string
  domain: DomainKey
  version: string
  prompt: { system: string; examples: Array<{ input: string; callArgs: Record<string, unknown> }> }
  inputSchema: TI // sanitization target for phase-2; required in Phase 1, unused at runtime
  outputSchema: TO
  toolScope: { domains: DomainKey[]; extraTools?: ToolKey[]; roleFilter: 'inherit-caller' }
  budgets: { maxIterations: number; wallclockMs: number; costUsd: number }
}

export function defineSubAgent<TI, TO>(cfg: SubAgentConfig<TI, TO>): SubAgentConfig<TI, TO> {
  assertSubAgentShape(cfg) // runtime structural validation at boot
  return cfg
}
```

`plannerSubAgent` config: `key: 'planner'`, `domain: 'planner'`, `budgets: { maxIterations: 5, wallclockMs: 15_000, costUsd: 0.5 }`, `toolScope: { domains: ['planner'], roleFilter: 'inherit-caller' }`.

`SubAgentRegistry` is a NestJS provider with boot-time discovery and `getSubAgent(key)`.

### 6.5 Tool registry adapter

```ts
// infrastructure/tool-registry/meta-to-ai-sdk-tool.ts
export function buildAgentTool(procedure: ProcedureMeta): Tool<TArgs, TResult>
```

At boot, walks the tRPC app-router tree, finds procedures with `meta.agent` set, strips `actorId` and `tenantId` from the Zod input schema, and wraps in an AI SDK `tool()` whose `execute` delegates to `ToolGateway.invoke` with the original procedure as the callee.

### 6.6 Prompt + narrative stores

Both Drizzle tables keyed by `content_hash`:

```sql
CREATE TABLE agents.prompt_store (
  content_hash   text PRIMARY KEY,
  layer          text NOT NULL,
  content        text NOT NULL,
  first_seen_at  timestamptz NOT NULL,
  tenant_id      uuid NOT NULL
);
-- RLS: relforcerowsecurity=true; policy on tenant_id = current_setting('app.tenant_id')
-- Append-only by construction (hash collision ≡ content identity)

CREATE TABLE agents.narrative_store (
  content_hash   text PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  role_id        uuid NOT NULL,
  content        text NOT NULL,
  first_seen_at  timestamptz NOT NULL
);
-- Same RLS discipline
```

Writes on first-use from `ContextAssembler`. Each write emits a kernel audit event: `agent.prompt_stored`, `agent.narrative_stored`.

### 6.7 `POST /agent/turn` controller

NestJS `@Controller('agent')` with a single `@Post('turn')` handler. Consumes the existing web-shell session middleware (actorId/tenantId via JWT); `RlsMiddleware` sets `app.tenant_id`. Opens SSE response, pipes stream-broker events to the client, hooks client disconnect to `ctx.abortSignal`.

### 6.8 Langfuse wiring (Day 1)

```ts
// infrastructure/telemetry/langfuse-wiring.ts
registerOTel({
  serviceName: 'future-agents',
  traceExporter: new LangfuseExporter({
    secretKey: env.LANGFUSE_SECRET_KEY,
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
    sampleRate: 1.0, // stratified sampling decided at runtime via tags
  }),
})
```

Every LLM call carries `experimental_telemetry.metadata`:

```ts
{
  tenant_id, trace_id, sub_agent_key,
  system_prompt_hash, permission_narrative_hash, tool_catalog_hash,
  model_id, router_version: 'n/a-phase-1', sub_agent_version, tool_meta_version
}
```

Pre-capture redaction hook strips fields declared in `tenantAuthoredFreeText` from the stored trace payload.

---

## 7. Error classification — Phase 1 subset of §4

| Class             | Source                                                     | Handling                                                                                                                               |
| ----------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Tool validation   | LLM emits wrong arg shape                                  | Return error to model; max 1 retry per call, 2 per turn; counts toward circuit breaker                                                 |
| Permission denied | `AgentPermissionService.checkToolPermission` returns false | Distinct error class; first denial disables the tool for the rest of this sub-agent run (`"not permitted, proceed without"`)           |
| Domain execution  | tRPC procedure throws non-permission error                 | Retry network/timeout only, max 2 with backoff; other errors returned to model as "transient"                                          |
| LLM provider      | Timeout, rate limit, 5xx                                   | Retry with jitter, max 2. Retry lives at gateway only; AI SDK `maxRetries: 0`                                                          |
| Ceiling (turn)    | iteration / wallclock / cost ceiling hit                   | Abort sub-agent; emit `turn.ended { reason: 'ceiling' }`. Partial-answer gate doesn't complicate Phase 1 because no writes are drafted |
| Model refusal     | Model-initiated policy decision                            | Emit `refusal.started`, skip all `answer.*`, emit `turn.ended { reason: 'refused' }`                                                   |

**Circuit breaker:** 2 failures of the same tool within one sub-agent run → disabled for the remainder of that run. Propagates trivially since Phase 1 has no phase-2.

**Deliberately deferred:**

- Taint-driven approval-tier bump (taint is _captured_ Phase 1, _enforced_ Phase 4).
- Per-tool independent ceilings (`.meta({ agent: { ceilings } })`) — Phase 3+.
- Budget error class (Phase 6).
- Composition-amplification sampling trigger — Phase 6.

---

## 8. Planner tool surface

Five tRPC procedures get `.meta({ agent, permission })` added in this phase. All five exist already in `apps/api/src/modules/planner/interface/trpc`:

| Procedure path               | Phase 1 tool name            | Purpose                                                                                                                                               |
| ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `planner.task.getFlat`       | `planner.tasks.getFlat`      | Flat list of tasks in a plan (includes due dates; sub-agent filters overdue client-side)                                                              |
| `planner.task.getDetail`     | `planner.tasks.getDetail`    | One task with relations                                                                                                                               |
| `planner.task.getBoard`      | `planner.tasks.getBoard`     | Bucket-grouped view of a plan                                                                                                                         |
| `planner.personal.listTasks` | `planner.personal.listTasks` | Tasks assigned to an actor (input: `actorId`, `includeCompleted`; no server-side date/overdue filter — sub-agent computes overdue from returned data) |
| `planner.evidence.list`      | `planner.evidence.list`      | Evidence attached to a task                                                                                                                           |

The demo utterance "what's overdue on Plan X?" is served by `planner.task.getFlat(planId)` + client-side overdue filtering inside the sub-agent. No new tRPC procedure is required.

**Existing input shapes accept `actorId` and `tenantId` as user-space parameters.** The gateway overrides these from `ctx` before invoking; LLM-visible Zod schemas strip both fields. Any LLM attempt to inject them is silently overwritten — identity is not a negotiable LLM decision.

**Deliberately not in Phase 1:**

- `tasks.overdueForProject` — "project" belongs to the `projects` module; cross-domain, Phase 3 when the projects sub-agent lands.
- `.meta({ permission })` middleware-retrofit on planner procedures. Planner currently runs permission checks inside handlers (passing `actorId`). Phase 1 does not fix this pre-existing gap; the gateway invokes `AgentPermissionService.checkToolPermission` explicitly before invocation, which is sufficient for the slice. Retrofitting planner to the `.meta({ permission })` pattern the other four modules use is a separate concern.

---

## 9. Testing

Co-located `.spec.ts` files per CLAUDE.md. `≥70%` coverage across lines/functions/branches. Command handlers cover happy path + every error path.

### 9.1 Unit tests (per gateway pipeline step)

Each of the 10 gateway steps has one or more tests:

- LLM-supplied `tenantId` is overridden by `ctx.tenantId`.
- Cache hit skips the procedure entirely.
- Abort pre-check throws before any side effect.
- Permission-denied throws distinct `PermissionDeniedError`, circuit-breaker records it.
- Shadow mode (`dry-run`) returns the marker and skips procedure, audit, and taint.
- Procedure invocation wraps tRPC error in classified gateway error.
- Abort post-check discards the result but still writes a "started but aborted" audit row.
- Kernel audit write fires with full field set (trace_id, tool_name, args_hash, result_hash, byte count, permission key, caller identity).
- Taint flips on declared field; does not flip on undeclared field; does not flip on null value.
- Cache write populates the entry under the canonical-JSON hash.

### 9.2 Unit tests (runner + assembler + registry)

- Each of the 6 Phase-1 error classes drives the correct outcome.
- Circuit breaker disables the tool on the 2nd failure.
- Budget ceilings abort cleanly with `turn.ended { reason: 'ceiling' }`.
- Gateway LLM-retry fires once, then escalates on 2nd failure.
- Abort propagates from controller through runner to in-flight tool call.
- `assertSubAgentShape` rejects malformed configs at boot.
- `plannerSubAgent`'s filtered tool menu matches exactly the 5 declared procedures.
- `ContextAssembler` resolves permission narrative via `narrative_store` by hash (cache hit + miss both covered).
- System-prompt content-hash is stable across turns with identical inputs.
- `narrative_store` first-use write emits `agent.narrative_stored` audit event.

### 9.3 Integration tests (against real DB)

- Full gateway invocation against a real seeded planner tenant, real tRPC procedure, real kernel audit write.
- Cross-tenant seed test: a tool call from tenant A cannot observe tenant B's data (RLS verification).
- `agent.prompt_store` idempotency: two calls with identical content produce exactly one row.
- `POST /agent/turn` end-to-end: user utterance → LLM call → tool call → streamed tokens → `turn.ended`.
- `canDo`-denied tool is surfaced narratively, not as an error state.
- Aborted request produces no audit rows past the abort point.

### 9.4 Frontend tests

- SSE schema round-trip: server emits new event → adapter parses → store reduces → component renders.
- `answer.token` accumulation across many events produces the full text.
- `turn.ended` stops the stream for each `reason`.
- Abort via `AbortController` closes the `fetchEventSource` and emits no further component state changes.

### 9.5 Drift tests (build gate)

- Every `.meta({ agent })` resolves to an existing procedure whose input contains `actorId: uuid` and `tenantId: uuid`.
- Every exposed LLM schema strips `actorId` and `tenantId`.
- `whenToUse`, `whenNotToUse`, `examples` are present on every `.meta({ agent })` (TypeScript-enforced; drift test is a safety net).

---

## 10. Frontend changes (web-planner)

`AgentProvider` is already mounted at `apps/web-planner/src/app/layout-client.tsx:29`. The frontend surface area of Phase 1 is:

1. **Full SSE schema refactor** in `packages/agent/src/runtime/*`. See §5. All `.spec.ts` files updated in the same change.
2. **Point the adapter at the real backend.** `agent-chat-adapter.ts` currently accepts `endpoint` as a prop; the planner layout wires it to `/api/agent/turn` (proxied to `apps/api`).
3. **Mount `<AgentPanel>`** in the planner shell — entry point is a trigger inside the global nav area managed by `@future/app-layout`. The panel already exists and has tests; it was not visible to users because no mount point wires the trigger. Phase 1 wires it.
4. **Update `AgentStateProvider`** if the new `trace_id` and conversation identity need exposing to UI components. Review pending during implementation.

No new zone. No `web-chat` app. `CLAUDE.md` navigation rule: the sidebar is owned by `@future/app-layout`; panel triggers route through it.

---

## 11. Exit criterion

A user in `web-planner`:

1. Clicks the agent trigger, the panel opens, composer is focused.
2. Types "what's overdue on Plan X?" and submits.
3. `turn.started` fires; `answer.token` events stream a narrative answer that cites at least one of the 5 tools.
4. `turn.ended { reason: 'completed' }` closes the stream.
5. Langfuse trace captured with `tenant_id`, `trace_id`, content hashes, `model_id`, `cached_tokens`.
6. Kernel audit events present: one `agent.tool_called` per tool call; `agent.prompt_stored` / `agent.narrative_stored` on first use; all correlated by `trace_id`.
7. Seeded cross-tenant test confirms RLS: same query in tenant B does not observe tenant A's plan.
8. Abort mid-stream: stream closes; no further tool audit rows written past abort.

---

## 12. Deferred to later phases

- Streaming-contract ordering invariants as a type-state machine → Phase 2.
- Synthesizer with 5 shapes + citations + `answer.shape_declared` → Phase 2.
- Router + multi-sub-agent + cross-turn summary + sanitizer + phase-2 → Phase 3.
- Drafts, approvals, execute-approved-draft, permission envelope, L3 memory → Phase 4.
- GDPR erasure + async agents + delegation lifecycle → Phase 5.
- Cost control + canary + eval CI + confidence calibration dashboard → Phase 6.
- Content moderation + replay harness + nightly consistency check → Phase 7.

---

## 13. Open items for implementation planning

- Entry point for the `<AgentPanel>` trigger inside `@future/app-layout` — sidebar rail vs. top-right icon. Decided when writing-plans reviews the existing nav shell.
- Whether `agents.schema.ts` already contains conversation/message tables that match the spec's shape, or whether migrations are needed to align. Verified during writing-plans.
- Whether to take the opportunity to add `.meta({ permission })` to the 5 planner read procedures in this phase, despite the pre-existing gap. Deferred; discussed when writing-plans sizes the planner-module changes.
