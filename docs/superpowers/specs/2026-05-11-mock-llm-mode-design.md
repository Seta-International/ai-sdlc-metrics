# Design — Mock LLM Mode (Epic 5, throwaway scaffolding)

**Status**: Draft for review · scoped as throwaway in brainstorm
**Author**: Canh Ta (with Claude)
**Date**: 2026-05-11
**Source brainstorm**: `docs/plans/MS365 Epics Brainstorm.md` — Epic 5
**Lifespan**: W1 build → W1-W3 use → **W3 deletion before staging deploy**

> This is the smallest spec in the set on purpose. Mock mode is parallelism scaffolding, not a permanent feature. The design is intentionally minimal because the code is intentionally short-lived.

---

## 1. Goal

In W1, AG team (AG-S, AG-F1, AG-F2) can write + run + test agent kernel code (K1–K7) without depending on FS/DO finishing OpenAI credential wiring. They use canned LLM responses behind the same `ModelClient` interface the real OpenAI client implements. The mock client is **removed from the codebase at end of W3** once the real OpenAI path is stable and `__recordings__/` (record/replay) handles deterministic CI.

## 2. Non-goals

- Production guard rails (it's deleted before any deploy).
- Demo mode / fallback / nightly smoke (no live consumer of mock by W4).
- Quarterly fixture refresh (~10 fixtures, hand-written, used for ~2 weeks).
- Fixture coverage CI gates.
- A `MockModelClient` for Anthropic. Mock only OpenAI because that's what the K-phase work targets first; if AG-S writes Anthropic-side code in W1, the real Anthropic client is already cheap enough to use directly (smaller token bills than OpenAI for K-phase scratch work).

## 3. What lives where

```
platform/agent/core/src/models/
  mock.ts                            NEW — MockModelClient implements ModelClient
  __fixtures__/mock-llm/             NEW — hand-written JSON fixtures (10–15 prompts)
    list-tasks.json
    create-task-confirmation.json
    workload-analysis.json
    ...

apps/api/src/env.ts                  add MOCK_LLM env (z.boolean default false)
platform/agent/core/src/models/index.ts
                                     factory picks MockModelClient if MOCK_LLM=1, else OpenAIModelClient
```

## 4. Interface — shared with the real client

```ts
// platform/agent/core/src/models/types.ts (from K3)
interface ModelClient {
  stream(input: {
    messages: Message[]
    tools?: Tool[]
    system?: string
    signal?: AbortSignal
  }): AsyncIterable<ModelChunk>
}
```

The mock returns the same `AsyncIterable<ModelChunk>` shape. AG team writes against `ModelClient`; the implementation behind the interface is invisible at the call site.

## 5. Mock impl — minimal

```ts
// platform/agent/core/src/models/mock.ts
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'

const FIXTURES_DIR = path.join(__dirname, '__fixtures__/mock-llm')

export class MockModelClient implements ModelClient {
  async *stream(input) {
    const key = await keyFor(input)                    // sha256 hash of messages + tools + system
    const file = path.join(FIXTURES_DIR, `${key}.json`)
    let chunks: ModelChunk[]
    try {
      chunks = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      // Per AC-4: fail loud
      throw new Error(
        `MockModelClient: no fixture for key ${key}. ` +
        `To capture, set RECORD=1 and re-run, OR hand-author ${file}.`
      )
    }
    for (const chunk of chunks) yield chunk
  }
}

async function keyFor(input) {
  const stable = JSON.stringify({
    msgs: input.messages.map(m => ({ role: m.role, content: m.content })),
    tools: (input.tools ?? []).map(t => ({ name: t.name, parameters: t.parameters })),
    system: input.system ?? '',
  })
  return createHash('sha256').update(stable).digest('hex').slice(0, 16)
}
```

**Match key:** deterministic hash of the *input shape* — not raw bytes — so re-runs against semantically-identical inputs hit the same fixture even if order or whitespace varies in the source code that built them.

**On miss:** throw with a clear message including the key. Don't fall back to live OpenAI (would silently hide missing fixtures).

## 6. Factory

```ts
// platform/agent/core/src/models/index.ts
export function createModelClient(env: { MOCK_LLM: boolean; OPENAI_API_KEY?: string }): ModelClient {
  if (env.MOCK_LLM) return new MockModelClient()
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY required when MOCK_LLM is not set')
  return new OpenAIModelClient(env.OPENAI_API_KEY)
}
```

## 7. Fixtures — 10–15 hand-written, covering W1-W2 prompts

The fixtures cover the prompts AG team needs in W1-W2 development:
- "list my tasks" — agent calls `planner.list_my_tasks` tool then summarizes
- "create three tasks under plan X" — agent calls `planner.create_tasks.preview` with three items
- "who's overloaded?" — agent calls `planner.workload_analysis`
- "complete task 'launch checklist'" — agent calls `planner.complete_tasks.preview`
- Simple text reply (no tool call)
- Multi-turn: follow-up after card confirmation
- Anthropic-shape fixture (not strictly used in W1; included as a safety net if AG-S touches it)
- A few negative-path: tool error, malformed args
- Total ~10-15 files

Files are committed under `platform/agent/core/src/__fixtures__/mock-llm/`. Authoring is via inspection of the OpenAI streaming response shape from K3 — the file is just a serialized array of `ModelChunk` events.

## 8. Lifecycle (compressed)

| Week | State |
|---|---|
| W1 (Mon-Tue) | AG-F2 ships `MockModelClient` + 10 fixtures. AG team starts using it. |
| W1-W3 | AG team uses mock when convenient (FS hasn't wired prod OpenAI yet, or for fast inner loop). |
| End of W3 | Real OpenAI is wired through K3 + W4-W5 server endpoints. AG-S **deletes**:<br>- `platform/agent/core/src/models/mock.ts`<br>- `platform/agent/core/src/__fixtures__/mock-llm/` (entire dir)<br>- `MOCK_LLM` from `env.ts`<br>- the factory branch (replace `createModelClient` body with direct OpenAI construction)<br>- Any test file imports of `MockModelClient`<br>CI runs entirely against live OpenAI (with K6 record/replay for cost containment). |
| W4+ | Mock mode does not exist. |

**Removal is a tracked task with a W3 deadline.** PM blocks W4 start if mock is still in the codebase. The removal commit's title is `chore(agent-core): remove mock LLM mode (W3 deadline)`.

## 9. Why no demo mode, prod guards, etc.

Because mock is **deleted before any deploy**:
- No demo fallback needed — staging uses real OpenAI.
- No prod guard against MOCK_LLM=1 — the env var doesn't exist post-W3.
- No mock/live drift concern — same reason.
- No nightly smoke — nothing to smoke.

These risks don't exist if the code is gone. We are not building infrastructure to manage a thing that won't be alive.

## 10. Acceptance criteria

| AC (brainstorm Epic 5) | Met by |
|---|---|
| AC-1: same interface as OpenAI | §4 shared `ModelClient` |
| AC-2: `MOCK_LLM=1` toggle | §6 factory |
| AC-3: 10-15 hand-written fixtures | §7 |
| AC-4: missing-fixture fails loud | §5 error message |
| AC-5: removed by end of W3 | §8 lifecycle + tracked task |

## 11. Effort recap

| Addition | MD | Owner |
|---|---:|---|
| `MockModelClient` + fixtures | 0.50 | AG-F2 |
| Removal task in W3 | 0.10 | AG-S |
| **Total** | **+0.60** | AG-S +0.10 · AG-F2 +0.50 |

## 12. Open follow-ups

None. The brainstorm scoped this as throwaway scaffolding; there are no questions left to resolve.

## 13. References

- K6 record/replay (kernel) — the **permanent** CI-cost-containment mechanism that outlives mock mode.
- Epic 1-4 specs (for context on what the kernel work AG team is doing leads to).
