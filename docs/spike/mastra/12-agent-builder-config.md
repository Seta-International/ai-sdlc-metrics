# Key 12 — Agent Builder / Declarative Config

**Mastra area:** `packages/core/src/agent/` (runtime `Agent` class + config types), `packages/core/src/mastra/index.ts` (registry), `packages/agent-builder/` (codegen package — **name is misleading**, not the declaration surface)
**Our design area:** `agent-runtime.md` §3 ("Sub-agent declaration site"), §6 (memory binding), §7 (tool scope), §17 (authoring tenet)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### The `agent-builder` package is a codegen/template-merge tool, not a declaration DSL

A plausible-looking name trap. `/Users/canh/Projects/Seta/mastra/packages/agent-builder/src/index.ts:1-3` re-exports `./agent`, `./workflows`, `./defaults`. `src/types.ts:10-32` defines `AgentBuilderConfig` with fields `model`, `storage`, `vectorProvider`, `tools`, `instructions`, **`projectPath`**, `summaryModel`, `mode: 'template' | 'code-editor'`. The rest of `src/types.ts:65-310` is manifest / merge-plan / validation schemas for cloning template repos, merging units (mcp-server, tool, workflow, agent, integration), and running codegen validation.

The actual declarative surface is the core `Agent` constructor. `agent-builder` is "LLM-powered Mastra-project scaffolder" — analogous to `create-next-app`, not to our `defineSubAgent`.

### `AgentConfig` — single flat shape, ~20 fields, everything `DynamicArgument<T>`

`packages/core/src/agent/types.ts:151-414` defines `AgentConfig<TAgentId, TTools, TOutput, TRequestContext>`. Required: `id`, `name`, `instructions`, `model`. Optional (relevant): `description`, `tools`, `workflows`, `agents` (sub-agents), `memory`, `scorers`, `inputProcessors`, `outputProcessors`, `errorProcessors`, `maxProcessorRetries`, `voice`, `browser`, `workspace`, `channels`, `skillsFormat`, `backgroundTasks`, `defaultGenerateOptions`, `defaultStreamOptions`, `defaultNetworkOptions`, `maxRetries`, `requestContextSchema`, `rawConfig`, `options.tracingPolicy`.

Nearly every meaningful field is `DynamicArgument<T, TRequestContext>`, defined at `packages/core/src/types/dynamic-argument.ts:4-12`:

```typescript
export type DynamicArgument<T, TRequestContext extends ... = unknown> =
  | T
  | (({ requestContext, mastra }) => Promise<T> | T);
```

So `instructions`, `model`, `tools`, `workflows`, `agents`, `memory`, `scorers`, `inputProcessors`, `outputProcessors`, `errorProcessors`, `workspace`, `defaultOptions`, `defaultNetworkOptions` can all be **either a static value or a function that receives `requestContext` + `mastra` and returns the value per-invocation**. Construction does not resolve them; they are resolved on demand by `getInstructions()` / `listTools()` / `listAgents()` / `getMemory()` etc. (`packages/core/src/agent/agent.ts:1265-1293` for instructions, `1553-1582` for tools, `573-603` for agents, `1034-1046` for memory).

### Minimal construction-time validation

`packages/core/src/agent/agent.ts:225-363` is the constructor. Validation is limited to:

- `config.model` is required — throws `AGENT_CONSTRUCTOR_MODEL_REQUIRED` (lines 238-250).
- If `model` is an array, non-empty — throws `AGENT_CONSTRUCTOR_MODEL_ARRAY_EMPTY` (lines 252-266).

Everything else is permissive — `config.tools || ({} as TTools)`, `config.agents || ({} as Record<string, Agent>)`, optional memory / processors / workspace / browser are assigned as-is. **No zod validation of the config shape itself at construction.** TypeScript is the only compile-time guard. All correctness is deferred to runtime — empty dynamic returns produce late errors like `AGENT_GET_TOOLS_FUNCTION_EMPTY_RETURN` (`agent.ts:1565-1578`).

### Runtime request-context validation

The one exception: `config.requestContextSchema?: PublicSchema<TRequestContext>` (`types.ts:404-408`), converted to a standard schema at construction (`agent.ts:353-355`) and validated on every `generate()` / `stream()` / `network()` call via `#validateRequestContext` (`agent.ts:533-561`, invoked at lines 5443, 5560). Failure throws `AGENT_REQUEST_CONTEXT_VALIDATION_FAILED` with per-field path + message.

This is the only schema validator baked into the config. There is **no `inputSchema` / `outputSchema` at the agent level** — structured output lives on a per-invocation basis via `structuredOutput: PublicStructuredOutputOptions<OUTPUT>` (`agent.types.ts:622-623`), not on the declaration.

### Sub-agent as opaque tool — input schema is generic, not per-agent

`agent.ts:3146-3188` is the canonical "agent-as-tool" wrapping. For every entry in `listAgents()`, a `createTool` is synthesized with a fixed `agentInputSchema`:

```typescript
const agentInputSchema = z.object({
  prompt: z.string().describe('The prompt to send to the agent'),
  threadId: z.string().nullish()...,
  resourceId: z.string().nullish()...,
  instructions: z.string().nullish().describe('Additional instructions to append...'),
  maxSteps: z.number().min(3).nullish()...,
});
```

And a fixed output schema with `text`, `subAgentThreadId`, `subAgentResourceId`, `subAgentToolResults[]`. The sub-agent receives a **free-text prompt**, not a typed, sanitized payload matching its own domain schema. Per-sub-agent input typing does not exist in mastra's declaration.

### Registry — flat, module-scoped to the `Mastra` root, string-keyed, typed through generics

`packages/core/src/mastra/index.ts:349` declares `#agents: TAgents` where `TAgents extends Record<string, Agent>`. Registration is declarative via `new Mastra({ agents: { weatherAgent: agent1, ... } })` (example at lines 99-107). Constructor at `index.ts:716-734` initializes `#agents = {}` and then iterates `config.agents` registering each.

Lookup: `getAgent(name)` at `index.ts:877-908` (with 404 error when missing — includes the full list of registered names in the error message for quick diagnostics). `getAgentById(id)` at `index.ts:951` searches by the `Agent.id` field, falling back to name lookup.

**No schema-per-tenant, no permission-scoped registry, no module boundaries beyond "one object passed to `new Mastra`".** Sub-agent routing uses the `agents` field **inside an `Agent` config** (`types.ts:314`), which is a nested/local view, and the router agent reads it via `listAgents({ requestContext })` at run time (`agent.ts:573`, and `loop/network/index.ts:132-220` as already covered in `01-orchestrator.md`).

### Tool scope — no first-class `toolScope`, just "what you put in `tools`"

`config.tools?: DynamicArgument<TTools, TRequestContext>` (`types.ts:265`). Whatever you hand the agent is what the LLM sees. Per-invocation override via `activeTools` (`agent.types.ts:486`) and per-invocation add via `toolsets` / `clientTools` (lines 506-508). Tool **permission** is not a first-class concept — an agent has a tool or it doesn't. The closest thing to scope-as-declaration is the dynamic function form: `tools: ({ requestContext }) => scoped[requestContext.get('tier')]`.

Browser + workspace + channels **auto-inject tools** when configured (`agent.ts:430-443` for sub-agent tool derivation, `agent.ts:2581` for browser tools, `agent.ts:2441` for channel tools). "Having a browser" = "agent silently gains browser tools." This is convenient for prototyping, dangerous for an audit-heavy product.

### Memory binding — per-agent instance OR inherited from parent

`config.memory?: DynamicArgument<MastraMemory, TRequestContext>` (`types.ts:323`). Each agent can carry its own Memory instance. `hasOwnMemory()` returns `Boolean(this.#memory)` (`agent.ts:1019`).

Critical delegation behavior at `agent.ts:3295-3308`: when a parent delegates to a sub-agent,

```typescript
if (!resolvedAgent.hasOwnMemory() && this.#memory) {
  resolvedAgent.__setMemory(this.#memory as DynamicArgument<MastraMemory>)
}
```

— the sub-agent **inherits the parent's memory** via mutation of a singleton unless it has its own. There's also a `__fork()` (`agent.ts:2087-2108`) that creates a lightweight clone so version-override branches don't mutate the root. Inheritance-or-dedicated is a binary choice; there are no L1/L2/L3/L4 tiers at declaration time. Memory processors (semantic recall, working memory) live **inside** the Memory instance, not in the agent config — which is why `01-orchestrator.md` already noted mastra's router has to manually strip memory processors to avoid influence.

### Dynamic instructions and `getInstructions({ requestContext })`

`instructions: DynamicArgument<AgentInstructions, TRequestContext>` (`types.ts:173`), resolved at `agent.ts:1265-1293`. The function form is the intended way to build per-tenant / per-tier / per-feature-flag prompts. Mastra additionally uses it inside the **router** to inline live introspection of `listAgents / listWorkflows / listTools` (see `01-orchestrator.md` §1 "Router is itself an Agent, not bespoke code").

There is no prompt-hash / content-addressing. Whatever the function returns is what the LLM receives for that call.

### Versioned agents from stored configs

`agent.ts:172`: `public source?: DefinitionSource` where `DefinitionSource = 'code' | 'stored'` (`packages/core/src/observability/types/core.ts:125`). Stored agents are hydrated from a `rawConfig: Record<string, unknown>` field (`types.ts:401`, preserved at `agent.ts:2090`). `resolveVersionedAgent` at `index.ts` + `agent.ts:3273-3287` lets a per-invocation `requestContext.get(MASTRA_VERSIONS_KEY)` substitute a stored version for a code-defined agent. This is how mastra does blue/green prompt rollouts without redeploying.

### Declarative / imperative mix in practice

Memory, tools, processors are **declaratively attached** (fields on `AgentConfig`). Sub-agents are **declaratively attached** (via `agents` field). But:

- `config.channels` attaches adapters that register themselves with the agent imperatively post-construction (`agent.ts:317-327`).
- `addTool()` on `Mastra` (`index.ts:729-733`) is imperative and called from the constructor.
- `__setMemory`, `__setTools`, `__registerMastra` are `__`-prefixed mutators used by the framework to re-attach primitives in sub-agent delegation paths.

Mostly declarative at user level; extensive internal mutation for wiring.

---

## 2. What this tells us

### Our `defineSubAgent` is **already more typed** than Mastra's agent declaration

We have per-sub-agent `inputSchema` + `outputSchema` + `toolScope` as first-class, validated fields. Mastra has none of that — sub-agent-as-tool has a generic `{ prompt, threadId, resourceId, instructions, maxSteps }` shape across every sub-agent. Their declaration is "strongly typed on TRequestContext, weakly typed on everything else." Ours is the opposite end of the spectrum, which matches our spec's tenet that router→sub-agent handoff is a sanitization boundary, not a prompt passthrough.

**Implication:** §3 is not missing fields from mastra. Mastra is missing fields from §3.

### `DynamicArgument<T, TRequestContext>` is worth stealing for a narrow set of fields — not the whole config

Mastra's dynamic-everything is too loose for our safety posture. But the pattern **does** cleanly solve three problems we have under-specified:

1. **Per-tenant tool scope.** Our `toolScope` today is a static list. Reality: tenant A has the MS 365 Planner adapter enabled, tenant B does not. A static scope forces us to hard-split sub-agents or guard inside handlers. A `toolScope: TenantId → ToolId[]` function resolves at session start, cleanly.
2. **Per-tenant prompt additions.** Today "prompt-as-content-hash" suggests fully-static strings. But tenants will need small additions — their fiscal year start month, their entity name, their approval thresholds. Static concatenation at session start with a versioned scalar (tenant config hash) keeps reproducibility while allowing per-tenant prompts.
3. **Per-tier model selection.** Free-tier users get a smaller model than paid. We need this anyway.

The invariant we must preserve that mastra does not: **resolution is session-scoped, not message-scoped**, so replay (§8) still works — the hash of `(resolved prompt, tool list, input schema, model id)` is what gets stored. Mastra lets dynamic resolution happen per-call, which makes replay non-deterministic unless you capture the resolved values. We should capture-then-pin at session start.

### Prompt-as-content-hash and dynamic instructions can coexist — if we pin at session start

Our current tenet: prompts are content-hashed for replay. Mastra's runtime-computed instructions look incompatible. They aren't, if we split:

- **Static template** with versioned scalar holes (`{{tenant.fiscalYearStart}}`, `{{tenant.entityName}}`).
- **Resolution at session start**, producing the final prompt string.
- **Hash the resolved string** and stamp the session with that hash.

The hash is still content-addressed; the template is still reviewable; tenant-specific values are still replayable because session records pin the resolved hash. We get Mastra's flexibility without losing our audit story.

### Construction-time validation in Mastra is essentially absent — we should go the other way

Mastra's config is a TS interface with two runtime checks (model present, model array non-empty). Everything else is late-bound. This is appropriate for a framework that serves a wide range of applications and can't assume much. **We are not that framework.** We know every sub-agent must:

1. Declare a non-empty `toolScope` resolvable against the tRPC registry.
2. Declare an `inputSchema` that is a strict subset of the §9 phase-1 output shape.
3. Bind to exactly one `domain` from a closed enum.
4. Have a `prompt` that is non-empty and resolves to a non-empty string.

All four of these can fail **at module registration time, not at first call**. Mastra's late-binding is a misfeature for us — we can and should validate synchronously at `defineSubAgent()` invocation, with a separate runtime validator only for the resolved dynamic values.

### Mastra's generic "sub-agent is a tool with `{ prompt }`" confirms our sanitizer is load-bearing

Their handoff surface is literally a free-text prompt field (`agent.ts:3151`). Any caller LLM can write anything there. Sub-agent receives it directly. This is exactly the surface our §4 sanitizer is designed to prevent. If we adopt any of mastra's flexibility, we must not adopt this. Our `defineSubAgent.inputSchema` + the phase-1→phase-2 projection remains the sanitization boundary; the router's "plan" emits typed fields, not a prompt string.

### Their memory-inheritance-via-mutation pattern argues for explicit memory binding in our declaration

`agent.ts:3305-3306` mutates the sub-agent's memory pointer when delegating. This works for mastra because their memory model is singular ("one MastraMemory per run"). Our L1-L4 binding is richer, and we have §6 memory windowing decisions that depend on **which tier a sub-agent reads**. Explicit per-sub-agent memory binding (which tiers it may read, which it may write) belongs on `defineSubAgent` as an explicit field, not left to inheritance. We should not adopt the implicit-inheritance model.

### Registry discovery: module-scoped registration file (our direction) beats flat global (theirs)

Mastra has one `Mastra` object with one `agents: { ... }` map. Keys are arbitrary strings. Nothing prevents two different developers from picking `timesheet` as the key and silently colliding. We have schemas-per-module; we should have registries-per-module too, with `key` namespaced by domain (`timesheet/*`, `hiring/*`) and a root aggregator that fails loudly on collision.

### Version-override propagation via `requestContext` is a good pattern — already aligned with our direction

`MASTRA_VERSIONS_KEY` flowing through `requestContext` (`agent.ts:3273-3287`) lets a single call override one sub-agent's version without redeploy. This is the staging/rollout mechanism we will need for prompt iteration. `rawConfig` + `source: 'code' | 'stored'` + per-invocation overrides is the right decomposition. Our §3 does not currently say anything about this; it probably should — as a §3.x "declaration can be code-defined or stored; stored overrides resolve per request."

---

## 3. Proposed edits to agent-runtime.md §3

### Add fields to `defineSubAgent(config)`

The spec currently lists: `key`, `domain`, `prompt`, `inputSchema`, `outputSchema`, `toolScope`, `budgets`. Additions with reasoning:

1. **`description: string`** — short single-line human-readable purpose statement. Currently implicit. Mastra's router prompt generation (`loop/network/index.ts:132-220`, per `01-orchestrator.md`) uses `agent.getDescription()` as the "what this sub-agent is for" line the planner reads. Our router prompt auto-generation (already pending §3 edit from `01-orchestrator.md`) will need the same. Reason: without it the router prompt either omits purpose or synthesizes it from the `prompt` field, which is fragile.

2. **`whenToUse: string`** — selection hint, distinct from `description`. Mastra conflates these (`description` doubles as selection hint). Separating them gives the router prompt a dedicated "select this sub-agent when …" line and keeps `description` as human docs. Reason: router accuracy improves measurably when "what it is" and "when to pick it" are separate prompt fields.

3. **`memoryScope: { reads: ('L1'|'L2'|'L3'|'L4')[]; writes: ('L1'|'L2'|'L3'|'L4')[] }`** — which memory tiers this sub-agent may read from and write to, declared at registration. Mastra's implicit inheritance (`agent.ts:3305-3306`) is not safe for us; explicit per-tier binding is. Reason: §6 memory windowing needs per-sub-agent tier access to be declared, not derived from code inspection. Drift test: assert that a sub-agent that calls an L4 read tool declares `reads: includes 'L4'`.

4. **`tenantResolver?: (tenantId) => Partial<Pick<Config, 'toolScope' | 'promptVariables'>>`** — optional, session-start-resolved. Produces the per-tenant additions to `toolScope` and prompt template values. Resolution runs once at session start; resolved values pin into the session record for replay. Reason: static `toolScope` + static `prompt` make multi-tenant config untenable; mastra's fully-dynamic approach breaks replay determinism. Split the difference: declarative template with a session-bound resolver.

5. **`promptTemplate: { body: string; variables: Record<string, z.ZodType> }`** — replaces bare `prompt: string`. `body` is the templated prompt (e.g., `"You are the {{domain}} sub-agent for {{tenant.entityName}}..."`); `variables` is a zod schema for the allowed interpolation vars. Validated at `defineSubAgent()` time: every `{{var}}` in `body` must have a schema entry; resolved at session start against `tenantResolver` output + fixed values. Hash = hash of `(body, variables schema, resolved values)`. Reason: makes the template vs. tenant-value boundary explicit, keeps hash-based replay intact, kills the "how do I put tenant name in the prompt" footgun.

6. **`model?: DynamicArgument<ModelChoice, TenantContext>`** — optional per-sub-agent model override with dynamic resolution. Most sub-agents use the default `gpt-5.4` for reasoning; a few (pure-classification sub-agents) can run on `gpt-5.4-nano`; free-tier might downgrade. Mastra's `DynamicArgument<MastraModelConfig>` is the right shape. Resolve at session start, pin resolved model id into the session record. Reason: model-per-domain is a real cost/latency knob; without declaration, it leaks into handler code.

7. **`source: 'code' | 'stored'`** (read-only, set by the runtime) + **version-override plumbing via request context** — follow mastra's `rawConfig` / `resolveVersionedAgent` / `MASTRA_VERSIONS_KEY` pattern (`agent.ts:3273-3287`, `observability/types/core.ts:125`). Lets us stage prompt changes per-request without redeploy, with audit trail. Reason: prompt iteration velocity is high; all-or-nothing redeploy gating will become a bottleneck. Declarative support from day one beats bolt-on later.

### Naming alignments

- Mastra uses `agents` (plural) for sub-agent slots on an agent. Keep our terminology — `defineSubAgent` and `subAgents` registry — because "agent" in our doc is the primitive type, not a runtime role. Do not rename.
- Mastra uses `description` ambiguously. We should use `description` = human docs, `whenToUse` = router selection hint. Split cleanly.
- Mastra uses `DynamicArgument<T>` everywhere. We should adopt the **type name** (`DynamicArgument<T, TenantContext>`) for the narrow set of fields above, since it communicates the "resolve-at-session-start" contract exactly. Rename our internal TenantContext container to match — `tenantContext` mirrors mastra's `requestContext`.

### Validation split (new subsection under §3)

Add an explicit "Construction-time vs. session-time vs. runtime validation" subsection:

> **Construction-time (at `defineSubAgent()` call):** `key` globally unique; `domain` in closed enum; `prompt` / `promptTemplate.body` non-empty and all `{{vars}}` covered by schema; `inputSchema` strict-subset of §9 phase-1 output shape (TS-enforced); `outputSchema` defined; `toolScope` non-empty; `memoryScope.reads` and `memoryScope.writes` non-empty; `budgets` structurally valid.
>
> **Session-start-time (when router opens a session):** `tenantResolver` executed against the session's tenant; resolved `toolScope` validated against live tRPC registry (every tool id resolvable); resolved `promptTemplate.variables` passed through zod schema; resolved `model` id resolvable; final prompt hash computed and pinned to the session record.
>
> **Runtime (per invocation):** `requestContextSchema` check on handoff payload (already covered by §4 sanitizer).

This is the split mastra does not have — everything they validate is runtime. Making the phases explicit keeps the drift tests (§7) sharp.

### §17 authoring tenet — no change needed, but add registry structure note

Current tenet (proliferation-is-default) is preserved. Add a subpoint:

> **Registry structure.** Each domain module exports its own `subAgents.registry.ts` that collects `defineSubAgent` calls for that module. A root aggregator imports and merges module registries at boot; duplicate `key` across modules is a build error. No global registration side-effects; registry files are pure, importable, typecheckable in isolation. (Contrast: mastra has a single flat `agents: { ... }` map on `new Mastra()` — flat globals scale badly across 13 modules.)

---

## 4. What we are not borrowing

- **Generic sub-agent-as-tool input shape (`{ prompt, threadId, resourceId, instructions, maxSteps }`).** `agent.ts:3146-3188`. Breaks our sanitizer invariant. Per-sub-agent typed `inputSchema` is the whole point of §3.
- **Implicit memory inheritance via mutation** (`agent.ts:3305-3306`). Our L1-L4 story needs explicit declaration (`memoryScope` above). Inheriting a parent's memory by silent pointer-assign is exactly the kind of "works until it doesn't" behavior that breaks audit.
- **Auto-injected tools from `browser` / `workspace` / `channels` config fields.** `agent.ts:2441, 2581`. A tool you did not declare in `toolScope` should not appear in the LLM's tool list. Tool scope is a hard invariant; "having a browser" is not an implicit grant.
- **Per-call-dynamic resolution for `tools` / `instructions` / `model`.** Mastra resolves every call. We resolve once per session and pin. Non-negotiable for replay determinism (§8).
- **Flat global agent registry** (`mastra/index.ts:349`). Module-scoped registry files with a boot-time aggregator beats a single map.
- **The `agent-builder` package itself.** Codegen / template-merge for scaffolding projects. Not in scope for our runtime; if we ever build it, it's a DX tool on top of the runtime, not part of it.
- **`channels: ChannelConfig` as an agent field** (`types.ts:363`). We route through our own surface layer (inline copilots / global chat / async). Channel-adapter-as-agent-field is a coupling we do not need.
- **`voice`, `browser`, `workspace` as agent fields.** Same reason. These are capabilities we bind at the tRPC-tool level, not the sub-agent level.
- **Zero construction-time schema validation.** Mastra defers everything to runtime; we validate at `defineSubAgent()` for everything we can. Late errors are worse than early errors when the declaration is the unit of review.

---

## 5. Open questions

- **`promptTemplate` variables — zod schema or simple `Record<string, string>`?** Zod gives us validation + type inference for free; simple string map is cheaper. Leaning zod because tenant values include numbers (thresholds), dates (fiscal year start), enums (region). Decide when §3 lands.
- **`tenantResolver` — synchronous or async?** Mastra is always async-capable (`Promise<T> | T`). Async means a DB hit at session start. For tenants with cached config, fine. For others, adds latency to first-message TTFT. Leaning "sync-preferred, async-allowed, warn on p95 > 50ms" — but this needs §12 observability sign-off.
- **Model override default — per-sub-agent, per-tenant, or both?** If a sub-agent declares a `model` and a tenant's tier demands a different one, who wins? Leaning: tenant tier is a hard ceiling ("free tier never sees gpt-5.4"), sub-agent preference is a soft choice. Needs a policy rule co-located with `model` field.
- **Versioned-agent overrides — where does the override list live?** Mastra puts it in `requestContext` (`MASTRA_VERSIONS_KEY`). We don't yet have a sanctioned request-context container in the runtime spec. Pick one (proposal: `sessionContext`) and name the key.
- **Cross-module sub-agent visibility.** Does the `hiring` module's router see `timesheet` sub-agents? Today §3 is silent. Default answer: yes — the global registry is domain-indexed but visible to all routers; scoping happens via `toolScope` + `inputSchema`, not via registry partitioning. Confirm before implementing.
- **How do we prevent `tenantResolver` from returning different `toolScope` resolutions for the same session** (imagine a background refresh changing mid-session)? Mastra doesn't address this; per-session pin is our answer, but the implementation has to cache the resolved value for the session lifetime. Minor but worth pinning in implementation doc.
- **Does `defineSubAgent` return a class or a plain object?** Mastra returns an `Agent` class with methods (`listTools`, `getInstructions`, etc.). Our spec is silent; factory-returns-validated-config implies plain object. A class would let us attach `session.openForTenant()` ergonomically. Factory returns `{ config, open(tenantContext): ResolvedSubAgent }` may be the sweet spot. Decide when implementing, not now.
