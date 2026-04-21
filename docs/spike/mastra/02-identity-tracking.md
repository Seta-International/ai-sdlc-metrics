# Key 2 — Multi-user, Identity, Tracking

**Mastra area:** `packages/core/src/request-context/`, `packages/memory/src/index.ts`, observability spans
**Our design area:** `agent-runtime.md` §2 (Trust & Security Model), §5 (Memory Model), §6 (Conversation State), §12 (Observability), §15.4 (Downward Contract)
**Investigation date:** 2026-04-21

---

## 1. How mastra does it

### Only two identity axes: `resourceId` + `threadId`

No tenant concept anywhere in core. Multi-tenancy is assumed to be a layer above mastra, not a mastra concern. Grep for `tenant|multi-tenant|rls|row.level` in `packages/core/src` returns only unrelated workspace/sandbox matches.

- `resourceId` ≈ the user (or any resource that owns threads).
- `threadId` ≈ a conversation. A thread is owned by exactly one `resourceId`.

### Ownership enforced by application-layer equality check

`packages/memory/src/index.ts:194-212`:

```typescript
protected async validateThreadIsOwnedByResource(threadId, resourceId, config) {
  const thread = await this.getThreadById({ threadId });
  if (thread && thread.resourceId !== resourceId) {
    throw new Error(
      `Thread with id ${threadId} is for resource with id ${thread.resourceId} ` +
      `but resource ${resourceId} was queried.`
    );
  }
}
```

No RLS. No DB-layer isolation. If the check isn't called, or a bug slips past it, rows come back.

### Middleware-precedence typed keys

`packages/core/src/request-context/index.ts:5-44` defines three reserved keys:

- `MASTRA_RESOURCE_ID_KEY` — comment: _"prevents attackers from hijacking another user's memory."_
- `MASTRA_THREAD_ID_KEY` — same.
- `MASTRA_VERSIONS_KEY` — per-request agent version overrides.

Middleware-set values **override** client-provided values. The rule is typed (the keys are exported constants), not just comment-only.

### `RequestContext` is a typed `Map<string, unknown>`

Threaded explicitly through every step:

```typescript
agent.getInstructions({ requestContext })
agent.listTools({ requestContext })
memory.saveMessages({ messages, observabilityContext })
```

No AsyncLocalStorage / global state. Values flow via parameter.

### Tracking = span tree, not correlated IDs

`observabilityContext.tracingContext.currentSpan.createChildSpan(...)` is the correlation surface. Spans carry `resourceId`, `threadId`, `operationType` as attributes. Example: `createMemorySpan` at `packages/memory/src/index.ts:215-231` creates a `SpanType.MEMORY_OPERATION` as a child of the current span.

No single `trace_id` stamped across DB + job queue + LLM provider. Cross-system correlation is the caller's problem.

### Semantic recall scope is a multi-tenant landmine

`packages/memory/src/index.ts:331-335`:

```typescript
if (resourceScope && !resourceId && config?.semanticRecall && vectorSearchString) {
  throw new Error(
    `Memory error: Resource-scoped semantic recall is enabled but no resourceId was provided. ...`,
  )
}
```

Scope can be `'thread' | 'resource'`. Resource-scoped recall searches **across all threads for a `resourceId`**. In a multi-tenant deployment where `resourceId` might collide across tenants (user ID reuse), this is a silent cross-tenant leak vector.

---

## 2. What this tells us

1. **Mastra is a single-tenant library treated as multi-tenant by users.** Tenancy is a deployment concern, not a library concern. It provides hooks (middleware-set typed keys) and walks away.

2. **Our RLS-first model is a genuine architectural win over mastra's pattern**, not just a stack preference. Application-layer `!==` checks are exactly the attack surface our Tenet #1 ("gateway is the security boundary, not the prompt") closes off — one forgotten `await this.validate...` call and rows cross boundaries.

3. **Mastra lacks the cross-device conversation-consolidation invariant we have in §6** (scope key `(tenant_id, user_id, surface)` across devices/tabs). Their `threadId` is whatever the caller passes — multi-device identity is the app's problem.

4. **Their `trace_id` story is weaker than ours.** Span trees give rich hierarchy, but single-ID grep across DB audit + pg-boss + Langfuse is genuinely above what mastra offers. Our §12 "one ID to grep" validates.

5. **The middleware-precedence typed-key pattern is adoptable.** We already enforce tenant/user via `RlsMiddleware`, but we have no written invariant saying _tool handlers and sub-agent code cannot write identity keys on context_. Mastra's reserved-constants pattern formalizes this.

---

## 3. Proposed edits to agent-runtime.md

### Edit 1 — §6, lock the RLS-over-app-check invariant

Add after the "Scope key" paragraph:

> **Ownership is RLS, not application check.** A thread lookup that returns rows is by construction visible to the caller — `tenant_id` + `user_id` are set in the DB session before the query, and RLS filters at read time. There is no separate `thread.userId === caller.userId` step in application code. Prior art rejected: mastra's `validateThreadIsOwnedByResource` pattern — one forgotten application check away from a cross-resource leak.

### Edit 2 — §15.4 (or §2), identity-key write discipline

Add:

> **Identity keys on per-request context are middleware-write-only.** `tenant_id`, `user_id`, `trace_id`, and `delegation_id` (async) are set exclusively by `RlsMiddleware` / JWT verifier / pg-boss worker bootstrap. Tool handlers, sub-agent code, and processors **read** from context; they cannot **write** identity keys. Attempts throw at dev time, are silently dropped at runtime — never override. Pattern inspired by mastra's `MASTRA_RESOURCE_ID_KEY` middleware-precedence convention, adapted to our RLS model.

### Edit 3 — §16, name the semantic-recall scope trap for v1.5

When embeddings land (§16 trigger), the scope choice is non-obvious and the footgun is real:

> **Semantic recall scope decision is load-bearing for v1.5.** When embeddings land, the `thread` vs `resource` scope choice (cf. mastra `semanticRecall.scope`) is a tenant-safety decision, not a UX decision. Resource-scoped recall searches across all threads for a given `(tenant_id, user_id)` — fine only because the tuple is tenant-keyed by our construction. **Never scope embedding recall by `user_id` alone**; the tenant half of the key must be in the index partition, not in a post-filter. Post-filter scoping is what turns a single bug into a cross-tenant leak.

---

## 4. What we are not borrowing

- **Mastra's `resourceId` vocabulary.** We have `(tenant_id, user_id)` — richer, and the single-name collapse is the bug magnet above.
- **Span-tree-only tracking model.** Our `trace_id` stamp across DB + pg-boss + Langfuse is strictly more capable. Don't regress to "just use spans."
- **Client-settable identity keys on `RequestContext` without middleware-write-only discipline.** The typed-key pattern without the write-only invariant is the footgun mastra ships with (a sub-agent in their model _can_ re-set the key — they only document middleware-precedence, not middleware-exclusivity).
- **Version-per-request overrides via context** (`MASTRA_VERSIONS_KEY`). Our §14 resolves via `tenant_id` hashing — deliberate for A/B stability. Per-request override defeats stability.

---

## 5. Open questions

- **Is `RequestContext` useful to us as-is, or does NestJS provide enough?** Mastra's explicit-threading-via-parameter is cleaner than NestJS's `REQUEST` DI scoping, but we already have `RlsMiddleware` + AsyncLocalStorage patterns in the codebase. Defer — doesn't block design.
- **Does `MASTRA_VERSIONS_KEY` suggest a debug-override hook we want for replay?** Being able to force specific prompt-hashes / sub-agent versions per-request would be valuable for `/agent/debug` endpoints. Note for §8 replay harness.
- **How does mastra handle identity rotation (user deletion, role change) mid-conversation?** Not investigated. May inform our GDPR-erasure pipeline (§6).

---

## Status

- **Applied to agent-runtime.md:** none yet. All three edits above are pending.
