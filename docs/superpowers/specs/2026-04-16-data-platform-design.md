# Future — Data Platform System Design

**Date:** 2026-04-16
**Status:** Draft
**Project:** Seta Future AaaS
**Supersedes:** `docs/architecture/data-platform.md` (2026-04-08)

---

## 1. Purpose

This document defines the complete system design for the Future data platform — a three-layer medallion lakehouse on AWS that transforms operational PostgreSQL data into analytics-ready Iceberg tables queryable by zone frontends, AI agents, and ad-hoc users. It supersedes the original data platform architecture document with the following material changes:

- **Three-layer medallion** (Bronze → Silver → Gold) replacing the two-layer design
- **Apache Airflow on ECS Fargate** replaces Glue's built-in scheduler for orchestration
- **AWS Lake Formation** added for access control, column-level security, and Iceberg registration
- **Glue Crawlers** added for automated catalog registration
- **Monitoring layer** with pipeline health, data quality, and cost alerts to Microsoft Teams

---

## 2. Core Principles

1. **Full lakehouse from day one** — S3 + Iceberg + Athena operational from the start. No phased rewrites.
2. **AWS-native** — all data stays inside the Future AWS account (`ap-southeast-1`). No third-party services moving tenant data off-account.
3. **Open format** — Apache Iceberg on S3. No proprietary warehouse lock-in.
4. **Cost-effective over real-time** — hourly Glue ETL batch is sufficient for HR/workforce analytics. Streaming CDC adds cost and complexity with no business benefit for this domain.
5. **PII handled at ETL, not governance** — Silver layer strips/masks PII before data reaches Gold. Lake Formation controls access to layers, not individual PII columns.
6. **Tenant isolation at every layer** — `tenant_id` partition key on all tables. Enforced in ETL, Lake Formation, and the tRPC query layer.
7. **ECS Fargate ARM64 only** — all compute (Airflow, API, zones) runs on Fargate Graviton. No EC2 instances.

---

## 3. Architecture Overview

```
PostgreSQL RDS Primary (OLTP, ap-southeast-1)
  │
  │  Schemas: people, time, finance, hiring, performance, goals, kernel, agents
  │
  └── AWS Glue ETL (triggered by Airflow)
        │
        ▼
      S3 Bronze (raw Parquet, includes PII)
        │
        ▼  Glue ETL — cleanse, mask PII, standardize
      S3 Silver (cleaned Parquet, PII stripped)
        │
        ▼  Glue ETL — aggregate, denormalize, Iceberg MERGE
      S3 Gold (Apache Iceberg, analytics-ready)
        │
        ├── Glue Data Catalog (registered by Crawlers)
        ├── Lake Formation (access control, column security, Iceberg registration)
        │
        ▼
      Amazon Athena (query engine)
        │
        ├── Redis cache ─── tRPC proxy (trpc.insights.*) ─── Zone frontends
        │                     Pre-built queries, cached         (web-people, web-finance,
        │                                                        web-insights, etc.)
        │
        ├── Athena result reuse ─── Ad-hoc querying
        │                            (web-insights explorer)
        │
        └── Agent access
              ├── Pre-built queries via tRPC (trpc.insights.*)
              └── Raw Athena SQL tool (tenant_id enforced server-side)

  Orchestration: Apache Airflow on ECS Fargate ARM64
  Monitoring: Pipeline failures + data quality + cost → Microsoft Teams
```

### Agent Memory (unchanged)

Vector search for agent RAG remains on RDS in the `agents` schema using pgvector with HNSW index (`vector(1536)`, OpenAI `text-embedding-3-small`). No changes from the original design.

---

## 4. Lakehouse Storage Layout

Single S3 bucket, prefix-partitioned by layer, module, and tenant:

```
s3://future-lakehouse-{env}/
  bronze/
    {module}/tenant_id={id}/year=YYYY/month=MM/day=DD/hour=HH/
      *.parquet                          ← raw extract, includes PII
  silver/
    {module}/tenant_id={id}/year=YYYY/month=MM/day=DD/hour=HH/
      *.parquet                          ← cleansed, PII stripped/masked, standardized
  gold/
    (Iceberg table metadata + data files, managed by Glue Data Catalog)
```

**Modules extracted:** people, time, finance, hiring, performance, goals, kernel (audit_event)

### S3 Lifecycle Policies

| Layer          | Retention      | Transition                                 |
| -------------- | -------------- | ------------------------------------------ |
| Bronze         | 30 days active | → Glacier after 30d → delete at 6 months   |
| Silver         | 90 days active | → Glacier after 90d → delete at 1 year     |
| Gold (Iceberg) | Indefinite     | Snapshot expiry managed by Glue compaction |

Bronze retention is short because Silver holds the canonical cleaned copy. Bronze is only needed for debugging recent extractions.

### Glue Data Catalog Databases

```
future_bronze   → raw Parquet tables (7 module schemas)
future_silver   → cleansed Parquet tables
future_gold     → Iceberg tables:
    people_employment
    people_org_placement
    time_leave_request
    time_attendance
    time_overtime
    finance_invoice
    hiring_candidate
    hiring_application
    performance_evaluation
    goals_kpi_score
    goals_objective
    kernel_audit_event
```

---

## 5. ETL Pipeline — Four Glue Jobs

### Job 1: Bronze Extract

```
RDS Primary → Glue (Python/PySpark) → S3 Bronze (Parquet)
```

- Reads from each module schema: `people.employment`, `time.leave_request`, `finance.invoice`, etc.
- Watermark-based: `WHERE updated_at > last_exported_at`
- Writes raw Parquet, partitioned by `tenant_id/year/month/day/hour`
- No transformation — exact copy of source rows including PII
- Watermark state stored in Glue job bookmarks

### Job 2: Silver Cleanse

```
S3 Bronze (Parquet) → Glue (Python/PySpark) → S3 Silver (Parquet)
```

Operations:

- **PII masking/removal** — emails, phone numbers, national IDs → hashed or dropped
- **Schema standardization** — consistent column names, types, nullability across modules
- **Deduplication** — same row extracted twice across runs
- **Data type coercion** — timestamps to UTC, enums to consistent values

PII rules defined in a YAML config file per module (not hardcoded in ETL scripts). Each table specifies columns to mask, drop, or keep.

### Job 3: Gold Merge

```
S3 Silver (Parquet) → Athena SQL → S3 Gold (Iceberg)
```

- `MERGE INTO` gold table `USING` silver snapshot
  - `ON gold.tenant_id = silver.tenant_id AND gold.id = silver.id`
  - `WHEN MATCHED → UPDATE SET all columns`
  - `WHEN NOT MATCHED → INSERT`
- Merge key: `(tenant_id, id)` — universal across all tables
- INSERT-only tables (e.g., `kernel_audit_event`) are safe: re-seen rows match on key and update with identical data (no-op)
- Gold tables may include denormalized/aggregated views where needed for analytics performance

### Job 4: Catalog Crawlers

```
Glue Crawlers → Glue Data Catalog
```

- Runs after Gold merge completes
- Updates table schemas in `future_bronze`, `future_silver`, `future_gold` databases
- Detects schema drift (new columns, type changes)
- Crawler runs are idempotent — safe to re-run

---

## 6. Airflow Orchestration

### Deployment: Self-Hosted on ECS Fargate ARM64

| Component | Fargate Task    | Purpose                                |
| --------- | --------------- | -------------------------------------- |
| Webserver | 0.5 vCPU / 1 GB | Airflow UI for DAG monitoring          |
| Scheduler | 0.5 vCPU / 1 GB | Triggers DAGs on schedule              |
| Worker    | 1 vCPU / 2 GB   | Executes tasks (horizontally scalable) |

**Metadata DB:** Dedicated `airflow` schema on the existing RDS instance.

**DAG storage:** S3 bucket, synced to Airflow scheduler on startup.

**Connections:** Managed via AWS Secrets Manager (RDS, S3, Glue, Teams webhook).

### Main DAG: `data_platform_hourly`

```
Schedule: @hourly

bronze_extract          ← AwsGlueJobOperator
    ↓
silver_cleanse          ← AwsGlueJobOperator
    ↓
gold_merge              ← AwsGlueJobOperator
    ↓
catalog_crawlers        ← AwsGlueCrawlerOperator
    ↓
data_quality_checks     ← PythonOperator (row counts, null checks, schema drift)
    ↓
cost_check              ← PythonOperator (daily only, skipped on other runs)
    ↓
notify_teams            ← MSTeamsWebhookOperator (on failure or quality/cost alerts)
```

### Retry Policy

- Each task retries **2x** with **5-minute exponential backoff**
- If all retries exhausted → DAG marked failed → Teams alert fires
- Individual task failure does not cascade — downstream tasks are skipped, not retried

### Airflow Variables

| Variable               | Purpose                               |
| ---------------------- | ------------------------------------- |
| `lakehouse_bucket`     | S3 bucket name per environment        |
| `glue_job_bronze`      | Glue job name for Bronze extract      |
| `glue_job_silver`      | Glue job name for Silver cleanse      |
| `glue_job_gold`        | Glue job name for Gold merge          |
| `crawler_names`        | Comma-separated Glue Crawler names    |
| `teams_webhook_url`    | Microsoft Teams incoming webhook URL  |
| `cost_alert_threshold` | Monthly USD threshold for cost alerts |

---

## 7. Lake Formation Governance

### What Lake Formation Manages

1. **Database/table access control** — which IAM roles can query which Glue Data Catalog databases (`future_bronze`, `future_silver`, `future_gold`)
2. **Column-level security** — tag-based policies restricting column access per IAM role
3. **Iceberg table registration** — Gold Iceberg tables registered in Lake Formation for unified governance

### What Lake Formation Does NOT Manage

- **PII masking** — handled at the Silver ETL layer, not governance. By the time data reaches Gold, PII is already stripped.
- **Iceberg lifecycle** — compaction, snapshot cleanup, and table maintenance managed by Glue.

### Access Matrix

| IAM Role            | Bronze | Silver | Gold | Purpose                             |
| ------------------- | ------ | ------ | ---- | ----------------------------------- |
| `glue-etl-role`     | R/W    | R/W    | R/W  | ETL jobs read/write all layers      |
| `airflow-role`      | —      | —      | —    | Orchestration only, no data access  |
| `athena-api-role`   | —      | —      | R    | tRPC insights proxy reads Gold only |
| `athena-agent-role` | —      | —      | R    | Agent raw SQL reads Gold only       |
| `crawler-role`      | R      | R      | R    | Crawlers scan all layers for schema |
| `admin-role`        | R      | R      | R    | Platform admin full read            |

Bronze and Silver are never exposed to application or agent roles. Only the ETL pipeline and crawlers touch them.

---

## 8. Query Layer — Athena

Athena is the sole query engine.

### Caching Strategy (Dual-Layer)

**Layer 1: Redis cache at tRPC** — `apps/api` caches pre-built query results in Redis (ElastiCache) with configurable TTL per query. Dashboard page loads hit Redis, not Athena.

```
Zone frontend → trpc.insights.headcountTrend → Redis hit? → return cached
                                               Redis miss? → Athena query → cache in Redis (TTL: 15 min) → return
```

**Layer 2: Athena query result reuse** — Athena's built-in result caching (up to 60 minutes). Catches repeated ad-hoc queries from agents or web-insights explorer that bypass Redis.

---

## 9. Analytics API — tRPC Proxy

`apps/api` exposes `trpc.insights.*` which executes pre-defined Athena queries against Gold Iceberg tables. Zone components call tRPC — never Athena directly.

Each insights procedure:

1. Checks Redis for a cached result (key: `insights:{tenantId}:{queryName}`)
2. On miss: executes a parameterized SQL query against Athena with `tenant_id` enforced
3. Caches the result in Redis with a query-specific TTL (default: 15 minutes)
4. Returns typed result to the zone frontend

`apps/web-insights` has additional explorer capabilities — ad-hoc Athena queries via a dedicated tRPC procedure with parameterized SQL templates. Still enforces `tenant_id`.

---

## 10. Agent Data Access

AI agents access analytics data through two paths:

### Path 1: Pre-Built Queries via tRPC

Same `trpc.insights.*` procedures used by zone frontends. Agent runtime calls them as tool invocations.

### Path 2: Raw Athena SQL Tool

For ad-hoc analysis when the agent needs to explore data beyond pre-built queries. The agent submits SQL, and the server:

1. Parses and validates the SQL
2. Injects `tenant_id` filter — mandatory, server-side
3. Rejects DDL/DML (SELECT only)
4. Executes via Athena with `athena-agent-role`
5. Returns results

**Security constraints on raw SQL path:**

- `tenant_id` filter injected server-side before execution — the agent cannot bypass it
- Only `SELECT` statements allowed — no `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`
- Query timeout: 30 seconds
- Scanned data limit: 100 MB per query (prevents runaway costs)
- Only `future_gold` database accessible — Bronze and Silver blocked by Lake Formation

---

## 11. Monitoring Layer

### Alert Categories

**Category 1: Pipeline Failures**

- Glue job failure (Bronze, Silver, Gold)
- Crawler failure
- Airflow task retry exhaustion
- Airflow scheduler down

**Category 2: Data Quality**

- Row count anomalies (>50% deviation from 7-day rolling average)
- Null spike detection (>20% nulls in a non-nullable column)
- Schema drift (new columns, type changes detected by Crawlers)
- Stale watermarks (table not updated in >3 hours)

**Category 3: Cost**

- Daily Glue cost exceeds threshold
- Daily Athena scanned data exceeds threshold
- Monthly S3 storage growth exceeds threshold
- Runs once per day (not every hour)

### Alert Delivery

All alerts go to a **Microsoft Teams** channel via incoming webhook. Airflow's `MSTeamsWebhookOperator` sends structured messages with:

- Alert category and severity
- Failed task/job name
- Error message or metric value
- Link to Airflow UI for investigation

### Data Quality Checks Implementation

Data quality checks run as an Airflow `PythonOperator` after the Crawler task. They query Athena to validate Gold table health (row counts, null percentages) and compare results against rolling averages stored in a `data_quality_history` table (in the `airflow` schema on RDS).

---

## 12. Infrastructure — Terraform

All infrastructure provisioned via Terraform. No manual AWS console changes.

### New Terraform Modules

| Module                   | Resources                                                    |
| ------------------------ | ------------------------------------------------------------ |
| `modules/glue`           | Glue jobs (bronze, silver, gold), Crawlers, Data Catalog DBs |
| `modules/lakehouse`      | S3 bucket, lifecycle policies, bucket policy                 |
| `modules/airflow`        | ECS task definitions, service, ALB, S3 DAG bucket            |
| `modules/lake-formation` | Lake Formation settings, permissions, LF-tags                |
| `modules/athena`         | Athena workgroup, result bucket, query limits                |

### Existing Modules Updated

| Module                | Changes                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `modules/ecs`         | Add Airflow task definitions (webserver, scheduler, worker)         |
| `modules/elasticache` | Add Redis instance for insights query caching                       |
| `modules/iam`         | Add IAM roles: glue-etl, airflow, athena-api, athena-agent, crawler |

### Resource Sizing

| Resource                    | Size                    | Notes                            |
| --------------------------- | ----------------------- | -------------------------------- |
| Glue ETL jobs               | 2 DPU each              | Min for PySpark, ~5 min/run      |
| Airflow webserver (Fargate) | 0.5 vCPU / 1 GB         |                                  |
| Airflow scheduler (Fargate) | 0.5 vCPU / 1 GB         |                                  |
| Airflow worker (Fargate)    | 1 vCPU / 2 GB           | Horizontally scalable            |
| Redis (ElastiCache)         | cache.t4g.small         | Shared with existing app cache   |
| Athena workgroup            | 100 MB scan limit/query | For agent queries                |
| S3 lakehouse bucket         | Standard class          | Lifecycle transitions to Glacier |

---

## 13. Cost Estimate

| Component                                      | Monthly                        |
| ---------------------------------------------- | ------------------------------ |
| AWS Glue ETL (3 jobs × hourly × 2 DPU)         | ~$5                            |
| AWS Glue Crawlers                              | ~$15                           |
| S3 storage (100 GB bronze + silver + gold)     | ~$3                            |
| Amazon Athena (10 tenants, pre-built + ad-hoc) | ~$5                            |
| Airflow on ECS Fargate (3 tasks)               | ~$45                           |
| Redis ElastiCache (cache.t4g.small, shared)    | ~$20                           |
| Lake Formation                                 | Free (no charge for LF itself) |
| **Total data platform**                        | **~$93/month**                 |

---

## 14. Decisions Log

| Decision           | Outcome                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Medallion layers   | Three layers: Bronze (raw) → Silver (cleansed, PII stripped) → Gold (Iceberg, analytics-ready) |
| ETL mechanism      | Hourly Glue ETL batch — sufficient for HR analytics, ~$5/month for 3 jobs                      |
| Orchestration      | Self-hosted Apache Airflow on ECS Fargate ARM64                                                |
| Storage            | Single S3 bucket, prefix-partitioned by layer/module/tenant_id/date                            |
| Table format       | Apache Iceberg via Glue Data Catalog (NOT S3 Tables — 20x cost overhead)                       |
| Governance         | Lake Formation for access control + column-level security + Iceberg registration               |
| PII handling       | Silver layer strips/masks PII via config-driven rules. Gold is PII-free.                       |
| Query engine       | Athena only                                                                                    |
| Caching            | Dual-layer: Redis at tRPC (hot dashboards) + Athena result reuse (ad-hoc)                      |
| Analytics API      | tRPC proxy (`trpc.insights.*`) — zones never call Athena directly                              |
| Agent data access  | Pre-built queries via tRPC + raw Athena SQL tool with enforced tenant_id                       |
| Reporting          | Embedded charts in zone frontends via tRPC. No external BI tools.                              |
| Monitoring         | Pipeline failures + data quality + cost alerts → Microsoft Teams                               |
| Catalog            | Glue Crawlers for automated schema registration                                                |
| Vector search      | pgvector on RDS, HNSW index, `vector(1536)` — OpenAI `text-embedding-3-small` (unchanged)      |
| All IDs            | UUID v7                                                                                        |
| Glue ETL merge key | `(tenant_id, id)` — universal across all tables                                                |
| RDS Read Replica   | Removed — all analytics served via Athena                                                      |

---

## 15. Open Questions

1. **Gold table denormalization scope** — which specific denormalized/aggregated tables are needed beyond 1:1 mirrors of source tables? Depends on dashboard requirements per zone.
2. **Airflow Docker image** — build a custom ARM64 image with AWS provider pre-installed, or use the official `apache/airflow` image with provider installed at startup?
3. **Cost alert thresholds** — what USD thresholds should trigger alerts for Glue, Athena, and S3?
4. **Agent SQL allowlist** — should the raw Athena SQL tool restrict queries to specific Gold tables, or allow any table in `future_gold`?
5. **Athena query result location** — dedicated S3 prefix or separate bucket for Athena results?

---

## 16. What This Design Does NOT Cover

- **Agent runtime architecture** — how AI agents are defined, triggered, governed. Covered separately in the Agent Runtime design.
- **Frontend chart components** — specific chart implementations in `packages/ui`. Covered in zone-level specs.
- **Terraform state management** — S3 backend config, state locking. Covered in `infra/` existing setup.
- **CI/CD for Glue jobs** — deployment pipeline for ETL scripts. To be defined in implementation plan.
