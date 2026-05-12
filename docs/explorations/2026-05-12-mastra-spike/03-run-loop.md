# Mastra spike — Run loop, streaming, abort, retries, prompt caching

## What Mastra does

Mastra's `loop()` is a thin factory that constructs a `MastraModelOutput` wrapping a `ReadableStream` produced by `workflowLoopStream` — the loop *is* a Mastra workflow.

- Entry point: `/Users/canh/Projects/Seta/mastra/packages/core/src/loop/loop.ts:11-166`. Generates a `runId`, builds `_internal` (id/now generators, transportRef, memory, drainPendingSignals), invokes `workflowLoopStream`, optionally wraps via `modelSpanTracker.wrapStream` (`:134`), and returns a `MastraModelOutput` (`:139`).
- Stream shell: `/Users/canh/Projects/Seta/mastra/packages/core/src/loop/workflows/stream.ts:33-302`. Creates a `ReadableStream`, emits a `start` chunk (`:221`), runs the `agentic-loop` workflow, and on completion emits `finish` (`:285`) then `safeClose` (`:299`). Failure path enqueues `error` + invokes `options.onError` (`:260-269`).
- Outer loop (tool-call iteration): `/Users/canh/Projects/Seta/mastra/packages/core/src/loop/workflows/agentic-loop/index.ts:80-277` uses `.dowhile(agenticExecutionWorkflow, predicate)`. Termination is driven by `stepResult.reason` + `isContinued` (`:270-277`), with `stopWhen` user predicates (`:144-157`), `onIterationComplete` hooks (`:160-241`), and a `_delegationBailed` escape hatch (`:244-247`). `accumulatedSteps[]` carries history across iterations (`:37`).
- Inner step pipeline: `/Users/canh/Projects/Seta/mastra/packages/core/src/loop/workflows/agentic-execution/index.ts:79-92` = `.then(llmExecutionStep).map(toolCalls).foreach(toolCallStep, {concurrency}).then(llmMappingStep).then(backgroundTaskCheckStep).then(isTaskCompleteStep)`.
- Tool concurrency: `/Users/canh/Projects/Seta/mastra/packages/core/src/loop/workflows/agentic-execution/tool-call-concurrency.ts:7-9` defaults to 10; collapses to 1 when any active tool has `hasSuspendSchema` or `requireApproval` (`:36-39`).
- Abort wiring: `LoopConfig` exposes `abortSignal` + `onAbort` (`/Users/canh/Projects/Seta/mastra/packages/core/src/loop/types.ts:111-112`). Threaded into `pRetry({signal})` (`/Users/canh/Projects/Seta/mastra/packages/core/src/stream/aisdk/v5/execute.ts:184`), into the LLM `doStream` (`:169`), into tool `onInputStart`/`onInputDelta` callbacks (`/Users/canh/Projects/Seta/mastra/packages/core/src/loop/workflows/agentic-execution/llm-execution-step.ts:395,417`), tool execution (`tool-call-step.ts:340,468,761,1115`), and processor pipelines (`:778,1022,1288,1401`). The chunk-consumer breaks on `abortSignal.aborted` per iteration (`llm-execution-step.ts:328-334`) — *some providers keep streaming after abort, so signal is re-checked every chunk*. On error, `isAbortError(err) && signal.aborted` short-circuits to `onAbort` + `{type:'abort'}` chunk (`:1316-1331, 1438-1449`).
- Retries: `pRetry` in `execute.ts:158-192` with `retries: modelSettings?.maxRetries ?? 2`, `shouldRetry` honouring `APICallError.isRetryable`, and `signal: abortSignal` so retries stop on abort. Processor-level error retries are tracked separately via `runProcessAPIError` + `maxProcessorRetries` (`types.ts:158-163`; `llm-execution-step.ts:1382-1432`).
- Prompt caching at loop level: chunk-level replay cache. `cachedResponse` short-circuits a full model call by replaying serialized chunks (`llm-execution-step.ts:997-1066`); output processors are *skipped* on cache hit (`:1187`). Reusable plumbing in `/Users/canh/Projects/Seta/mastra/packages/core/src/stream/caching-transform-stream.ts:51-92` (cache while passing through) + `createReplayStream` (`:116-190`) prepend cached history before live source — basis for `resumeStream()`. No Anthropic `cache_control` annotation is added here; that is left to provider options merged at `:1086`.
- Backpressure-safe enqueue: `/Users/canh/Projects/Seta/mastra/packages/core/src/stream/base/input.ts:14-47` — `safeEnqueue`/`safeClose`/`safeError` swallow `controller closed` throws. Used everywhere instead of bare `controller.enqueue`.
- Determinism for tests: `_internal.now`, `_internal.generateId`, `_internal.currentDate` are injectable (`loop.ts:60-77`), so recordings are reproducible.
- Loop ↔ workflows: `agentic-loop` *is* a workflow (`createWorkflow({id:'agentic-loop'})`, `agentic-loop/index.ts:56`). Snapshot persistence is gated to `pending|paused|suspended` for `resumeStream()` (`:66-76`). Sub-agents and tools-that-are-workflows reuse the same executor.

## What setup.md plans

§5 Kernel patterns (`docs/setup.md:338`):
> "Use the SDK's `.stream()` helpers, not raw `create({ stream: true })`. … The kernel wraps these into a single `ModelStream<TChunk>` interface so route authors don't see the SDK split."

§5 Loop ownership (`:366`):
> "Do NOT use `runTools()` / `beta.messages.toolRunner()`. … the kernel is exactly that loop (K4 in our roadmap). Owning the loop lets us enforce per-tool budgets, RLS-aware tool execution, structured cost accounting, and deterministic replay from `__recordings__`."

§5 Abort (`:368`):
> "Abort wiring is non-negotiable. Every model call accepts `{ signal }`. The SSE handler's `stream.onAbort()` … MUST trigger `controller.abort()` on the AbortController passed to the model SDK — otherwise a closed client leaves the LLM streaming tokens we'll never deliver, burning quota and money."

§5 Prompt caching (`:370-393`):
> "For any agent with a stable system prompt + tool definitions across turns, opt into ephemeral prompt caching by default. … The kernel exposes `cacheTtl?: '5m' | '1h' | null` on agent config; default `'5m'` for any agent with a `systemPrompt` longer than ~512 tokens."

§5 streamKernelSSE three rules (`:397-426`): (1) `stream.onAbort` wired before the loop, (2) `setInterval(…, 15_000)` keep-alive pings cleared in `finally`, (3) third-arg error handler. "Codify this in `@seta/agent-core` as a single `streamKernelSSE(c, run)` helper."

Per-tool budgets, max iterations, retry policy: setup.md only mentions "per-tool budgets" once (`:366`) — no schema, no numbers. No `maxSteps` / `stopWhen` / `maxRetries` / concurrency value appears anywhere in setup.md (`grep -n` of those terms returned only the §5 sentence above).

## Delta

**Fold in.**
1. `safeEnqueue`/`safeClose` wrappers (`stream/base/input.ts:14-47`) — adopt verbatim in `streamKernelSSE`; controller-closed races are otherwise silent SSE drops.
2. Signal-check-per-chunk pattern (`llm-execution-step.ts:328-334`). setup.md §5 only abort-on-controller; Mastra shows providers buffer past abort, so the consumer must guard every chunk.
3. Split abort handling: `isAbortError(e) && signal.aborted` ⇒ `debug` log + `onAbort` + `abort` chunk; everything else ⇒ `error` chunk (`llm-execution-step.ts:1316-1331`). Prevents alert-noise from client disconnects.
4. `pRetry` with `signal` + `APICallError.isRetryable` (`execute.ts:158-192`) — gives us setup.md's missing retry policy in 10 lines.
5. Injectable `_internal.now/generateId/currentDate` (`loop.ts:60-77`) for SA-6: testkit recordings need deterministic ids/timestamps, otherwise `__recordings__/*.json` diff on every record.
6. `toolCallConcurrency` default 10, forced to 1 when any tool requires approval (`tool-call-concurrency.ts:36-39`). Cheap, fits "RLS-aware tool execution."
7. `stopWhen[]` array of predicates evaluated over `accumulatedSteps` (`agentic-loop/index.ts:144-157`) is a cleaner shape than a scalar `maxSteps`.

**Avoid.**
- Mastra's loop = full workflow engine (snapshot persistence, suspend/resume, processor stacks, span trackers, background-task manager). P1 doesn't need any of that and it drags in `createWorkflow`, `ProcessorRunner`, `BackgroundTaskManager`, `SaveQueueManager`. Pull *patterns*, not the workflow shell.
- Mastra's `cachingTransformStream` (`stream/caching-transform-stream.ts`) is a *chunk replay cache* (resume reconnects), not Anthropic prompt caching. setup.md's `cacheTtl` plan is provider-level `cache_control`; these are orthogonal and shouldn't be conflated when we name the agent config field.
- Mastra has no Anthropic `cache_control` wiring at loop level — it punts to `providerOptions`. We must do this ourselves; no pattern to copy.
- `MastraModelOutput` is ~474 lines wrapping a single stream with replay/finalisation helpers. P1's `ModelStream<TChunk>` should stay minimal.

**Open questions.**
- SA-5 (workflows): Mastra unifies loop + workflows. P1 setup.md doesn't mention workflows as a kernel concept. Do we adopt a `dowhile`+`foreach` workflow runtime in K-something, or hand-write the loop and revisit in P2?
- SA-6 (recording): Mastra's determinism hooks live on `_internal`. Should `@seta/agent-core`'s testkit accept the same shape (`{now, generateId, currentDate}`) so swapping record/replay is one option bag?
- Per-tool budget shape: Mastra doesn't have one (it has concurrency only). setup.md promises it but doesn't spec it. Token budget? Wall-clock? Both?

## Punch list

- setup.md §5: add an explicit "max iterations / stopWhen" subsection. Spec a default (e.g. `maxSteps: 16`) and a `stopWhen?: (steps) => boolean | Promise<boolean>` shape mirroring `agentic-loop/index.ts:144-157`. Today the section is silent.
- setup.md §5: add a "retry policy" subsection. Spec `maxRetries: 2` default, retry only on `isRetryable` errors, `signal`-aware (mirrors `execute.ts:183-190`). Today the only mention is "RLS-aware tool execution" hand-wave at `:366`.
- setup.md §5: add a "per-tool budget" sub-bullet under `:366` with at minimum `{ maxCalls, maxTokens?, timeoutMs? }` or strike the phrase. Currently promised, undefined.
- setup.md §5: extend the abort paragraph at `:368` with "and re-check `signal.aborted` on every consumed chunk — some providers keep emitting after abort." Cite Mastra `llm-execution-step.ts:328-334`.
- setup.md §5: clarify that `cacheTtl` (`:393`) is provider prompt caching, separate from any future chunk-replay cache for resumeable SSE. Avoid future naming collision.
- setup.md §5: in the `streamKernelSSE` block (`:397-426`), require `safeEnqueue` semantics on the writer — note that `stream.writeSSE` after client-disconnect must not throw the loop.
- @seta/agent-core: leave a hook for injectable `{ now, generateId, currentDate }` on the kernel `run` context (mirrors `loop.ts:60-77`) so SA-6 recordings are byte-stable.
- @seta/agent-core: leave a hook for `toolCallConcurrency` + auto-sequential when a tool declares `requireApproval` (mirrors `tool-call-concurrency.ts`). Even if P1 ships sequential, the seam matters.
- @seta/agent-core: leave a hook on the loop `options` for `stopWhen?: StopCondition | StopCondition[]` and `onIterationComplete?` — both are 5-line wires and cheap to expose now.
- @seta/agent-core: split abort vs error branches in the SSE writer (mirrors `llm-execution-step.ts:1316-1331`) so client-disconnect doesn't log at `error` level.
- P2-defer: workflow-as-loop architecture (snapshot persistence, suspend/resume, `dowhile`/`foreach` step DAG). Drags `createWorkflow`, `ProcessorRunner`, `SaveQueueManager` — out of scope for P1.
- P2-defer: chunk-replay cache + `resumeStream()` (`caching-transform-stream.ts`). Useful for browser reconnects, but P1 only promises in-memory SSE.
- P2-defer: processor stack (`outputProcessors`, error processors, tripwire). Mastra-specific abstraction; revisit when we have a concrete moderation/redaction need.
