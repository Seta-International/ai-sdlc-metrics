# agent-vector demo — design

## Purpose

A self-contained CLI demo for `@seta/agent-vector` that exercises every public
responsibility of the package against a real local Postgres + pgvector, prints
human-readable output, and is easy to screenshot or paste into a status report.

The demo tells one story — **two tenants (Acme and Globex) share the system;
each must see only their own FAQ** — and shows ingest, dedup, vector search,
and RLS isolation in that order. It mirrors the style and ergonomics of the
existing `platform/agent/embeddings/scripts/demo.ts`.

## Scope

In scope:

- A single new file: `platform/agent/vector/scripts/demo.ts`
- Run via `OPENAI_API_KEY=sk-... pnpm exec tsx platform/agent/vector/scripts/demo.ts`
- Uses the local Postgres started by `pnpm db:up` with migrations applied by
  `pnpm migrate`
- Exercises `insertChunks`, `findExistingHashes`, `searchChunks` from
  `@seta/agent-vector`
- Uses `@seta/agent-embeddings` for real embeddings (same dep set as the
  embeddings demo)
- Self-cleans the rows it inserts so the demo is idempotent and safe to
  re-run

Out of scope:

- Any change to package source (`src/`, schema, migrations)
- A long-running server, web UI, or HTTP surface
- Wiring into `vitest`, CI, or root `package.json` scripts
- Testcontainers / auto-spinning Postgres
- Performance benchmarking or large corpora
- Mock / stub embedding paths (real OpenAI only, matching the embeddings
  demo precedent)

## Prerequisites and failure modes

Before any work, the script validates and prints actionable errors if any of
the following are missing:

- `OPENAI_API_KEY` — exit 1, instruct user how to set it
- `DATABASE_URL` (optional; defaults to `postgres://seta:dev@localhost:5432/seta`,
  matching the integration test helper). If the pool fails to connect, surface
  the underlying error and remind the user to run `pnpm db:up`.
- Migrations applied — if a `SELECT 1 FROM agent_vector.chunks LIMIT 0` probe
  fails with a missing-relation error, instruct the user to run `pnpm migrate`
  and exit. Other errors propagate.

The script never runs migrations itself. It does not own the schema lifecycle.

## Narrative and on-screen steps

The demo prints a boxed banner, then runs ten numbered steps. Each step prints
its title, the action, and a one-line status (`✓` / `✗` / numeric result).

1. **Setup** — open the `tenant_user` pool via `createPool`, generate two fresh
   `crypto.randomUUID()` tenant ids (`ACME`, `GLOBEX`) for this run. Generate
   one fresh `source_id` per tenant (UUID, opaque per the SCOPE — no FK).
2. **Embed FAQ corpora** — Acme and Globex each have a hard-coded array of
   four `{question, answer}` items. Each item flattens to a single chunk
   `"Q: ...\nA: ..."`. Call `createOpenAIEmbeddings().embed(...)` once per
   tenant. Print vectors-count, dims, total tokens, latency ms.
3. **Ingest as Acme** — inside `tenantContext.run({ tenantId: ACME }, ...)`,
   call `insertChunks(sql, rows)` with sha256 `contentHash` and `tokenCount`
   derived from `usage.totalTokens` (see "Data shape"). Print `inserted N
   rows`.
4. **Ingest as Globex** — same, under `GLOBEX` context.
5. **Dedup demo** — under `ACME` context: call `findExistingHashes(sql,
   acmeSourceId, hashes)` and assert all four hashes are present. Then call
   `insertChunks(...)` again with the same rows and verify the row count in
   `agent_vector.chunks` for tenant Acme has not changed (probe via
   `platform_admin` connection counting). Print both checks.
6. **Search as Acme** — pick one fixed user query (`"How do I reset my Acme
   password?"`), embed it, call `searchChunks(sql, queryVec, { k: 3 })` under
   `ACME` context. Print top-3 hits as similarity bars with truncated content
   previews.
7. **Cross-tenant isolation** — reuse the same Acme query vector but run
   `searchChunks` under `GLOBEX` context with the same `k`. Assert that none
   of the returned hit ids appear in the Acme insert ids. Print
   `returned N hits, 0 from Acme ✓`.
8. **Search as Globex** — embed `"What Globex products are available?"`, run
   `searchChunks` under `GLOBEX` context, print top-3.
9. **Cleanup** — open a one-shot `postgres()` connection as `platform_admin`
   (the only role allowed to bypass RLS), `DELETE FROM agent_vector.chunks
   WHERE tenant_id IN (ACME, GLOBEX)`, close the connection. Print rows
   deleted.
10. **Summary** — print a small `PASS/FAIL` table covering: ingest Acme,
    ingest Globex, dedup, RLS isolation, search Acme, search Globex. Exit 0
    if all pass, 1 otherwise.

Every step that mutates DB state is wrapped in a top-level `try { ... } finally
{ cleanup; pool.end() }` so cleanup runs on any failure.

## Output style

- Mirrors `platform/agent/embeddings/scripts/demo.ts`:
  - Top boxed banner with the package name
  - Section headers `📦 [N/10] Title`
  - `bar(sim, width=40)` helper producing `█...░...` plus percentage
  - Numbers formatted with `toFixed(6)` where decimals matter
- English output. No emojis beyond the small set already used in the
  embeddings demo (`📥 📐 🔢 📊 🔍 ✅`), plus `📦 🔁 🛡️` for the new sections.
- All ANSI plain — no `chalk`-style deps. The embeddings demo already prints
  unstyled; match that.

## Architecture and code shape

Single file, top-level `await` (the embeddings demo already uses top-level
await — Node ≥24, ESM). Approximate layout:

```
scripts/demo.ts
├── env + preflight checks
├── constants: FAQ_ACME, FAQ_GLOBEX, ACME_QUERY, GLOBEX_QUERY
├── helpers: bar(), fmt(), printSection(), printResult(), hashContent()
├── main():
│     1. setup
│     2. embed
│     3. ingest acme
│     4. ingest globex
│     5. dedup
│     6. search acme
│     7. cross-tenant
│     8. search globex
│   finally:
│     9. cleanup
│    10. summary
│
└── pool.end()
```

Dependencies (all already declared in `platform/agent/vector/package.json`):

- `@seta/db` — `createPool`
- `@seta/tenant` — `tenantContext.run`
- `@seta/agent-embeddings` — `createOpenAIEmbeddings`
- `@seta/agent-vector` — public exports
- `postgres` — for the one-shot `platform_admin` cleanup connection
- `node:crypto` — `randomUUID`, `createHash`

No new deps. No edits to `package.json` (per CLAUDE.md the script is invoked
via `pnpm exec tsx` directly, not via a package script).

## Data shape

`NewChunk` per the existing schema requires
`{ tenantId, sourceId, content, contentHash, tokenCount, embedding }`. The
demo:

- `tenantId` — `ACME` or `GLOBEX`
- `sourceId` — one UUID per tenant for this run
- `content` — `"Q: ...\nA: ..."`
- `contentHash` — sha256 hex of `content` (utf-8)
- `tokenCount` — derived from `embed` result `usage.totalTokens` divided
  by row count and rounded — exact tokens-per-row are not exposed by the
  OpenAI embeddings API, so the per-row count is an estimate. This is
  acceptable for a demo; the field is metadata only and not used by search.
- `embedding` — 1536-d `number[]` from `client.embed(...)`

## Behavioural guarantees (success criteria)

The demo PASSes when:

- Step 3 inserts exactly 4 rows under Acme
- Step 4 inserts exactly 4 rows under Globex
- Step 5: `findExistingHashes` returns a `Set` of size 4; the re-ingest leaves
  the Acme row count unchanged at 4
- Step 6: returns ≥ 1 hit with similarity ≥ 0.3 (the default `minSim`)
- Step 7: returns zero hits whose ids are in the Acme insert id set
- Step 8: returns ≥ 1 hit, all ids in the Globex insert id set
- Step 9: deletes 8 rows (4 per tenant)

If any check fails the summary table prints the failure, the script exits 1,
but cleanup still runs.

## Testing

This is a demo script, not library code. CLAUDE.md "Implementation flow"
excludes one-off scripts from TDD. The script is verified by running it once
manually against a live local DB and confirming all ten steps PASS. No
`vitest` is added.

## Risks and footguns considered

- **RLS bypass**: only the cleanup `DELETE` uses `platform_admin`. Every
  read and write in the demo body goes through the `tenant_user` pool under
  `tenantContext.run`. This is the same pattern as the integration tests.
- **Clobbering shared dev data**: random per-run tenant UUIDs means the demo
  cannot collide with any pre-existing row. No `TRUNCATE`.
- **API spend**: 8 short FAQ inputs + 2 query inputs = 10 embed calls, all
  text-embedding-3-small. Bounded and small.
- **Top-level await in scripts/**: the embeddings demo already uses this
  pattern, confirming the local `tsx` + `tsconfig` chain supports it.
- **`tokenCount` accuracy**: documented above — the field is metadata, not
  load-bearing for search.

## Cross-references

- Precedent: `platform/agent/embeddings/scripts/demo.ts`
- Package contract: `platform/agent/vector/SCOPE.md`
- Public surface: `platform/agent/vector/src/index.ts`
- Integration helpers (pattern, not imports): `platform/agent/vector/tests/integration/_helpers.ts`
