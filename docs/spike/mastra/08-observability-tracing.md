# Key 8 — Observability / Tracing

**Mastra area:** `packages/core/src/observability/`, `observability/mastra/src/` (default instance + exporter base + span processors), `observability/langfuse/src/`
**Our design area:** `agent-runtime.md` §12 (Observability)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### Single `ObservabilityInstance` owns: exporters + span processors + bridge + sampler

The orchestration surface for tracing is `ObservabilityInstanceConfig` (`packages/core/src/observability/types/core.ts:394-450`). A single config carries: `serviceName`, `sampling`, `exporters[]`, `spanOutputProcessors[]`, `bridge` (for OTel), `excludeSpanTypes`, `spanFilter`, `requestContextKeys`, `serializationOptions`. Everything plugs into that one struct.

The top-level `Observability` class (`observability/mastra/src/default.ts:47-147`) holds a **registry** of named instances selected per-request via a `ConfigSelector(requestContext) => instanceName` function. Two concrete implementations ship: `DefaultObservabilityInstance` and `BaseObservabilityInstance`.

### Span taxonomy — `SpanType` enum (26 values) + `EntityType` enum (12 values)

**`SpanType`** (`packages/core/src/observability/types/tracing.ts:34-85`) — the **shape** of a span:

```
AGENT_RUN, SCORER_RUN, SCORER_STEP, GENERIC,
MODEL_GENERATION, MODEL_STEP, MODEL_CHUNK,
MCP_TOOL_CALL, TOOL_CALL, PROCESSOR_RUN,
WORKFLOW_RUN, WORKFLOW_STEP, WORKFLOW_CONDITIONAL,
WORKFLOW_CONDITIONAL_EVAL, WORKFLOW_PARALLEL,
WORKFLOW_LOOP, WORKFLOW_SLEEP, WORKFLOW_WAIT_EVENT,
MEMORY_OPERATION, WORKSPACE_ACTION,
RAG_INGESTION, RAG_EMBEDDING, RAG_VECTOR_OPERATION,
RAG_ACTION, GRAPH_ACTION
```

Each has a typed attribute interface via `SpanTypeMap` (`tracing.ts:566-592`), e.g. `ModelGenerationAttributes` carries `model`, `provider`, `usage: UsageStats` (with `inputDetails` / `outputDetails` cacheRead/cacheWrite/audio/image token breakdowns — `tracing.ts:153-191`), `resultType: 'tool_selection' | 'response_generation' | 'reasoning' | 'planning'`, `parameters` (temperature, topP…), `streaming`, `finishReason`, `completionStartTime` (TTFT), `responseModel`, `responseId`.

**`EntityType`** (`packages/_internal-core/src/storage/domains/shared.ts:4-29`) — **what produced** the span:

```
AGENT, SCORER, RAG_INGESTION, TRAJECTORY,
INPUT_PROCESSOR, INPUT_STEP_PROCESSOR,
OUTPUT_PROCESSOR, OUTPUT_STEP_PROCESSOR,
WORKFLOW_STEP, TOOL, WORKFLOW_RUN, MEMORY
```

Same span type can be produced by different entities (e.g., a `PROCESSOR_RUN` span comes from either `INPUT_PROCESSOR` or `OUTPUT_PROCESSOR`). `CorrelationContext` (`core.ts:40-73`) then captures the full hierarchy: `entityType` / `entityId` / `entityName` / `entityVersionId` plus `parentEntity*` and `rootEntity*` — so you can query "all tool spans under any agent named `recruiter`" without tree-walking.

**No first-class router/sub-agent span type.** Mastra doesn't know about multi-agent topologies. The closest analog is `AGENT_RUN` (nested via parent/child). Planning vs synthesis is only distinguished via `ModelGenerationAttributes.resultType`.

### Sampling — polymorphic `SamplingStrategy` discriminated union

`packages/core/src/observability/types/core.ts:332-354`:

```typescript
export enum SamplingStrategyType {
  ALWAYS,
  NEVER,
  RATIO,
  CUSTOM,
}

export type SamplingStrategy =
  | { type: ALWAYS }
  | { type: NEVER }
  | { type: RATIO; probability: number }
  | { type: CUSTOM; sampler: (options?: CustomSamplerOptions) => boolean }

export interface CustomSamplerOptions {
  requestContext?: RequestContext
  metadata?: Record<string, any>
}
```

Evaluated in `observability/mastra/src/instances/base.ts:458-482`. Critical property: **sampling decision is made once at the root span and inherited by all children** (`base.ts:158-225`). If the root is not sampled, `new NoOpSpan(...)` is returned; every child of a NoOpSpan is also NoOp. Trace-level atomicity is the fix for [mastra issue #11504](https://github.com/mastra-ai/mastra/issues/11504) — the change history confirms this was not always the case.

`ConfigSelector` (`core.ts:482-485`) composes above sampling: pick the instance first (per request context), then that instance's sampler decides. The custom sampler has **read access to `RequestContext` and arbitrary `metadata`** — exactly the hook needed for "stratify by error / approval / ceiling-hit".

### PII / redaction — `SpanOutputProcessor` pipeline, pre-export

**Three independent cleanup layers**, all run before `ObservabilityExporter.onTracingEvent`:

1. **`excludeSpanTypes: SpanType[]`** — drop by type before processors (`instances/base.ts:594`). Use for cost control, e.g. drop `MODEL_CHUNK` / `MODEL_STEP`.
2. **`spanOutputProcessors: SpanOutputProcessor[]`** — in-place mutation of `attributes`, `metadata`, `input`, `output`, `errorInfo` (`instances/base.ts:567-582`). Processors are **mutating**, not pure; errors per-processor are caught and logged, pipeline continues.
3. **`spanFilter: (exportedSpan) => boolean`** — final yes/no on the serialized `ExportedSpan` (`instances/base.ts:600-608`). On filter **error** the span is **kept**, not dropped — explicit "fail open to avoid silent data loss" comment.

The canonical processor implementation is **`SensitiveDataFilter`** (`observability/mastra/src/span_processors/sensitive-data-filter.ts:46-222`). It's not a PII scanner — it's a **key-name filter** with key-normalization (`api-key` → `apikey`, `Api Key` → `apikey`) and an exact-match list: `password, token, secret, key, apikey, auth, authorization, bearer, bearertoken, jwt, credential, clientsecret, privatekey, refresh, ssn`. Values are redacted `full` (replace with `[REDACTED]`) or `partial` (keep 3 chars front/back). It deep-walks into objects/arrays, handles circular refs, and even parses string values that look like JSON to redact inside them (`sensitive-data-filter.ts:98-142, 180-197`).

**What this does not cover** (important for our spec):

- **Free text** — user messages, LLM outputs, tool result previews are untouched. There is no "this field came from a user, so redact with high sensitivity" concept — that's all on the tenant app.
- **Dedicated user-utterance/tenant-free-text bucketing** — none. Input/output on a span is opaque to the filter unless key-names inside it match.
- **Per-tenant GDPR purge-by-user-id** — none. Spans are shipped to exporters and mastra forgets them.

There is also a blunt trace-level switch: `TracingOptions.hideInput` / `hideOutput` (`tracing.ts:1170-1180`) — if set at the root, every span in the trace sets `exportedSpan.input = undefined` / `output = undefined` (`spans/base.ts:371-387`). All-or-nothing, not field-level.

### Context propagation — `TracingContext` threaded through parameters (+ AsyncLocalStorage as an escape hatch)

Primary surface (`tracing.ts:1192-1195`):

```typescript
export interface TracingContext {
  currentSpan?: AnySpan
}
```

Every tool, processor, agent method receives `{ tracingContext }` in options and calls `tracingContext.currentSpan.createChildSpan(...)`. The `context.ts:45-92` Proxy wrapping pattern auto-injects `tracingContext` into `agent.generate()` / `workflow.execute()` / `run.start()` so users don't have to thread it manually — it's still parameter-based, just hidden behind a Proxy.

**AsyncLocalStorage exists but is secondary** — `packages/core/src/observability/context-storage.ts:11-101` uses `AsyncLocalStorage<AnySpan>` only so **infrastructure code that cannot accept parameters** (the DualLogger, auto-instrumented HTTP/DB under an OTel bridge) can resolve the current span. The public API is parameter-based; the ALS is a read-only resolver for background chores. Explicit comment at `context-storage.ts:6-11`: _"Populated by executeWithContext/executeWithContextSync so that infrastructure code (e.g. DualLogger) can resolve the active span without being passed it explicitly."_

### Exporter plugin model — `ObservabilityExporter` interface + event-bus dispatch

`ObservabilityExporter` (`core.ts:527-565`) is tiny:

```typescript
interface ObservabilityExporter extends ObservabilityEvents {
  name: string;
  init?(options: InitExporterOptions): void;
  onTracingEvent?(event: TracingEvent): void | Promise<void>;
  exportTracingEvent(event: TracingEvent): Promise<void>;
  addScoreToTrace?(...): Promise<void>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}
```

Events are `SPAN_STARTED | SPAN_UPDATED | SPAN_ENDED` carrying the serialized `ExportedSpan`. An exporter subscribes to the observability bus; the instance calls `getSpanForExport()` (processors + filter) first and forwards the cleaned event to every registered exporter. Multiple exporters are supported in parallel — there's no "primary vs secondary" hierarchy.

**First-party exporters** in `observability/`:

- `mastra` (DefaultExporter — writes to Mastra storage; CloudExporter — Mastra cloud)
- `langfuse`, `langsmith`, `braintrust`, `arize`, `arthur`, `datadog`, `laminar`, `posthog`, `sentry`
- `otel-exporter` (generic OTLP), `otel-bridge` (two-way OpenTelemetry integration)
- `clickhouse-design` (in progress)

The **`BaseExporter`** (`observability/mastra/src/exporters/base.ts:84-260`) provides: logger injection, disabled-state gating (`setDisabled(reason)` when creds are missing — the exporter keeps running but returns early on events — see `observability/langfuse/src/tracing.ts:58-74`), and `customSpanFormatter` hook (an **async-capable** transform run per-event just before `_exportTracingEvent`, `base.ts:166-184`). Formatters are **exporter-local, post-processor** — the pattern is: global redaction in `spanOutputProcessors`, then vendor-specific reshaping in `customSpanFormatter`.

**Langfuse exporter specifics** (`observability/langfuse/src/tracing.ts`):

- Wraps `@langfuse/otel` span processor; the **Mastra span is converted to an OTel span first** by `SpanConverter` (shared infra from `@mastra/otel-exporter`) and then handed to `LangfuseSpanProcessor.onEnd(otelSpan)`.
- `mapMastraToLangfuseAttributes` (`tracing.ts:208-309`) does **attribute key rewriting** so Langfuse's UI reads them: `mastra.metadata.userId` → `user.id`, `mastra.metadata.sessionId` (or `threadId`) → `session.id`, `mastra.tags` → `langfuse.trace.tags`, `mastra.completion_start_time` → `langfuse.observation.completion_start_time`, etc. The Langfuse observation-prompt-linking (`langfuse.observation.prompt.name`) is derived from a nested metadata object.
- Supports `realtime` mode (flush each event) vs batched, configurable `flushAt` / `flushInterval`, and per-trace `environment` / `release` tags.

### Cross-system correlation — OTel-compatible `traceId` on the span + persisted record fields

`BaseSpan.traceId` is a 32-hex-char OTel-compatible ID (`tracing.ts:622`). Every span in a tree shares it. On export it propagates to the OTel span, which is what Langfuse groups by.

`TracingOptions.traceId` / `parentSpanId` (`tracing.ts:1154-1163`) allow a caller to **join an existing trace** — e.g. nested workflows that should appear under an outer trace's span. The `ObservabilityBridge.createSpan()` hook (`core.ts:605-609`) exists so an OTel bridge can **override the span's traceId/spanId with its own**, enabling co-mingled traces with auto-instrumented HTTP/DB.

**Where correlation stops**: mastra does **not** stamp `traceId` into any non-span persistence path. Memory writes, queue jobs, DB audit rows carry no trace ID. The `spanContextFields` Zod schema (`packages/_internal-core/src/storage/domains/shared.ts:263-266`) shows the observability-record shape — `traceId`, `spanId`, plus all the `entity*`/`user*`/`session*` IDs — but this is only persisted on observability-owned tables. The fact that tracing-adjacent storage tables (`scores`, `feedback`, `metrics`) all carry `traceId` + `spanId` tells us mastra **does** care about grep-across-observability-tables, just not across application tables.

### Per-layer attributes captured (vs what we spec)

Mastra captures on span attributes (see `tracing.ts:101-562`):

- **Model spans**: `model`, `provider`, `resultType`, `usage` (+ cache tokens, audio/image, reasoning tokens), `parameters`, `streaming`, `finishReason`, `completionStartTime` (TTFT!), `responseModel`, `responseId`, `serverAddress`, `serverPort`.
- **Agent run**: `conversationId`, `instructions`, `prompt`, `availableTools: string[]`, `maxSteps`, `resolvedVersionId`, `tripwireAbort` block.
- **Tool/MCP**: `toolType`, `toolDescription`, `success`, `mcpServer`, `serverVersion`.
- **Processor**: `processorExecutor`, `processorIndex`, `messageListMutations[]` (type + count + message ids added/removed), `tripwireAbort`.
- **Memory**: `operationType`, `messageCount`, `embeddingTokens`, `semanticRecallEnabled`, `vectorResultCount`, `workingMemoryEnabled`, `lastMessages`.
- **Workflow conditional/loop/parallel**: condition counts + truthy indexes + selected steps + concurrency.
- **Tenancy/correlation (via `CorrelationContext`)**: `userId`, `organizationId`, `resourceId`, `threadId`, `sessionId`, `runId`, `requestId`, `environment`, `serviceName`, `experimentId`, `tags[]`.
- **Entity versioning**: `entityVersionId`, `parentEntityVersionId`, `rootEntityVersionId` — exactly the "version string" hook we want for prompt/catalog version pinning.

**No content-hash attributes** (`router_prompt_hash`, `sub_agent_prompt_hash`, `tool_catalog_hash`, `permission_narrative_hash`). Closest thing is `resolvedVersionId` and `entityVersionId` — version strings, not content hashes. A trace in mastra tells you _which prompt ID_ ran; ours would tell you _which exact bytes_ ran — a stronger invariant for regression hunting.

### `TraceState` — trace-wide shared state

`tracing.ts:1125-1140`: `TraceState = { requestContextKeys: string[], hideInput?, hideOutput? }`. Computed once at root, inherited by every child (`base.ts:177-192`). The `requestContextKeys` are applied to **every span in the trace** as attributes, pulled out of the `RequestContext` via dot-notation paths (`'user.id'`, `'session.data.experimentId'`). This is how tenant IDs propagate uniformly — not by "stamp tenant_id on every span manually" but by saying once "every span in this trace should snapshot these RequestContext keys."

---

## 2. What this tells us

1. **Our span taxonomy is smaller but richer per layer.** Mastra has 26 span types; we plan 7-8 core ones (router / sub-agent / tool / synthesizer / phase-2 / final, plus memory / RAG when they land). But mastra has _no first-class concept for our router → sub-agent → phase-2-synthesizer pipeline_ — `AGENT_RUN` is too generic. We should define our own enum that **names these layers explicitly** rather than re-using a generic `AGENT_RUN`, because the single most useful filter ("show me all sub-agent plan spans for tenant X last 24h") depends on the span type carrying semantic layer meaning. The mastra `resultType: 'tool_selection' | 'response_generation' | 'reasoning' | 'planning'` enum on model spans is a cheaper hack; it's a hint, not a type.

2. **`EntityType` is a separate dimension from span type — adopt this.** Same `TOOL_CALL` span can carry `entityType: TOOL | entity: MCP_TOOL`; same `PROCESSOR_RUN` span can carry `entityType: INPUT_PROCESSOR | OUTPUT_PROCESSOR`. Mapping this onto our design: a single `SUB_AGENT_PLAN` span type carries an `entityType: RECRUITING_AGENT | TIME_AGENT | HIRING_AGENT` attribute. This makes dashboard queries cheap (filter by entity) without multiplying span types.

3. **`SamplingStrategy` polymorphic discriminated-union with `CUSTOM` is the right shape for our stratified capture.** Our spec says "1% baseline + 100% on triggers (error, taint flipped, approval required, ceiling hit, amplification)". This is exactly a `CUSTOM` sampler with access to `RequestContext` + `metadata`. The key mastra lesson is **the sampling decision must be made once at the root and inherited** — otherwise a trace ends up half-sampled and the span tree is broken. We should lift this invariant explicitly into our spec.

4. **Sampling composes with instance-selection.** Mastra's two-layer model — `ConfigSelector(requestContext) → instance` then `instance.sampling → boolean` — is elegant when you want per-tenant sampling rates. We don't need this right now (one Langfuse instance), but it's a cheap design for later: a tenant in a premium tier could get 5% baseline vs 1% for others by selecting a different instance. Flag for §14 tier-aware routing.

5. **Our PII strategy is stronger than mastra's — by design.** Mastra's `SensitiveDataFilter` is a key-name allowlist, which assumes "sensitive fields are named sensitively." This works for `api_key` but fails for "user said their SSN in a chat message." Our spec redacts **by origin** (tenantAuthoredFreeText is always redacted pre-capture, regardless of field name). The correct frame: mastra's filter is a _defense in depth_ we should also ship, but the _primary_ redaction is origin-based. Also: mastra's `hideInput`/`hideOutput` flags are a blunt all-or-nothing trace-level switch; our per-field discipline is the right level of granularity.

6. **`spanOutputProcessors` is the extension point for pre-capture redaction.** The processor interface is `process(span: AnySpan): AnySpan | undefined` — runs in-process, pre-export. A `TenantFreeTextRedactor` implementing this interface plugs in cleanly. Our redaction logic belongs in a processor, not in every span-creation call site. The mastra pattern of "processors mutate, errors are caught per-processor, pipeline continues" is a good safety net — one buggy redactor should not take down tracing.

7. **Mastra does not stamp `traceId` on non-observability rows. Confirmed our §12 advantage.** The observability-owned tables (`scores`, `feedback`, `metrics`) carry `traceId` + `spanId`, but nothing in application code does. Our `agent_message.trace_id` + kernel audit `trace_id` + pg-boss job `trace_id` is strictly more powerful for production debugging: **one grep, any table**. This validates the spec's "one UUID at router entry" design.

8. **`TraceState.requestContextKeys` is how mastra avoids having to stamp tenant_id manually on every span.** We should do the same: set `tenant_id` / `trace_id` / `user_id` / `delegation_id` once in a middleware-equivalent, declare them as `requestContextKeys`, and have the span infrastructure auto-stamp them. Saves a hundred `span.attribute('tenant_id', ctx.tenantId)` call sites.

9. **Exporter plugin model is genuinely pluggable — but we shouldn't abstract prematurely.** Fourteen first-party exporters exist in mastra because it's a library. We're committed to Langfuse. Writing our own `LangfuseExporter` directly (without a generic `ObservabilityExporter` interface) is fine for v1. If we hit "need to swap for Phoenix / OpenInference / self-hosted OTel collector," the mastra-style interface is the fallback.

10. **`customSpanFormatter` is the right seam for Langfuse-specific attribute remapping.** Mastra's `mapMastraToLangfuseAttributes` function (key rewriting: `user.id`, `session.id`, prompt linking) is exactly the plumbing we'll need. Copy the pattern, but do it once in our own Langfuse adapter rather than rolling a plugin framework.

11. **TTFT (`completionStartTime`) is a first-class attribute we are missing.** For streaming responses, time-to-first-token is the user-perceived latency metric. Mastra captures it on `ModelGenerationAttributes.completionStartTime`. We should add it to our router/sub-agent/synthesizer model spans — it's free data on any streaming SDK.

12. **Cache-token usage breakdown is a cost-tracking hook we should capture.** `UsageStats.inputDetails.cacheRead` / `cacheWrite` (`tracing.ts:153-164`) — Anthropic's prompt-caching ships reduced-cost cache-hit tokens, and if we don't capture the breakdown we can't tell a 10k-token prompt-cache-hit from a 10k-token fresh prompt. This matters for our cost dashboards under §12. Today our attribute list doesn't distinguish them.

---

## 3. Proposed edits to agent-runtime.md

### Edit 1 — §12, name the span types explicitly as an enum

Today §12 says "Spans: router plan, each sub-agent plan, each tool call …". Promote to a proper enum.

> **Span-type enum (closed set).** Every span in the system has a type drawn from:
>
> | SpanType              | When emitted                                     | Parent                            |
> | --------------------- | ------------------------------------------------ | --------------------------------- |
> | `TURN`                | Router entry — root of the trace.                | —                                 |
> | `ROUTER_PLAN`         | Router LLM call that picks sub-agents / tools.   | `TURN`                            |
> | `SUB_AGENT_PLAN`      | Sub-agent's planning LLM call.                   | `TURN`                            |
> | `SUB_AGENT_SYNTHESIS` | Sub-agent's own synthesis call within its slice. | `SUB_AGENT_PLAN`                  |
> | `TOOL_CALL`           | Single tool invocation (any depth).              | `ROUTER_PLAN` \| `SUB_AGENT_PLAN` |
> | `PHASE_2`             | Second-pass LLM call after phase-1 gather.       | `TURN`                            |
> | `SYNTHESIZER`         | Final cross-agent synthesizer LLM call.          | `TURN`                            |
> | `FINAL`               | Closing span — ties off the turn.                | `TURN`                            |
>
> Parallel to span type, each span also carries an `entity_type` attribute (`recruiting_agent` | `time_agent` | `hiring_agent` | `planner_agent` | …) so "all spans produced by agent X" is a cheap filter without multiplying types.
>
> Prior art: mastra's 26-type enum (`SpanType` in `@mastra/core/observability`) is finer-grained than we need today because mastra does not have a first-class router/sub-agent/synthesizer concept and has to lean on generic `AGENT_RUN` + `ModelGenerationAttributes.resultType`. We name our layers.

### Edit 2 — §12, lift the sampling strategy into a typed shape

> **Sampler type (polymorphic).** Sampling is a discriminated union:
>
> ```typescript
> type SamplingStrategy =
>   | { type: 'always' }
>   | { type: 'never' }
>   | { type: 'ratio'; probability: number } // 0..1
>   | { type: 'trigger'; probability: number; triggers: TriggerPredicate[] }
>
> type TriggerPredicate = (ctx: {
>   kind: 'error' | 'taint_flipped' | 'approval_required' | 'ceiling_hit' | 'amplification'
>   tenantId: string
>   requestContext: RequestContext
> }) => boolean
> ```
>
> Our v1 baseline is `{ type: 'trigger', probability: 0.01, triggers: [anyOfTheAbove] }`. The root span evaluates the sampler once; every child span inherits the decision. Half-sampled traces are a bug. Prior art: mastra issue [#11504](https://github.com/mastra-ai/mastra/issues/11504) documents the regression this invariant closes.

### Edit 3 — §12, pre-capture redaction pipeline

Currently §12 has "PII redaction at capture, not query: pre-capture hook redacts `tenantAuthoredFreeText` fields + user-utterance purge-by-user-id." Formalize:

> **Pre-capture redaction pipeline.** Before any span reaches the Langfuse exporter, it passes through an ordered pipeline:
>
> 1. **`excludeSpanTypes`** — drop by type (e.g., `MODEL_CHUNK` / `MODEL_STEP` on streaming LLM calls — keeps costs sane).
> 2. **Span processors (mutating, ordered)**:
>    - **`TenantFreeTextRedactor`** — any field originating from tenant-authored free text (user messages, tenant-edited prompts, tool-result text previews from tenant data) is replaced with `{ redacted: true, hash, bytes, origin }`. Origin is the load-bearing signal; field name is not.
>    - **`KeyNameFilter`** — defense-in-depth, redact by key name (`token`, `secret`, `api_key`, etc.). Adopted from mastra's `SensitiveDataFilter`, not the primary defense.
>    - **`TraceIdStamper`** — no-op if `trace_id` already on span attributes; else stamp from `RequestContext`.
> 3. **`spanFilter`** — final yes/no on the exported span. On filter error the span is kept (fail-open). Used for last-ditch "don't export this".
>
> **Fail-per-processor, don't fail-pipeline.** A buggy redactor logs and is skipped; the trace still ships with the remaining redaction applied. Silently dropping all traces because one processor threw is worse than shipping partially-redacted ones.
>
> **`hideInput` / `hideOutput` trace-level switches** — for admin / impersonation / password-reset flows where the whole trace is sensitive end-to-end. Set once at the root; every child span auto-drops its input/output payload. Not a replacement for per-field redaction; an emergency brake.

### Edit 4 — §12, per-layer attributes (expanded)

Add to the existing list:

> **Per-span attributes we capture (beyond `tenant_id` / `trace_id`):**
>
> - **Content hashes (every layer)**: `router_prompt_hash`, `sub_agent_prompt_hash`, `permission_narrative_hash`, `tool_catalog_hash`, `identity_capsule_hash`. These are **content hashes**, not version strings — two identical prompt bodies get the same hash regardless of config-table PK. (Version strings sit alongside as `prompt_version_id`.)
> - **Model attrs**: `model`, `provider`, `model_response_id`, `finish_reason`, **`completion_start_time` (TTFT)**, `streaming`, plus the full `UsageStats` object including `input_details.cache_read` / `input_details.cache_write` / `output_details.reasoning`. Cache-hit tokens must be broken out — a 10k-token cache-hit is materially different cost from a 10k-token fresh prompt.
> - **Tool attrs**: `tool_name`, `args_hash`, `result_hash`, `result_preview` (first N chars, post-redaction), `byte_count`, `success`.
> - **Router/sub-agent attrs**: `planned_tool_names: string[]`, `planned_sub_agents: string[]`, `approvals_required: string[]`, `ceiling_hit: boolean`, `taint_flipped: boolean`.
> - **Versioning**: `entity_version_id`, `parent_entity_version_id`, `root_entity_version_id` — already in our version-resolver spec; surface on every span so "all traces on v4 of the recruiter agent" is one filter.
>
> Prior art: mastra's `ModelGenerationAttributes` (`packages/core/src/observability/types/tracing.ts:196-237`) captures TTFT and cache-token breakdown already; we adopt the attribute shapes, not the enum.

### Edit 5 — §12, cross-system correlation invariant (sharpen)

Currently §12 says "`trace_id` (single UUID at router entry, stamped on `agent_message.trace_id`, every kernel audit, Langfuse trace, pg-boss job row)." Add:

> **`trace_id` is stamped on every row in any table touched by this turn.** Specifically: `agent_message.trace_id`, `kernel_audit.trace_id`, `tool_invocation.trace_id`, `pg_boss.job.metadata.trace_id`, `outbox_event.trace_id`, `approval_request.trace_id`. The invariant is "one `trace_id`, grep anywhere." This is explicitly stronger than any library-level span tree — mastra's `traceId` only appears on observability-owned tables (`scores`, `feedback`, `metrics`); application DB rows do not carry it. Our grep-across-application-tables capability is not free-by-library, it's a hard invariant we maintain.

### Edit 6 — §12, exporter boundary + Langfuse attribute remapping

> **Exporter boundary is thin and Langfuse-specific for v1.** The handoff from redacted-span to Langfuse goes via an internal `shipToLangfuse(exportedSpan)` function — not a pluggable `ObservabilityExporter` interface. We are not in the multi-backend business.
>
> The function handles: Mastra-style attribute key remapping (`tenant_id → langfuse.observation.metadata.tenantId`, `trace_id → trace.id`, `user_id → user.id`, `thread_id → session.id`, `prompt_hash → langfuse.observation.prompt.name`), + batched flush (`flushAt: 100` / `flushInterval: 5s`) with `realtime: false`. For approval-required or error traces (high-capture strata), we flip `realtime: true` so they surface in the dashboard within seconds.
>
> Prior art: `observability/langfuse/src/tracing.ts:208-309` `mapMastraToLangfuseAttributes` is exactly this shape; our version ports the pattern, skips the generic `SpanConverter` layer.

### Edit 7 — §12 (or §15.4), auto-stamp context keys on every span

> **`trace_id` / `tenant_id` / `user_id` / `delegation_id` are auto-stamped on every span via `TraceState`.** Set once in the gateway middleware as `requestContextKeys: ['trace_id', 'tenant_id', 'user_id', 'delegation_id']`; the span factory reads them from `RequestContext` on span creation and snapshots them onto span attributes. No call site manually stamps these. Mirrors mastra's `TraceState.requestContextKeys` pattern (`packages/core/src/observability/types/tracing.ts:1125-1140`) — avoids a hundred `span.attr('tenant_id', ctx.tenantId)` call sites and, more importantly, makes "forgot to stamp" impossible.

---

## 4. What we are not borrowing

- **The 26-span-type enum.** Over-fitted to mastra's "anything can be a span" philosophy; we name our pipeline layers and don't emit a `WORKFLOW_SLEEP` span. Revisit when we ship a workflow engine.
- **`customSpanFormatter` as a general mechanism.** Mastra needs it because exporters are pluggable and each vendor has its own attribute dialect. We have one backend; the attribute remapping lives in `shipToLangfuse()` inline. A formatter **interface** is over-abstraction for v1.
- **`SensitiveDataFilter` as our primary redactor.** Key-name-based redaction is defense-in-depth only. The primary defense is origin-based (field came from tenant-authored free text → redact). We port the key-name filter as a secondary layer.
- **`AsyncLocalStorage` as the primary context surface.** Mastra uses parameter-threading as primary and ALS only for infrastructure escape hatches (DualLogger, OTel bridge auto-instrumentation). NestJS has `REQUEST`-scoped DI plus our existing `RlsMiddleware` handles the equivalent; we don't need to introduce ALS for spans. If auto-instrumented HTTP/DB becomes valuable, we re-evaluate — not before.
- **Separate `ObservabilityInstance` registry + `ConfigSelector` per-request.** Useful for "tenant A ships to Langfuse, tenant B to Arize" — not our v1 need (one self-hosted Langfuse cluster). If we add a premium tier with higher sample rates, a selector is a half-day change; YAGNI until then.
- **`MODEL_CHUNK` / `MODEL_STEP` span types.** Mastra emits a span per streaming chunk which is unusable volume for a Langfuse bill. If we need chunk-level observability, capture it as span **events** on the parent `MODEL_GENERATION` span, not as child spans. Mastra even documents `excludeSpanTypes: [MODEL_CHUNK, MODEL_STEP]` as the recommended cost-control move (`core.ts:410-419`) — this is telling.
- **Mastra's `hideInput` / `hideOutput` trace-level switch as the only input/output privacy control.** It's all-or-nothing. We keep it as an emergency brake (admin/reset flows), but per-field origin-based redaction is the primary.

---

## 5. Open questions

- **`trace_id` — OTel-compatible 32-hex-char format, or our UUIDv7?** Mastra uses OTel format (`BaseSpan.traceId`, `tracing.ts:622`) because it bridges to OTel exporters. Langfuse via OTel accepts both? If our `trace_id` is UUIDv7 for grep-convenience in DB, we'd need to convert on export to Langfuse. Decide before wiring Langfuse — format mismatch is a pain to migrate later.
- **Are span-events (child-less spans with `isEvent: true`) the right shape for approval decisions / ceiling-hit signals, vs a real child span?** Mastra has `createEventSpan()` (`tracing.ts:684`) — a span with a start but no duration. For things like "approval granted at t+300ms" this is cheaper than a full child span. Investigate before we start emitting approval spans.
- **How do we handle trace-joining for async work (pg-boss reminders, GDPR erasure job)?** Mastra's `TracingOptions.traceId` + `parentSpanId` (`tracing.ts:1154-1163`) lets a new execution join an existing trace, but the trace in Langfuse must still be "open" (unshipped). For async work hours/days later, we likely want a _new_ trace with a `parent_trace_id` attribute link — not a child span. Define the convention.
- **Custom-span-formatter async vs sync?** Mastra explicitly supports async (`CustomSpanFormatter = (span) => Span | Promise<Span>`, `tracing.ts:1288`). If we need DB lookups during export (unlikely — everything interesting is on the span already), this matters. Probably never async for us. Note as non-goal.
- **Trace retention in Langfuse vs DB audit.** Mastra has no opinion. We do: Langfuse is a debugging tool (default 90-day retention? 30?); the kernel `tool_invocation` audit + `agent_message` are our durable record. Document the split explicitly in §12 — otherwise someone will try to query Langfuse for a compliance audit two years later.
- **`entity_version_id` vs content-hash dual-tracking.** Mastra only has version IDs. We want both — the ID for "roll back to this config" and the hash for "these exact bytes ran." Is the hash redundant if the version-ID → prompt-body mapping is immutable? Yes **if** we enforce content-addressed prompt storage. Easy to get wrong. Align with the prompt store (Plan 01) before finalizing.

---

## Status

- **Applied to agent-runtime.md:** none yet. All edits above are pending.
