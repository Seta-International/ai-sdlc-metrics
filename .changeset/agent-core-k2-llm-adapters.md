---
"@seta/agent-core": minor
---

K2: concrete `createAnthropicAdapter`, `createOpenAIAdapter`, and
`createAzureOpenAIAdapter` factories that satisfy the K1 `ModelAdapter` contract.
Pure helpers (`cache-control`, `tokens`, `translate/*`) compose into each
adapter. `startLlmSpan` emits one OTel span per LLM call with baseline attrs
(`llm.provider`, `llm.model`, `run.id`, `tenant.id`) and end-state attrs
(`finishReason`, `inputTokens`, `outputTokens`, `cacheReadInputTokens`,
`errorCode`, `aborted`). First wire-up in `apps/api/src/agent.ts` registers
Anthropic + OpenAI (and Azure OpenAI when configured) into the adapter registry
at boot.

OpenAI's automatic structured-output caching makes `cacheTtl` a documented
no-op on `createOpenAIAdapter` and `createAzureOpenAIAdapter`. Anthropic's
ephemeral prompt-cache annotations are applied automatically when `cacheTtl !==
null`.
