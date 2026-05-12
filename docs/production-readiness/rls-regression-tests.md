# RLS Regression Tests — Multi-Tenant Isolation Coverage

**Branch:** `spike/mastra-foundation` · **Last updated:** 2026-05-12

Proactive test suite that proves the multi-tenant isolation invariants enumerated in [`threat-model.md`](./threat-model.md) §5. RLS is the *backstop*; `tenantContext` + `withTenant` is the primary enforcement (setup.md §3:59-100). This suite verifies that the backstop actually catches what the primary enforcement is supposed to make impossible — defense-in-depth, not redundancy.

## 1. Goal

For every tenant-data table in P1 (and every P1-override table the spike added):

- Cross-tenant **read** is impossible by construction (RLS USING clause).
- Cross-tenant **modify** (UPDATE/DELETE on a known PK) is impossible (RLS USING clause).
- Cross-tenant **insert** (INSERT with a different `tenant_id` than the GUC) is impossible (RLS WITH CHECK clause).
- Unsetting / forgetting `app.tenant_id` returns zero rows — the deny-by-default contract (setup.md §3:168, CLAUDE.md *Footguns — Tenant id is never a function parameter*).

Tests are evidence, not aspirations: a failing RLS test is a **P0 deploy block**.

## 2. Ownership

Each schema-owning package owns its RLS regression tests under `<owner-pkg>/tests/integration/rls/<schema>.test.ts`:

| Schema | Owner package | Test home |
|--------|---------------|-----------|
| `auth` | `@seta/auth` | `platform/auth/tests/integration/rls/auth.test.ts` |
| `tenant` | `@seta/tenant` | `platform/tenant/tests/integration/rls/tenant.test.ts` |
| `directory` | `@seta/directory` | `platform/directory/tests/integration/rls/directory.test.ts` |
| `oauth` | `@seta/oauth` | `platform/oauth/tests/integration/rls/oauth.test.ts` (consolidates the existing `vault.test.ts` cross-tenant assertions) |
| `audit` | `@seta/audit` | `platform/audit/tests/integration/rls/audit.test.ts` (special — see §6: no RLS today) |
| `connector_ms365_directory` | `@seta/connector-ms365-directory` | `modules/connectors/ms365-directory/tests/integration/rls/connector-ms365-directory.test.ts` |
| `connector_ms365_planner` | `@seta/connector-ms365-planner` | `modules/connectors/ms365-planner/tests/integration/rls/connector-ms365-planner.test.ts` |
| `agent` | `@seta/agent` (product) | `modules/products/agent/tests/integration/rls/agent.test.ts` |
| `agent_memory` | `@seta/agent-memory` | `platform/agent/memory/tests/integration/rls/agent-memory.test.ts` |
| `agent_workflows` | `@seta/agent-workflows` | `platform/agent/workflows/tests/integration/rls/agent-workflows.test.ts` |
| `agent_vector` | `@seta/agent-vector` | `platform/agent/vector/tests/integration/rls/agent-vector.test.ts` |

Cross-schema invariants live in `/tests/integration/rls/cross-package.test.ts` (workspace-root, runs after all owner-schema tests have migrated).

Discovery is by file path; CI does not need a registry. New schemas add a `rls/` test file when they land.

## 3. Test pattern (per tenant-data table)

For each table `<table>` in a tenant-data schema, eight tests:

### Test 1 — Setup two tenants, write rows to each

```ts
// pseudocode — real harness uses createTenantWithData() from §5
const A = uuid(), B = uuid()
await runAsPlatformAdmin(sql, () => seedTenant(A, { kind: 'minimal' }))
await runAsPlatformAdmin(sql, () => seedTenant(B, { kind: 'minimal' }))
const aRowId = ... // PK of a row written under A
const bRowId = ... // PK of a row written under B
```

`seedTenant` writes one canonical row to `<table>` (plus parent rows as needed) under each tenant. Seeded as `platform_admin` (BYPASSRLS) so the test is talking about *post-seed* enforcement, not seeding.

### Test 2 — `SELECT *` under tenant A returns A's rows only

```ts
const rows = await withTenant(sql, A, (tx) => tx`SELECT id FROM <schema>.<table>`)
expect(rows.map(r => r.id)).toEqual([aRowId])
expect(rows.map(r => r.id)).not.toContain(bRowId)
```

### Test 3 — `UPDATE` under tenant A targeting tenant B's PK affects 0 rows

```ts
const result = await withTenant(sql, A, (tx) =>
  tx`UPDATE <schema>.<table> SET updated_at = now() WHERE id = ${bRowId}`)
expect(result.count).toBe(0)  // RLS makes B's row invisible — UPDATE finds nothing
```

The RLS policy's `USING` clause hides B's row from A entirely; the WHERE clause matches zero rows.

### Test 4 — `DELETE` under tenant A targeting tenant B's PK deletes 0 rows

```ts
const result = await withTenant(sql, A, (tx) =>
  tx`DELETE FROM <schema>.<table> WHERE id = ${bRowId}`)
expect(result.count).toBe(0)
// confirm B's row still exists when queried as platform_admin
const stillThere = await runAsPlatformAdmin(sql, () =>
  sql`SELECT 1 FROM <schema>.<table> WHERE id = ${bRowId}`)
expect(stillThere.length).toBe(1)
```

### Test 5 — `INSERT` under tenant A with `tenant_id = B` is rejected

```ts
await expect(
  withTenant(sql, A, (tx) =>
    tx`INSERT INTO <schema>.<table> (tenant_id, ...) VALUES (${B}, ...)`)
).rejects.toThrowError(/new row violates row-level security policy/)
```

The WITH CHECK clause on the policy rejects inserts that would not be visible — prevents *write-then-disown* attacks.

### Test 6 — `platform_admin` bypasses RLS (sanity check)

```ts
const rows = await runAsPlatformAdmin(sql, () =>
  sql`SELECT id FROM <schema>.<table> ORDER BY id`)
expect(rows.map(r => r.id).sort()).toEqual([aRowId, bRowId].sort())
```

Migrations + cleanup scripts rely on this. If this test ever **fails closed**, it means BYPASSRLS got dropped from `platform_admin` and migrations will start failing in production — needs to surface immediately. Citing `platform/db/SCOPE.md` *Owns — tenantUser / platformAdmin* and the `infra/postgres/init.sql` BYPASSRLS workaround referenced there.

### Test 7 — `tenant_user` without `set_config('app.tenant_id', …)` returns zero rows

```ts
// raw client, no withTenant wrapper, SET ROLE tenant_user
await runAsTenantUserBare(sql, async (tx) => {
  const rows = await tx`SELECT * FROM <schema>.<table>`
  expect(rows).toEqual([])
})
```

This is the deny-by-default contract (setup.md §3:168 "the desired failure mode: deny by default"). The current `platform/db/src/with-tenant.test.ts` covers the inverse (set + visible) — this is the explicit denial half. Replicates the load-bearing assertion for every owner package's schema.

### Test 8 — `SET app.tenant_id = …` (no LOCAL, no set_config(…, true)) is forbidden in code

This is a guardrail test, not a Postgres-behavior test:

```ts
// Search the package's src/ for plain `SET app.tenant_id` and fail if found.
// Implemented as a one-off ripgrep assertion inside this test:
const grep = await execa('rg', ['-n', "SET\\s+app\\.tenant_id", 'src/'], { reject: false })
expect(grep.stdout).toBe('')  // only `set_config('app.tenant_id', …, true)` is allowed
```

The footgun (setup.md §3:132): plain `SET` on a pooled connection persists across release → silent cross-tenant leak. This test fences the codebase against re-introducing it. Already covered behaviorally by `platform/db/src/with-tenant.test.ts` (asserts the GUC is empty outside the tx on the same backend), but the grep is a faster signal at PR time.

## 4. Cross-schema invariants

`/tests/integration/rls/cross-package.test.ts` — tests that span multiple owner schemas, run after every owner's `rls/` directory has migrated:

1. **JIT mapping does not leak across tenants.** Two tenants with the same external subject (which *can* happen for non-Entra IdPs; for Entra the GUID is globally unique) must not collapse into a single `auth.users` row. Today the unique index is `(provider_id, external_subject)` — flagged in `platform/directory/SCOPE.md` Open Questions. **Test:** seed two tenants A and B, call `mapIdTokenToUser` with identical subject under each, assert each tenant gets its own `auth.users` row and its own `directory.external_identities` row.
2. **`agent_memory` recall under tenant B does not return tenant A's turns.** Seed conversations and turns under A; call `MemoryProvider.recall()` inside `withTenant(B, …)`; assert zero hits. Cites `platform/agent/memory/SCOPE.md` *Test strategy — Per-tenant fixture data*.
3. **`agent_workflows.workflow_snapshots.run_id` for tenant A cannot be resumed under tenant B.** Suspend a workflow under A; attempt `workflow.resume(runId)` inside `withTenant(B, …)`; assert it cannot read the snapshot (RLS hides it) and that the advisory-lock path therefore short-circuits cleanly without leaking the run's existence (`platform/agent/workflows/SCOPE.md` *Patterns — Advisory-lock the resume path*).
4. **`agent_vector.chunks` search for tenant A returns no hits from B's corpus** even with overlapping/near-duplicate embeddings. This is the load-bearing test for `platform/agent/vector/SCOPE.md` *Patterns — Three SET LOCAL tuning statements*: load `≥ 10×k` rows mixed across A and B, query as A, assert exactly `k` results, all under tenant A. Without `iterative_scan = strict_order`, this test would silently under-return.
5. **OAuth refresh single-flight remains per-tenant.** Already covered by `platform/oauth/src/refresh.test.ts` (10 concurrent acquirers, exactly one refresh call); extend with an A+B variant — 10 acquirers each, each tenant's refresh runs exactly once and the two refreshes do not interfere (no advisory-lock collision, no token swap).
6. **Audit log cross-tenant note.** `audit.audit_log` is intentionally not RLS-policied today (compliance reads cross tenants — `platform/audit/SCOPE.md` Open Q: *RLS vs admin-only reads*). Cross-package test asserts that the *app role `tenant_user` does not have SELECT on `audit.audit_log`*. Either privilege isolation (today's choice if/when applied) or future RLS — but never silently visible.

## 5. Synthetic test data

A fixture builder lives in `@seta/db/testkit` (sibling open question for that package — see `platform/db/SCOPE.md` *Open questions — @seta/db carrying zod*: this is one consumer of that staged dep).

```ts
// pseudocode — declared in @seta/db/testkit
export async function createTenantWithData(opts: {
  tenantId: string
  userId?: string
  kind: 'minimal' | 'full'
}): Promise<void>
```

- `minimal` — one row per tenant-data table that this owner package needs to test (a `tenant.tenants` row, a `auth.users` row, one row in this schema's primary table).
- `full` — the canonical test set: one of each entity type with realistic relationships; used by the cross-package tests in §4.

The builder runs as `platform_admin` so it can populate across all schemas in one call. It is the only allowed cross-schema writer in the test harness — keeping the test-data layer's own boundary clean.

**Why a shared builder, not per-package fixtures.** Cross-package tests need the *same* canonical shape under tenant A and tenant B; any drift between per-package seeders becomes false-positive coverage. One builder + one canonical row set is the fence.

## 6. Special-case schemas

**`audit.audit_log`** — no RLS today. `platform/audit/SCOPE.md` *Patterns to avoid — Do not declare RLS on audit.audit_log without an ADR* + *Open questions — RLS vs admin-only reads* are explicit. The audit suite therefore has tests 1, 6, 8 from §3 but **substitutes** the cross-tenant tests with:

- **Test 2′** — `tenant_user` role has zero SELECT/INSERT privileges on `audit.audit_log` (privilege isolation, not policy isolation). If `audit_reader` role later lands, add an analogous test.
- **Test 7′** — n/a; the schema is intentionally not GUC-gated. Document why in the test file (one-line `it.todo`-style comment referencing the SCOPE open question).

Any future change that adds RLS to `audit.audit_log` ships with the full §3 test set and an ADR — same gating bar as a data-losing migration (CLAUDE.md *ADRs for non-reversible decisions*).

## 7. CI integration

RLS tests run on every PR as part of the `integration` job per setup.md §12 ci.yml. Concretely:

- Vitest projects pick up `**/tests/integration/rls/*.test.ts` by glob.
- The `integration` project depends on a freshly-migrated Postgres (the existing `pnpm db:up` + migration step in CI).
- **Any failure is a P0 deploy block.** No emergency override — if you need to ship past a real-deny test failure, you need an ADR explaining the loss of an invariant in [`threat-model.md`](./threat-model.md) §5. Cites CLAUDE.md *Build for now / Idempotent external boundaries* discipline + the deny-by-default framing.
- RLS tests run **after** Schema-per-module migrations have been applied (the `OWNER_ORDER` per `platform/db/SCOPE.md`). Otherwise the policies don't exist yet and the tests pass trivially.

## 8. Coverage matrix

A script (`tooling/scripts/rls-coverage.ts`, deferred until first PR adds it) walks every tenant-data table in every `*/migrations/*.sql` and looks up whether each of Tests 1-8 (or 1, 2′, 6, 7′, 8 for `audit`) exists in the corresponding `rls/` test file. Outputs:

```
tests/integration/rls/coverage.md   (committed; regenerated by CI)
```

Format (sketch):

| Schema | Table | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 |
|--------|-------|----|----|----|----|----|----|----|----|
| `auth` | `users` | pass | pass | pass | pass | pass | pass | pass | pass |
| `auth` | `sessions` | pass | pass | pass | pass | pass | pass | pass | pass |
| `auth` | `api_keys` | pass | pass | pass | pass | pass | pass | pass | pass |
| `oauth` | `oauth_tokens` | pass | pass | pass | pass | pass | pass | pass | pass |
| `oauth` | `oauth_state` | pass | pass | pass | pass | pass | pass | pass | pass |
| `agent` | `write_continuations` | — | — | — | — | — | — | — | — |
| `agent_memory` | `conversations` | — | — | — | — | — | — | — | — |
| `agent_memory` | `turns` | — | — | — | — | — | — | — | — |
| … | … | … | … | … | … | … | … | … | … |

Most cells will be `—` initially — establishing the contract for what *should* exist. The matrix is the spec-fence for "did the last PR ship its RLS tests"; it must update in lockstep with new tables.

The matrix in this doc lists which tables exist in P1 SCOPEs today:

- `auth.users`, `auth.sessions`, `auth.api_keys` — shipped, no RLS yet (`platform/auth/SCOPE.md`).
- `tenant.tenants`, `tenant.tenant_connectors` — shipped, no RLS yet.
- `directory.external_identities` — shipped, no RLS yet (`platform/directory/SCOPE.md` Open Q on RLS).
- `oauth.oauth_tokens`, `oauth.oauth_state` — RLS shipped (`platform/oauth/SCOPE.md` *0001_security_hardening.sql*).
- `audit.audit_log` — intentionally no RLS (see §6).
- `connector_ms365_directory.{directory_users, directory_groups, directory_group_members, sync_state}` — schema shipped, RLS not yet enabled (TODO before P1 close).
- `connector_ms365_planner.{planner_tasks_cache, planner_plans_cache, planner_buckets_cache, sync_watermarks}` — not yet shipped.
- `agent.write_continuations` — not yet shipped.
- `agent_memory.{conversations, turns, working_memory}` — P1 override; placeholder SCOPE only.
- `agent_workflows.{workflow_snapshots, workflow_steps}` — P1 override; placeholder SCOPE only.
- `agent_vector.chunks` — P1 override; placeholder SCOPE only.

## 9. What this suite does NOT test

- **Application-level authorization (RBAC).** RLS only enforces *tenant* isolation. Within a tenant, "user X can read audit logs" / "user Y can update task assignments" is enforced by `@seta/auth` role policy + route middleware. A separate test suite (TBD) covers role-based access. Cites `platform/auth/SCOPE.md` Open Q: *RBAC primitive shape*.
- **OAuth scope correctness.** Whether tenant A's consent grant includes `Tasks.ReadWrite` is governed by `@seta/connector-registry.requireConsent(tenantId, '<connector-id>')` (CLAUDE.md *Connector consent*). RLS does not see Graph scopes.
- **Cryptographic integrity of audit log.** `audit.audit_log` is plaintext + append-only; a malicious `platform_admin` could rewrite it. Tamper-evident audit (Merkle tree, signed checkpoints) is P3+ and out of P1 scope.
- **Application correctness of the JIT mapper.** Tests prove tenant isolation, not that mapping logic produces the right `email` / `displayName` (`platform/directory/SCOPE.md` *Test strategy* covers that separately).

## 10. Migration of existing tests

Epic 1's `platform/oauth/tests/integration/*` already has tenant-isolation flavor (the `vault.test.ts` integration test verifies that `withTenantTx` scopes correctly; `refresh.test.ts` exercises the single-flight invariant under 10 concurrent acquirers — both load-bearing for the multi-tenant story). When the `rls/` directory pattern lands:

- **Move** `vault.test.ts`'s tenant-isolation assertions into `platform/oauth/tests/integration/rls/oauth.test.ts` as Test 2 / 3 / 4 / 5 above. Leave the encryption-correctness assertions in place in `vault.test.ts`.
- **Keep** `refresh.test.ts` where it is (it tests refresh-correctness, not RLS).
- The migration happens in one PR; no parallel coverage during the move (`CLAUDE.md` *No legacy, no backward compat*).

## 11. Open questions

- **`@seta/db/testkit` home.** Should `createTenantWithData` live in `@seta/db` (as a sibling export) or its own `@seta/db-testkit` package? Setup.md §13 suggests `@seta/db` carries `zod` already and there's no current consumer; adding a `testkit/` subpath that ships only in `devDependencies` of consumer packages is simpler. Decide before the first owner package writes its `rls/` suite.
- **Parallel RLS tests vs schema-reset per test.** Vitest parallel projects run each owner's `rls/` suite concurrently. Each suite seeds its own tenants with ULIDs, so collisions are statistically impossible — but `platform_admin` writes touch shared schemas (`auth`, `tenant`). Options: (a) leave it parallel and let ULIDs disambiguate; (b) run RLS tests serially via a `--poolOptions.threads.maxThreads=1` override on the RLS vitest project. Recommendation: start with (a) since `audit.audit_log` is the only cross-test-visible append target and tests assert per-tenant scoping, not global counts. Revisit if a flake emerges.
- **`SET ROLE tenant_user` plumbing for test helpers.** The `withTenant` wrapper assumes the caller already entered the test as `tenant_user`. The `runAsPlatformAdmin` / `runAsTenantUserBare` helpers needed by §3 tests don't exist yet — small addition to `@seta/db/testkit`. Cites `platform/db/SCOPE.md` *Owns — runMigrations* (which does `SET ROLE` via `sql.unsafe`) for the pattern.
- **Audit-log RLS decision.** `platform/audit/SCOPE.md` flags it as an Open Q (RLS-policy vs privilege-isolation). Whichever wins, this doc's §6 needs to update.
- **`directory.external_identities` cross-tenant subject collision.** `platform/directory/SCOPE.md` Open Q. Cross-package Test §4.1 above is the regression fence; the *fix* is a schema change (add `tenant_id` to the unique index, or split per IdP) and is out of scope for this test suite — but the test will go red the day the fix is needed.

## 12. Cross-references

- [`threat-model.md`](./threat-model.md) §5 — the invariants this suite proves.
- [`llm-safety.md`](./llm-safety.md) — RLS does not stop prompt-injection-driven cross-tenant content leak inside a single agent run; LLM-safety doc covers the gap.
- `platform/db/SCOPE.md` — `withTenant` semantics, `OWNER_ORDER`, `tenantUser` / `platformAdmin` roles.
- `platform/oauth/SCOPE.md` *Patterns — Tid-mismatch fails-closed and audits*, `vault.test.ts`, `refresh.test.ts` — closest existing reference implementation.
- setup.md §3 (full RLS section, especially the `SET LOCAL` / `set_config` distinction at 132 and the deny-by-default principle at 168), §15 (footguns table — `SET app.tenant_id` discussion).
- CLAUDE.md — *Multi-tenant from day one*, *Tenant id is never a function parameter*, *Idempotent external boundaries*, *No cross-schema foreign keys*.
