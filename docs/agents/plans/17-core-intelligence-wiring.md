# 17 — Core Intelligence Wiring (Theme C + Theme E remainder)

**Design §§:** Plan 03 §4 (sub-agent ReAct loop), §9 (synthesizer); Plan 10 §3 (golden-trace runner); Plan 12 §6 (iterative orchestrator seams).

**Status:** Spec — closes the "Theme C — Core intelligence layer is stubbed" and "Theme E remainder — golden-trace-runner stub" findings from `docs/agents/audit/2026-04-26-INDEX.md`. The `sub-agent-runner.ts:160` `usageTotals` bug is a separate pre-PR landed independently.

---

## 1. Scope

### In

- **Task A — Sub-agent ReAct loop wiring.** Replace `SubAgentRunnerAdapter` stub with a real Vercel AI SDK `generateText` driven loop that invokes tools through `ToolGateway`, accumulates real signals, and produces a real `usageTotals` rollup. Bridges `ToolGateway` Tripwires onto AI SDK semantics (soft → tool-result error; hard → throw → kind=`'errored'`/`'aborted'`).
- **Task B — Synthesizer LLM call.** Replace `SynthesizerAdapter` deterministic-only stub with a real LLM-backed synthesizer using `generateObject` against a discriminated-union shape schema. Pure helpers (`detectContradiction`, `buildCitations`, `buildDisclosureStatements`) remain the prompt-context preprocessor; rule-derived confidence and citations are merged on top of the LLM output.
- **Task C — Golden-trace real execution.** Replace the `actualFingerprint = { ...expectedFingerprint }` stub in `GoldenTraceRunner.runCiGate` with a replay-mode pipeline run: `ReplayHarness` provides captured tool outputs; a new `ReplayModeToolGateway` returns those for matching `(toolName, canonicalArgs)`; the production turn-controller pipeline is invoked with the override; the resulting fingerprint is compared against expected.

### Out

- Pre-PR `sub-agent-runner.ts:160` ZERO_USAGE bug (lands first as a standalone fix; not part of this plan).
- L4 pre-injection (Plan 04 INFO — beta-gated).
- Per-iteration synthesizer (Plan 12 INFO — beta-gated).
- LLM-judge scorer activation in golden-trace runner (Plan 10 INFO — beta-gated; observe-only stays).
- Multi-provider failover for sub-agent / synthesizer (Plan 11 §17 deferral).
- Streaming sub-agent tokens to UI (Plan 03 §9 explicitly rejects per-sub-agent streaming).
- Tolerated-divergence scorer extensions for golden-trace (out of scope; current `ScorerRegistry` already supports per-trace tolerance via existing scorer interface).

---

## 2. Design Context

**Why now.** The audit (`docs/agents/audit/2026-04-26-INDEX.md` Theme C) flagged the agent runtime as production-grade scaffolding around a stubbed intelligence core: sub-agents never call tools, the synthesizer concatenates summaries with `join(' ')`, and the CI gate's `actualFingerprint` is a copy of `expectedFingerprint`. Plans 01/02/03/05/07 are nominally Shipped but produce no real intelligence behavior.

**Why this is one plan, not three.** All three pieces share infrastructure: the same Vercel AI SDK v6 wrapper conventions, the same `OPENAI_API_KEY` sourcing, the same observability surface (sub-agent loop spans + synthesizer spans both feed the existing flow_id / TURN-span tree). Splitting risks divergent test stub strategies and triple review overhead. The pre-PR bug fix is split out because it's a 1-line change with a clean test boundary; everything else benefits from being designed coherently.

**Prior-art alignment.** Plan 03 §4 prior-art review already locked in the loop shape (pure ReAct, 4–5 iterations, `maxRetries: 0`, no mid-turn user input, no per-sub-agent incremental synthesis). This plan implements that contract; it does not re-litigate it.

---

## 3. Data Model

No new tables. No schema changes. The existing schema already carries everything needed:

- `agent_session.pinnedSubAgentPromptHashes`, `routerPromptHash`, etc. — already used by `ReplayHarness`.
- `agent_tool_invocation.resultPreview / resultHash` — already populated by `ToolGateway`; replay harness reads these in `mode='full'`.
- `agent_cost_event` — already populated by `cost-recorder`; this plan ensures real `usageTotals` flow into it via the fixed sub-agent runner.

---

## 4. Interface Contracts

### 4.1 New domain value object — `SynthesizerOutputSchema`

`apps/api/src/modules/agents/domain/value-objects/synthesizer-output-schema.ts`:

```ts
export const SynthesizerOutputSchema = z.discriminatedUnion('shape', [
  z.object({ shape: z.literal('short-answer'), content: z.string().min(1) }),
  z.object({ shape: z.literal('list'), items: z.array(z.string()).min(1) }),
  z.object({
    shape: z.literal('table'),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.string())),
  }),
  z.object({ shape: z.literal('narrative'), content: z.string().min(1) }),
  z.object({
    shape: z.literal('chart'),
    series: z.array(
      z.object({
        label: z.string(),
        points: z.array(
          z.object({
            x: z.union([z.string(), z.number()]),
            y: z.number(),
          }),
        ),
      }),
    ),
    axes: z.object({ x: z.string(), y: z.string() }),
  }),
])

export type SynthesizerLlmOutput = z.infer<typeof SynthesizerOutputSchema>
export function narrowToShape(
  schema: typeof SynthesizerOutputSchema,
  shape: SynthesizerLlmOutput['shape'],
): z.ZodType
```

Pure Zod, zero NestJS imports. Lives in `domain/` per CLAUDE.md DDD rule.

### 4.2 New infrastructure clients

**`apps/api/src/modules/agents/infrastructure/llm/sub-agent-llm-client.ts`:**

```ts
export const SUB_AGENT_LLM_CLIENT = Symbol('SUB_AGENT_LLM_CLIENT')

export interface SubAgentLlmClientOpts {
  readonly model: ModelChoice
  readonly system: string
  readonly userMessage: string
  readonly tools: Record<string, AiSdkTool>
  readonly outputSchema: ZodType
  readonly maxIterations: number
  readonly abortSignal: AbortSignal
}

export interface SubAgentLlmClientResult {
  readonly rawStructured: unknown
  readonly text: string
  readonly steps: ReadonlyArray<AiSdkStep>
  readonly usage: SubAgentUsage
  readonly finishReason: 'stop' | 'tool-calls' | 'length' | 'content-filter' | 'error' | 'other'
}

export interface SubAgentLlmClient {
  runWithTools(opts: SubAgentLlmClientOpts): Promise<SubAgentLlmClientResult>
}
```

Wraps `generateText({ model, system, prompt, tools, stopWhen: stepCountIs(opts.maxIterations), abortSignal, maxRetries: 0, experimental_output: Output.object({ schema: opts.outputSchema }) })`. Falls back to a follow-up `generateObject` if `experimental_output` is unavailable in the installed SDK version (drift test enforces this branch resolves).

**`apps/api/src/modules/agents/infrastructure/llm/synthesizer-llm-client.ts`:**

```ts
export const SYNTHESIZER_LLM_CLIENT = Symbol('SYNTHESIZER_LLM_CLIENT')

export interface SynthesizerLlmClientOpts {
  readonly model: ModelChoice
  readonly system: string
  readonly userContext: string
  readonly schema: ZodType // either full union or narrowed
  readonly abortSignal?: AbortSignal
}

export interface SynthesizerLlmClient {
  synthesize(opts: SynthesizerLlmClientOpts): Promise<{
    output: SynthesizerLlmOutput
    usage: SubAgentUsage
  }>
}
```

Wraps `generateObject({ model, schema, system, prompt: userContext })`.

`OPENAI_API_KEY` sourcing for both clients is identical to `RouterLlmClient`: AWS Secrets Manager → ECS env in production, dev shell export locally. No new secret.

### 4.3 Tool-gateway bridge & ReAct driver

**`apps/api/src/modules/agents/infrastructure/tool-gateway/tool-gateway-bridge.ts`:**

```ts
export interface BridgeAccumulator {
  toolResultCount: number
  toolFailureCount: number
  retryCount: number
  taintFlippedDuringRun: boolean
  ceilingHit: boolean              // set by driver, not bridge
  semanticConflictWithSibling: boolean   // set by phase executor, not bridge
  circuitBreakerEventOccurred: boolean
  sourceToolProvenance: ToolCall[]
  drafts: DraftProposal[]
  circuitBreakerState: Record<ToolName, { disabled: boolean; reason: string }>
}

export class HardTripwireError extends Error {
  constructor(public readonly tripwire: Tripwire, public readonly toolName: ToolName) { super(...) }
}

export function buildSubAgentTools(opts: {
  toolScope: ReadonlyArray<ToolName>
  registry: ToolRegistry
  toolGateway: ToolGateway
  invokeContext: Omit<ToolGatewayInvokeInput, 'toolName' | 'args'>
  accumulator: BridgeAccumulator
}): Record<ToolName, AiSdkTool>
```

Hard-tripwire classifier (Q2 ratification):

```
HARD = result.kind === 'infra_error' || result.action === 'abort'
SOFT = permission_denied | validation_error | ceiling_breached | circuit_broken |
       (any other tripwire kind with action !== 'abort')
```

**`apps/api/src/modules/agents/application/services/react-loop-driver.ts`** (pure, no NestJS):

```ts
export interface ReactLoopDriverOpts {
  readonly llmClient: SubAgentLlmClient
  readonly model: ModelChoice
  readonly system: string
  readonly userMessage: string
  readonly tools: Record<ToolName, AiSdkTool>
  readonly outputSchema: ZodType
  readonly maxIterations: number
  readonly abortSignal: AbortSignal
  readonly accumulator: BridgeAccumulator
}

export interface ReactLoopDriverResult {
  readonly rawStructured: unknown
  readonly text: string
  readonly signals: ConfidenceSignals
  readonly usageTotals: SubAgentUsage
  readonly hardTripwire?: { tripwire: Tripwire; toolName: ToolName }
  readonly aborted: boolean
}

export async function runReactLoop(opts: ReactLoopDriverOpts): Promise<ReactLoopDriverResult>
```

The driver:

1. Calls `llmClient.runWithTools(...)`.
2. Catches `HardTripwireError` → returns `{ hardTripwire, ... }` with `signals` accumulated up to the failure.
3. Catches AI SDK `AbortError` → returns `{ aborted: true, ... }`.
4. On normal return: builds `signals` from accumulator + `result.steps` length + `finishReason === 'tool-calls'` → `ceilingHit = true`.
5. Returns aggregate `usage` (AI SDK v6 sums across steps in `result.usage`).

### 4.4 Updated adapters

**`SubAgentRunnerAdapter`** becomes a thin shell:

```ts
async run(opts: IterativeSubAgentRunOpts): Promise<SubAgentOutput> {
  const config = this.subAgentRegistry.get(opts.directive.sub_agent_key)
  if (!config) throw new Error(`unknown sub_agent_key "${opts.directive.sub_agent_key}"`)
  if (opts.abortSignal.aborted) return abortedOutput(opts)

  const accumulator: BridgeAccumulator = { /* zeroed */ }
  const tools = buildSubAgentTools({
    toolScope: config.toolScope,
    registry: this.toolRegistry,
    toolGateway: this.toolGateway,
    invokeContext: { /* requestContext, turnState, subAgentKey, subAgentScope, mode, flowId, intentSlug, userUtterance */ },
    accumulator,
  })

  const driverResult = await runReactLoop({
    llmClient: this.llmClient,
    model: resolveModel(config.model, opts.tenantContext),
    system: config.resolvedPromptBody,
    userMessage: buildSubAgentUserMessage(opts.directive),
    tools,
    outputSchema: config.outputSchema,
    maxIterations: config.budgets.maxIterations,
    abortSignal: opts.abortSignal,
    accumulator,
  })

  if (driverResult.aborted) return abortedOutput(opts)
  if (driverResult.hardTripwire) {
    return buildSubAgentOutput({
      rawStructured: {},
      outputSchema: config.outputSchema,
      signals: { ...driverResult.signals, ceilingHit: false },   // ceiling never beats hard error
      summary: `[error] ${driverResult.hardTripwire.tripwire.kind}`,
      semantics: opts.directive.sub_agent_key,
      sourceToolProvenance: accumulator.sourceToolProvenance,
      circuitBreakerState: accumulator.circuitBreakerState,
      drafts: accumulator.drafts,
      usageTotals: driverResult.usageTotals,
    })  // buildSubAgentOutput returns kind='errored' due to schema mismatch
  }

  return buildSubAgentOutput({
    rawStructured: driverResult.rawStructured,
    outputSchema: config.outputSchema,
    signals: driverResult.signals,
    summary: extractSummary(driverResult.rawStructured, driverResult.text),
    semantics: opts.directive.sub_agent_key,
    sourceToolProvenance: accumulator.sourceToolProvenance,
    circuitBreakerState: accumulator.circuitBreakerState,
    drafts: accumulator.drafts,
    usageTotals: driverResult.usageTotals,
  })
}
```

**`SynthesizerAdapter`** becomes:

```ts
async synthesize(opts: SynthesizerOpts): Promise<SynthesizerOutput> {
  const allOutputs = new Map([...opts.phase1Outputs, ...opts.phase2Outputs])

  // Shape selection sources:
  //   - inline copilot: directive declares expectedOutputShape per R-03.26
  //   - global chat: undefined → LLM picks from full union per R-03.25
  const expectedShape = extractExpectedShape(opts.directive)
  const surface = opts.turnState.requestContext.surface

  const hasContradiction = detectContradiction(allOutputs)
  const citations        = buildCitations(allOutputs)
  const disclosures      = buildDisclosureStatements(allOutputs)

  const userContext = buildSynthesizerPrompt({
    allOutputs, disclosures, hasContradiction, expectedShape,
    userUtterance: opts.userUtterance,
  })

  const schema = expectedShape
    ? narrowToShape(SynthesizerOutputSchema, expectedShape)
    : SynthesizerOutputSchema

  const model = surface === 'inline' ? NANO_MODEL : REASONING_MODEL

  try {
    const { output, usage } = await this.llm.synthesize({
      model, system: SYNTHESIZER_SYSTEM_PROMPT, userContext, schema,
      abortSignal: opts.abortSignal,
    })
    return {
      ...output,
      citations,
      confidence: hasContradiction ? 'low' : deriveAggregateConfidence(allOutputs),
      turnEndedReason: 'completed',
      usage,
    }
  } catch (err) {
    recordSynthesizerFallback(err)
    return deterministicFallback({ allOutputs, citations, disclosures, hasContradiction })
  }
}
```

### 4.5 Replay-mode tool gateway & golden-trace runner

**`apps/api/src/modules/agents/infrastructure/tool-gateway/replay-mode-tool-gateway.ts`:**

```ts
@Injectable()
export class ReplayModeToolGateway implements ToolGatewayPort {
  constructor(
    private readonly capturedOutputs: ReadonlyArray<ToolCallRecord>,
    private readonly canonicalize: (args: unknown) => string,
  ) {}

  async invoke(input: ToolGatewayInvokeInput): Promise<ToolGatewayResult> {
    const argsHash = this.canonicalize(input.args)
    const match = this.capturedOutputs.find(
      (r) => r.toolName === input.toolName && this.canonicalize(r.args) === argsHash,
    )
    if (!match) {
      throw new ReplayToolOutputMissError(input.toolName, input.requestContext.traceId)
    }
    return { kind: 'ok', value: match.result, taintFlipped: false, drafts: [] /* ... */ }
  }
}

export interface ToolGatewayPort {
  invoke(input: ToolGatewayInvokeInput): Promise<ToolGatewayResult>
}
```

Production `ToolGateway` is refactored to declare `implements ToolGatewayPort` (no behavior change; `tsc` enforces signature compatibility).

**`GoldenTraceRunner.runCiGate`:**

```ts
for (const trace of traces) {
  const expectedFingerprint = buildExpectedFingerprint(trace)

  let actualFingerprint: Fingerprint
  try {
    const replay = await this.replayHarness.replay({ traceId: trace.id, mode: 'full' })
    if (!replay.toolOutputs) throw new Error('replay returned no toolOutputs')
    const result = await this.turnPipelineRunner.runWithReplay({
      messages: replay.messages,
      pinnedVersions: replay.pinnedVersions,
      // Tenant context flows from the replayed message row; the runner
      // re-establishes app.tenant_id via the standard middleware.
      toolGatewayOverride: new ReplayModeToolGateway(replay.toolOutputs, canonicalize),
    })
    actualFingerprint = {
      toolCallsSorted: [...result.toolCallNames].sort(),
      shape: result.shape,
      permissionKeys: [...result.permissionKeys].sort(),
      taintFlipped: result.taintFlipped,
    }
  } catch (err) {
    actualFingerprint = MARKER_REPLAY_FAILED // sentinel — diverges from any expected
    recordReplayFailure(trace.id, err)
  }

  // existing scorer + regression-report code below — unchanged
}
```

**`TurnPipelineRunner`** (new, `application/services/turn-pipeline-runner.ts`): a thin facade that lifts the `agent-turn-controller` pipeline into a callable service accepting an optional `ToolGatewayPort` override. Production callers (the controller itself) continue using the DI-wired gateway via the default override. The runner is the _only_ new entry point; the controller delegates to it on every turn (zero-cost refactor — the controller becomes ~10 lines thinner).

---

## 5. Control Flow

### 5.1 Sub-agent ReAct loop (per phase-executor sub-agent dispatch)

1. Phase executor calls `subAgentRunner.run({ directive, abortSignal, turnState, requestContext, ... })`.
2. Adapter resolves `ValidatedSubAgentConfig` from `SubAgentRegistry`.
3. Adapter builds `BridgeAccumulator` (zeroed) and tool wrappers via `buildSubAgentTools`.
4. Adapter calls `runReactLoop(...)`.
5. Driver calls `llmClient.runWithTools(...)` → AI SDK iterates: LLM proposes tool call → bridge invokes `toolGateway.invoke()` → result returned to LLM → LLM either calls another tool or stops with structured output.
6. Per tool call, bridge:
   - On `kind: 'ok'` → push provenance + drafts → mutate accumulator → return `result.value` to LLM.
   - On hard tripwire → throw `HardTripwireError` → AI SDK propagates → driver catches → returns with `hardTripwire`.
   - On soft tripwire → mutate accumulator (`toolFailureCount++`, circuit-breaker state) → return `{error, message}` to LLM.
7. Driver builds `ConfidenceSignals` (toolResultCount, toolFailureCount, retryCount, taintFlippedDuringRun, ceilingHit, semanticConflictWithSibling=false, circuitBreakerEventOccurred), totals usage, returns to adapter.
8. Adapter calls `buildSubAgentOutput(...)` (existing pure helper) which applies ceiling-hit precedence (R-03.19), schema validation (R-03.17), confidence derivation (R-03.22).

### 5.2 Synthesizer (after phase-2 completes)

1. Phase executor calls `synthesizer.synthesize({ phase1Outputs, phase2Outputs, expectedOutputShape, surface })`.
2. Adapter computes `hasContradiction`, `citations`, `disclosures` via existing pure helpers.
3. Adapter builds `userContext` prompt (per-sub-agent JSON blocks + disclosure prose).
4. Adapter narrows schema for inline; selects model (R-03.28).
5. `synthesizerLlmClient.synthesize(...)` → `generateObject` → typed output.
6. Adapter merges adapter-controlled fields (citations, confidence, `turnEndedReason`, usage).
7. On LLM failure: deterministic fallback using `renderContradictionClarity` + disclosures, marked `turnEndedReason: 'errored'`, fallback counter incremented.

### 5.3 Golden-trace CI run

1. CI invokes `goldenTraceRunner.runCiGate({ branch, commit })`.
2. Runner loads active traces.
3. For each trace:
   a. `replayHarness.replay({ traceId, mode: 'full' })` returns messages + captured tool outputs + pinned versions.
   b. Build `ReplayModeToolGateway` from `replay.toolOutputs`.
   c. `turnPipelineRunner.runWithReplay(...)` runs the production pipeline (router → phase executor → sub-agents → synthesizer) with the replay gateway override and pinned prompt versions.
   d. Capture `actualFingerprint` from real result.
   e. Run deterministic scorers; if any fail → regression report.
   f. Run LLM-judge scorers in observe-only mode (R-10.30 — unchanged).
4. Return `{ passed: regressions.length === 0, regressions, durationMs }`.

---

## 6. Requirements

| ID      | Requirement                                                                                                                                                                                                                                                                                                                                                               | Source          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| R-17.1  | `SubAgentRunnerAdapter.run()` invokes a real Vercel AI SDK `generateText` loop bounded by `config.budgets.maxIterations`; `rawStructured` is non-empty on `kind='completed'` returns from any sub-agent that produced a parseable response.                                                                                                                               | Plan 03 §4      |
| R-17.2  | `SubAgentLlmClient` calls `generateText` with `maxRetries: 0` (R-03.16).                                                                                                                                                                                                                                                                                                  | Plan 03 R-03.16 |
| R-17.3  | The tool-gateway bridge classifies `kind='infra_error'` and any tripwire with `action='abort'` as **hard** (throws `HardTripwireError`); all other tripwires are **soft** (returned as tool-result error to the LLM).                                                                                                                                                     | This plan       |
| R-17.4  | `signals.ceilingHit` is set when the AI SDK returns `finishReason === 'tool-calls'` at the step cap.                                                                                                                                                                                                                                                                      | Plan 03 R-03.19 |
| R-17.5  | `signals.taintFlippedDuringRun` is set when any `toolGateway.invoke()` result has `taintFlipped: true` during the loop.                                                                                                                                                                                                                                                   | Plan 03 R-03.32 |
| R-17.6  | `usageTotals` returned to `buildSubAgentOutput` is the AI SDK aggregate `result.usage` (sum across steps), not `ZERO_USAGE`.                                                                                                                                                                                                                                              | Audit Theme C   |
| R-17.7  | `DraftProposal` items emitted by `ToolGateway` flow through the bridge accumulator into `SubAgentOutput.drafts`.                                                                                                                                                                                                                                                          | Plan 08 §4      |
| R-17.8  | `Citation.subAgentKey` and `Citation.sources` are populated per-sub-agent in `SynthesizerOutput` — the LLM never produces or merges citations.                                                                                                                                                                                                                            | Plan 03 R-03.33 |
| R-17.9  | `SynthesizerOutput.confidence` is rule-derived from sub-agent outputs via `deriveAggregateConfidence`, not from the LLM.                                                                                                                                                                                                                                                  | Plan 03 R-03.22 |
| R-17.10 | When `opts.expectedOutputShape` is set (inline copilot, R-03.26), the synthesizer schema is narrowed to that shape's variant before the LLM call.                                                                                                                                                                                                                         | Plan 03 R-03.26 |
| R-17.11 | `OPENAI_API_KEY` is sourced via Secrets Manager → ECS env (prod) and dev shell export (local). Never in env files, DB, or hardcoded.                                                                                                                                                                                                                                      | CLAUDE.md       |
| R-17.12 | Synthesizer LLM failure (any throw, including auth, 5xx, abortSignal) falls back to `renderContradictionClarity` + disclosures with `turnEndedReason: 'errored'` and increments `agent_synthesizer_fallback_total`.                                                                                                                                                       | This plan       |
| R-17.13 | `ReplayModeToolGateway.invoke` matches by `(toolName, canonicalize(args))` against `ReplayHarness` mode='full' outputs; on miss it throws `ReplayToolOutputMissError`.                                                                                                                                                                                                    | This plan       |
| R-17.14 | `GoldenTraceRunner.runCiGate` builds `actualFingerprint` from the result of running the captured user message through `TurnPipelineRunner` with `ReplayModeToolGateway`. The previous `actualFingerprint = { ...expectedFingerprint }` stub is removed.                                                                                                                   | Audit Theme E   |
| R-17.15 | Replay-harness lookup failure during a CI trace marks the trace's fingerprint as `MARKER_REPLAY_FAILED` — a `Fingerprint` constant whose four fields all hold sentinel values that cannot match any real fingerprint (e.g. `toolCallsSorted: ['__REPLAY_FAILED__']`, `shape: '__replay_failed__'`, etc.) — producing a regression report with `divergedFields` populated. | This plan       |
| R-17.16 | `ToolGateway` and `ReplayModeToolGateway` both implement a shared `ToolGatewayPort` interface; `tsc` enforces compatibility.                                                                                                                                                                                                                                              | This plan       |
| R-17.17 | `TurnPipelineRunner` is the single execution path for live turns and golden-trace replay; the controller delegates to it.                                                                                                                                                                                                                                                 | This plan       |
| R-17.18 | All new code lives in `apps/api/src/modules/agents/`; no cross-module imports from another module's `domain/` or `infrastructure/`.                                                                                                                                                                                                                                       | CLAUDE.md DDD   |
| R-17.19 | DB queries inside command/query handlers are sequenced (no `Promise.all` of DB queries — request-bound `pg.PoolClient` cannot multiplex).                                                                                                                                                                                                                                 | CLAUDE.md       |
| R-17.20 | Test stubs (`FakeSubAgentLlmClient`, `FakeSynthesizerLlmClient`) are the default in unit tests; real LLM is gated behind `process.env.OPENAI_API_KEY` check and skipped when absent.                                                                                                                                                                                      | CLAUDE.md TDD   |

---

## 7. Failure Modes & Recovery

| Failure                                          | Source                                        | Behavior                                                                                             | Recovery                                                                                                              |
| ------------------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY` missing/invalid                 | `SubAgentLlmClient` / `SynthesizerLlmClient`  | Hard tripwire `infra_error` for sub-agent (kind=`'errored'`); deterministic fallback for synthesizer | Operator rotates secret; service restart picks up new value via existing Secrets Manager wiring.                      |
| LLM 5xx / timeout                                | LLM client                                    | No retry inside the loop (R-03.16). Sub-agent returns kind=`'errored'`; synthesizer falls back.      | Gateway-level retry already exists for tool calls; LLM call itself relies on Vercel AI SDK's transient error surface. |
| `abortSignal` fired mid-loop                     | `agent-cancel-controller`                     | AI SDK aborts; bridge throws `AbortError`; adapter returns kind=`'aborted'`, abortReason=`'user'`.   | None — abort is intentional.                                                                                          |
| Step cap reached, LLM still wants tools          | AI SDK `finishReason === 'tool-calls'` at cap | `signals.ceilingHit = true`; `buildSubAgentOutput` produces kind=`'ceiling_hit'`.                    | Phase-executor partial-answer gate (R-03.19) decides surface vs suppress.                                             |
| Output schema validation fails at sub-agent exit | `buildSubAgentOutput`                         | kind=`'errored'` (existing behavior)                                                                 | Synthesizer disclosure (R-03.31) surfaces failure to user.                                                            |
| Synthesizer LLM returns invalid shape            | extremely rare with `generateObject`          | Fallback to deterministic prose; `turnEndedReason: 'errored'`.                                       | Operator inspects logs; LLM call is shape-typed, validation drift means schema or model upgrade needed.               |
| Replay harness lookup miss (capture incomplete)  | `GoldenTraceRunner`                           | `actualFingerprint = MARKER_REPLAY_FAILED` → regression report.                                      | Trace owner reruns the original turn to recapture; existing Plan 10 runbook.                                          |
| Replay tool-output args mismatch                 | `ReplayModeToolGateway`                       | `ReplayToolOutputMissError` → caught by runner → regression.                                         | Trace owner investigates router-plan drift; expected divergence after intentional sub-agent prompt changes.           |
| Sub-agent tries a tool outside `toolScope`       | Bridge does not expose out-of-scope tools     | LLM cannot call it; AI SDK errors at tool resolution → driver classifies as soft failure.            | LLM picks another tool or stops; observability captures the attempt.                                                  |

---

## 8. Observability Surface

### 8.1 Spans

- `sub_agent.run` — root span per sub-agent dispatch. Attributes: `sub_agent_key`, `tenant_id`, `flow_id`, `iterations`, `kind`, `usage.{input_tokens, output_tokens, cost_usd}`.
- `sub_agent.tool_call` — per tool call within ReAct. Attributes: `tool_name`, `iteration`, `outcome` (`ok | soft_tripwire | hard_tripwire`).
- `synthesizer.synthesize` — root span per synthesizer call. Attributes: `surface`, `shape_selected`, `model`, `outcome` (`completed | fallback`), `usage.{input_tokens, output_tokens, cost_usd}`.
- `golden_trace.replay` — root span per CI gate replay. Attributes: `trace_id`, `branch`, `commit`, `replay_outcome` (`succeeded | replay_miss | pipeline_error`).
- `golden_trace.tool_replay` — per replay-gateway invoke. Attributes: `tool_name`, `match_found`.

All spans inherit `flow_id` and `tenant_id` from the request context per Plan 07.

### 8.2 Metrics (new instruments)

| Instrument                             | Type      | Labels                                                                        |
| -------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| `agent_sub_agent_iterations_total`     | counter   | `sub_agent_key`, `outcome` (`completed`, `ceiling_hit`, `errored`, `aborted`) |
| `agent_sub_agent_tool_failures_total`  | counter   | `sub_agent_key`, `tool_name`, `tripwire_kind`, `severity` (`soft`, `hard`)    |
| `agent_synthesizer_call_total`         | counter   | `shape`, `surface`, `outcome`                                                 |
| `agent_synthesizer_latency_ms`         | histogram | `shape`, `surface`, `outcome`                                                 |
| `agent_synthesizer_fallback_total`     | counter   | `cause` (`llm_error`, `schema_error`, `aborted`)                              |
| `agent_golden_trace_ci_run_total`      | counter   | `result` (`pass`, `regression`, `replay_failed`)                              |
| `agent_golden_trace_replay_miss_total` | counter   | `tool_name`                                                                   |

All instruments registered lazily in their respective `*-metrics.ts` modules following the existing pattern (`gateway-metrics.ts`, `cost-metrics.ts`, `streaming-metrics.ts`).

### 8.3 Audit events

No new kernel audit events. Existing Plan 03 audit emits (sub-agent invocations, synthesizer outcome) cover this surface; flow_id/tenant_id propagation already implemented in PR #105.

---

## 9. Security Considerations

- **Tenant isolation**: Both LLM clients receive only the per-tenant resolved system prompt and per-turn user message. No cross-tenant data flows. RLS continues to enforce DB-level isolation; the bridge's `toolGateway.invoke()` runs under the request-scoped `app.tenant_id` setting (PR #105).
- **`OPENAI_API_KEY`**: per CLAUDE.md, sourced exclusively from Secrets Manager in production and developer shell in local. Never logged. The clients never include it in error messages; failures emit `auth_error` outcome label only.
- **Prompt injection**: `directive.quote` is already projected through `sanitizeUtteranceForApprover` at the router boundary (Plan 02); this plan does not introduce new untrusted-text surfaces. Sub-agent system prompts come from `SubAgentRegistry` (boot-validated, frozen). User message comes from the directive's structured fields.
- **Replay-mode gateway**: only operates in CI / harness contexts; never wired into a live request path. It cannot perform writes (it returns captured outputs). Tenant context for replay still flows through the same RLS middleware so any DB lookups during replay (e.g., session port reads in `ReplayHarness`) honour tenant isolation.
- **`generateObject` schema attack surface**: discriminated union is closed; LLM cannot produce shapes outside the enumeration. AI SDK rejects schema mismatches at parse time.

---

## 10. Performance Budget

| Operation                                                           | p50       | p95       | p99 hard cap                        |
| ------------------------------------------------------------------- | --------- | --------- | ----------------------------------- |
| Sub-agent ReAct loop (4 iterations, avg 2 tool calls each)          | <3000 ms  | <8000 ms  | <12000 ms (Plan 03 §10 — unchanged) |
| Synthesizer LLM call (narrative, global chat, full reasoning model) | <2000 ms  | <5000 ms  | <8000 ms                            |
| Synthesizer LLM call (short-answer, inline, nano model)             | <500 ms   | <1500 ms  | <3000 ms                            |
| Golden-trace runner per-trace replay                                | <15000 ms | <30000 ms | <60000 ms                           |
| `ReplayModeToolGateway.invoke`                                      | <5 ms     | <15 ms    | <50 ms                              |

Budgets enforced via existing `BudgetChecker.preTurnCheck` (already wired in PR #105). New `agent_synthesizer_latency_ms` and `agent_sub_agent_iterations_total` enable per-instrument SLO dashboards.

---

## 11. Testing Strategy

**Pre-PR (ZERO_USAGE bug):**

- Unit: `sub-agent-runner.spec.ts` adds a test asserting `usageTotals` propagates through the success branch when provided. Existing tests for the ceiling/error branches confirm parity.

**Task A — Sub-agent ReAct loop:**

- Unit: `react-loop-driver.spec.ts` with `FakeSubAgentLlmClient`:
  - single-tool happy path (no tools called → kind='completed' from initial structured output);
  - multi-step ReAct (LLM calls 2 tools, then stops with structured output);
  - ceiling hit (`finishReason: 'tool-calls'` at step cap → ceilingHit signal);
  - hard tripwire (bridge throws → driver returns `hardTripwire`);
  - soft tripwire (LLM sees error tool-result, recovers with another tool);
  - abortSignal mid-step (driver returns aborted=true);
  - taint flip (tool result with `taintFlipped: true` → accumulator records);
  - schema validation failure at exit (rawStructured doesn't match outputSchema → kind='errored' via existing helper).
- Unit: `tool-gateway-bridge.spec.ts` covers the hard/soft classifier with every Tripwire `kind` × `action` combination.
- Unit: `sub-agent-runner-adapter.spec.ts` (existing, expand) — registry miss, abortSignal pre-loop, hard-tripwire kind classification end-to-end.
- Integration: `sub-agent-runner-adapter.integration.spec.ts` against real `ToolGateway` + a stub LLM client that emits scripted tool calls. Verifies cross-tenant isolation (RLS still enforced), provenance accumulation, drafts flow.
- Coverage: ≥70% lines/branches/functions per CLAUDE.md.

**Task B — Synthesizer LLM:**

- Unit: `synthesizer-llm-client.spec.ts` with mocked AI SDK `generateObject`.
- Unit: `synthesizer-adapter.spec.ts` (rewrite existing + new) covers each shape variant, contradiction handling, disclosure rendering, inline shape pinning (R-03.26), global shape selection (R-03.25), LLM failure fallback, citation pass-through (R-03.33), rule-derived confidence override (R-03.22, R-03.9).
- Integration with real `generateObject`: skipped in CI (no key); runs in dev manually via a tagged spec (`@requires-openai-key`).

**Task C — Golden-trace runner:**

- Unit: `replay-mode-tool-gateway.spec.ts` — match by `(toolName, canonicalArgs)`, miss throws, canonicalization stability, large-result handling.
- Unit: `golden-trace-runner.spec.ts` (existing, expand) — fingerprint divergence detection per field, replay-failure marker behavior, scorer integration.
- Integration: `golden-trace-runner.integration.spec.ts` — seed a trace fixture with captured tool outputs, run against `FakeSubAgentLlmClient` configured to produce matching `toolCallNames`; assert `passed: true` and `actualFingerprint` non-stub. Inject a divergent fixture; assert regression report.
- E2E: skipped at MVP (real LLM in CI is too costly); covered by Plan 13's harness when activated.

**Drift tests (added under `extensibility-invariant-audit.ts`):**

- `EI-11` (new): `SubAgentRunnerAdapter` does not return `rawStructured: {}` with all-zero signals (filesystem grep against the file's exit return literals).
- `EI-12` (new): `SynthesizerAdapter.synthesize` calls a `SynthesizerLlmClient` (filesystem grep against `synthesizer-adapter.ts`).
- `EI-13` (new): `GoldenTraceRunner.runCiGate` does not contain `actualFingerprint = { ...expectedFingerprint }` (filesystem grep).

These EI checks live alongside EI-7..EI-10 to give CI a permanent guard against future re-stubbing.

---

## 12. Acceptance Criteria

1. **A live sub-agent dispatch invokes ≥1 tool through `ToolGateway` and produces non-empty `rawStructured`.** Verified by integration test using a stub LLM client that emits a scripted tool call; the resulting `SubAgentOutput.kind === 'completed'` with non-empty `structured` and non-zero `usageTotals`.
2. **A live synthesizer call returns shape-typed output that satisfies `SynthesizerOutputSchema`.** Verified by unit test against `FakeSynthesizerLlmClient`; covers all 5 shapes via discriminated-union narrowing.
3. **`runCiGate` against a seeded fixture produces real `actualFingerprint` from pipeline execution and detects a deliberately-injected regression.** Verified by integration test; trace fixture includes a captured plan that, when replayed, produces a known fingerprint; modifying the fixture's expected fingerprint produces a regression report with the correct `divergedFields`.
4. **Hard-tripwire path is exercised end-to-end.** Integration test seeds an `infra_error` Tripwire from `ToolGateway`; sub-agent returns kind=`'errored'`; observability counter `agent_sub_agent_tool_failures_total{severity='hard'}` increments.
5. **Synthesizer fallback path is exercised end-to-end.** Integration test forces `SynthesizerLlmClient` to throw; adapter returns deterministic prose with `turnEndedReason: 'errored'` and `agent_synthesizer_fallback_total{cause='llm_error'}` increments.
6. **EI-11, EI-12, EI-13 drift tests pass.** Verified by `extensibility-invariant-audit.spec.ts`.
7. **No regression in PR #105 surface.** Existing `rls-all-tables.integration.spec.ts`, `agent-turn-controller.spec.ts`, `cost-recorder.spec.ts` continue to pass without modification.

---

## 13. Rollout Plan

This plan ships behind no feature flag. The intelligence layer is currently inert; turning it on changes every live turn from "produces zero spans + zero token usage + concatenated text" to "produces real spans + real cost events + LLM-synthesized output". There is no halfway state worth holding.

Sequencing:

1. **Pre-PR — ZERO_USAGE bug.** Lands first, independently. Closes one P0. ~30 min.
2. **PR 1 — `ToolGatewayPort` + `TurnPipelineRunner` refactor.** Pure refactor, no behavior change. Lands ahead of substantive PRs to give them a clean seam. ~0.5 day.
3. **PR 2 — Task A (sub-agent ReAct loop).** Largest piece. Lands behind no flag but with the `FakeSubAgentLlmClient` test path validated; production traffic switches over on merge. ~3 days.
4. **PR 3 — Task B (synthesizer LLM).** Lands after Task A is merged + soaked ~24h. ~2 days.
5. **PR 4 — Task C (golden-trace real execution + EI-11/12/13).** Lands last. CI gate gains real teeth. ~1.5 days.

Each PR follows the standard review protocol per CLAUDE.md: CI green + one approval to merge.

**Soak window:** after PR 2 + PR 3 merge, monitor `agent_sub_agent_iterations_total`, `agent_synthesizer_fallback_total`, `agent_cost_event` rates for ≥48h before declaring stable. If `fallback_total / synthesizer_call_total > 1%` sustained, roll back PR 3.

---

## 14. Dependencies

**Code (in-repo):**

- Plan 02 — `SubAgentRegistry`, `RouterLlmClient` patterns.
- Plan 03 — `phase-executor-contracts`, `buildSubAgentOutput`, pure synthesizer helpers.
- Plan 05 — `BudgetChecker.preTurnCheck` (already wired in PR #105).
- Plan 07 — `ObservabilityContextFactory`, `FlowIdPropagation`.
- Plan 10 — `ReplayHarness`, `GoldenTraceRunner`, `Fingerprint` type, `ScorerRegistry`.
- Plan 12 — `IterativeOrchestrator` interfaces (`ISubAgentRunner`, `ISynthesizer`).

**External:**

- `ai@^6.0.168` (already present).
- `@ai-sdk/openai` (already present).
- `OPENAI_API_KEY` secret (already provisioned).

**No new infrastructure, no new tables, no new external services.**

---

## 15. Integration Points

- **`agent-turn-controller`** — gains delegation to `TurnPipelineRunner`. Existing `BudgetChecker` / `ObservabilityContextFactory` / `FlowIdPropagation` wiring (PR #105) is preserved.
- **`agent-cancel-controller`** — `abortSignal` already plumbed; this plan's bridge respects it.
- **`cost-recorder`** — already consumes `agent_cost_event`; with real `usageTotals` flowing through, cost telemetry stops being identically zero.
- **`extensibility-invariant-audit`** — gains EI-11, EI-12, EI-13.
- **`agents.module.ts`** — provider wiring updated to inject `SubAgentLlmClient`, `SynthesizerLlmClient`, `TurnPipelineRunner`. Existing `SubAgentRunnerAdapter` / `SynthesizerAdapter` registrations stay (the adapter implementations change; the DI tokens don't).

---

## 16. Activation Gate

Not applicable — this plan removes stubs from production code paths. The audit findings remain open until each PR lands. Closure criteria are §12 acceptance + soak window in §13.

---

## 17. Out of Scope

Per §1 Out:

- ZERO_USAGE pre-PR (separate change).
- L4 pre-injection (Plan 04 INFO).
- Per-iteration synthesizer (Plan 12 INFO).
- LLM-judge scorer activation (Plan 10 INFO).
- Multi-provider failover (Plan 11 §17).
- Streaming sub-agent tokens to UI (Plan 03 §9 rejection).
- Tolerated-divergence scorer extensions for golden-trace.

---

## 18. Open Questions

None at design time. Implementation may surface:

- **AI SDK `experimental_output: Output.object(...)` availability in v6.0.168.** Driver fallback path uses two-step `generateText` + `generateObject`. The fallback is functionally equivalent (one extra LLM call when triggered) and is gated by an SDK-version check. If the experimental API is removed in a future SDK upgrade, the fallback becomes the only path; cost impact is monitored via `agent_sub_agent_iterations_total`.
- **`narrowToShape` ergonomics.** Zod `discriminatedUnion` narrowing requires building a single-variant `z.object({...})` matching the discriminator. Implemented as a switch over the literal `shape` values; trivial code, included in Task B.
- **`FakeSubAgentLlmClient` ergonomics for fixture-driven tests.** The fake accepts a scripted sequence of `[{ kind: 'tool-call', toolName, args } | { kind: 'final', rawStructured }]` directives and replays them as AI SDK steps. This pattern lives in the test file; not a public API.
