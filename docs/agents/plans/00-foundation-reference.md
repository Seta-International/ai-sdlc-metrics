# 00 — Foundation Reference (SHIPPED)

**Design §§:** §8 (Prompt Architecture — content-hash stores), §3 (sanitization pipeline).

**Status:** Shipped as PR #73 (commit `518e7258`). This plan is reference-only; it captures what landed so later plans can cite it. Sections 2-11 kept brief because implementation is complete; the full 18-section convention is honored for consistency.

---

## 1. Scope

### In

- `agent_prompt_store` Drizzle migrations + RLS + append-only repository (content-hash primary key).
- `agent_narrative_store` Drizzle migrations + RLS + append-only repository (permission narrative cache).
- `project_to_schema` pure sanitization function (field-drop projection; errors on shape mismatch).
- Langfuse OTel wiring at module bootstrap.
- Kernel audit events on first-write to either store.

### Out

- Any runtime consumer of the stores (plans 01 + 02).
- Any assembled prompt producer (plan 02).
- Any read/use of spans (plan 07).

---

## 2. Design Context

The prompt and narrative stores are content-hash-keyed (§8) so replay (plan 10) can deterministically reconstruct any prompt from a single hash. Append-only with unique constraint on hash makes idempotent writes safe; first-write emits a kernel audit event. Writing at use-time (not deploy-time) self-populates from live traffic.

`project_to_schema` is the single sanitization primitive used across phase handoffs, directive construction, and approval-card provenance rendering. Pure function, fail-on-mismatch — no silent coercion.

---

## 3. Data Model

### `agent_prompt_store`

- `content_hash TEXT PK` — hash of canonicalized content.
- `layer TEXT` — `'system' | 'router' | 'sub_agent' | 'tool_catalog' | 'directive_schema'`.
- `content TEXT` — the canonicalized content itself.
- `first_seen_at TIMESTAMPTZ`.
- `tenant_id UUID` (RLS — though content is typically tenant-neutral, narrative store is tenant-scoped; prompt store may share across tenants; in practice tenant-scoped for audit).

### `agent_narrative_store`

Same shape. Narrative is content — not keyed by tenant in the hash but queried by `(tenant_id, role_id)` via a separate lookup table or denormalized column.

Both tables: `ALTER TABLE ... FORCE ROW LEVEL SECURITY`; RLS policy permits read/insert by matching `tenant_id`.

---

## 4. Interface Contracts

### `PromptStore` repository

```
exists(hash: string): Promise<boolean>
getByHash(hash: string): Promise<{ content: string; layer: string } | undefined>
appendIfMissing(opts: { hash; layer; content; tenantId }): Promise<{ wasAppended: boolean }>
```

### `NarrativeStore` repository

Similar shape; `(tenantId, roleId)` → narrative lookup + append.

### `project_to_schema`

```
project_to_schema<T>(source: unknown, schema: ZodType<T>): T
// Pure; throws SchemaMismatchError on any missing required field or type mismatch.
```

---

## 5. Control Flow

### First use of a prompt content

1. Runtime assembles a prompt (future plan 02).
2. Canonicalize content; compute hash.
3. Call `PromptStore.appendIfMissing({ hash, layer, content, tenantId })`.
4. If `wasAppended: true` → emit kernel audit `agent.prompt_stored`.
5. Hash is stamped on the trace as a trace attribute for replay resolution.

### Sanitization

1. Caller has a source object + target schema.
2. `project_to_schema(source, schema)` runs Zod validation with field-drop semantics.
3. Missing required fields → `SchemaMismatchError` raised.
4. Extra fields → silently dropped.
5. Returns typed result.

---

## 6. Requirements

| #      | Requirement                                                                       | Design §§ |
| ------ | --------------------------------------------------------------------------------- | --------- |
| R-00.1 | `agent_prompt_store(content_hash, layer, content, first_seen_at)` exists with RLS | §8        |
| R-00.2 | `agent_narrative_store` same shape; keys by `(tenant_id, role_id) → hash → text`  | §8        |
| R-00.3 | Both stores append-only; same content hashes to same key (idempotent writes)      | §8        |
| R-00.4 | First-write emits kernel audit event                                              | §8        |
| R-00.5 | `project_to_schema` is pure: same inputs → same outputs, no side effects          | §3        |
| R-00.6 | `project_to_schema` raises on schema mismatch rather than silently coercing       | §3        |
| R-00.7 | Langfuse OTel exporter wired at `apps/api` bootstrap with `tenant_id` inheritance | §12       |

---

## 7. Failure Modes & Recovery

| Failure                               | Symptom                      | Recovery                                                               |
| ------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Concurrent appends with same hash     | Unique constraint violation  | Idempotent; second insert treated as no-op.                            |
| Kernel audit write fails              | Partial observability        | Log; retry via outbox (plan 11 or caller-driven).                      |
| `project_to_schema` schema mismatch   | `SchemaMismatchError` raised | Caller catches + handles (typically a bug, treat as programmer error). |
| Langfuse exporter unreachable at boot | Spans buffer in memory       | Bounded buffer; drop oldest; alert.                                    |

---

## 8. Observability Surface

- Kernel audit: `agent.prompt_stored`, `agent.narrative_stored` with `content_hash`.
- Langfuse wiring emits trace spans from `apps/api` bootstrap forward.
- Metric `agent_prompt_store_append_total{layer}` (shipped).

---

## 9. Security Considerations

- RLS on both stores prevents cross-tenant hash lookups.
- Append-only immutability prevents tampering with stored prompts that have been replayed.
- Kernel audit on first-write captures the discovery of every unique prompt content.

---

## 10. Performance Budget

- `appendIfMissing`: <10ms p99 (cached hit) / <30ms p99 (insert).
- `project_to_schema`: <1ms per typical turn-handoff payload.

---

## 11. Testing Strategy

Shipped. Tests cover:

- Idempotent hash writes.
- Kernel audit emission on first-write only.
- `project_to_schema` drops unknown fields + raises on mismatch.
- Cross-tenant RLS isolation.
- Langfuse bootstrap smoke test.

---

## 12. Acceptance Criteria

Shipped (PR #73 merged):

- Migration applies cleanly with `FORCE ROW LEVEL SECURITY`.
- Unit tests green; RLS integration test green.
- Langfuse traces produce at startup smoke test with `tenant_id`.

---

## 13. Rollout Plan

Shipped. No rollout remaining.

---

## 14. Dependencies

None — foundation layer.

## 15. Integration Points

- `@future/db` — migrations.
- `apps/api/src/modules/agents/infrastructure/schema/` — schemas.
- `apps/api/src/modules/agents/infrastructure/repositories/` — store repos.
- `apps/api/src/modules/agents/domain/services/sanitizer.ts` — `project_to_schema`.
- `apps/api/src/modules/kernel/` — audit facade.
- Langfuse OTel — `apps/api` bootstrap.

## 16. Activation Gate

Shipped.

## 17. Out of Scope

- Runtime consumption of stores (plans 01 + 02 + 10).
- Replay harness (plan 10).
- Canonicalization rule enforcement at prompt assembly (plan 02 owns).

## 18. Open Questions

None — shipped. Post-hoc issues → `docs/agents/repeat-issues.md`.
