---
'@seta/agent-core': minor
---

Promote `mapOpenAIError` to public API so downstream packages (next: `@seta/agent-embeddings`) can share the OpenAI SDK → `LlmError` mapping instead of duplicating it.
