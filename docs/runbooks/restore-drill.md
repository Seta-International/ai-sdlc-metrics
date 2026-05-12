# Runbook — Postgres restore drill

> **Cadence:** once per quarter; dated entry per drill in the log table below.
> **Owner:** on-call rotation (same owner as `secret-rotation.md` per CLAUDE.md
> "Operating conventions"). A skipped quarter is an SLO breach — log it.

## Goal

Verify that a Postgres snapshot + WAL replay restores `seta-os` to a working
application state. The drill measures two metrics and exits with a pass/fail:

1. **Time-to-restore** — wall-clock from "kick off restore" to "WAL replay
   complete; database accepting connections".
2. **Time-to-green-tests** — wall-clock from "restored DB accepting
   connections" to "integration suite returns exit 0".

Postgres is the system of record for every persisted byte in P1 (setup.md §3
"Data layer" — `docs/setup.md:39-50`, §15 "Operating conventions" Backup/DR row
at `docs/setup.md:2126`): tenant rows, vectors, FTS, KMS-envelope encrypted
tokens, sessions, audit log. Recovery posture is one snapshot away. The drill is
the only test that asserts that posture is real.

setup.md §3 (`docs/setup.md:49`) pins the storage contract: **daily snapshot,
7-day WAL retention, restore drill once per quarter**. CLAUDE.md "Forward-only
schema" (`seta-os/CLAUDE.md`) means restore validation
is the only path that ever asserts a backup can be re-applied — there is no
downgrade.

## Cadence

- **Quarterly.** Q1 (Mar), Q2 (Jun), Q3 (Sep), Q4 (Dec).
- The drill must complete before the last business day of the quarter.
- The drill must run against a snapshot from the production environment (or the
  highest-fidelity stand-in that exists at the time).
- A skipped quarter is an SLO breach. Log it in the drill table with
  `Time-to-restore: SKIPPED`, an operator name, and a follow-up plan.

## Prerequisites

Before kicking off the procedure, confirm the operator has all of the
following. Where the secret lives is part of the contract — never copy a
production secret into a chat or a doc.

| Item | Source | Notes |
|---|---|---|
| Cloud-provider credentials (AWS / Azure) | Operator's IAM identity / Azure AD assignment | Read access to the snapshot store; write access to the restore target. **Never the long-lived `platform_admin` Postgres role** — that's a downstream artefact, not an entry credential. |
| Source snapshot id | Cloud console / `aws rds describe-db-snapshots` / `az postgres flexible-server backup list` | Pinned in the drill log row as the exact id; document the snapshot's UTC timestamp. |
| Target host | New isolated DB instance (NOT production) | `apps/api` will point at this for the drill window. Tear down at end. |
| KMS key ARN / Key Vault URI | setup.md §4 (`docs/setup.md:277-326`) — `env.KMS_KEY_ARN` | The KEK that wraps `oauth.oauth_tokens` DEKs. Restored DB must reach the same KEK or decrypts fail. Drill uses the prod KEK in read-only mode; do not rotate during a drill. |
| DEK (dev/staging fallback only) | `EnvDekProvider` (setup.md §4 line 320; `platform/oauth/SCOPE.md` line 60) | Production never uses `EnvDekProvider`. If the drill is against a staging snapshot taken under `EnvDekProvider`, set `DEV_DEK_BASE64` in the drill env. |
| `MS_BOT_SECRET`, `ENTRA_CLIENT_ID/SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Operator vault (1Password / Doppler / cloud secrets manager) | The drilled `apps/api` instance needs these to boot — integration tests do not call MS or LLMs (CLAUDE.md "Mocks" + setup.md §17 "Testing strategy"), but env validation at boot (`apps/api/src/env.ts`, setup.md §3 / CLAUDE.md "Schema-driven") refuses to start without them. Use the drill-environment values, never production. |
| `DATABASE_URL` for the restored target | Constructed once the target is up | `postgres://platform_admin:…@<target-host>:5432/seta` for `pnpm migrate`; `postgres://tenant_user:…@<target-host>:5432/seta` for `apps/api`. The two-role split is the setup.md §3 contract (`docs/setup.md:170-172`). |
| Network reachability from drill operator to target | VPN / bastion | Restore targets must NOT accept public ingress. |

## Procedure (step-by-step)

Run each step in order. Start a stopwatch at step 1; stop it at step 4 (this is
**time-to-restore**). Start a second stopwatch at step 4; stop it at step 7
(this is **time-to-green-tests**).

### 1. Provision the isolated target

- Create a new Postgres 17 instance in the same region / VPC as the snapshot
  store. Match the production instance class so timing is comparable.
- Apply the bootstrap initialisation expected by the app:
  `infra/postgres/init.sql` — installs `pgvector` + `pg_trgm`, creates the
  `platform_admin` role with `BYPASSRLS` and the `tenant_user` role
  (setup.md §3 callout at `docs/setup.md:68-73`, repo location
  `infra/postgres/init.sql` per setup.md §11 `docs/setup.md:998`).
- Confirm the instance is reachable from the operator workstation only — no
  public ingress.

### 2. Restore the snapshot

- Restore the chosen snapshot id into the target. Use the cloud provider's
  point-in-time-restore (PITR) flow when WAL replay is required (see §3 row
  in setup.md `docs/setup.md:49` — "Daily snapshot, 7-day WAL retention").
- Snapshot-only restore: skip WAL apply (step 3). This is the fast path; use
  for quarterly validation when no incident is being simulated.
- PITR: pick a target UTC timestamp within the WAL retention window
  (≤ 7 days from snapshot).

### 3. Apply WAL until target timestamp (PITR only)

- Cloud-managed PITR runs this automatically when a recovery-target-time is
  supplied. Confirm via the provider's restore-job status that recovery
  reached the requested LSN / time.
- For manual restore: `pg_wal_replay_resume()` after staging WAL segments
  from the archive store; loop on `pg_last_wal_replay_lsn()` until the
  target LSN is reached.

### 4. Run validation queries (see "Validation queries" section below)

- Connect as `platform_admin` (BYPASSRLS, setup.md §3 line 73).
- Execute every query in the "Validation queries" section in order. Each
  query has a documented pass/fail threshold.
- **Stop stopwatch #1 here** — record as **time-to-restore**.

### 5. Run `pnpm migrate` against the restored DB

- `pnpm migrate` (setup.md §15 row "Migrations" `docs/setup.md:2059`) invokes
  the `@seta/db` top-level runner that applies every owner package's
  migrations in `OWNER_ORDER` (`platform/db/SCOPE.md` lines 17-22 — `auth →
  tenant → directory → oauth → audit → connector_ms365_directory →
  connector_ms365_planner → agent → agent_memory → agent_workflows`; vector
  schema slots in per `platform/agent/vector/SCOPE.md` Open Question #2).
- Expected output: every owner reports "already up to date" — no migration
  rows to apply. CLAUDE.md "Forward-only schema" means a non-empty diff
  here is a P0: the snapshot is older than the deployed schema.
- A non-empty diff is a **failure**. Do not proceed; restart the drill
  against a fresher snapshot or hand back to platform engineering.

### 6. Start `apps/api` against the restored DB

- Set `DATABASE_URL` to the restored target with the `tenant_user` role
  (setup.md §3 `docs/setup.md:170-172` — "The app connects as `tenant_user`").
- Set `KMS_PROVIDER=aws|azure` and the same `KMS_KEY_ARN` / Key Vault URI
  the production deployment uses (setup.md §4 line 323).
- Boot with `node --import ./instrumentation.ts dist/main.js` (setup.md §8
  "OTel init order" `docs/setup.md:682-721`).
- Confirm `/agent/health` returns 200 and `req_id` / `tenant_id` log fields
  appear (`platform/observability/SCOPE.md` and setup.md §8 pino redact
  block at `docs/setup.md:616-680`).

### 7. Run the integration test suite

- `pnpm test:integration` (setup.md §15 row "Tests" `docs/setup.md:2059`,
  CLAUDE.md "Commands" table).
- The suite covers `@seta/db` `withTenant` semantics, `@seta/oauth`
  `vault.test.ts` + `refresh.test.ts` single-flight, `@seta/audit`
  `writer.test.ts`, `@seta/directory` `jit-mapper.test.ts`, and each
  connector schema. See setup.md §17 "Testing strategy"
  (`docs/setup.md:2152-2228`).
- **Stop stopwatch #2 here** — record as **time-to-green-tests**.

### 8. Tear down

- Drop the restored instance. Do not retain.
- Revoke any temporary credentials issued for the drill.
- Update the drill log table (below) in the same PR as any follow-ups.

## Validation queries

Connect as `platform_admin` (BYPASSRLS) for the first six queries; the
RLS-isolation probe in query 7 uses `tenant_user`.

```sql
-- 1. Tenant row counts per owner schema. Compare against the snapshot baseline
--    captured at snapshot time; threshold is ±0.1 % per table.
--    Owners per platform/db/SCOPE.md OWNER_ORDER + the P1 override.
SELECT 'auth.users'                                AS table, COUNT(*) FROM auth.users
UNION ALL SELECT 'auth.sessions',                  COUNT(*) FROM auth.sessions
UNION ALL SELECT 'auth.api_keys',                  COUNT(*) FROM auth.api_keys
UNION ALL SELECT 'tenant.tenants',                 COUNT(*) FROM tenant.tenants
UNION ALL SELECT 'tenant.tenant_connectors',       COUNT(*) FROM tenant.tenant_connectors
UNION ALL SELECT 'directory.external_identities',  COUNT(*) FROM directory.external_identities
UNION ALL SELECT 'oauth.oauth_tokens',             COUNT(*) FROM oauth.oauth_tokens
UNION ALL SELECT 'oauth.oauth_state',              COUNT(*) FROM oauth.oauth_state
UNION ALL SELECT 'audit.audit_log',                COUNT(*) FROM audit.audit_log
UNION ALL SELECT 'connector_ms365_directory.directory_users',         COUNT(*) FROM connector_ms365_directory.directory_users
UNION ALL SELECT 'connector_ms365_directory.directory_groups',        COUNT(*) FROM connector_ms365_directory.directory_groups
UNION ALL SELECT 'connector_ms365_directory.directory_group_members', COUNT(*) FROM connector_ms365_directory.directory_group_members
UNION ALL SELECT 'connector_ms365_directory.sync_state',              COUNT(*) FROM connector_ms365_directory.sync_state
UNION ALL SELECT 'connector_ms365_planner.planner_tasks_cache',       COUNT(*) FROM connector_ms365_planner.planner_tasks_cache
UNION ALL SELECT 'connector_ms365_planner.planner_plans_cache',       COUNT(*) FROM connector_ms365_planner.planner_plans_cache
UNION ALL SELECT 'connector_ms365_planner.planner_buckets_cache',     COUNT(*) FROM connector_ms365_planner.planner_buckets_cache
UNION ALL SELECT 'connector_ms365_planner.sync_watermarks',           COUNT(*) FROM connector_ms365_planner.sync_watermarks
UNION ALL SELECT 'agent.write_continuations',                         COUNT(*) FROM agent.write_continuations
UNION ALL SELECT 'agent_memory.conversations',                        COUNT(*) FROM agent_memory.conversations
UNION ALL SELECT 'agent_memory.turns',                                COUNT(*) FROM agent_memory.turns
UNION ALL SELECT 'agent_memory.working_memory',                       COUNT(*) FROM agent_memory.working_memory
UNION ALL SELECT 'agent_workflows.workflow_snapshots',                COUNT(*) FROM agent_workflows.workflow_snapshots
UNION ALL SELECT 'agent_workflows.workflow_steps',                    COUNT(*) FROM agent_workflows.workflow_steps
UNION ALL SELECT 'agent_vector.chunks',                               COUNT(*) FROM agent_vector.chunks;

-- 2. Sample tenant_id existence — pick three known production tenant ids and
--    confirm each appears in at least one tenant-data table (proves selective
--    restore did not silently drop rows).
SELECT 'tenant_a' AS tenant_id, EXISTS (SELECT 1 FROM tenant.tenants WHERE id = '<tenant_a_uuid>'::uuid) AS present
UNION ALL SELECT 'tenant_b', EXISTS (SELECT 1 FROM tenant.tenants WHERE id = '<tenant_b_uuid>'::uuid)
UNION ALL SELECT 'tenant_c', EXISTS (SELECT 1 FROM tenant.tenants WHERE id = '<tenant_c_uuid>'::uuid);

-- 3. RLS policies present on every tenant-data table. Expected count must match
--    the policy count on production HEAD; an empty result on any table is a
--    hard fail (setup.md §3 "Multi-tenancy: app-layer + RLS", docs/setup.md:59-91).
SELECT schemaname, tablename, policyname, cmd
  FROM pg_policies
 WHERE schemaname IN ('auth','tenant','directory','oauth',
                      'connector_ms365_directory','connector_ms365_planner',
                      'agent','agent_memory','agent_workflows','agent_vector')
 ORDER BY schemaname, tablename, policyname;

-- 4. Extensions loaded. setup.md §11 (docs/setup.md:998) names pgvector +
--    pg_trgm as required; both must be present.
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- 5. Roles. setup.md §3 line 73 + platform/db/SCOPE.md require platform_admin
--    (BYPASSRLS) and tenant_user (the app role).
SELECT rolname, rolbypassrls, rolcanlogin
  FROM pg_roles
 WHERE rolname IN ('platform_admin','tenant_user');

-- 6. GUC probe — assert set_config('app.tenant_id', $1, true) inside a
--    transaction is visible to a follow-up SELECT and is gone afterward.
--    Matches the contract in platform/db/SCOPE.md:142-147 / setup.md §3
--    "The only correct way to set the GUC" (docs/setup.md:130-168).
BEGIN;
  SELECT set_config('app.tenant_id', '00000000-0000-0000-0000-000000000001', true);
  SELECT current_setting('app.tenant_id', true);   -- expect the uuid above
COMMIT;
SELECT current_setting('app.tenant_id', true);     -- expect NULL / empty

-- 7. RLS isolation probe under the app role. Pick two tenant ids from query 2.
--    The second query must return zero rows even though tenant_b's rows exist
--    (setup.md §3 line 168 "Deny by default").
SET ROLE tenant_user;
BEGIN;
  SELECT set_config('app.tenant_id', '<tenant_a_uuid>', true);
  SELECT COUNT(*) AS my_tasks       FROM connector_ms365_planner.planner_tasks_cache;
  SELECT COUNT(*) AS leaked_tasks   FROM connector_ms365_planner.planner_tasks_cache
    WHERE tenant_id = '<tenant_b_uuid>'::uuid;    -- expect 0
COMMIT;
RESET ROLE;
```

## Acceptance criteria

A drill is **pass** only if every criterion below is satisfied. Any single
failure flips the drill to **fail**, requires an entry in the drill log
"Issues found" column, and triggers a follow-up issue.

| Criterion | Threshold | Source |
|---|---|---|
| Time-to-restore | < 2 hours (P1 target; revisit per actual size) | This runbook; revisit with real data after first three drills |
| Time-to-green-tests | < 15 minutes from `pnpm test:integration` start | CI baseline; setup.md §18 "Build / lint / format optimization" (`docs/setup.md:2229-2378`) |
| Row counts | Within ±0.1 % of snapshot baseline per table from validation query 1 | This runbook |
| RLS policies | Validation query 3 returns the same `(schemaname, tablename, policyname)` tuples as production HEAD | setup.md §3 (`docs/setup.md:59-91`) |
| Extensions | `pgvector` + `pg_trgm` both present from validation query 4 | setup.md §11 (`docs/setup.md:998`) |
| Roles | `platform_admin` (BYPASSRLS) + `tenant_user` both present from validation query 5 | setup.md §3 line 73; `platform/db/SCOPE.md` line 27 |
| GUC probe | Validation query 6 prints the uuid inside the tx and empty after | `platform/db/SCOPE.md` lines 142-147 |
| RLS isolation | Validation query 7 returns `0` leaked rows | setup.md §3 line 168 |
| Migrations | `pnpm migrate` reports no pending migrations | CLAUDE.md "Forward-only schema"; setup.md §15 row "Migrations" |
| Integration suite | `pnpm test:integration` exits 0 | setup.md §15 row "Tests"; setup.md §17 |

## Rollback path

The drill restores to an **isolated** target — production is never touched.
There is no rollback because the drill cannot break production.

If the restored target is itself unhealthy (any acceptance criterion fails):

1. Do **not** retry on the same target. State is suspect.
2. Tear down the failed target immediately to free the snapshot storage hold.
3. Re-run the drill from step 1 against a **different** snapshot id — ideally
   one day older. A consistent failure across two snapshots is a P0 incident:
   the backup chain is broken. Escalate to platform engineering and the
   sponsor.
4. The drill log row records both attempts with their snapshot ids in the
   "Issues found" column.

If the failure is environmental (cloud provider 5xx, transient network), retry
once on a fresh target before declaring a failure.

## Drill log

| Date | Operator | Source snapshot ID | Time-to-restore | Time-to-tests-green | Issues found | Followups |
|---|---|---|---|---|---|---|
| 2026-Q3 (2026-09-30) | TBD | TBD | TBD | TBD | TBD | TBD |
| 2026-Q4 (2026-12-30) | TBD | TBD | TBD | TBD | TBD | TBD |
| 2027-Q1 (2027-03-30) | TBD | TBD | TBD | TBD | TBD | TBD |
| 2027-Q2 (2027-06-30) | TBD | TBD | TBD | TBD | TBD | TBD |

> Add a new row each quarter. Never overwrite a past row. Skipped quarters land
> in the table with `Time-to-restore: SKIPPED` so the SLO breach is auditable.

## Open questions

1. **PITR vs latest-snapshot as the canonical drill mode.** This runbook
   defaults to snapshot-only restore (faster, validates the snapshot chain).
   PITR validates the WAL chain too but takes longer. Recommendation: alternate
   each quarter (Q1/Q3 snapshot-only; Q2/Q4 PITR to a chosen mid-window
   timestamp). Decision belongs to platform engineering before the first drill.
2. **Which environment's WAL is canonical.** Production-only? Or do we also
   drill against staging snapshots so the drill itself is rehearsable
   pre-production? Recommendation: drill against production snapshots quarterly
   (acceptance criterion); rehearse against staging monthly (no logged entry
   required, just `pnpm test:integration` smoke).
3. **Cross-region / cross-cloud restore.** setup.md does not pin a DR region.
   When `apps/api` runs in two regions, the drill must validate cross-region
   restore. Re-open this runbook when the multi-region trigger fires
   (setup.md §3 "Scaling triggers" `docs/setup.md:51-57`).
4. **Tenant id pseudonymisation for the drill log.** Validation queries 2 and 7
   reference real tenant uuids. Recommendation: store hashed ids
   (`encode(sha256(tenant_id::text::bytea), 'hex')`) in the public drill log,
   keep the raw mapping in the operator's vault. Cross-references the GDPR
   delete flow at `docs/production-readiness/gdpr-delete-flow.md`.
5. **Encrypted-token decrypt validation.** The drilled DB still holds
   `oauth.oauth_tokens` ciphertext bound to production `EncryptionContext`
   (setup.md §4 line 325). The integration suite exercises decrypt for the
   tenants seeded by the tests, not for restored production rows. Add a
   targeted assertion ("for every tenant in `tenant.tenants`, attempt to
   decrypt at least one `oauth_tokens` row; record success rate") if
   compromised-KEK simulation is in scope.
6. **Per-tenant size variance.** Time-to-restore is wall-clock; it does not
   stratify by tenant size. Once a single tenant exceeds 10 % of the DB,
   capture per-tenant restore latency separately.
