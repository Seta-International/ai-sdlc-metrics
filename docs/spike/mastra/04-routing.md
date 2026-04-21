# Key 4 — Routing (router prompt generation, decision shape, delegation mechanics)

**Mastra area:** `packages/core/src/loop/network/index.ts` — `getRoutingAgent`, `routingStep`, `safeParseLLMJson`, `tryGenerateWithJsonFallback`
**Our design area:** `agent-runtime.md` §3 (Runtime Topology — directive schema, ambiguity ladder), §8 (Prompt Architecture — layer composition, directive field semantics), §12 (router-accuracy signals)
**Investigation date:** 2026-04-21

Companion to `01-orchestrator.md`. That file investigated iterative-vs-bounded topology choice at the orchestrator level. This file zooms in on what the **router itself** looks like in mastra: how its prompt is built, how its decision is typed + parsed, and the error-recovery story when the model emits slightly-broken JSON.

---

## 1. How mastra does it

### The router _is_ an `Agent`, not a function

`getRoutingAgent` at `loop/network/index.ts:132-220` constructs a regular `Agent` whose `instructions` are generated from live introspection of the host agent:

```ts
const agentsToUse = await agent.listAgents({ requestContext }) // :144
const workflowsToUse = await agent.listWorkflows({ requestContext }) // :145
const toolsToUse = await agent.listTools({ requestContext }) // :146
```

Three inline string-builders (`agentList`, `workflowList`, `toolList` at `:157-179`) render each primitive as one markdown bullet with its description and JSON-Schema-serialized `inputSchema` (via `schemaToJsonSchema` at `:32-44`). Those three sections are concatenated into one big template-literal system prompt at `:185-207`.

The key property: **the router prompt is a pure function of the registry snapshot at session start.** Drift between what is registered and what the router "knows about" is structurally impossible — they are the same data rendered once.

### The static router instructions (abridged)

`loop/network/index.ts:185-207`:

```
You are a router in a network of specialized AI agents.
Your job is to decide which agent should handle each step of a task.
...
## System Instructions
${instructionsToUse}
You can only pick agents and workflows that are available in the lists below.
Never call any agents or workflows that are not available in the lists below.
## Available Agents in Network
${agentList}
## Available Workflows in Network (make sure to use inputs corresponding to the input schema ...)
${workflowList}
## Available Tools in Network ...
${toolList}
...
When calling a workflow, the prompt should be a JSON value that corresponds to the input schema ...
When calling a tool, the prompt should be a JSON value that corresponds to the input schema ...
When calling an agent, the prompt should be a text value, like you would call an LLM in a chat interface.
Keep in mind that the user only sees the final result of the task.
${additionalInstructionsSection}
```

`additionalInstructions` (line `:181`) is a small tenant/caller-level escape hatch — a free-text string appended after the generated sections. No validation, no schema. Pure "append your prose here."

### Router memory: user processors only, memory processors stripped

`loop/network/index.ts:151-155`:

```ts
// Memory processors (semantic recall, working memory) can interfere with routing decisions,
// but user-configured processors like token limiters should be applied.
const configuredInputProcessors = await agent.listConfiguredInputProcessors(requestContext)
const configuredOutputProcessors = await agent.listConfiguredOutputProcessors(requestContext)
```

And `:678-684` — the routing call itself passes `memory: { ..., options: { readOnly: true, workingMemory: { enabled: false } } }`. The router reads conversation history, but never updates working memory and never triggers semantic-recall tool calls during routing.

### Decision schema — four fields, no directive object

The routing decision is parsed through a Zod v4 structured-output schema at `loop/network/index.ts:665-672`:

```ts
structuredOutput: {
  schema: z.object({
    primitiveId:      z.string().describe('The id of the primitive to be called'),
    primitiveType:    PRIMITIVE_TYPES.describe('The type of the primitive to be called'),
    prompt:           z.string().describe('The json string or text value to be sent to the primitive'),
    selectionReason:  z.string().describe('The reason you picked the primitive'),
  }),
}
```

`PRIMITIVE_TYPES` resolves to `z.enum(['agent', 'workflow', 'tool', 'none'])` (imported at `:26`). "None" is how the router signals "task complete, don't select anything" — checked at `:752`: `const isComplete = object.primitiveId === 'none' && object.primitiveType === 'none';`.

There is **no `finalResult` field in the router's own decision schema.** The earlier comment at `:190` mentions a "finalResult" property, but that refers to the _prompt-message format describing past iteration results_, not to what the router emits. `finalResult` is produced by a separate downstream LLM call in `validation.ts` (`generateFinalResult` at `:374-505`, `generateStructuredFinalResult` at `:529-615`) — these run when the scorer gate closes, not as part of the router step.

So the router emits exactly: `{ primitiveId, primitiveType, prompt, selectionReason }`. That `prompt` is a raw text-or-stringified-JSON the sub-agent receives verbatim as its user message (see `:867`: `{ role: 'user' as const, content: inputData.prompt }`).

### The per-iteration routing message

Separate from the generated system instructions, each routing call gets a fresh assistant-role prompt at `:629-662`:

```
${isOneOff ? 'You are executing just one primitive...' : 'You will be calling just *one* primitive at a time...'}

The user has given you the following task:
${inputData.task}

# Rules:
## Agent:
  - prompt should be a text value, like you would call an LLM in a chat interface.
  - If you are calling the same agent again, make sure to adjust the prompt to be more specific.
## Workflow/Tool:
  - prompt should be a JSON value that corresponds to the input schema...
...
Please select the most appropriate primitive ... If no primitive is appropriate, return "none" for the primitiveId and "none" for the primitiveType.

{
    "primitiveId": string,
    "primitiveType": "agent" | "workflow" | "tool",
    "prompt": string,
    "selectionReason": string
}

The 'selectionReason' property should explain why you picked the primitive${verboseIntrospection ? ', as well as why the other primitives were not picked.' : '.'}
```

The JSON example is inline — redundant with the Zod schema but serves as a few-shot shape anchor. Compare: our §8 says the router's user message is the raw utterance wrapped in `<user_message>`; mastra's router never sees a distinguishable "user message" at the prompt level — the user's utterance is flowed in as the `task` field inside the orchestrator's own message, framed as context for a decision.

### Error recovery — two layers

**Layer 1: `tryGenerateWithJsonFallback`** at `packages/core/src/agent/utils.ts:18-50`:

```ts
try {
  return await agent.generate(prompt, options) // :42 — normal structured-output
} catch (error) {
  console.warn('Error in tryGenerateWithJsonFallback. Attempting fallback.', error)
  return await agent.generate(prompt, {
    ...options,
    structuredOutput: { ...options.structuredOutput, jsonPromptInjection: true }, // :47
  })
}
```

If native structured output fails (provider doesn't support it, or failed the schema), the fallback retries with `jsonPromptInjection: true` — which prepends a system-level "respond as JSON conforming to {schema}" instruction and parses the resulting text. One retry, no third attempt. Called from the routing step at `:692`.

**Layer 2: `safeParseLLMJson`** at `loop/network/index.ts:63-80`. Used **not for the router output** (the router goes through Zod validation inside the Agent's structured-output path), but for **downstream re-parse of the `prompt` string** when that string must be further interpreted as JSON (e.g., workflow input at `:1152`):

```ts
async function safeParseLLMJson(text: string): Promise<unknown | null> {
  if (!text?.trim()) return null

  // First fix common LLM issues with control characters in strings
  const preprocessed = escapeUnescapedControlCharsInJsonStrings(text) // :69

  // Use parsePartialJson which can recover truncated/incomplete JSON
  const { value, state } = await parsePartialJson(preprocessed) // :72

  if (state === 'successful-parse' || state === 'repaired-parse') {
    return value
  }
  return null
}
```

Two recoveries: (a) unescaped `\n` / `\t` / `\r` inside string literals (a common Claude failure mode when generating JSON that contains prose), and (b) `parsePartialJson` from the AI SDK which closes unclosed braces/brackets/quotes when the model truncated before finishing. Workflow-step behavior on parse failure at `:1153-1158`: log a warning, return an error to the routing agent, and **let the next routing iteration re-plan with the parse failure as feedback** — not a hard abort.

### "Ambiguity" — mastra has no equivalent of our disambiguation ladder

Searched: no `clarify`, `clarification`, `ambiguous`, `disambiguat`, or similar terms in `loop/network/`. Their model is:

- If no primitive fits → router returns `{ primitiveId: 'none', primitiveType: 'none' }` → marked complete → final-result synthesis runs against whatever context exists.
- If the pick was wrong → the validation step's scorers return `passed: false`, a "completion feedback" message is appended to memory (`formatCompletionFeedback` at `validation.ts:326`), and the loop iterates. The router now sees the feedback and can pick a different primitive.
- There is **no built-in "ask the user a clarifying question" branch.** An author who wants clarification has to model it as a sub-agent whose tool is `ask-user` — mastra will route to it, but the router doesn't natively classify "user intent is ambiguous" as a terminal state distinct from "task complete" or "keep going."

### Additional mechanics worth naming

- **`conversationContext`** at `:755` is built by `filterMessagesForSubAgent` — it strips all routing-decision JSON and completion-feedback messages out of history before handing it to the sub-agent. The router sees them; sub-agents do not. Already discussed in `01-orchestrator.md`.
- **`verboseIntrospection`** at `:659` toggles whether `selectionReason` should also say why _other_ primitives were not picked. Useful for debugging, costs extra tokens per routing call.
- **Structured-output schema lives on the call, not the Agent.** The Agent `routing-agent` at `:209-219` has no schema pinned; the schema is passed at `structuredOutput.schema` on every call at `:665-672`. Agent reuse does not imply schema reuse.

---

## 2. What this tells us

### Their decision schema is operationally simpler, ours is semantically richer

Mastra: `{ primitiveId, primitiveType, prompt, selectionReason }`.
Ours: `{ goal, constraints, expected_output_shape, quote }` per sub-agent, plus the router's outer plan-shape.

Mastra's `prompt` is a free-form string — agent prompts are natural language, workflow/tool prompts are stringified JSON. The sub-agent does what it wants with it. Our directive commits to four structurally-separated fields:

- `goal` — natural language.
- `constraints` — natural language, separate from goal so a safety reviewer can audit the two independently.
- `expected_output_shape` — lets the synthesizer (§9) and inline-surface consumers (§3) pre-bind to a shape without reading the goal text.
- `quote` — narrow slice of user utterance, the controlled recovery path for the sub-agent when the router's goal-distillation loses nuance.

**The tradeoff.** Mastra's shape is easier for an LLM to produce correctly on first try (one short string); ours gives the sub-agent four decorrelated signals, which is especially load-bearing for (a) prompt-injection defense — the `quote` field is the _only_ place raw utterance appears downstream of the router, (b) the synthesizer's ability to pre-shape its merge without re-reading every sub-agent's output, and (c) auditability — a reviewer can see what constraints were imposed without inferring them from prose.

Our shape is not free: the router has to learn to correctly segment a goal from its constraints and pick a representative quote, which is more to get right than mastra's single prompt field. The cost is real. It is justified only _if_ those four fields are actually consumed downstream by code — synthesizer shape-binding (§9), the sanitizer's quote-propagation rule (§8), and audit views. If any consumer is vestigial, that consumer's field should be removed, not kept as aspirational structure.

**Net:** keep our four-field directive; acknowledge in the design doc that the router's structured-output call is doing strictly more work than mastra's and budget for it in the router-prompt version rev cadence.

### Their prompt-generation pattern is exactly what we want for our declaration site

Mastra builds router instructions from three inline renderers pulling from `listAgents / listWorkflows / listTools`. Our §3 "Sub-agent declaration site" paragraph names the registry (`defineSubAgent` + boot-time registry module) but **does not specify that the router prompt is generated from it.** `01-orchestrator.md` Edit 2 already proposed adding that sentence. This investigation confirms the pattern is production-validated.

One detail worth lifting: mastra renders `inputSchema` inline as JSON Schema inside the system prompt (`:167`, `:177`). Our router needs the equivalent so it can emit directives with `expected_output_shape` that correctly reference each sub-agent's declared `outputSchema`. Without inlining, the router emits shape references it can't verify.

### The `additionalInstructions` hook — useful in our model, but under a different name

`routing.additionalInstructions` (`:181`) is mastra's "tenant-level router customization" extension point. A caller can append a few lines to the router's system prompt. This is interesting because our doc has **no explicit answer** for "what if a tenant needs to nudge router behavior — e.g., `always prefer finance over payroll when ambiguous`?"

The honest answer: in our model, that belongs in the sub-agent's `whenToUse` declaration at the registry level (so it appears in the generated list the router reads), not as a tenant-scoped prepended prose blob. A free-text addendum breaks our version-hash story (§8) — any tenant text hash-differs from the base prompt, and the prompt store fans out N-tenants × M-versions instead of staying one canonical hash per version. If mastra's `additionalInstructions` ships to production unreviewed, it is also an injection surface for a tenant admin to nudge routing in ways that cross permission boundaries.

**Conclusion:** _do not_ adopt `additionalInstructions` as-is. Our `whenToUse` per sub-agent is the right surface for this, and tenant-specific variations should take the form of sub-agent toggles (available or not per tenant) rather than router-prompt overrides.

### Error-recovery: we do need parsing fallback, but not `safeParseLLMJson`'s full stack

We're using `generateObject` with Zod schemas, same as mastra does through structured-output. Their first-layer fallback (`tryGenerateWithJsonFallback`) — retry with `jsonPromptInjection: true` when native structured-output fails — is a pattern worth naming in our error model (§4). It is currently implicit; it should not be.

Their second layer (`safeParseLLMJson`) is a different problem: it repairs **LLM-generated string payloads that must be re-parsed as JSON downstream** (workflow input). We don't have the equivalent because we don't have mastra's heterogeneous-primitive model — our router emits a typed directive, not a stringified-JSON-or-text blob depending on primitive type. Our sub-agent inputs are already Zod-shaped by the directive schema. So we don't need string-level JSON repair at the sub-agent boundary.

**But we do need `safeParseLLMJson`-style tolerance at one place:** the sub-agent's ReAct tool-call loop, where the model emits tool args as JSON and trips on unescaped control characters in error messages / tenant-authored strings. This is a §4 error-handling detail, not a §3 routing detail. Mention in cross-ref, not in the routing section.

### "Router-confidence" and "router picked wrong" — they iterate, we have three explicit branches

Mastra's model is: the router picks, the scorer gates, and iteration provides the re-plan. There is no explicit `confidence` field on the routing decision, no `ambiguous: true` branch. The router's `selectionReason` text is the only trace of its reasoning.

Our §3 ambiguity ladder — disambiguate → fan-out → analyst — is an explicit three-way branch at classification time. That is richer than mastra and worth keeping. It is also more to get right: the router must classify _its own uncertainty_ into one of three buckets, not just pick a primitive.

What mastra's approach suggests we should add: **a router-accuracy signal for "how often does the selected branch get overridden within the same turn?"** §12 has `user-corrects-mid-conversation` and `sub-agent-returns-empty-handoff`. Adding `router-rechose-after-replan` (analog of mastra's "iteration 2 picks a different primitive than iteration 1") would let us observe whether our _first-shot_ classification is drifting. A rising rate is the early-warning before user-visible corrections.

### One missing mechanism in mastra they would probably benefit from

Our §3 has a bounded re-plan: if phase-1 output doesn't fit phase-2's input schema, the router gets _exactly one re-plan then fail loudly._ Mastra's loop has no such bound — it simply iterates until scorers pass or max-iterations hits. A poorly-scorer-gated network can burn $50 of tokens re-asking the same question in slightly different ways. The bounded re-plan is a real differentiator.

---

## 3. Proposed edits to agent-runtime.md

### Edit 1 — §3, name the router-prompt generation input explicitly

Under "Sub-agent declaration site," after the drift-tests bullet, add:

> **Router prompt is generated from this registry, not hand-written.** At session start, the router's available-primitives section is rendered from the registry as one list entry per sub-agent, containing `{ key, domain, whenToUse, inputSchema as JSON Schema, outputSchema as JSON Schema }`. `outputSchema` is included so the router can correctly populate `expected_output_shape` in each directive; `inputSchema` is included so phase-2 directives can be pre-validated against the target sub-agent's shape before the LLM call. Drift between registry and router prompt is structurally impossible.

(This extends `01-orchestrator.md` Edit 2 with the `outputSchema` detail this investigation surfaced.)

### Edit 2 — §3, explicitly reject tenant-level router-prompt addenda

Add to "Router responsibilities," after the existing bullets:

> **No tenant-scoped router-prompt overrides.** Tenant variation in routing behavior is expressed by which sub-agents are available to that tenant (registry-level toggle), not by free-text addenda to the router's system prompt. Free-text tenant overrides would fan out the prompt-store (§8) to N-tenants × M-versions and reintroduce an injection surface at the routing layer. `whenToUse` per sub-agent is the single extension point for routing nudges.

### Edit 3 — §4, name the structured-output parse-fallback policy explicitly

§4's error-classification table currently covers tool validation, permission denied, domain execution, LLM provider, ceilings, and model refusal — but structured-output parse failure on the router's own call is nowhere. Add a row to the table:

| Class                            | Source                                                                 | Response                                                                                                                                                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured-output parse (router) | Model returned text that did not validate against the directive schema | **Exactly one fallback attempt** with `jsonPromptInjection: true` (explicit schema in system prompt, text-mode generation, manual parse). If still fails → emit `routing-parse-failure` span (§12 100%-capture trigger) and escalate to disambiguation. No third attempt. |

Also add to the `routing-parse-failure` span as a new 100%-capture trigger in §12.

### Edit 4 — §12, add `router-rechose-after-replan` signal

Under "Router-accuracy regression signals," add:

> - **`router-rechose-after-replan`** — when the bounded re-plan (§3 "Plan-shape mismatch fails fast") produces a different sub-agent selection than the original plan. Leading indicator of first-shot classification drift. Dashboards as a rate (`re-plans / total turns with fan-out`); alert on sustained rise rather than absolute level.

### Edit 5 — §8, pin what the router's user message contains and does NOT contain

Currently §8 says:

> **User message:**
>
> - **Router:** raw user utterance wrapped `<user_message>...</user_message>`.
> - **Sub-agent:** router's directive, NOT the raw utterance.

Tighten to:

> **User message:**
>
> - **Router:** raw user utterance wrapped `<user_message>...</user_message>`. Nothing else — no primitive lists (those live in the system prompt, generated from registry), no per-turn framing prose (that lives in the developer/context message).
> - **Sub-agent:** router's directive `{ goal, constraints, expected_output_shape, quote }`, NOT the raw utterance. The `quote` field is the **only** downstream carrier of raw utterance content. Sub-agents that need more utterance context request a re-plan; they do not receive the full raw input.

Mastra's router has no separate "user message" position at all — the utterance is spliced into an assistant-role framing message. Our explicit wrapping position is more defensible; name it.

---

## 4. What we are not borrowing

- **`routingConfig.additionalInstructions`** (index.ts:181). Tenant-scoped router-prompt addenda break the prompt-hash story (§8) and are a latent injection surface. Our `whenToUse` on each sub-agent handles the legitimate use case with no fan-out.
- **Free-form `prompt: string` as the directive body.** Mastra's single-string prompt is simpler for the model to produce but gives the sub-agent one undifferentiated blob. Our four-field directive pays a first-shot-generation cost for downstream properties (injection scoping via `quote`, synthesizer shape-binding via `expected_output_shape`, audit separability of `goal` vs `constraints`).
- **Router-as-Agent-instance pattern.** Mastra re-instantiates a full `Agent` object for routing (line 209-219) so it can reuse the Agent's processor / memory / streaming machinery. Our router is a code-orchestrated LLM call with its own prompt layers (§8), not an Agent. Flattening router into "just another sub-agent" would remove the architectural distinction between planner and executor (§3 "router produces a plan; code executes it") — non-negotiable.
- **Scorer-gated termination as the only exit condition.** Already covered in `01-orchestrator.md` §4. The router's `{ primitiveId: 'none', primitiveType: 'none' }` "I'm done" signal is a nice simple termination shape, but our bounded-topology model terminates by plan completion, not by the router self-declaring done each iteration.
- **Inline few-shot JSON example inside the per-call prompt** (`:652-657`). We have typed structured output via Zod; the schema's `.describe()` strings serve the same "tell the model what each field means" role without the token cost of an inline example. Redundant.
- **No-built-in-clarification pattern.** Mastra returns `none / none` or iterates when the task is unclear — there is no native path for "ask the user a question and stop." We model this as our ambiguity-ladder tier 1 (disambiguation question), which is a distinct router output shape. Keep ours; do not collapse to mastra's binary `none | continue`.

---

## 5. Open questions

- **Does `expected_output_shape` need to be a Zod schema reference, a JSON Schema literal, or a shape-identifier token?** Three paths:
  - (a) Literal JSON Schema embedded in the directive — the router emits the schema itself; ~400 tokens per directive at realistic sub-agent complexity; correctness burden on the router.
  - (b) Reference by name (e.g., `"expected_output_shape": "kpi.summary.v1"`) — router emits a token, sub-agent resolves it via registry; near-zero token cost; requires the set of shape names to be in the router's system prompt alongside the primitive list.
  - (c) Implicit — `expected_output_shape` is the declared `outputSchema` on the selected sub-agent, router doesn't emit it at all. Simplest; removes router's ability to request _partial_ shape (only the fields synthesizer needs this turn).
    Tentative: (b) — same trick as mastra's approach of inlining schemas in the router prompt, but with shape-names as the router-emitted slug. (c) is too restrictive; (a) is too expensive per turn.
- **Can the router `quote` field leak PII from one sub-agent's scope to another?** Example: user utterance mentions a salary figure + a project name. Finance sub-agent's `quote` contains "why is Bob's comp below bracket", Projects sub-agent's `quote` contains "why is Bob's comp below bracket" too — Projects can now see compensation context it had no scope to read. Fix path: `quote` is not verbatim; it is **projected to the sub-agent's scope** by the same sanitizer that handles phase-1 → phase-2 handoff. This is not currently stated in §8. Ask and decide before implementation.
- **Should the router emit a `confidence` field on its decision?** Mastra doesn't; our three-way ambiguity ladder already encodes confidence as branch selection (disambiguate = low, fan-out = medium, single-agent = high). An additional scalar would be redundant unless we use it for sampling (e.g., 100%-capture when `confidence < 0.8`). Declined for v1 unless §12 shows we need the signal.
- **Should `tryGenerateWithJsonFallback`-style retry apply to the sub-agent's structured outputs too, or only to the router?** Mastra applies it only at the routing layer. Our §4 error table changes should specify: parse-fallback at router only; sub-agent structured-output parse failure goes to §4 "Tool validation" row (treat the structured output like a tool-arg validation failure, retry once, then return error to the sub-agent's ReAct loop). Verify at implementation.
- **How do we version the router prompt when the registry changes?** Mastra sidesteps this — no replay story, no prompt-hash. We have both (§8). When a new sub-agent is added, every router prompt hash changes, every live conversation sees a new hash, and the replay harness now references a hash that didn't exist at turn-time for old conversations. Need: **prompt hash is a function of the registry snapshot AT turn start**, captured and stored at turn start — not regenerated at replay. Our §8 prompt-store is append-only by hash, so this just works, but the turn-start capture step needs to be explicitly specified.
