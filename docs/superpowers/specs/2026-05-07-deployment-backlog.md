# Deployment Backlog

**Source design:** `docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md` §6.3.
**Source architecture:** `docs/architecture/deployment.md` (335 lines).
**Tickets:** 3 Epics, ~14 Stories.

**Persona:** DevOps engineer (single track owner per design §4.3).

**Hard rules from CLAUDE.md baked into AC:**

- ARM64 only (`linux/arm64` — no x86 deps).
- Terraform only — no manual AWS console changes.
- Secrets in AWS Secrets Manager — never env files / DB / hardcoded.
- Every table has `tenant_id`.
- Vendor-agnostic observability (no Langfuse at MVP per memory `project_no_langfuse_mvp.md`).

**AI-led deployment guard (per design §13 risk #10):** every Story has a `**human-review**` AC checkbox a DevOps engineer ticks; AI doesn't self-tick.

---

## [EPIC] DEPLOY-1 AWS infra & Terraform IaC

ID: DEPLOY-1
Status: Backlog
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 29
Rank: 100
Jira Key:
Confluence Link:

### Summary

Provision the full AWS infrastructure for staging and production in `infra/terraform/` using reusable modules, so that the platform runs on Graviton ARM64 ECS Fargate in ap-southeast-1 with RDS Postgres 16, RDS Proxy, ALB, ACM, Route53, ECR, and Secrets Manager — all managed by Terraform with no manual AWS console changes.

### Goal

By S3 close, the staging environment is reachable at the documented hostnames with the API and at least one zone deployed via Terraform.

### Scope

- Terraform layout: root + `environments/{staging,production}.tfvars` + reusable modules under `infra/terraform/modules/`
- VPC (public + private subnets, 2 AZs, security groups)
- ECS Fargate Graviton ARM64 cluster — 13 services (api + web-shell + 10 domain zones + web-admin + cubejs)
- RDS Postgres 16 (db.t4g.medium) + RDS Proxy (IAM auth) + Read Replica for Cube.js
- ALB + ACM wildcard cert + Route53 records per zone
- ECR repos (14 total: api + web-shell + 10 zones + cubejs + web-admin)
- Secrets Manager wired to ECS task definitions for DB credentials, OPENAI_API_KEY, Slack + Teams credentials

### Out of Scope

- Multi-AZ RDS — enable when first enterprise tenant requires written SLA
- CloudFront — add when performance is a real user complaint
- Terraform bootstrap (`infra/bootstrap/`) — one-time manual step, not a Story
- CI/CD pipelines → DEPLOY-2

### SRS Coverage

- n/a (deployment infra; derived from `docs/architecture/deployment.md`)

### Acceptance Criteria

- [ ] `terraform apply` against staging completes within 30 minutes and all 13 ECS services are in `RUNNING` state.
- [ ] No AWS console changes — all resources managed exclusively by Terraform.
- [ ] ARM64 only — every ECS task definition specifies `linux/arm64`; no x86 images.
- [ ] All secrets injected via Secrets Manager; no env files, DB fields, or hardcoded values.
- [ ] Staging environment is reachable at `https://staging-<zone>.seta-international.com` for at least one zone.

### Child Tickets

- DEPLOY-1.S1 Terraform layout (root + staging + prod modules) (Story)
- DEPLOY-1.S2 VPC + subnets + security groups (Story)
- DEPLOY-1.S3 ECS Fargate Graviton ARM64 cluster + service definitions per zone (Story)
- DEPLOY-1.S4 RDS Postgres + RDS Proxy + RLS contract (Story)
- DEPLOY-1.S5 ALB + ACM + Route53 + ECR + Secrets Manager (Story)

### Definition of Done

- All child Stories `Status: Done`.
- `terraform plan` produces no diff against the deployed staging environment.
- Staging dual-tenant probe (DEPLOY-3.S1) passes against infrastructure provisioned here.

---

### [STORY] DEPLOY-1.S1 Terraform layout (root + staging + prod modules)

ID: DEPLOY-1.S1
Status: Backlog
Epic: DEPLOY-1
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 5
Rank: 110
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want a Terraform layout under `infra/terraform/` with root, reusable modules, and environment var files for staging and production, so that staging and production share infrastructure code while differing in tunables (instance size, min/max tasks, scaling schedules).

#### Acceptance Criteria

- [ ] Directory structure matches `docs/architecture/deployment.md` §"Terraform IaC Layout": `infra/terraform/modules/{vpc,alb,ecs-cluster,ecs-service,rds,redis,ecr,secrets,glue,eventbridge}/`, `infra/terraform/environments/{staging,production}.tfvars`, `infra/terraform/{main,variables,backend}.tf`.
- [ ] `infra/bootstrap/` contains the one-time S3 state bucket + DynamoDB lock table module with a README warning it is run manually once.
- [ ] `terraform validate` passes with no errors.
- [ ] `terraform plan` runs cleanly against staging workspace.
- [ ] Remote state configured: S3 bucket `future-tf-state-{env}` (versioned) + DynamoDB lock table (`PAY_PER_REQUEST`); state keys `future/staging/terraform.tfstate` and `future/production/terraform.tfstate`.
- [ ] **human-review** — DevOps engineer reviewed the Terraform layout diff before apply.
- [ ] **E2E** — `terraform apply -var-file=environments/staging.tfvars` in the `staging` workspace succeeds and all top-level module outputs are non-null.

#### AI Execution Notes

Create `infra/terraform/` directory tree following `deployment.md` §"Terraform IaC Layout" exactly. The `ecs-service` module must be parameterised with `name`, `image`, `cpu`, `memory`, `spot_weight` as shown in the HCL examples in the architecture doc. `backend.tf` references the S3 bucket created by `infra/bootstrap/`.

#### Testing Notes

- Unit: `terraform validate` on all modules.
- Integration: `terraform plan` against staging workspace with no resources yet created — confirm plan produces expected resource count.
- E2E: `terraform apply` against staging reaches a `Plan: N to add, 0 to change, 0 to destroy` steady state.
- Manual: DevOps engineer reviews plan output before approving apply.

#### Dependencies

- Blocked by: none (first DEPLOY story)
- Blocks: DEPLOY-1.S2, DEPLOY-1.S3, DEPLOY-1.S4, DEPLOY-1.S5 (all depend on the shared layout)

#### Definition of Done

- Inherits project DoD.
- `terraform validate` + `terraform plan` both pass in CI.
- Layout matches `deployment.md` §"Terraform IaC Layout" exactly; deviations are documented as ADRs.

---

### [STORY] DEPLOY-1.S2 VPC + subnets + security groups

ID: DEPLOY-1.S2
Status: Backlog
Epic: DEPLOY-1
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 3
Rank: 120
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want a VPC with public + private subnets across two AZs and security groups for ALB → ECS → RDS traffic, so that network traffic is isolated and no database ports are reachable from outside the VPC.

#### Acceptance Criteria

- [ ] VPC created in `ap-southeast-1` with 2 public subnets (ALB only) and 2 private subnets (ECS tasks, RDS, RDS Proxy, ElastiCache) across two AZs.
- [ ] ALB security group allows inbound 443 from `0.0.0.0/0`; allows outbound to ECS task SG on container port only.
- [ ] ECS task security group allows inbound from ALB SG only; allows outbound to RDS Proxy SG on port 5432 only.
- [ ] RDS and RDS Proxy security group allows inbound from ECS task SG on port 5432 only; no public ingress on port 5432.
- [ ] NAT Gateway in each AZ for private subnet outbound internet access.
- [ ] All resources declared in `infra/terraform/modules/vpc/`.
- [ ] **human-review** — DevOps engineer reviewed the VPC + SG Terraform diff before apply.
- [ ] **E2E** — Security group rules verified by SG diagram review in AWS Console (read-only inspection); a synthetic connectivity test confirms DB port 5432 is NOT reachable from an IP outside the VPC.

#### AI Execution Notes

Use `aws_vpc`, `aws_subnet`, `aws_internet_gateway`, `aws_nat_gateway`, `aws_route_table`, `aws_security_group` resources. Parameterise VPC CIDR and subnet CIDRs in `variables.tf` so staging and production can differ.

#### Testing Notes

- Unit: `terraform validate` on the vpc module.
- Integration: `terraform plan` confirms expected resource count (VPC, 4 subnets, 2 route tables, 3+ SGs).
- E2E: after apply, `nc -zv <rds-endpoint> 5432` from an external IP times out; same command from an ECS task succeeds.
- Manual: DevOps reviews SG rules diagram before apply.

#### Dependencies

- Blocked by: DEPLOY-1.S1 (layout must exist)
- Blocks: DEPLOY-1.S3, DEPLOY-1.S4, DEPLOY-1.S5

#### Definition of Done

- Inherits project DoD.
- No DB port exposed publicly — verified by connectivity test.
- `terraform plan` against staging shows zero drift after initial apply.

---

### [STORY] DEPLOY-1.S3 ECS Fargate Graviton ARM64 cluster + service definitions per zone

ID: DEPLOY-1.S3
Status: Backlog
Epic: DEPLOY-1
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 8
Rank: 130
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want an ECS Fargate cluster running Graviton ARM64 with a service per zone (api + web-shell + 10 domain zones + cubejs + web-admin = 13 services), so that the platform runs on cost-optimized ARM64 hardware as required by CLAUDE.md and `deployment.md`.

#### Acceptance Criteria

- [ ] ECS cluster created with Fargate + Fargate Spot capacity providers.
- [ ] ARM64 only — every task definition specifies `runtimePlatform: { cpuArchitecture: "ARM64", operatingSystemFamily: "LINUX" }`; no x86 images (CLAUDE.md hard rule).
- [ ] 13 ECS services declared via the reusable `ecs-service` module: `api` (1 vCPU / 2GB, 1 On-Demand + Spot scale-out), `web-shell` (0.25 vCPU / 0.5GB, On-Demand), `web-admin` (0.25 vCPU / 0.5GB, On-Demand), `web-insights` (0.5 vCPU / 1GB, Spot), `cubejs` (1 vCPU / 2GB, On-Demand), all remaining domain zones (0.25 vCPU / 0.5GB, Spot).
- [ ] ECR image references use `var.image_tag`; no hardcoded image digests.
- [ ] Task definitions reference Secrets Manager ARNs for environment injection (no env vars hardcoded in task def JSON).
- [ ] Resource sizing matches `deployment.md` §"ECS Cluster" table exactly.
- [ ] **human-review** — DevOps engineer reviewed the ECS cluster + service Terraform diff before apply; `needs-human-review` flag set (SP ≥ 8).
- [ ] **E2E** — One zone (e.g., `web-planner`) deploys and returns HTTP 200 on its `/health` endpoint.

#### AI Execution Notes

Implement the `ecs-service` module with inputs `name`, `image`, `cpu`, `memory`, `spot_weight` as shown in `deployment.md` HCL examples. Set `spot_weight = 0` for On-Demand services, `spot_weight = 100` for Spot-only zones. The `api` service uses a mixed strategy: `base_on_demand_count = 1` + Spot scale-out.

#### Testing Notes

- Unit: `terraform validate` on `ecs-cluster` + `ecs-service` modules.
- Integration: `terraform plan` lists 13 ECS services and all task definitions include ARM64 runtime platform.
- E2E: `aws ecs describe-tasks` on the deployed web-planner task confirms `architecture: ARM64`; health check returns 200.
- Manual: DevOps inspects plan diff for any x86 references before apply.

#### Dependencies

- Blocked by: DEPLOY-1.S1 (layout), DEPLOY-1.S2 (VPC + SGs), DEPLOY-1.S5 (ECR repos must exist before image pull)
- Blocks: DEPLOY-2.S2 (per-zone build+push pipelines reference these service names)

#### Definition of Done

- Inherits project DoD.
- All 13 ECS services listed in `deployment.md` are declared and ARM64-only.
- At least one zone passes its `/health` check in staging.

---

### [STORY] DEPLOY-1.S4 RDS Postgres + RDS Proxy + RLS contract

ID: DEPLOY-1.S4
Status: Backlog
Epic: DEPLOY-1
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 8
Rank: 140
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want RDS Postgres 16 with RDS Proxy in front (IAM auth) and an RLS contract enforced by application middleware, so that connection pooling works within budget and tenant isolation holds at the database layer.

#### Acceptance Criteria

- [ ] RDS Postgres 16 instance provisioned as `db.t4g.medium` (staging: `db.t4g.micro`) Graviton single-AZ per `deployment.md` cost table.
- [ ] RDS Proxy created with IAM authentication; NestJS API connects through Proxy, not directly to RDS.
- [ ] RDS Read Replica (`db.t4g.medium`) provisioned for Cube.js direct connection (bypasses Proxy) per `deployment.md` architecture diagram.
- [ ] Connection pool budget enforced: `api_tasks × (pool_size + 2) < 100` per `deployment.md` §"Connection Pool Budget"; `pool_size_per_task` defaults to 10, lowered to 8 if auto-scaling pushes API tasks above 8.
- [ ] RLS policies created by Drizzle migrations in `0000_initial.sql` (single-file migration policy per CLAUDE.md); no ad-hoc SQL applied outside migrations.
- [ ] DB credentials stored in Secrets Manager; not in env files, DB rows, or task definition env vars (CLAUDE.md hard rule).
- [ ] Automated backups enabled (14-day retention); point-in-time recovery enabled.
- [ ] **human-review** — DevOps engineer reviewed the RDS + Proxy Terraform diff before apply; `needs-human-review` flag set (SP ≥ 8, multi-tenancy risk).
- [ ] **E2E** — Synthetic dual-tenant probe (cross-link DEPLOY-3.S1) passes against this DB; confirms no cross-tenant row leakage.

#### AI Execution Notes

Declare RDS, RDS Proxy, and Read Replica in `infra/terraform/modules/rds/`. RDS Proxy IAM policy must grant `rds-db:connect` for the ECS task execution role. ElastiCache (`cache.t4g.small`) for Cube.js query cache is declared in `infra/terraform/modules/redis/`. Staging uses smaller instance classes (`db.t4g.micro`, `cache.t4g.micro`) controlled via `environments/staging.tfvars`.

#### Testing Notes

- Unit: `terraform validate` on `rds` module.
- Integration: `terraform plan` confirms RDS Proxy + Replica are in the plan; connection pool budget calculation verified in a unit test of the NestJS `DB_TOKEN` config.
- E2E: dual-tenant probe (DEPLOY-3.S1) run against staging DB — confirms RLS enforced and no cross-tenant leakage.
- Manual: DevOps reviews RDS parameter groups and backup config before apply.

#### Dependencies

- Blocked by: DEPLOY-1.S1 (layout), DEPLOY-1.S2 (VPC + SGs)
- Blocks: DEPLOY-3.S1 (dual-tenant probe requires a running DB)

#### Definition of Done

- Inherits project DoD.
- RDS Proxy in use — no direct RDS connections from ECS tasks.
- Dual-tenant probe passes in staging.
- Connection pool budget documented in `deployment.md` is not exceeded at planned scale-out.

---

### [STORY] DEPLOY-1.S5 ALB + ACM + Route53 + ECR + Secrets Manager

ID: DEPLOY-1.S5
Status: Backlog
Epic: DEPLOY-1
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 5
Rank: 150
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want ALB with ACM TLS + Route53 records + ECR repos per zone + Secrets Manager entries wired to ECS task definitions, so that every zone is reachable over HTTPS with secrets injected at container runtime.

#### Acceptance Criteria

- [ ] ALB with HTTPS listener (port 443); HTTP (port 80) redirects to HTTPS.
- [ ] ACM wildcard certificate for `*.seta-international.com` issued and auto-renewing; covers all zone subdomains with a single cert per `deployment.md` decisions log.
- [ ] Route53 host-based routing: one subdomain record per zone (13 zones + api = 14 records for staging, same for prod).
- [ ] Session cookie configured `Domain=.seta-international.com; HttpOnly; Secure; SameSite=Lax` per `deployment.md`.
- [ ] 14 ECR repositories declared (api + web-shell + 10 domain zones + cubejs + web-admin); one repo per service per `deployment.md`.
- [ ] Secrets Manager entries for: DB credentials, `OPENAI_API_KEY` (platform default), per-tenant BYO key path `future/{env}/tenant/{tenantId}/openai-api-key`, Slack signing secret, Teams bot credentials — per `deployment.md` decisions log.
- [ ] ECS task definitions reference Secrets Manager ARNs via `secrets:` block; no secret values in task definition env vars (CLAUDE.md hard rule).
- [ ] **human-review** — DevOps engineer reviewed the ALB + ACM + ECR + Secrets Manager Terraform diff before apply.
- [ ] **E2E** — At least one zone (e.g., `web-planner`) is reachable at `https://staging-planner.seta-international.com` and returns HTTP 200 on `/health`.

#### AI Execution Notes

ALB listener rules use host-based routing (`host_header` condition). ACM certificate validation uses Route53 DNS validation. ECR repos declared in `infra/terraform/modules/ecr/` — one `aws_ecr_repository` per service, parameterised via a `for_each` on a service name list. Secrets Manager entries in `infra/terraform/modules/secrets/` with `aws_secretsmanager_secret` + `aws_secretsmanager_secret_version` (initial placeholder values; real values injected by ops runbook).

#### Testing Notes

- Unit: `terraform validate` on `alb`, `ecr`, `secrets` modules.
- Integration: `terraform plan` confirms 14 ECR repos and all ALB listener rules present.
- E2E: `curl -I https://staging-planner.seta-international.com/health` returns 200; TLS cert is valid and auto-renewing.
- Manual: DevOps confirms no secret literals appear in Terraform plan output before apply.

#### Dependencies

- Blocked by: DEPLOY-1.S1 (layout), DEPLOY-1.S2 (VPC for ALB placement)
- Blocks: DEPLOY-1.S3 (ECR repos must exist for ECS image pull), DEPLOY-2.S1 (OIDC needs ECR ARNs for IAM policy)

#### Definition of Done

- Inherits project DoD.
- Zero secrets in task definition env vars — all injected via Secrets Manager ARN reference.
- HTTPS enforced on all zone subdomains; HTTP redirects to HTTPS.

---

## [EPIC] DEPLOY-2 CI/CD pipelines

ID: DEPLOY-2
Status: Backlog
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 23
Rank: 200
Jira Key:
Confluence Link:

### Summary

Build GitHub Actions CI/CD pipelines with OIDC federation to AWS (no static keys), per-zone build+push workflows for 14 services using Turbo affected detection, remote cache, smoke tests, and explicit deploy gates with a rollback playbook — so that every merged PR auto-deploys to staging and production releases are safe and reversible.

### Goal

By S4 close, every PR auto-builds, pushes to ECR, and deploys to staging via GitHub Actions OIDC with no static AWS keys; production deploys require manual approval gate.

### Scope

- GitHub Actions OIDC trust policy + per-environment IAM roles (`future-staging-deploy`, `future-production-deploy`)
- 14 per-zone build+push workflows (Turbo `--filter` affected detection, `linux/arm64` buildx)
- Turbo remote cache (S3-backed) + post-deploy smoke tests
- Deploy gates: CI green + smoke pass required; manual approval gate for production
- Rollback playbook (documented, tested in staging drill)

### Out of Scope

- Multi-region CI/CD — only `ap-southeast-1` at MVP
- Blue/green or canary deployments — ECS rolling update only at MVP

### SRS Coverage

- n/a (CI/CD infra; derived from `docs/architecture/deployment.md` §"CI/CD Pipeline")

### Acceptance Criteria

- [ ] Zero static AWS access keys in any `.github/workflows/` file or GitHub secret.
- [ ] A merged PR to `main` affecting `apps/web-planner/**` triggers only the `deploy-web-planner.yml` workflow; other zone workflows are not triggered.
- [ ] Smoke tests pass after every staging deploy; a deliberately broken commit fails the smoke test.
- [ ] Production deploy requires manual approval in GitHub Actions environment gate.

### Child Tickets

- DEPLOY-2.S1 GitHub Actions OIDC to AWS (no static keys) (Story)
- DEPLOY-2.S2 Per-zone build+push pipelines (14 services) (Story)
- DEPLOY-2.S3 Turbo remote cache + smoke tests (Story)
- DEPLOY-2.S4 Deploy gates + rollback playbook (Story)

### Definition of Done

- All child Stories `Status: Done`.
- A full deploy cycle (PR merge → staging deploy → smoke pass) completes end-to-end without manual intervention.
- Rollback drill (DEPLOY-2.S4) completed within 10 minutes in staging.

---

### [STORY] DEPLOY-2.S1 GitHub Actions OIDC to AWS (no static keys)

ID: DEPLOY-2.S1
Status: Backlog
Epic: DEPLOY-2
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 5
Rank: 210
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want GitHub Actions OIDC federation to AWS with a separate IAM role per environment, so that no static AWS access keys are stored in GitHub secrets and the blast radius of a compromised token is bounded to one environment.

#### Acceptance Criteria

- [ ] OIDC identity provider `token.actions.githubusercontent.com` registered in AWS IAM.
- [ ] Two IAM roles created: `future-staging-deploy` (trust: `repo:Seta-International/future:ref:refs/heads/main`, environment: `staging`) and `future-production-deploy` (trust: environment: `production`).
- [ ] Both roles have least-privilege policies: ECR push, ECS update-service, ECS register-task-definition, Secrets Manager read for deploy secrets only.
- [ ] Zero static AWS access keys in `.github/workflows/` files or GitHub repository secrets (verified by `grep -r "AWS_ACCESS_KEY_ID\|AWS_SECRET_ACCESS_KEY" .github/`).
- [ ] OIDC configuration declared in Terraform (`infra/terraform/modules/` or root `main.tf`); not applied via AWS console.
- [ ] **human-review** — DevOps engineer reviewed the OIDC trust policy + IAM role Terraform diff before apply.
- [ ] **E2E** — A workflow run using `aws-actions/configure-aws-credentials@v4` with `role-to-assume: future-staging-deploy` successfully assumes the role and pushes a test image to ECR without static credentials.

#### AI Execution Notes

Use `aws_iam_openid_connect_provider` + `aws_iam_role` with a condition on `token.actions.githubusercontent.com:sub` matching the repo + environment. The workflow step uses `permissions: id-token: write` + `contents: read`. Reference `deployment.md` §"CI/CD — Security" for the IAM role names.

#### Testing Notes

- Unit: `terraform validate` on OIDC + IAM role resources.
- Integration: `terraform plan` confirms OIDC provider + two roles in plan.
- E2E: workflow run in staging GitHub Actions environment assumes role and pushes successfully.
- Manual: DevOps confirms no static keys appear in the plan or workflow YAML before apply.

#### Dependencies

- Blocked by: DEPLOY-1.S5 (ECR repos must exist for the IAM policy ARNs)
- Blocks: DEPLOY-2.S2 (per-zone pipelines depend on these roles)

#### Definition of Done

- Inherits project DoD.
- `grep -r "AWS_ACCESS_KEY_ID\|AWS_SECRET_ACCESS_KEY" .github/` returns no results.
- Staging workflow successfully assumes role via OIDC in CI run.

---

### [STORY] DEPLOY-2.S2 Per-zone build+push pipelines (14 services)

ID: DEPLOY-2.S2
Status: Backlog
Epic: DEPLOY-2
Sprint: Sprint-3
Release: deployment
Priority: P0
Story Point: 8
Rank: 220
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want a build+push pipeline per zone + API (14 total) using Turbo affected detection and ARM64 buildx, so that only changed services rebuild on each PR merge — keeping CI fast and independent per zone.

#### Acceptance Criteria

- [ ] 14 workflow files under `.github/workflows/deploy-{service}.yml` (api + web-shell + 10 domain zones + cubejs + web-admin).
- [ ] Each pipeline uses Turbo `--filter` to detect affected packages; unchanged services skip build entirely.
- [ ] Docker image built with `--platform linux/arm64` via `docker/setup-buildx-action` (CLAUDE.md hard rule: ARM64 only).
- [ ] Image tagged with both `:{git-sha}` and `:{env}` (`:staging` or `:production`) per `deployment.md` §"Pipeline Flow".
- [ ] Deploy step updates ECS task definition and triggers ECS rolling update (`min_healthy_percent: 50` for staging, `100` for production).
- [ ] Only the affected zone's ECS service is updated; other zones are not restarted.
- [ ] **human-review** — DevOps engineer reviewed all 14 workflow files before merge; `needs-human-review` flag set (SP ≥ 8, 14 parallel pipelines).
- [ ] **E2E** — A push to a feature branch that modifies only `apps/web-planner/**` triggers only `deploy-web-planner.yml`; `deploy-web-people.yml` is not triggered.

#### AI Execution Notes

Each workflow triggers on `push` to `main` with a `paths` filter (e.g., `paths: ['apps/web-planner/**', 'packages/**']`). The `packages/**` path ensures shared package changes rebuild all affected zones via Turbo. Use `docker/build-push-action` with `platforms: linux/arm64`. The ECS deploy step uses `aws-actions/amazon-ecs-deploy-task-definition`.

#### Testing Notes

- Unit: lint each workflow YAML (`actionlint`).
- Integration: verify Turbo affected detection by modifying a single zone's source and checking which pipelines trigger.
- E2E: modify only `apps/web-planner/src/app/page.tsx`, push to feature branch — confirm only `deploy-web-planner.yml` runs.
- Manual: DevOps reviews workflow YAML for ARM64 platform flag before merge.

#### Dependencies

- Blocked by: DEPLOY-2.S1 (OIDC roles), DEPLOY-1.S3 (ECS service names), DEPLOY-1.S5 (ECR repo URLs)
- Blocks: DEPLOY-2.S3 (smoke tests run after deploy step in these pipelines)

#### Definition of Done

- Inherits project DoD.
- All 14 pipeline files pass `actionlint`.
- ARM64 build flag present in every Dockerfile + workflow file — no x86 images.

---

### [STORY] DEPLOY-2.S3 Turbo remote cache + smoke tests

ID: DEPLOY-2.S3
Status: Backlog
Epic: DEPLOY-2
Sprint: Sprint-4
Release: deployment
Priority: P1
Story Point: 5
Rank: 230
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want Turbo remote cache (S3-backed) and post-deploy smoke tests on every staging deploy, so that CI is fast on no-op PRs and bad deploys are caught before they reach production.

#### Acceptance Criteria

- [ ] Turbo remote cache configured with an S3 bucket as the cache store; cache token stored in Secrets Manager (not a GitHub secret plain text).
- [ ] Cache hit rate ≥ 80% on PRs that touch no source files (no-op PRs) — verified by Turbo run summary log.
- [ ] Smoke test job added to each per-zone pipeline after the ECS rolling update; asserts `GET /health` returns HTTP 200 on the updated zone's staging hostname.
- [ ] Smoke test failure marks the workflow run as failed; no auto-rollback at this stage (rollback is DEPLOY-2.S4).
- [ ] **human-review** — DevOps engineer reviewed the Turbo cache config + smoke test scripts before merge.
- [ ] **E2E** — A deliberately broken deploy (image that returns 503 on `/health`) causes the smoke test job to fail and the workflow run to be marked failed; the previous healthy deployment remains serving traffic.

#### AI Execution Notes

Use `@turbo/remote-cache` or the Turbo `--token` flag with a custom S3-compatible remote cache server (e.g., `ducktors/turborepo-remote-cache` self-hosted on ECS, or native Vercel remote cache if available). The smoke test is a simple `curl` or `wget` step in the workflow YAML. If the test fails, ECS already rolled back via `min_healthy_percent: 50` — the smoke test just surfaces the failure clearly.

#### Testing Notes

- Unit: smoke test shell script unit-tested with a mock endpoint.
- Integration: Turbo remote cache hit confirmed by running lint twice on an unchanged codebase — second run should be a full cache hit.
- E2E: broken image smoke test scenario (see AC).
- Manual: DevOps confirms cache token is not exposed in workflow logs.

#### Dependencies

- Blocked by: DEPLOY-2.S2 (per-zone pipelines must exist to add smoke step)
- Blocks: DEPLOY-2.S4 (rollback playbook references smoke test failure as the trigger)

#### Definition of Done

- Inherits project DoD.
- Turbo cache hit rate ≥ 80% on no-op PRs verified in CI run.
- Smoke test failure correctly blocks promotion to production gate.

---

### [STORY] DEPLOY-2.S4 Deploy gates + rollback playbook

ID: DEPLOY-2.S4
Status: Backlog
Epic: DEPLOY-2
Sprint: Sprint-4
Release: deployment
Priority: P1
Story Point: 5
Rank: 240
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want explicit deploy gates (CI green + smoke pass) and a documented rollback playbook, so that production cutover is safe and any bad deploy can be reversed within 10 minutes.

#### Acceptance Criteria

- [ ] Production deploy workflow requires manual approval via a GitHub Actions environment protection rule on the `production` environment; no auto-deploy to production on push.
- [ ] Production deploy gate checks: CI lint + test pass, staging smoke tests green, manual approver from the `production-deployers` team.
- [ ] Rollback procedure documented in the prod cutover runbook (cross-link DOC-1.T5): `terraform apply` of the previous tagged release restores the prior task definition; ECS performs a rolling update.
- [ ] Rollback is tested in a staging drill: revert a staging deploy to the previous image tag within 10 minutes end-to-end.
- [ ] Pipeline uses `re-tag ECR image :staging → :production` (no rebuild) per `deployment.md` §"Pipeline Flow".
- [ ] **human-review** — DevOps engineer reviewed the deploy gate configuration + rollback runbook before merge.
- [ ] **E2E** — Staging rollback drill: deploy a broken image → smoke test fails → manually trigger rollback → healthy image serving within 10 minutes; end-to-end timeline is recorded.

#### AI Execution Notes

GitHub Actions environment protection rule is configured in the repository settings (Settings → Environments → `production` → Required reviewers). The production workflow YAML includes `environment: production` on the deploy job. The rollback step is a separate `rollback.yml` workflow that accepts the previous image tag as an input and re-registers the old ECS task definition.

#### Testing Notes

- Unit: rollback workflow YAML linted with `actionlint`.
- Integration: staging rollback drill (see E2E).
- E2E: see staging rollback drill AC above.
- Manual: DevOps + Eng-lead both walk through rollback runbook steps before production cutover.

#### Dependencies

- Blocked by: DEPLOY-2.S2 (pipelines), DEPLOY-2.S3 (smoke tests as gate input)
- Blocks: DEPLOY-3.S5 (prod cutover runbook content feeds into this DoD)

#### Definition of Done

- Inherits project DoD.
- Rollback drill recorded and result documented in the cutover runbook.
- No production deploy can proceed without manual approval in GitHub Actions.

---

## [EPIC] DEPLOY-3 Production readiness

ID: DEPLOY-3
Status: Backlog
Sprint: Sprint-4
Release: deployment
Priority: P0
Story Point: 24
Rank: 300
Jira Key:
Confluence Link:

### Summary

Harden the production environment with a synthetic dual-tenant probe, staging scale-to-zero cost controls, secrets rotation runbook, vendor-agnostic CloudWatch alerting, RDS backup + PITR verification, and a prod cutover runbook — so that the platform meets the launch gates defined in the SRS before Phase-1 GA.

### Goal

By S5 close, the production environment passes all launch gates: zero cross-tenant exposure verified (planner-srs §1.5.3 + agents-srs NFR-018), backups verified by a real restore drill, secrets rotation cadence enforceable, alerting operational, and prod cutover runbook signed off by DevOps + Eng-lead.

### Scope

- Synthetic dual-tenant probe (daily, production + staging)
- Staging scale-to-zero EventBridge schedule (9am–8pm SGT weekdays)
- Secrets rotation runbook (DB credentials, JWT keys, OpenAI API key)
- CloudWatch alarms + SNS alerting (vendor-agnostic; no Langfuse dependency)
- RDS automated backups + PITR verification via restore drill
- Prod cutover runbook

### Out of Scope

- Multi-AZ RDS — deferred until first enterprise SLA
- Trace observability backend — deferred per CLAUDE.md + `project_no_langfuse_mvp.md` memory
- PagerDuty full-featured incident management — basic SNS integration only at MVP

### SRS Coverage

- agents-srs NFR-001..008 (latency/availability SLOs — alert thresholds)
- agents-srs NFR-009, NFR-018 (tenant isolation — dual-tenant probe)
- agents-srs NFR-013 (secret rotation cadence)
- planner-srs §1.5.3 (launch gate: zero cross-tenant leakage)
- planner-srs NFR-PERF (performance — alert thresholds)

### Acceptance Criteria

- [ ] Synthetic dual-tenant probe runs daily in production and pages on-call on any cross-tenant read success.
- [ ] Staging scales to zero nightly and on weekends; cost stays within `~$109/month` envelope from `deployment.md`.
- [ ] Secrets rotation runbook is documented and a real DB credential rotation completes with zero downtime in staging.
- [ ] CloudWatch alarms defined in Terraform for all critical failure modes; no Langfuse dependency in any alarm config.
- [ ] RDS restore drill completes successfully in staging within S5.

### Child Tickets

- DEPLOY-3.S1 Synthetic dual-tenant cross-tenant probe (Story)
- DEPLOY-3.S2 Scale-to-zero staging schedule (Story)
- DEPLOY-3.S3 Secrets rotation runbook (Story)
- DEPLOY-3.S4 Alerting wiring (vendor-agnostic) (Story)
- DEPLOY-3.S5 DB backup + PITR verification + prod cutover runbook (Story)

### Definition of Done

- All child Stories `Status: Done`.
- Dual-tenant probe passing in production.
- Prod cutover runbook signed off by DevOps + Eng-lead (DEPLOY-3.S5 DoD).

---

### [STORY] DEPLOY-3.S1 Synthetic dual-tenant cross-tenant probe

ID: DEPLOY-3.S1
Status: Backlog
Epic: DEPLOY-3
Sprint: Sprint-4
Release: deployment
Priority: P0
Story Point: 8
Rank: 310
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want a synthetic dual-tenant probe running daily in production, so that any cross-tenant data leak is detected within 24 hours and pages on-call immediately.

#### Acceptance Criteria

- [ ] Probe runs daily in production (EventBridge Scheduler → Lambda or ECS task).
- [ ] Probe provisions two isolated test tenants and attempts a cross-tenant read against every tenant-scoped table, including the KB index and agent session store (agents-srs NFR-018).
- [ ] Any successful cross-tenant read triggers an SNS alert to on-call (not merely logged).
- [ ] Probe coverage matrix is documented listing every table and endpoint tested.
- [ ] Probe tenants are cleaned up after each run; no test data accumulates in production.
- [ ] **human-review** — Security reviewer and DevOps engineer both signed off on probe coverage matrix before enabling in production; `needs-human-review` flag set (SP ≥ 8, security-critical).
- [ ] **E2E** — In staging with two tenants: deliberately misconfigure a RLS policy on one table; confirm the probe detects the cross-tenant read and fires an SNS alert within the run.

#### AI Execution Notes

The probe is a standalone NestJS or TypeScript script invoked as an ECS task or Lambda. It creates two tenants via the API (with a test-tenant flag that prevents real email sends), executes reads scoped to tenant A using tenant B's credentials, and asserts all reads return empty or 403. Tables to probe: all tables with `tenant_id` column across every module schema. Cross-link DEPLOY-1.S4 (RDS must be running) and DEPLOY-3.S4 (SNS alarm topic).

#### Testing Notes

- Unit: probe assertion logic — mock DB returns a row with wrong `tenant_id`; confirm probe marks the run as failed.
- Integration: probe run against staging DB with real tenants.
- E2E: deliberately misconfigured RLS scenario (see AC).
- Manual (security review): Security reviewer walks through coverage matrix before production enable.

#### Dependencies

- Blocked by: DEPLOY-1.S4 (RDS must be running), DEPLOY-3.S4 (SNS topic for alerting)
- Blocks: planner-srs §1.5.3 launch gate, agents-srs NFR-018 launch gate

#### Definition of Done

- Inherits project DoD.
- Coverage matrix approved by security reviewer before enabling in production.
- Probe has run at least once successfully in staging with the deliberate-misconfiguration test.

---

### [STORY] DEPLOY-3.S2 Scale-to-zero staging schedule

ID: DEPLOY-3.S2
Status: Backlog
Epic: DEPLOY-3
Sprint: Sprint-4
Release: deployment
Priority: P2
Story Point: 3
Rank: 320
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want staging ECS services to scale to zero outside SGT business hours, so that staging cost stays within the `~$109/month` envelope documented in `deployment.md`.

#### Acceptance Criteria

- [ ] EventBridge Scheduler rule `staging-scale-up-weekdays`: cron `0 1 ? * MON-FRI *` (9am SGT = 01:00 UTC) sets all 13 staging ECS services to `desiredCount: 1`.
- [ ] EventBridge Scheduler rule `staging-scale-down-weekdays`: cron `0 12 ? * MON-FRI *` (8pm SGT = 12:00 UTC) sets all 13 staging ECS services to `desiredCount: 0`.
- [ ] No scale-up rule on weekends — staging remains at 0 all weekend.
- [ ] RDS staging instance runs 24/7 (no schedule — cold start cost is negligible at `db.t4g.micro` per `deployment.md`).
- [ ] Schedule rules declared in `infra/terraform/modules/eventbridge/`; configurable per environment via `environments/staging.tfvars` (`enable_scale_to_zero = true`); production tfvars sets `enable_scale_to_zero = false`.
- [ ] **human-review** — DevOps engineer reviewed the EventBridge rule Terraform diff before apply.
- [ ] **E2E** — At a scheduled scale-down time: verify all 13 ECS services show `desiredCount: 0` and staging hostnames return 503; at scale-up time: verify services restart and `/health` returns 200.

#### AI Execution Notes

Use `aws_scheduler_schedule` (EventBridge Scheduler, not the older EventBridge Rules) with a `FlexibleTimeWindow` of `Off` for exact-time execution. Target is `aws_scheduler_schedule_group` invoking `ecs:UpdateService` for each service. Wrap in a `count = var.enable_scale_to_zero ? 1 : 0` conditional.

#### Testing Notes

- Unit: `terraform validate` on `eventbridge` module.
- Integration: `terraform plan` confirms schedule rules present for staging, absent for production.
- E2E: observe ECS service desired count at scheduled off-hours.
- Manual: confirm UTC → SGT offset calculation is correct (UTC+7, not UTC+8 — Vietnam is UTC+7).

#### Dependencies

- Blocked by: DEPLOY-1.S3 (ECS services must exist)
- Blocks: none

#### Definition of Done

- Inherits project DoD.
- Staging scales to zero on schedule — verified by E2E check.
- Production tfvars has `enable_scale_to_zero = false` — confirmed by `terraform plan` for prod workspace.

---

### [STORY] DEPLOY-3.S3 Secrets rotation runbook

ID: DEPLOY-3.S3
Status: Backlog
Epic: DEPLOY-3
Sprint: Sprint-5
Release: deployment
Priority: P1
Story Point: 3
Rank: 330
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want a documented runbook for rotating all secret classes (DB credentials, OpenAI API keys, Slack signing secrets, Teams bot credentials), so that the agents-srs NFR-013 90-day rotation cadence is enforceable and a real rotation can be performed with zero downtime.

#### Acceptance Criteria

- [ ] Runbook documents rotation procedure for each secret class: DB credentials (automated via Secrets Manager Lambda rotator), `OPENAI_API_KEY` (manual, procedural), Slack signing secret (manual), Teams bot credentials (manual).
- [ ] Secrets Manager rotation Lambda configured for DB credentials; rotation schedule set to 90 days per agents-srs NFR-013.
- [ ] Runbook specifies the zero-downtime rotation sequence for DB credentials: new credential staged → ECS tasks pick up new credential via Secrets Manager ARN reference (no task restart required if using `valueFrom`).
- [ ] Runbook published at `docs/runbooks/secrets-rotation.md` and cross-linked from DOC-1.T5 prod cutover runbook.
- [ ] **human-review** — DevOps engineer reviewed the runbook + Lambda rotation config before enabling automated rotation.
- [ ] **E2E** — Perform a real DB credential rotation in staging: rotate via Secrets Manager → confirm ECS tasks continue serving traffic without restart; validate `/health` returns 200 throughout the rotation.

#### AI Execution Notes

`aws_secretsmanager_secret_rotation` resource in the `secrets` Terraform module wires the rotation Lambda. Use the AWS-provided `SecretsManagerRDSPostgreSQLRotationSingleUser` or `MultiUser` Lambda function from the Serverless Application Repository. Per-tenant BYO OpenAI key rotation at `future/{env}/tenant/{tenantId}/openai-api-key` is a manual procedure — document the API call sequence in the runbook.

#### Testing Notes

- Unit: `terraform validate` on `secrets` module rotation config.
- Integration: rotation Lambda invoked manually in staging against a test secret — confirm rotation succeeds.
- E2E: real DB credential rotation drill (see AC).
- Manual: DevOps walks through runbook steps end-to-end before signing off.

#### Dependencies

- Blocked by: DEPLOY-1.S5 (Secrets Manager entries must exist), DEPLOY-1.S4 (RDS instance required for DB rotation)
- Blocks: agents-srs NFR-013 launch gate

#### Definition of Done

- Inherits project DoD.
- DB credential rotation drill completed in staging with zero downtime recorded.
- Runbook at `docs/runbooks/secrets-rotation.md` reviewed and linked from DOC-1.T5.

---

### [STORY] DEPLOY-3.S4 Alerting wiring (vendor-agnostic)

ID: DEPLOY-3.S4
Status: Backlog
Epic: DEPLOY-3
Sprint: Sprint-5
Release: deployment
Priority: P1
Story Point: 5
Rank: 340
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want CloudWatch alarms + SNS alerting wired for all critical failure modes, so that on-call is paged when production degrades and no alerting config depends on Langfuse or any other vendor-specific trace backend.

#### Acceptance Criteria

- [ ] Alarms defined in Terraform for: RDS unreachable (connection count = 0 for 5 min), dual-tenant probe failure (custom metric from DEPLOY-3.S1), ECS task crash loops (`TaskStoppedReasonExited` alarm on all 13 services), ACM certificate expiry < 30 days.
- [ ] Alarm thresholds derived from agents-srs NFR-001..NFR-008 (p99 latency, error rate) and planner-srs NFR-PERF.
- [ ] SNS topic `future-{env}-alerts` declared in Terraform; on-call rotation subscribed (email + webhook to PagerDuty or equivalent).
- [ ] **Vendor-agnostic** — no Langfuse dependency in any alarm, metric filter, or log group config (per memory `project_no_langfuse_mvp.md`); observability trace backend is deferred per CLAUDE.md.
- [ ] All alarm + SNS resources declared in Terraform; no manual CloudWatch console configuration.
- [ ] **human-review** — DevOps engineer reviewed the CloudWatch alarm + SNS Terraform diff before apply.
- [ ] **E2E** — Synthetic alarm test in staging: manually set RDS connection count to 0 (stop the DB proxy) → confirm SNS notification arrives at the on-call webhook within 5 minutes.

#### AI Execution Notes

Declare `aws_cloudwatch_metric_alarm` + `aws_sns_topic` + `aws_sns_topic_subscription` in `infra/terraform/modules/` (new `monitoring` module or inline in `main.tf`). For the dual-tenant probe custom metric, the probe script (DEPLOY-3.S1) publishes a `PutMetricData` call with namespace `Future/Security` and metric `CrossTenantLeakDetected`; the alarm watches this metric.

#### Testing Notes

- Unit: `terraform validate` on monitoring resources.
- Integration: `terraform plan` confirms all alarms present for both environments.
- E2E: synthetic alarm test (see AC).
- Manual: DevOps confirms no Langfuse endpoint or trace backend URL appears in any alarm config.

#### Dependencies

- Blocked by: DEPLOY-3.S1 (dual-tenant probe metric), DEPLOY-1.S4 (RDS monitoring), DEPLOY-1.S3 (ECS monitoring)
- Blocks: agents-srs NFR-001..008 launch gate, planner-srs NFR-PERF launch gate

#### Definition of Done

- Inherits project DoD.
- All alarms green in staging before production cutover.
- No Langfuse or vendor-specific trace backend dependency in any Terraform resource.
- Synthetic alarm fires and on-call receives notification within 5 minutes.

---

### [STORY] DEPLOY-3.S5 DB backup + PITR verification + prod cutover runbook

ID: DEPLOY-3.S5
Status: Backlog
Epic: DEPLOY-3
Sprint: Sprint-5
Release: deployment
Priority: P0
Story Point: 5
Rank: 350
Jira Key:
Confluence Link:

#### Summary

As a DevOps engineer, I want RDS automated backups + Point-In-Time-Recovery verified by a real restore drill, plus a signed-off prod cutover runbook, so that a production failure can be recovered within the RTO target and the team has a shared, tested plan for going live.

#### Acceptance Criteria

- [ ] RDS automated backups enabled with 14-day retention; PITR enabled on both staging and production RDS instances (declared in `infra/terraform/modules/rds/`).
- [ ] Snapshot taken before every Drizzle migration run (procedure documented in runbook; triggered manually via `aws rds create-db-snapshot` before applying `0000_initial.sql`).
- [ ] PITR restore drill performed in staging within S5: restore to a known point-in-time → verify dataset integrity → record actual recovery time.
- [ ] Restore drill RTO ≤ 30 minutes (single-AZ, snapshot-based); result documented.
- [ ] Prod cutover runbook published at `docs/runbooks/prod-cutover.md` containing: pre-cutover checklist, cutover steps, rollback decision tree, and cross-links to DEPLOY-2.S4 (rollback playbook) and DEPLOY-3.S3 (secrets rotation).
- [ ] Runbook signed off by DevOps engineer + Eng-lead before production cutover.
- [ ] **human-review** — DevOps engineer and Eng-lead both reviewed and signed the runbook before production cutover.
- [ ] **E2E** — PITR drill: restore staging DB to T-1 hour → run the dual-tenant probe (DEPLOY-3.S1) against the restored DB → confirm probe passes on the restored dataset.

#### AI Execution Notes

`backup_retention_period = 14` + `backup_window = "03:00-04:00"` (low-traffic SGT window) in the RDS Terraform module. The restore drill uses `aws rds restore-db-instance-to-point-in-time`. The `prod-cutover.md` runbook template should follow the same structure as the secrets rotation runbook — pre-checks, steps, rollback, sign-off table.

#### Testing Notes

- Unit: `terraform validate` — confirm `backup_retention_period` and `backup_window` are set.
- Integration: `terraform plan` confirms backup config present for both environments.
- E2E: PITR restore drill in staging (see AC); dual-tenant probe on restored DB.
- Manual (sign-off): DevOps + Eng-lead walk through runbook before production cutover date.

#### Dependencies

- Blocked by: DEPLOY-1.S4 (RDS instance), DEPLOY-2.S4 (rollback playbook cross-link), DEPLOY-3.S3 (secrets rotation cross-link), DEPLOY-3.S1 (dual-tenant probe for post-restore verification)
- Blocks: Phase-1 GA production cutover

#### Definition of Done

- Inherits project DoD.
- PITR restore drill completed and RTO recorded.
- Prod cutover runbook signed off by DevOps + Eng-lead.
- `docs/runbooks/prod-cutover.md` published and cross-linked from portfolio overview.
