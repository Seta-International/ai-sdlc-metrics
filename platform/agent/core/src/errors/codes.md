# @seta/agent-core — stable error codes

Every code below is the `code` field on a `KernelError` subclass. The mapping
is stable across minor versions; renaming a code is a breaking change.

## LLM_* (K2)

| Code | Domain | Category | When |
|---|---|---|---|
| `LLM_TRANSIENT_EXHAUSTED` | LLM | THIRD_PARTY | SDK retries done, still 5xx/429 |
| `LLM_RATE_LIMITED` | LLM | THIRD_PARTY | 429 with explicit no-retry header |
| `LLM_SERVER_ERROR` | LLM | THIRD_PARTY | 5xx beyond retry budget |
| `LLM_AUTH_FAILED` | LLM | SYSTEM | 401/403 from the provider |
| `LLM_BAD_REQUEST` | LLM | SYSTEM | 400 (malformed) |
| `LLM_CONTENT_POLICY` | LLM | USER | 422 / content-policy refusal |
| `LLM_STREAM_INTERRUPTED` | LLM | THIRD_PARTY | Mid-stream socket error |
| `LLM_INVALID_TOOL_ARGS` | LLM | THIRD_PARTY | Tool args JSON parse failed |
| `LLM_UNKNOWN` | LLM | SYSTEM | Fallback for unrecognized provider errors |

## AGENT_* (K4)

| Code | Domain | Category | When |
|---|---|---|---|
| `INVALID_MAX_STEPS` | AGENT | USER | `RunLoopOptions.maxSteps <= 0` |
| `INVALID_CONCURRENCY` | AGENT | USER | `RunLoopOptions.toolCallConcurrency <= 0` |
| `ADAPTER_PROTOCOL_VIOLATION` | AGENT | THIRD_PARTY | `finishReason='tool_calls'` but final message has no `tool_use` content blocks |
| `PROCESSOR_ABORTED` | AGENT | USER | A processor called `ctx.abort()` |
| `PROCESSOR_RETRY_EXHAUSTED` | AGENT | SYSTEM | `processAPIError` returned `'retry'` past internal cap |
| `PROCESSOR_FAILED` | AGENT | SYSTEM | A processor hook threw a non-abort error |
| `STOP_WHEN_FAILED` | AGENT | SYSTEM | A `stopWhen` predicate threw |
| `ADAPTER_NOT_REGISTERED` | AGENT | SYSTEM | Model id references a provider not in the adapter registry |
| `INVALID_MODEL_ID` | AGENT | USER | Model id failed `<provider>/<model>` parse |
| `ADAPTER_ALREADY_REGISTERED` | AGENT | SYSTEM | Provider name registered twice |
| `UNKNOWN_KERNEL_ERROR` | KERNEL | SYSTEM | Coerced from a non-KernelError thrown value |

## TOOL_* (K4)

| Code | Domain | Category | When |
|---|---|---|---|
| `TOOL_UNKNOWN` | TOOL | THIRD_PARTY | Model called a tool name not in `cfg.tools` |
| `TOOL_EXECUTION_FAILED` | TOOL | SYSTEM | `execute()` rejected |
| `TOOL_TIMEOUT` | TOOL | SYSTEM | Per-tool `timeoutMs` elapsed |
| `TOOL_BUDGET_EXCEEDED` | TOOL | USER | Per-tool `maxCalls` reached |
| `TOOL_SUSPEND_NOT_SUPPORTED` | TOOL | SYSTEM | Tool returned `{suspend}` with no workflow runtime bound |

Validation errors returned via `ToolResult<{ok:false, error}>` do NOT carry
a code from this catalog; they live on the tool message as `isError:true`
and are intentionally opaque to the kernel — they are the LLM's job to
self-correct.
