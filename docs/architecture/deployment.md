# Future — Deployment Infrastructure Design

**Date:** 2026-04-08  
**Status:** Agreed  
**Project:** Seta Future AaaS

---

## Purpose

This document captures the agreed deployment infrastructure for Future — AWS region, compute strategy, database setup, CI/CD pipeline, environments, and IaC approach.

---

## Core Principles

- **AWS Singapore (ap-southeast-1)** — primary region. Low latency for Vietnamese and Southeast Asian tenants. Compliant data residency story for the region.
- **Graviton (ARM64) everywhere** — ECS Fargate ARM64 tasks and RDS t4g Graviton instances. ~20% cheaper than x86 equivalents, no code changes needed for Node.js containers.
- **Fargate Spot for all stateless frontend zones** — all Next.js zone containers run on Spot (up to 70% cheaper). NestJS API runs 1 On-Demand baseline + Spot scale-out.
- **One ECS service per Next.js zone** — each domain module is an independent deployment. No module deployment ever touches another module's container.
- **Two environments only** — `staging` + `production`. Terraform workspaces, single AWS account.
- **Staging scale-to-zero** — EventBridge scheduled rules scale all ECS tasks to 0 outside SGT business hours.
- **No Multi-AZ** — RDS single-AZ with automated backups + point-in-time recovery. Enable Multi-AZ only when first enterprise tenant requires written SLA commitments.
- **OIDC for CI/CD** — GitHub Actions assumes scoped IAM roles via OIDC. No static AWS credentials stored anywhere.
- **ECS auto-heals** — container crashes restart automatically. No server management, no SSH, no OS patching. The 2-4 person team focuses on product, not infrastructure ops.
- **Full platform from day one** — lakehouse (S3 + Glue + Iceberg + Athena), agent runtime (Teams + Slack + SSE), and observability (Langfuse) all operational from initial deployment.

---

## AWS Architecture

```
ap-southeast-1 (Singapore)
│
├── VPC
│     ├── Public subnets (2 AZs)   → ALB
│     └── Private subnets (2 AZs)  → ECS tasks, RDS, Redis, RDS Proxy
│
├── Application Load Balancer (one per environment)
│     ├── api.seta-international.com        → api ECS service (NestJS)
│     ├── cubejs.seta-international.com     → cubejs ECS service (internal only)
│     ├── people.seta-international.com     → web-people ECS service
│     ├── time.seta-international.com       → web-time ECS service
│     ├── hiring.seta-international.com     → web-hiring ECS service
│     ├── performance.seta-international.com → web-performance ECS service
│     ├── projects.seta-international.com   → web-projects ECS service
│     ├── finance.seta-international.com    → web-finance ECS service
│     ├── goals.seta-international.com      → web-goals ECS service
│     ├── insights.seta-international.com   → web-insights ECS service
│     ├── planner.seta-international.com    → web-planner ECS service
│     ├── admin.seta-international.com      → web-admin ECS service (tenant admin + platform admin portal)
│     └── shell.seta-international.com      → web-shell ECS service (navigation, auth, landing)
│
├── ECS Cluster (Fargate, Graviton ARM64)
│     ├── api              1 vCPU / 2GB   — 1 On-Demand + Spot scale-out
│     ├── web-shell        0.25 vCPU / 0.5GB — On-Demand (navigation hub)
│     ├── web-people       0.25 vCPU / 0.5GB — Spot
│     ├── web-time         0.25 vCPU / 0.5GB — Spot
│     ├── web-hiring       0.25 vCPU / 0.5GB — Spot
│     ├── web-performance  0.25 vCPU / 0.5GB — Spot
│     ├── web-projects     0.25 vCPU / 0.5GB — Spot
│     ├── web-finance      0.25 vCPU / 0.5GB — Spot
│     ├── web-goals        0.25 vCPU / 0.5GB — Spot
│     ├── web-insights     0.5 vCPU / 1GB    — Spot (Cube.js integration)
│     ├── web-planner      0.25 vCPU / 0.5GB — Spot
│     ├── cubejs           1 vCPU / 2GB      — On-Demand
│     ├── web-admin        0.25 vCPU / 0.5GB — On-Demand (admin portal, low traffic)
│     └── langfuse         0.5 vCPU / 1GB    — On-Demand
│
├── RDS PostgreSQL 16 — OLTP (db.t4g.medium, Graviton, single-AZ)
│     ├── RDS Proxy    → connection pooling + RLS session context (NestJS API only)
│     └── Read Replica (db.t4g.medium) → Cube.js direct connection (bypasses Proxy)
│
├── RDS PostgreSQL 16 — Langfuse (db.t4g.micro, Graviton, single-AZ)
│     └── Isolated from OLTP — trace write volume must not impact business queries
│
├── ElastiCache Redis (cache.t4g.small)  → Cube.js query cache only
│                                          (agent sessions stored in PostgreSQL agents.agent_session)
│
├── ECR                → one repo per service (15 repos: api + web-shell + 10 zones + cubejs + langfuse)
├── S3
│     ├── future-tf-state-{env}     → Terraform state (versioned)
│     └── future-lakehouse-{env}    → bronze/ + gold/ (Parquet + Iceberg)
├── AWS Glue
│     ├── ETL jobs (hourly)        → RDS → S3 Bronze → S3 Gold (Iceberg)
│     └── Data Catalog             → future_bronze + future_gold databases
├── Amazon Athena                  → ad-hoc analytics queries on S3 Gold
├── DynamoDB                       → Terraform state lock table
├── Secrets Manager                → DB credentials, OPENAI_API_KEY (platform default),
│                                    per-tenant BYO keys at future/{env}/tenant/{tenantId}/openai-api-key,
│                                    Langfuse keys, Slack signing secret,
│                                    Teams bot credentials
├── CloudWatch                     → logs, basic metrics, EventBridge scheduled scaling
└── Route 53 + ACM                 → Wildcard DNS `*.seta-international.com` + wildcard TLS cert
                                     covers all zone subdomains with a single certificate.
                                     Session cookie: `Domain=.seta-international.com; HttpOnly; Secure; SameSite=Lax`
```

---

## Frontend Deployment Strategy — Next.js Multi-Zones

See **Architecture Overview — Frontend Zone Routing** for the canonical zone list, basePath mappings, and `next.config.ts` pattern.

Each zone is an independent ECS service, ECR repo, and GitHub Actions deployment workflow. Deploying `web-finance` restarts only `web-finance` — all other zones are completely unaffected.

---

## Cost Estimates (ap-southeast-1, no Multi-AZ)

### Production

| Resource                                                                           | Spec                                   | Monthly         |
| ---------------------------------------------------------------------------------- | -------------------------------------- | --------------- |
| ECS api                                                                            | 1 vCPU / 2GB, Graviton, mixed Spot     | ~$30            |
| ECS web-shell                                                                      | 0.25 vCPU / 0.5GB, Graviton, On-Demand | ~$8             |
| ECS web-admin                                                                      | 0.25 vCPU / 0.5GB, Graviton, On-Demand | ~$8             |
| ECS 8 domain zones (people, time, hiring, perf, projects, finance, goals, planner) | 0.25 vCPU / 0.5GB, Graviton, Spot      | ~$32            |
| ECS web-insights                                                                   | 0.5 vCPU / 1GB, Graviton, Spot         | ~$8             |
| ECS cubejs                                                                         | 1 vCPU / 2GB, Graviton, On-Demand      | ~$30            |
| ECS langfuse                                                                       | 0.5 vCPU / 1GB, Graviton, On-Demand    | ~$17            |
| RDS OLTP (db.t4g.medium)                                                           | PostgreSQL 16, single-AZ, Graviton     | ~$55            |
| RDS Read Replica (db.t4g.medium)                                                   | Cube.js direct connection              | ~$55            |
| RDS Langfuse (db.t4g.micro)                                                        | Isolated trace storage, single-AZ      | ~$15            |
| RDS Proxy                                                                          | NestJS API connection pooling + RLS    | ~$22            |
| ElastiCache (cache.t4g.small)                                                      | Cube.js query cache only               | ~$20            |
| ALB                                                                                |                                        | ~$20            |
| AWS Glue ETL (hourly batch)                                                        | ~2 DPU × 5min × 24 runs/day            | ~$2             |
| S3 lakehouse (bronze + gold, ~100GB)                                               |                                        | ~$3             |
| Amazon Athena (ad-hoc, 10 tenants)                                                 |                                        | ~$5             |
| ECR + CloudWatch + misc                                                            |                                        | ~$15            |
| **Total production**                                                               |                                        | **~$349/month** |

### Staging

| Resource                        | Notes                                                     | Monthly         |
| ------------------------------- | --------------------------------------------------------- | --------------- |
| ECS all services (14 services)  | Scale-to-zero off SGT business hours (~50hrs/week active) | ~$28            |
| RDS OLTP (db.t4g.micro)         | Smaller instance, single-AZ                               | ~$20            |
| RDS Read Replica (db.t4g.micro) |                                                           | ~$20            |
| RDS Langfuse (db.t4g.micro)     |                                                           | ~$15            |
| ElastiCache (cache.t4g.micro)   |                                                           | ~$15            |
| ALB                             |                                                           | ~$18            |
| Glue + Athena + S3 + misc       |                                                           | ~$8             |
| **Total staging**               |                                                           | **~$127/month** |

**Total both environments: ~$476/month**

---

## RDS Proxy and RLS

See **Architecture Overview — Multi-Tenancy Contract** for the full RLS + tenant isolation pattern.

```
NestJS API → RDS Proxy → PostgreSQL Primary  (set_config + RLS enforced per request)
Cube.js    →            → RDS Read Replica   (queryTransformer tenant filter)
Langfuse   →            → Langfuse RDS        (isolated, no OLTP impact)
```

### Connection Pool Budget

Each NestJS API task holds a persistent connection pool (Drizzle). The pool competes with two background pollers running inside the same task:

- **Outbox relay** — polls `outbox_event` every 5s (1 dedicated connection per task)
- **pg-boss** — polls its own job queue every 5s (1 dedicated connection per task)

Total connection budget formula:

```
total_connections = api_tasks × (pool_size_per_task + 2)
```

Example at production scale-out (4 tasks, pool size 10):

```
4 tasks × (10 pool + 2 pollers) = 48 connections
```

`db.t4g.medium` PostgreSQL 16 supports approximately **170 max connections** (calculated from `LEAST(DBInstanceClassMemory / 9868951, 5000)` with 4GB RAM). RDS Proxy multiplexes these — the proxy's own connection limit to the upstream RDS instance is set to 70% of `max_connections` by default (~120 connections).

**Budget gate:** Keep `api_tasks × (pool_size + 2)` below 100. If auto-scaling pushes API tasks above 8, lower `pool_size_per_task` to 8 (8 tasks × 10 = 80 — still safe). If the platform grows beyond 10 API tasks consistently, upgrade to `db.t4g.large` (8GB RAM, ~350 max connections) before hitting the ceiling.

**Cube.js** connects directly to the read replica (bypasses Proxy) — its connection count is independent of this budget.

---

## Terraform IaC Layout

```
infra/
  bootstrap/          → ONE-TIME: creates S3 state bucket + DynamoDB lock table
    main.tf           → run manually before all other Terraform ops
  modules/
    vpc/              → VPC, subnets, NAT gateway, security groups
    alb/              → ALB, listeners, target groups, ACM cert
    ecs-cluster/      → ECS cluster, capacity providers (Fargate + Spot)
    ecs-service/      → reusable: service + task def + autoscaling
                        (parameterized: name, image, cpu, memory, spot_weight)
    rds/              → RDS instance, RDS Proxy, Read Replica, parameter groups
    redis/            → ElastiCache cluster
    ecr/              → ECR repos (one per service)
    secrets/          → Secrets Manager entries
    glue/             → Glue ETL jobs, Data Catalog databases, crawlers
    eventbridge/      → Scheduled scaling rules for staging
  environments/
    staging.tfvars    → instance sizes, min/max tasks, schedule rules
    production.tfvars → instance sizes, min/max tasks (no schedule rules)
  main.tf
  variables.tf
  backend.tf          → remote state: S3 + DynamoDB (created by bootstrap)
```

Adding a new zone is one block in `main.tf`:

```hcl
module "web_people" {
  source      = "./modules/ecs-service"
  name        = "web-people"
  image       = "${aws_ecr_repository.web_people.repository_url}:${var.image_tag}"
  cpu         = 256
  memory      = 512
  spot_weight = 100
}

module "web_admin" {
  source      = "./modules/ecs-service"
  name        = "web-admin"
  image       = "${aws_ecr_repository.web_admin.repository_url}:${var.image_tag}"
  cpu         = 256
  memory      = 512
  spot_weight = 0   # On-Demand — admin portal, low volume but must be stable
}
```

**Workspace commands:**

```bash
terraform workspace select staging
terraform apply -var-file=environments/staging.tfvars

terraform workspace select production
terraform apply -var-file=environments/production.tfvars
```

**Terraform state:**

- S3 bucket with versioning enabled (safe rollbacks)
- DynamoDB table for state locking (`PAY_PER_REQUEST` billing)
- State keys: `future/staging/terraform.tfstate`, `future/production/terraform.tfstate`

---

## CI/CD Pipeline — GitHub Actions

### Security

- GitHub Actions OIDC → IAM role assumption per environment. No static AWS access keys.
- Separate IAM roles: `future-staging-deploy`, `future-production-deploy` (least-privilege).

### Pipeline Flow

```
On push to main (per affected zone — Turbo --filter):
  1. Turbo lint + typecheck (all packages, parallel, cached)
  2. Turbo test (affected packages only)
  3. Build Docker image for affected zone(s) only
     - platform: linux/arm64 (Graviton)
     - Next.js output: standalone
  4. Push to ECR with :staging tag
  5. Deploy to staging:
     - Update ECS task definition (new image tag)
     - ECS rolling update, min 50% healthy
     - Only the affected zone's service is updated
  6. Run smoke tests on updated zone

On manual release (workflow_dispatch → select zone or 'all'):
  1. Re-tag ECR image: :staging → :production (no rebuild)
  2. Deploy to production:
     - ECS rolling update, min 100% healthy
  3. Post notification to Teams webhook
```

**Independent per-zone deploys:** Each zone has its own GitHub Actions workflow file. Changing `apps/web-finance/**` triggers only the `deploy-web-finance.yml` workflow. `web-people`, `web-time`, and all other zones are untouched.

### Turbo Optimization

- Remote cache: unchanged packages never rebuild (~30s for lint/typecheck on cache hit)
- `--filter` flag: only affected apps and their dependencies build
- Docker layer cache from ECR: only changed layers rebuild

---

## Staging Scale-to-Zero Schedule

EventBridge Scheduler rules (SGT = UTC+8):

| Rule                | Cron (UTC)                     | Action                             |
| ------------------- | ------------------------------ | ---------------------------------- |
| Scale up weekdays   | `0 1 ? * MON-FRI *` (9am SGT)  | All ECS services → desired count 1 |
| Scale down weekdays | `0 12 ? * MON-FRI *` (8pm SGT) | All ECS services → desired count 0 |

RDS staging instance runs 24/7 (cold start is 5-10 min, cost at t4g.micro is negligible).

---

## Decisions Log

| Decision              | Outcome                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Region                | AWS ap-southeast-1 (Singapore)                                                                                                                           |
| Domain                | `seta-international.com` — wildcard `*.seta-international.com` covers all zones                                                                          |
| ALB routing           | Host-based rules (subdomain-per-zone) — not path-based. Each zone lives at its own subdomain.                                                            |
| Session cookie        | `Domain=.seta-international.com; HttpOnly; Secure; SameSite=Lax` — shared across all subdomains                                                          |
| Compute               | ECS Fargate Graviton ARM64 — 20% cheaper, no code changes                                                                                                |
| Frontend zones        | Fargate Spot — up to 70% cheaper for stateless workloads                                                                                                 |
| NestJS API            | 1 On-Demand baseline + Spot scale-out                                                                                                                    |
| Environments          | staging + production only, single AWS account, Terraform workspaces                                                                                      |
| Staging scale-to-zero | EventBridge: 9am-8pm SGT weekdays only                                                                                                                   |
| Multi-AZ              | Not enabled — add when first enterprise tenant signs SLA                                                                                                 |
| Data protection       | RDS automated backups (7-day), point-in-time recovery, snapshot before migrations                                                                        |
| CloudFront            | Not now — ALB only. Add when performance is a real user complaint.                                                                                       |
| Terraform bootstrap   | `infra/bootstrap/` one-time module for S3 + DynamoDB                                                                                                     |
| Langfuse RDS          | Separate db.t4g.micro — isolated from OLTP trace write volume                                                                                            |
| LLM provider          | OpenAI API key (`OPENAI_API_KEY`) in Secrets Manager for platform default; per-tenant BYO keys stored at `future/{env}/tenant/{tenantId}/openai-api-key` |
| Agent channels        | Teams bot credentials + Slack signing secret in Secrets Manager                                                                                          |
| Admin zone            | `web-admin` — On-Demand Fargate (0.25 vCPU / 0.5GB), own ECR repo and GitHub Actions workflow                                                            |
| Lakehouse             | S3 bronze/gold + Glue ETL (hourly) + Athena — all in Terraform `glue/` module                                                                            |
| Total cost            | ~$349/month production + ~$127/month staging = ~$476/month                                                                                               |

---

## Future: Global Expansion

When targeting global SMBs beyond Southeast Asia:

1. Add `us-east-1` workspace in Terraform (one `region` variable change)
2. Route 53 latency-based routing: SGP for APAC users, US-East for Americas/EMEA
3. RDS stays Singapore as primary; add cross-region read replica for analytics
4. S3 Iceberg data replicates via S3 Cross-Region Replication

No code changes. Infrastructure is parameterized for multi-region from day one.
