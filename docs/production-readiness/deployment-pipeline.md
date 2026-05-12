# Deployment Pipeline

> How code reaches production. Companion docs:
> - On-call responder playbook: `seta-os/docs/runbooks/oncall.md`
> - SLO + alerting contract that the deployed system must meet: `seta-os/docs/production-readiness/slo-alerting.md`
> - Restore drill (forward-only schema implies snapshot-based rollback for data): `seta-os/docs/runbooks/restore-drill.md`
> - Secret rotation drill: `seta-os/docs/runbooks/secret-rotation.md`
>
> **Scope today (2026-05-12).** P1 deploys nowhere. CI runs on every PR; merging to `main` produces no artifact. AWS Terraform staging is in `Project Plan v3.1` § 6 disposition table as **DROPPED for P1**, lands P1.5. This doc covers (a) what CI does today, (b) the CD pipeline we'll build at P1.5, (c) the invariants that don't change with environment.

---

## 1. Environments

| Env             | Where it runs                                    | Who provisions it          | Status (2026-05-12)                                                  |
| --------------- | ------------------------------------------------ | -------------------------- | -------------------------------------------------------------------- |
| **dev**         | Local laptop via `docker-compose.yml` (setup.md §12) | Each developer            | Live — `pnpm db:up` brings pg + jaeger + otel-collector              |
| **ci**          | GitHub Actions runners, ephemeral                | `.github/workflows/ci.yml` (setup.md §12 lines 1545-1682) | Live — dockerized pg per `integration` and `e2e` job        |
| **staging**     | AWS, single-AZ, Terraform-provisioned            | Platform team              | **P1.5** — `Project Plan v3.1` § 6 disposition: "AWS Terraform staging — DROPPED" for P1 |
| **production**  | AWS, multi-AZ once $/SLO justify it              | Platform team              | **P2+**                                                              |

> No "preview" environments per-PR. They're tempting but multiply CI cost and (with persistent pg) violate "no shared state across instances" hygiene. Reconsider in P2 once we have multi-instance deploy.

---

## 2. Branch model

**Trunk-based.** One long-lived branch: `main`.

- PRs against `main`, squash-merge only. No long-lived feature branches.
- `spike/mastra-foundation` is an **explicit exception window** during the spike — once it merges, the rule reverts immediately.
- Conventional Commits as the commit-message format (CLAUDE.md "Commits & PRs"). Scope = package without the `@seta/` prefix: `feat(agent-core): …`, `fix(teams): …`, breaking changes `feat(api)!: …`.
- **One change, one PR** (CLAUDE.md). Bug fix doesn't carry refactors; feature doesn't carry dep bumps. Mixed PRs are bounced at review.
- **Changeset required** for any change to a published (`"private": false`) package (CLAUDE.md). CI guard fails the PR without one.

---

## 3. CI gates (pre-merge)

Every gate below runs on every PR and on every push to `main`. **All must pass to merge.** Source: setup.md §12 lines 1545-1682 (`ci.yml`).

| Job             | What it runs                                                                                          | Why this is the right gate                                                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setup`         | `pnpm install --frozen-lockfile --prefer-offline --child-concurrency=10`                              | Lockfile must be authoritative — no drift between PR and lock.                                                                                          |
| `lint`          | `pnpm lint` then `pnpm tooling/scripts/check-public-private.ts` then `pnpm tooling/scripts/check-no-manual-pkg-edit.ts` | Biome lint + module-boundary rule + the manual-`package.json`-edit guard (CLAUDE.md "CLI-only — packages and dependencies").                            |
| `typecheck`     | `pnpm turbo run typecheck`                                                                            | Per-package `tsc --noEmit -p tsconfig.json`. Catches every type drift CI-side.                                                                          |
| `unit`          | `pnpm turbo run test:unit`                                                                            | Co-located unit tests across all packages. No external services.                                                                                        |
| `integration`   | dockerized pgvector → `psql … -f infra/postgres/init.sql` → `pnpm --filter @seta/db exec drizzle-kit migrate` → `pnpm turbo run test:integration` | Real Postgres, real migrations, RLS-policy enforcement under `tenant_user` role.                                                                        |
| `e2e`           | dockerized pgvector → migrate → `pnpm turbo run build --filter=@seta/api` → `pnpm vitest run --project tests/e2e` | Builds the actual app artifact and exercises it against real pg. P1 ships 4 smoke tests (`Project Plan v3.1` § 6 disposition: "12 → 4 E2E tests" — P1.0 has 4). |
| `build`         | `pnpm turbo run build` (gates on `lint`, `typecheck`, `unit`)                                          | Final artifact-buildability gate. Doesn't ship the artifact — that's CD.                                                                                |

### Auxiliary CI guards (worth calling out)

- **`check-public-private.ts`** — enforces CLAUDE.md "Boundaries": a `"private": false` package must not import any `"private": true` workspace package. The cross-package boundary is enforced at CI; you cannot land a regression.
- **`check-no-manual-pkg-edit.ts`** — fails any non-whitelisted `package.json` diff without a matching `pnpm-lock.yaml` diff (CLAUDE.md "Never hand-edit `package.json`"). Forces all dependency changes through `pnpm --filter`.
- **Lockfile up-to-dateness** — `--frozen-lockfile` fails when `package.json` and `pnpm-lock.yaml` disagree.

---

## 4. CD gates (post-merge to main)

**Today: NONE.** P1 doesn't deploy (Project Plan v3.1 § 6 disposition table: "AWS Terraform staging — DROPPED for P1"). CI builds and discards the artifact.

### To-be-built (P1.5)

This is the design we'll implement when staging lands. Sequence on every merge to `main`:

1. **Build container images.**
   - `apps/api` image, multi-stage `node:24-alpine` per the existing `apps/api/Dockerfile` (cited in `apps/api/SCOPE.md` § Current state).
   - `apps/studio` later (Project Plan v3.1 § 6: "Studio web app — DROPPED" until P2; do not build until then).
   - Image tag = `<short-git-sha>` and also `main-<timestamp>`.
   - SBOM generated alongside (`syft` or `docker buildx imagetools`).
   - Vulnerability scan (`trivy` or `grype`) — high/critical findings **block** the image push.

2. **Push to registry.**
   - Target registry TBD (see § Open questions: ECR vs GHCR).
   - Image is signed (`cosign`) so the deploy step can verify provenance.

3. **Run database migrations against staging.**
   - `pnpm --filter @seta/db exec drizzle-kit migrate` (the same command CI's integration job runs).
   - Uses the `platform_admin` role per setup.md §3 "App connects as `tenant_user` (RLS-enforced). `platform_admin` (`bypassRls: true`) is migrations/ops only".
   - Migrations run **before** the new app image starts.
   - On failure: **abort deploy**. The previous app image is still running, the DB is left in the pre-migration state, and the migration error is paged.

4. **Deploy app to staging.**
   - Terraform / orchestrator (see § Open questions: ECS / EKS / Kubernetes) rolls the new container.
   - Health-gate the rollout on `GET /healthz` (`apps/api/SCOPE.md` § HTTP endpoints): 3 consecutive 200s within 30 s.

5. **Smoke-test staging.**
   - Re-run the 4 P1 smoke tests against staging (`Project Plan v3.1` § 6: "4 smoke tests in P1.0").
   - Run the canary agent run (cross-cite `slo-alerting.md` § Synthetic monitoring).
   - On failure: **rollback** (see § Rollback procedure).

6. **Promote to production (manual gate).**
   - Promotion is **explicitly manual** at P1.5. Automated promotion happens once the synthetic-monitor canary has shown 24 hours of green plus the on-call rotation has a primary acknowledged.
   - Canary 5 % traffic for 1 h, then 100 % cut-over — see § Blue-green / canary policy.

---

## 5. Migration deployment policy

- **Forward-only.** CLAUDE.md "No legacy, no backward compat" and CLAUDE.md "Scale & multi-tenancy: Forward-only schema. No downgrade migrations." Setup.md §3 "Schema-per-module (DDD)" also: migrations are owned per-package and applied in dependency order by the top-level runner in `@seta/db`.
- **Generated, never hand-written.** Setup.md §3 + CLAUDE.md "Schema-driven — always generate, never hand-write": **Drizzle schema → migration SQL via `drizzle-kit generate`. Never hand-edit `migrations/*.sql`; fix the schema and regenerate.**
- **Migrations run before app deploy.** New code never runs against an old schema. If we can't move forward, we **don't deploy** — we don't try to roll back the migration.
- **Data-loss migrations require explicit sign-off.** The PR description must name the rows/columns/tables dropped, the rollback story (always: "restore from snapshot per `restore-drill.md`"), and the approving reviewer. The commit message includes `BREAKING:` and links the PR.
- **Cross-schema FKs forbidden.** CLAUDE.md "Schema-per-module (DDD) … No cross-schema foreign keys; cross-context references by ID only (`tenant_id` is the universal correlation key)." This makes per-package migration independence possible.
- **`drizzle-kit push` is local-dev only.** CLAUDE.md footgun: "**`drizzle-kit push`** is local-dev only — never against shared DBs." CD uses `drizzle-kit migrate` exclusively.

---

## 6. Rollback procedure

### Application code

- **Deploy the previous container tag.** Orchestrator rollback (ECS service-revision rollback, Kubernetes `kubectl rollout undo`, depending on § Open questions outcome).
- Time-to-rollback target: **< 5 minutes** from decision.
- The orchestrator must keep the previous `N=2` image revisions warm so rollback is image-pull-free.

### Database

- **Not generally reversible** — forward-only schema (CLAUDE.md). There is no "rollback migration".
- For a data-bug recovery (corrupted writes from a bad app version), restore from a snapshot per **`docs/runbooks/restore-drill.md`**. Snapshots are daily, WAL retained 7 days (setup.md §3 "Backup / PITR").
- A restore is a **declared incident** (P0). Customer-facing communications run through `oncall.md` § Communications.

### The interleave

- A bad deploy that runs migrations and then fails app startup leaves the DB on the new schema with the old app code. **The old app code may not run against the new schema** — this is exactly why we follow setup.md §3 and CLAUDE.md "Schema-driven": migrations must be **backward-compatible with the previous app version** so rollback is purely a code revert.
- Adding a column → safe. Dropping a column → must be done in **two deploys**: deploy app code that stops reading the column, then a follow-up PR drops the column. Same for renames (add-new + dual-write + read-new + drop-old).
- No "big bang" data-shape changes in a single deploy.

---

## 7. Blue-green / canary policy

- **P1.5 deferred.** Canary at 5 % traffic for 1 h, then 100 % cut-over.
- The orchestrator and feature-flag service make this real (§ Open questions covers both).
- Until canary exists, P1.5 staging deploys are **all-or-nothing**. The rollback procedure above is the safety net.

---

## 8. Secret management in deploy

Per setup.md §4 "Auth & secrets":

- **Secrets read from KMS at boot.** The `KMS_PROVIDER=aws` path (`apps/api/src/env.ts` per `apps/api/SCOPE.md` § Env contract) decrypts the DEK at process start using `EncryptionContext` per-tenant.
- **Never in container env vars.** Container env carries only non-sensitive config (`PORT`, `NODE_ENV`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `KMS_KEY_ARN`, `AWS_REGION`).
- **Never in source control.** `.env` is `.gitignored`; only `.env.example` is committed.
- **Never in CI logs.** GitHub Actions `secrets.*` are masked. Custom logging must not echo decrypted values; the pino redact list (setup.md §8 lines 637-649) covers known secret-shaped fields by default.
- **Rotation.** Per-tenant DEK rotation drill in `docs/runbooks/secret-rotation.md`. KMS key rotation is annual at minimum.

---

## 9. Build reproducibility

- **`pnpm install --frozen-lockfile`** in every CI job and every container build (setup.md §12 ci.yml + CLAUDE.md "CLI-only").
- **Pinned Node 24** (`actions/setup-node@v4 with: { node-version: 24 }`; `Dockerfile` uses `node:24-alpine`). Mismatched Node across env is the most common "works on my laptop" footgun.
- **Pinned pnpm 11** (`pnpm/action-setup@v4 with: { version: 11 }`).
- **Turbo remote cache.** `TURBO_TOKEN` + `TURBO_TEAM` + `TURBO_REMOTE_CACHE_SIGNATURE_KEY` set per setup.md §12 ci.yml `env:` block (lines 1554-1558). The signature key means cache entries from a compromised builder cannot poison subsequent builds — it is **not optional** in production CI.
- **Container image is reproducible-as-of-PR-merge.** `<git-sha>` is the only authoritative tag; `main-<timestamp>` is convenience.

---

## 10. Container image hardening

| Control                       | Status                                            | Source / target                                                |
| ----------------------------- | ------------------------------------------------- | -------------------------------------------------------------- |
| Distroless / minimal base     | currently `node:24-alpine`; distroless TBD        | `apps/api/Dockerfile` (cited in `apps/api/SCOPE.md` § Current state). Distroless deferred to P1.5. |
| Non-root user                 | **P1.5 implementation**                           | `USER node` (or numeric uid) in the runtime stage              |
| SBOM generation               | **P1.5 implementation**                           | `syft` produces SBOM; uploaded alongside the image             |
| Vulnerability scan            | **P1.5 implementation**                           | `trivy` / `grype` block on high/critical                       |
| Image signing                 | **P1.5 implementation**                           | `cosign` signs at push time; deploy verifies                   |
| No secrets in image           | **invariant from day 1**                          | KMS-at-boot model (setup.md §4); image carries no env-resolved secrets. |

---

## 11. Production access

- **Read-only by default.** The day-to-day production IAM role is read-only on every resource (pg read-replica, KMS describe/decrypt, S3 list/get).
- **Write access is break-glass.** Requires explicit approval via the access-management system; auto-expires within hours; every grant is audit-logged.
- **Every shell session audit-logged.** SSM Session Manager + CloudTrail (or equivalent) captures every command. Direct SSH is forbidden.
- **No production DB writes from a laptop.** All migrations go through the CD pipeline; ad-hoc `UPDATE` on prod requires break-glass + a written ticket and a second pair of eyes.

---

## 12. Deploy frequency target

- **Active development (P1, P1.5).** Multiple deploys per day to staging. Production cutover is manual.
- **Stable (P2+).** Less than daily. Auto-promotion to production is gated on the canary + SLO budget headroom (cross-cite `slo-alerting.md` § Error budget — if we've already burned 50 % of monthly budget, freeze).
- **Explicit deploy freezes during incident response.** Trigger 6 in `oncall.md` § "Common triage runbooks" (KMS Decrypt failures, P0) explicitly: "**STOP DEPLOYS.**"
- **Friday-afternoon-Vietnam-time and pre-holiday freezes.** Operational hygiene — never deploy at the start of a window where no one is awake to roll back.

---

## 13. Open questions

These block production cutover. Each needs a single owner + a decision date.

- **Cloud target.** `Project Plan v3.1` picks AWS; setup.md §4 (Auth & secrets) is dual-cloud (Entra ID + AWS KMS). Confirm production cloud is AWS only. Owner: Platform team + Sponsor.
- **Container registry.** ECR (matches AWS choice, no cross-cloud egress) vs GHCR (free for public repos, simpler IAM until private). Owner: Platform team.
- **Orchestrator.** ECS Fargate (simplest), EKS (Kubernetes, more flexible, more ops), or a stand-alone EC2 + systemd (cheapest, no orchestration story). The 1-instance starting shape (setup.md §3 scaling triggers) means ECS Fargate is the leading candidate. Owner: Platform team.
- **Feature-flag service.** LaunchDarkly (mature, paid), Unleash (OSS, self-host), or none (env-driven rollouts only). The canary policy depends on this. Owner: Platform team.
- **CI minutes budget.** GitHub Actions costs grow with merge volume. Pre-Action: get a baseline once Project Plan v3.1 BK-3 ($/run) target is approved; CI cost has the same "per-run" shape. Owner: Sponsor (cost question).
- **Post-merge automated deploy to staging.** Auto-deploy every `main` merge to staging vs require a manual button. Auto is faster, manual is safer when we don't yet have full canary + rollback wiring. Owner: Platform team — decide before P1.5 staging lands.
