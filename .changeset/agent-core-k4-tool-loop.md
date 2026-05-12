---
"@seta/agent-core": minor
---

K4: tool-call iteration outer loop — multi-step model→tools→model runs.

Adds:
- Outer iteration over `accumulatedSteps[]` with `stopWhen` (OR semantics,
  async-aware; only evaluated when the most recent model step's
  `finishReason === 'tool_calls'`), `maxSteps` cap (default 16, counts model
  calls; tools on the cap-triggering step are NOT executed since the
  follow-up model call will never happen).
- Bounded concurrent tool execution (`toolCallConcurrency` default 10,
  inline semaphore — no `p-queue` dep). Auto-collapses to 1 when any tool
  in the batch declares `annotations.requireApproval`.
- Per-tool budgets: `perToolBudget: { maxCalls?, timeoutMs? }`. `maxCalls`
  counted by `tool.id` across the whole run; `timeoutMs` enforced via
  `AbortSignal.any([ctx.signal, AbortSignal.timeout(ms)])`.
- Fallback-model failover (`AgentConfig.fallback`) on transient-exhausted
  classes only: `LLM_TRANSIENT_EXHAUSTED`, `LLM_SERVER_ERROR`,
  `LLM_RATE_LIMITED`. Auth, content-policy, bad-request, etc. are
  terminal.
- Three live processor hooks: `processInput` (once at run start),
  `processOutputStep` (after every model and tool step; can rewrite the
  message that feeds the next iteration), `processAPIError` (between
  SDK retry exhaustion and fallback failover; `'retry'` reattempts the
  same model bounded by an internal cap).
- One `tool.<name>.execute` OTel span per tool call (attrs `tool.name`,
  `tool.id`, `run.id`, `tenant.id`, `tool.error_code?`, `tool.timed_out?`,
  `tool.budget_exceeded?`) and one `agent.run.loop` span per run (attrs
  `loop.stop_reason` ∈
  `natural_stop|natural_length|stop_when|step_limit|error|aborted|processor_aborted`
  and `loop.iterations`).
- Memory `saveTurn` is invoked exactly once at end of natural termination
  / `stopWhen` / `maxSteps`; skipped on abort or any error chunk.

BREAKING:
- `StopCondition` signature changed from `(steps) => boolean | Promise<boolean>`
  to `({ steps }) => boolean | Promise<boolean>`. K1 reserved the type with
  no in-tree consumers, so this is a one-shot rename. External consumers
  must update.

New stable error codes (see `src/errors/codes.md`):
`INVALID_MAX_STEPS`, `INVALID_CONCURRENCY`, `ADAPTER_PROTOCOL_VIOLATION`,
`TOOL_UNKNOWN`, `TOOL_EXECUTION_FAILED`, `TOOL_TIMEOUT`,
`TOOL_BUDGET_EXCEEDED`, `TOOL_SUSPEND_NOT_SUPPORTED`,
`PROCESSOR_ABORTED`, `PROCESSOR_RETRY_EXHAUSTED`, `PROCESSOR_FAILED`,
`STOP_WHEN_FAILED`.

`StepResult` gains four optional fields: `finishReason`, `toolCallId`,
`toolName`, `error`.

`FakeAdapter` constructor now takes `FakeAdapterScript[]` (multi-step
scripting; one script returned per `stream()` invocation). Call sites
updating from `new FakeAdapter({ chunks: ... })` to
`new FakeAdapter([{ chunks: ... }])` is a mechanical rewrite.
