# Mastra Spike — Memory (L1/L2/L3/L4, working memory, thread config)

Scope: memory mechanics only. Identity/RLS/tenancy partitioning was covered in `02-identity-tracking.md` and is not repeated here.

## 1. How mastra does it

### 1.1 Two persistent layers — `thread` and `resource`

Mastra exposes exactly **two** persistent scopes. There is no L3/L4 equivalent:

- `thread` — the conversation (our "conversation"). `StorageThreadType` with `resourceId`, `title`, `metadata` (`packages/core/src/storage/types.ts:243` — threads are implicit; the explicit resource record is `StorageResourceType`).
- `resource` — a persistent per-user record carrying `workingMemory: string` and opaque `metadata`
  (`packages/core/src/storage/types.ts:243-249`).

The default scope is `resource` — i.e. memory survives across threads for the same user (`packages/core/src/memory/types.ts:181-183`, `"@default 'resource'"`).

### 1.2 Thread config shape (what `SharedMemoryConfig.options` lets you tune)

Defaults come from `memoryDefaultOptions` (`packages/core/src/memory/memory.ts:80-99`):

```ts
lastMessages: 10,
semanticRecall: false,
generateTitle: false,
workingMemory: { enabled: false, template: "# User Information\n- **First Name**: ..." }
```

Working-memory shape is a discriminated union — `TemplateWorkingMemory | SchemaWorkingMemory | WorkingMemoryNone`
(`packages/core/src/memory/types.ts:188-204`). `use` was removed; it is always tool-call mode
(`packages/core/src/memory/memory.ts:370-372`). `scope` on both `workingMemory` and `semanticRecall`
is `'thread' | 'resource'` — same knob in two places (`types.ts:183`, `types.ts:337`).

### 1.3 `lastMessages` — recency windowing, no γ-style tiering

`recall()` takes a single integer `perPage` that comes from `config.lastMessages`
(`packages/memory/src/index.ts:277`). It always `ORDER BY createdAt DESC` then reverses
back to chronological in-process (`packages/memory/src/index.ts:289-292`, `419`) — i.e. "last N"
means "N most recent verbatim". Everything older is dropped unless semantic recall pulls
it back via an `include` clause (`packages/memory/src/index.ts:401-416`).

There is **no** notion of "last 3 verbatim + last 10 compressed" tiering in `recall()` itself.
Tiering exists but is implemented by a separate pipeline — observational memory (§1.6).

`lastMessages: false` disables history entirely; `historyDisabledByConfig` shortcircuits the
query path and returns empty unless semantic recall is separately producing include hits
(`packages/memory/src/index.ts:283`, `342-353`, `390-392`).

### 1.4 Working memory — persistent-per-resource scratchpad

Working memory is a single string (markdown or JSON, per schema) stored on either the
resource row or the thread metadata (`packages/memory/src/index.ts:609-651`,
`packages/memory/src/index.ts:629-647`):

- scope `'resource'` → `memoryStore.updateResource({ resourceId, workingMemory })`
- scope `'thread'` → merges into `thread.metadata.workingMemory`

Writes are concurrency-safe via an in-process `Mutex` keyed by `resource-{id}` or `thread-{id}`
(`packages/memory/src/index.ts:619-625`, `660`, `686-691`).

Reads happen at the **start of every turn** — the `WorkingMemory` input processor fetches
the current string and injects it as a system message (`packages/core/src/processors/memory/working-memory.ts:82-149`,
specifically `messageList.addSystem(instruction, 'memory')` at `:149`).

Writes happen via an LLM **tool call**: `update-working-memory`
(`packages/memory/src/tools/working-memory.ts:171-174`). The tool's description tells the
model "Any data not included will be overwritten" (template mode) or "Data is merged …
arrays are replaced entirely" (schema mode) (`working-memory.ts:167-169`). There is no
server-side extraction loop — the agent decides when to call the tool.

The vNext experimental variant (`packages/memory/src/index.ts:664-808`) adds find/replace
semantics via `searchString` and duplicate-suppression by normalized-whitespace comparison
against the template (`:704-706`, `:712-730`).

### 1.5 Semantic recall config — decoupled from recency

When `config.semanticRecall` is set **and** a `vectorSearchString` is passed to `recall()`,
mastra (a) embeds the query, (b) queries the vector store for top-K, (c) fetches the hit
messages plus a configurable before/after window (`messageRange`) as `include` items
alongside the recency page (`packages/memory/src/index.ts:355-417`).

Shape (`packages/core/src/memory/types.ts:301-337`):

```ts
topK: number                    // default 4 (packages/memory/src/index.ts:110)
messageRange: number | { before, after }   // default { before: 1, after: 1 } (idx:109)
scope: 'thread' | 'resource'    // default 'resource' (types.ts:337)
indexConfig?: { type, metric, hnsw, ivf }  // pg-only hints (types.ts:215-290)
```

Embeddings are written inline during `saveMessages()` — the per-message text is embedded,
then batched into a single `vector.upsert()` (`packages/memory/src/index.ts:946-1020`). This
is **on** the critical path of the save (vectors upsert before `saveMessages` resolves).

An in-process `embeddingCache` keyed by xxhash of the content string dedupes repeated
embed calls (`packages/memory/src/index.ts:842-906`). Cache lifetime = process lifetime,
so long-running servers grow unbounded in RAM unless restarted.

### 1.6 Observational memory — mastra's actual tiering/compression layer

Three-agent pipeline, separate package, entirely outside `recall()`
(`packages/memory/src/processors/observational-memory/observational-memory.ts:226-262`):

- **Actor** — the normal agent.
- **Observer** — periodically reads N most recent unobserved messages (threshold
  `observation.messageTokens`, default 30 000 tokens —
  `packages/memory/src/processors/observational-memory/constants.ts:4-23`) and extracts
  "observations" (structured facts). Runs on `google/gemini-2.5-flash` by default at
  `temperature: 0.3`.
- **Reflector** — compresses old observation groups into denser summaries once observations
  exceed `reflection.observationTokens` (default 40 000, `temperature: 0`
  — `constants.ts:24-40`).

Critically for our spec: these are **async buffering** jobs — `bufferTokens: 0.2`
(buffer every 20% of threshold), `bufferActivation: 0.8` (activate at 80%) — not blocking
calls (`constants.ts:20-22`). `shareTokenBudget` is incompatible with async buffering and
must explicitly opt out (`observational-memory.ts:435-451`). Per-resource in-process mutex
serializes cycles to prevent double-extraction (`observational-memory.ts:305-347`).

Injection: on input, observations are rendered into a single block
`<observations>…</observations>` prefixed with `OBSERVATION_CONTEXT_PROMPT` and followed
by a long instruction block telling the model "prefer the MOST RECENT information",
"treat the latest user message as highest-priority signal", and not to mention the memory
system (`constants.ts:61-75`, `observational-memory.ts:1563`). Observed messages are then
**filtered out** of the actor's context — the actor sees compressed observations + a
"continuation hint" + recent unobserved messages only.

Observation groups carry a `range="startId:endId"` pointer back to raw messages, and a
`recall` tool lets the actor paginate back into raw history when it needs exact content
(`constants.ts:81-100`, `packages/memory/src/tools/om-tools.ts`).

### 1.7 Title generation — fire-and-forget, off critical path

`agent.ts:5138-5158` — if `generateTitle.shouldGenerate` and the thread has no title yet,
the main flow uses `void this.genTitle(...).then(...)` — no `await`. The title LLM call
happens after the response is already being returned. The title tool has its own
model/instructions independent of the main agent (`agent.ts:6100-6127`).

Mastra has **no other** turn-level summarization. The only compression path is
observational memory (§1.6), and it too is async buffered.

### 1.8 Save path — debounced write queue

`SaveQueueManager` (`packages/core/src/agent/save-queue/index.ts`):

- Per-thread `Map<threadId, Promise<void>>` for serializing writes (`:18`, `:60-73`).
- 100 ms debounce (`:14-15`) — rapid successive saves coalesce into one DB write.
- Staleness override: if the earliest unsaved message is > 1000 ms old, debounce is
  skipped and the save is flushed immediately (`:11`, `:114-123`).
- `flushMessages()` forces an immediate save for shutdown / critical transitions
  (`:134-138`).

Net effect: message persistence is async + batched per thread, but always completes
before the next turn (the `flush` runs at turn boundaries).

### 1.9 Read caching — there is no tool-result cache

`packages/core/src/agent/message-list/cache/CacheKeyGenerator.ts` is the MessageList's
dedup cache — it keys off `type + text + toolCallId + state + reasoning` to detect when
a _message_ part has been updated (`:22-55`). It is **not** a tool-call-result cache.
It does not key off `(tool_name, args)` at all — `toolCallId` is a per-call opaque id.

Grep for `toolCallCache|dedupe.*tool` returns zero runtime hits across `packages/` — only
mastra-unrelated hits in `playground-ui/CHANGELOG.md` and recording fixtures. Mastra does
**not** dedupe repeated same-tool-same-args calls within a turn.

---

## 2. What this tells us

1. **Our L1–L4 taxonomy is finer-grained than mastra's.** Mastra collapses everything
   persistent into two scopes (`thread`, `resource`) and overlays a compression pipeline
   (observational memory) on top. It does not separately model "non-domain user
   preferences" (our L3) vs "tenant/role organizational facts" (our L4); those are both
   just `resource.metadata` fields or live outside memory entirely.

2. **Working memory is a real category we did not name.** Mastra's resource-scoped
   working-memory string is an LLM-maintained, persistent-per-user scratchpad that gets
   injected as a system message **every turn** and written via a tool call. Our §5
   treats all L3 writes as "user-initiated only in v1" to avoid prompt injection. Mastra
   treats working memory as agent-maintained by default — the agent is instructed to call
   `update-working-memory` whenever it learns a new stable fact. This is exactly the
   "agent-proposed extraction" surface we deferred. It is a legitimate third category
   distinct from both our L3 (UX prefs) and our L2 (conversation history): **agent-owned
   durable scratchpad**, scoped per resource, injected as system context.

3. **`lastMessages` is strictly recency — no γ tiering.** Mastra's v1 ships _either_ last-N
   verbatim _or_ last-N verbatim + semantic-recall top-K (not "3 verbatim + 10 compressed").
   Compression is opt-in via observational memory and is its own pipeline. Our γ split
   (3 verbatim + 10 compressed + background) is more ambitious than mastra's plain
   `lastMessages` but roughly matches the Actor/Observer split in observational memory
   — except mastra keeps recent unobserved raw and compresses old, where our spec keeps
   the _last 3_ raw and compresses 4–13. The mastra design is simpler (one threshold)
   and easier to reason about.

4. **Semantic recall is a flipped switch — embeddings happen on the save path.** Mastra's
   embedder runs inline inside `saveMessages()` before the DB write returns
   (`packages/memory/src/index.ts:946-1020`). Our §16 defers embeddings to v1.5. The
   mastra config shape (`topK`, `messageRange`, `scope`, `indexConfig`) is small and maps
   cleanly onto any future `recall_semantic` tool we build — nothing exotic to borrow.

5. **Summarization is off the critical path in mastra too — two different ways.**
   Title generation is `void`-then fire-and-forget (agent.ts:5142). Observation /
   reflection use explicit async buffering with activation thresholds at 80% /
   50% of their respective token budgets, and an in-process mutex for per-resource
   serialization. Our "post-turn async, written to `agent_message.summary`" matches the
   _title_ pattern and is strictly simpler than the observation/reflection pipeline.

6. **There is no tool-result dedup cache in mastra.** The same tool called twice with
   the same args in one turn hits the tool twice. Our L1 turn-scoped read cache (§5,
   key `(tool_name, canonical_args_hash)`) is a feature mastra lacks — this validates
   the design, not against it.

7. **Thread-vs-resource scope is a single config knob, applied identically to
   `workingMemory.scope` and `semanticRecall.scope`.** Our partition `(tenant_id, user_id,
conversation_id)` for L2 and `(tenant_id, user_id)` for L3 maps cleanly onto
   `scope: 'thread'` and `scope: 'resource'` respectively — but mastra has neither
   `tenant_id` nor our multi-tenant concerns; we layer that in (covered by 02).

8. **Debounced save queue is a useful primitive we do not currently specify.** 100 ms
   debounce + 1 s staleness cap, serialized per thread (`save-queue/index.ts:11, 14, 60-73`).
   Our spec describes writing messages post-turn; we should decide whether rapid tool-step
   updates coalesce or each gets its own row. Mastra coalesces — fewer DB writes per turn,
   no data loss because a turn-end flush is guaranteed.

---

## 3. Proposed edits to `agent-runtime.md`

### 3a. §5 — rename / add a layer for "agent-owned durable scratchpad"

Current spec has L3 = "Non-domain user preferences, UX-scoped, user-initiated writes only
in v1". Mastra's working memory is a _different_ thing: agent-writable, per-resource,
injected as system context every turn, used for names/projects/goals the agent learned.
We have two options:

- **Option A (recommended)**: keep L3 as user-pref only, add **L3.5 "agent scratchpad"**
  deferred to v1.5 with explicit call-out that it is the prompt-injection write surface
  we already identified. Partition `(tenant_id, user_id)`, write via tool call with
  server-side allowlist of keys.
- **Option B**: merge agent-scratchpad into L3 and widen the v1 write policy. **Reject**
  — we already ruled this out in §5 precisely because of the injection risk. Keep L3 read-
  only-by-agent in v1.

Insert under §5 (after L4, before invariants):

> **L3.5 — Agent scratchpad** (deferred v1.5). Persistent-per-user markdown/JSON blob the
> agent maintains via a single `scratchpad_write` tool. Injected as a system message at
> turn start. Partition `(tenant_id, user_id)`. Key/schema allowlist enforced server-side
> to bound the injection surface. Not shipping in v1; documented here because mastra's
> `workingMemory` proves the pattern and we want L3 to remain UX-pref-only without
> implying agent-derived facts have no home at all.

### 3b. §5 — clarify γ tiering vs mastra's single-threshold approach

Our γ = "last 3 verbatim + last 10 compressed + background" is richer than mastra. Add a
sentence: "Unlike mastra's single `lastMessages` cutoff, we stage compression because v1
runs without embeddings — we need _some_ older context without `recall_semantic`.
Compression model fixed at `gpt-5.4-nano`, summaries stored on `agent_message.summary`
(already §5)."

### 3c. §5 — L1 read cache: explicit non-dependency on mastra

Add one-line: "Mastra does not dedup tool results within a turn; we do. Key
`(tool_name, canonical_args_hash)`, per-sub-agent, no cross-sub-agent sharing — see §4."

### 3d. §16 — semantic recall shape for v1.5

Pre-register the future config shape to mirror mastra so the upgrade is a flipped switch,
not a redesign:

```ts
semanticRecall?: false | {
  topK: number;           // default 4
  messageRange: { before: number; after: number };  // default 1/1
  scope: 'conversation' | 'user';   // our equivalent of thread/resource
};
```

No code yet — just lock the shape. Justification: embedder cost/latency is still the v1
no-go, and embedding-on-save (mastra's choice) would couple writes to OpenAI availability.

### 3e. §5 — async save queue semantics

Add: "Turn-end message persistence uses a per-conversation debounced queue (100 ms
coalesce window, 1 s staleness cap, serialized per thread). Flush forced at turn boundary.
Mirrors mastra `SaveQueueManager` — reduces DB writes during multi-step tool loops
without risking data loss."

### 3f. §5 invariants — add

> Working memory / agent scratchpad is **not** part of v1. Any "agent derived the user's
> project name" fact is written to `conversation_summary` (L2) or `agent_message.summary`
> only. Cross-conversation carry-over is out of scope until L3.5 ships.

---

## 4. What we are not borrowing

1. **Observational memory's three-agent pipeline.** Observer + Reflector + Actor with
   async buffering, dynamic thresholds, per-provider retention heuristics
   (`observational-memory.ts:395-495` alone is ~100 lines of threshold math). We do not
   have the long-conversation problem it solves (most HR conversations will be <20 turns).
   The static γ window + post-turn `gpt-5.4-nano` summary is sufficient for v1 and v1.5.
   Re-evaluate if we observe conversations routinely exceeding our 10-turn compression
   window.

2. **Inline embedding during `saveMessages`.** Couples the save path to the embedder
   provider. We already decided §16 embeddings are out-of-band (post-turn job). Keep it
   that way when we turn on semantic recall — write embeddings from the summarizer job,
   not the save hot path.

3. **Working memory with `scope: 'thread'`.** Mastra offers both thread-scoped and
   resource-scoped working memory. Thread-scoped adds no value over L2 conversation
   summary for us — same partition, same lifecycle, but a parallel write path. Only the
   resource scope (`(tenant_id, user_id)`) is interesting, and that is L3.5.

4. **Free-form markdown templates for working memory** (`memoryDefaultOptions.workingMemory.template`,
   `memory.ts:86-98`). Mastra's default template is "fill in these blanks: first name,
   location, interests, goals". This is pure prompt-engineered extraction with zero
   server-side validation. When L3.5 ships, the write tool must take a **typed schema**
   (mastra's `SchemaWorkingMemory` variant), not a free-form string — bounds the
   prompt-injection blast radius.

5. **In-process embedding cache** (`packages/memory/src/index.ts:842-906`). Unbounded
   per-process cache of `xxhash → embeddings`. Fine for a single-box dev setup; wrong
   shape for our ECS multi-instance fleet. If we add a semantic-recall embedding cache,
   it belongs in Postgres keyed by `(tenant_id, content_hash)` with a TTL column.

---

## 5. Open questions

1. **Agent scratchpad (L3.5) write surface design.** If we eventually ship agent-maintained
   durable facts, the tool schema must enumerate allowed keys per tenant (working hours
   format, preferred name, timezone — but never salary, never PII-sensitive fields). Who
   owns the key allowlist — is it in `admin` module config or hard-coded in the agents
   module? Punt: add to v1.5 planning doc, not agent-runtime.md.

2. **Does our γ windowing need per-tenant tunability?** Mastra exposes `lastMessages` per
   memory instance. We currently hard-code γ = 3 verbatim + 10 compressed. For tenants
   with long support conversations we may want `lastMessages: 20`. Decision needed before
   we freeze §5.

3. **Debounced save queue — coalesce granularity.** If a multi-step agent does 8 tool
   calls in 1.2 s, mastra would persist once (after 100 ms of silence) or flush at 1 s
   staleness. We have outbox events; each tool call currently enqueues at least one
   event. Is there any scenario where coalescing messages is acceptable but not
   coalescing the derived events? Likely yes (events need individual sequence numbers)
   but worth confirming with the outbox-relay design.

4. **Post-turn summarization target: `agent_message.summary` per-message or
   `conversation_summary` per-conversation?** Our spec says the former; mastra's
   observational pipeline writes per-group observations indexed by
   `range="startId:endId"` (i.e. per-span, not per-message). Per-span is cheaper to
   render and easier to recall from. Revisit once we wire the summarizer job.
