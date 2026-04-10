# Future — Data Platform Design

**Date:** 2026-04-08  
**Status:** Agreed  
**Project:** Seta Future AaaS

---

## Purpose

This document captures the agreed data platform architecture for Future — how operational data flows from PostgreSQL into the analytics lakehouse, how the semantic layer is structured, and how agent memory is handled. The design is built strong from day one: full lakehouse on AWS-native services, open formats, no phased rewrites.

---

## Core Principles

- **Full lakehouse from day one** — S3 + Iceberg + Athena operational from the start. No interim-only designs.
- **AWS-native** — all data stays inside the Future AWS account. No third-party services moving tenant data off-account.
- **Open format** — Apache Iceberg on S3. No proprietary warehouse lock-in.
- **Cost-effective over real-time** — hourly Glue ETL batch is sufficient for HR/workforce analytics. Streaming CDC adds cost and complexity with no business benefit for this domain.
- **Cube.js as stable interface** — all analytics surfaces talk to Cube.js. Underlying data sources can evolve without touching frontend code.
- **Tenant isolation at every layer** — `tenant_id` partition key on all Iceberg tables + Cube.js `queryTransformer` enforces isolation server-side.

---

## Full Architecture

```
PostgreSQL RDS Primary (OLTP)
  │
  ├── RDS Read Replica ──────────────────────────────► Cube.js (operational queries)
  │     direct connection, bypasses RDS Proxy          last 30 days, live counts
  │
  └── AWS Glue ETL (hourly scheduled job)
        ↓
      S3 Bronze (raw Parquet, partitioned by tenant_id/date)
        ↓
      AWS Glue ETL (transform + compact)
        ↓
      S3 Gold (Apache Iceberg, Glue Data Catalog)  ───► Cube.js (historical queries)
                                                         trends, YTD, cross-module
                                                              │
                                                         apps/api trpc.insights.*
                                                         (tRPC proxy — zones never
                                                          call Cube.js directly)
                                                              │
                                                    ┌─────────────────────┐
                                                    │  web-people charts  │
                                                    │  web-finance charts │
                                                    │  web-insights full  │
                                                    └─────────────────────┘

PostgreSQL RDS (agents schema)
  └── pgvector HNSW ─────────────────────────────────► Agent RAG / semantic search
```

---

## ETL Pipeline — Hourly Glue Batch

**Mechanism:** AWS Glue ETL job runs every hour. Reads changed rows from each module schema on RDS, writes Parquet to S3 Bronze, compacts into Iceberg Gold.

```
Hour N:
  1. Glue reads people.employment, time.leave_request, finance.invoice, ...
     WHERE updated_at > last_exported_at (watermark per table)
  2. Write Parquet to s3://future-lakehouse-{env}/bronze/{module}/tenant_id=x/year=y/month=m/day=d/
  3. Glue Iceberg merge: MERGE INTO gold table USING bronze snapshot
         ON gold.tenant_id = bronze.tenant_id AND gold.id = bronze.id
         WHEN MATCHED → UPDATE SET all columns
         WHEN NOT MATCHED → INSERT
         Merge key is always (tenant_id, id) — universal across all tables.
         INSERT-only tables (e.g. audit_event) are safe: re-seen rows match on key and update with identical data (no-op in practice).
  4. Update watermark in Glue job bookmark
```

**Cost:** ~$0.44/DPU-hour × 2 DPUs × ~5 min/run × 24 runs/day = **~$1.50/month**

**Lag:** up to 60 minutes — acceptable for HR/workforce analytics (payroll, leave, reviews, headcount).

**Upgrade path:** if real-time lag ever becomes a requirement, swap the Glue batch job for DMS + Kinesis + Glue Streaming. Iceberg table schema stays unchanged.

---

## S3 Lakehouse Structure

**Single bucket, prefix-partitioned:**

```
s3://future-lakehouse-{env}/
  bronze/
    people/tenant_id={id}/year=2026/month=04/day=08/
    time/tenant_id={id}/year=2026/month=04/day=08/
    finance/tenant_id={id}/year=2026/month=04/day=08/
    hiring/tenant_id={id}/...
    performance/tenant_id={id}/...
    goals/tenant_id={id}/...
    kernel/audit_event/tenant_id={id}/...
  gold/
    (Iceberg table metadata + data files, managed by Glue)
```

**Glue Data Catalog:**

```
Database: future_bronze   → raw Parquet tables per module
Database: future_gold     → Iceberg tables (ACID, time travel, schema evolution)
  Tables:
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
    kernel_audit_event      ← full audit log queryable in analytics
```

**S3 lifecycle policies:**

| Layer          | Retention      | Transition                                    |
| -------------- | -------------- | --------------------------------------------- |
| Bronze         | 90 days active | → Glacier after 90d → delete at 1 year        |
| Gold (Iceberg) | Indefinite     | Glue managed compaction handles old snapshots |

---

## Semantic Layer — Cube.js

Cube.js is the stable analytics interface. All zones access analytics via `trpc.insights.*` — no zone imports `@cubejs-client/core` directly.

### Two Data Sources

```ts
// cube.js config — explicit routing, no magic
dataSources: operational: type: postgres // RDS Read Replica — last 30 days, sub-second
historical: type: athena // S3 Gold Iceberg — historical, trends, cross-module
```

Each cube definition declares its data source:

```ts
// cubes/LeaveRequest.js
cube('LeaveRequest', {
  dataSource: 'operational', // live data — RDS Read Replica
  sql: `SELECT * FROM time.leave_request`,
  // ...
})

cube('LeaveRequestHistory', {
  dataSource: 'historical', // Athena — multi-year trends
  sql: `SELECT * FROM future_gold.time_leave_request`,
  // ...
})
```

### Tenant Isolation

```ts
// queryTransformer — injected on every query, no exceptions
queryTransformer: (query, { securityContext }) => ({
  ...query,
  filters: [
    ...query.filters,
    {
      member: `${query.measures[0].split('.')[0]}.tenantId`,
      operator: 'equals',
      values: [securityContext.tenantId],
    },
  ],
})
```

JWT `securityContext` carries `tenantId` from Microsoft SSO session. No tenant ever sees another tenant's data.

### Redis Cache

Cube.js uses Redis (ElastiCache) for query result caching. Hot dashboard queries served from cache — no DB hit on repeat loads.

---

## Analytics API — tRPC Proxy

`apps/api` exposes `trpc.insights.*` which proxies pre-defined Cube.js queries. Zone components call tRPC — never Cube.js directly.

```ts
// apps/api/src/modules/insights/interface/trpc/insights.router.ts
export const insightsRouter = router({
  headcountTrend: protectedProcedure.query(({ ctx }) => cubejsProxy('HeadcountTrend', ctx)),
  leaveUtilization: protectedProcedure.query(({ ctx }) => cubejsProxy('LeaveUtilization', ctx)),
  hiringFunnel: protectedProcedure.query(({ ctx }) => cubejsProxy('HiringFunnel', ctx)),
  invoiceAgeing: protectedProcedure.query(({ ctx }) => cubejsProxy('InvoiceAgeing', ctx)),
  kpiScoreTrend: protectedProcedure.query(({ ctx }) => cubejsProxy('KpiScoreTrend', ctx)),
})

// apps/web-people — headcount sparkline embedded inline
const { data } = trpc.insights.headcountTrend.useQuery()

// apps/web-finance — invoice ageing embedded inline
const { data } = trpc.insights.invoiceAgeing.useQuery()
```

**`apps/web-insights`** has full Cube.js access (ad-hoc explorer, custom dashboards, exports). Other zones get pre-defined chart components from `packages/ui` backed by `trpc.insights.*`.

---

## Agent Memory — pgvector

Vector search for agent RAG lives on the same RDS instance in the `agents` schema. No dedicated vector DB needed at SME scale.

```sql
CREATE TABLE agents.embedding_store (
  id            UUID PRIMARY KEY,  -- $defaultFn(() => uuidv7()) in Drizzle — UUID v7 standard
  tenant_id     UUID NOT NULL,
  actor_id      UUID,                    -- which actor owns this memory (optional)
  entity_type   TEXT NOT NULL,           -- document | audit_event | kpi_score | conversation
  entity_id     UUID NOT NULL,
  content       TEXT NOT NULL,
  embedding     vector(1536),            -- OpenAI text-embedding-3-small (1536 dims)
  metadata      JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON agents.embedding_store
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

**Embedding pipeline:**

```
Document uploaded / audit_event written
  → pg-boss job: generate-embedding
  → NestJS worker → OpenAI text-embedding-3-small API
    (uses tenant's resolved API key from AdminQueryFacade.getResolvedAiConfig())
  → INSERT INTO agents.embedding_store
```

**Upgrade path:** migrate to Qdrant or Pinecone only if a single tenant exceeds 10M vectors or similarity search latency exceeds 200ms. Not expected at SME scale.

---

## Cost Estimate

| Component                                | Monthly        |
| ---------------------------------------- | -------------- |
| RDS Read Replica (db.t4g.medium)         | ~$35           |
| Cube.js on ECS Fargate (1 vCPU / 2GB)    | ~$30           |
| Redis ElastiCache (t4g.small)            | ~$20           |
| AWS Glue ETL (hourly batch)              | ~$2            |
| S3 storage (100GB bronze + gold)         | ~$3            |
| Amazon Athena (light ad-hoc, 10 tenants) | ~$5            |
| **Total data platform**                  | **~$95/month** |

---

## Decisions Log

| Decision           | Outcome                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Architecture       | Full lakehouse from day one — no phases                                                  |
| ETL mechanism      | Hourly Glue ETL batch (A) — sufficient for HR analytics, ~$2/month                       |
| Storage            | Single S3 bucket, prefix-partitioned by module + tenant_id + date                        |
| Table format       | Apache Iceberg via Glue Data Catalog (NOT S3 Tables — 20x cost overhead)                 |
| Cube.js routing    | Two explicit data sources: RDS Read Replica (operational) + Athena (historical)          |
| Analytics API      | tRPC proxy (`trpc.insights.*`) — zones never call Cube.js directly                       |
| Embedded analytics | Chart components in `packages/ui` + `trpc.insights.*` per zone                           |
| Vector search      | pgvector on RDS, HNSW index, `vector(1536)` — OpenAI `text-embedding-3-small`            |
| All IDs            | UUID v7                                                                                  |
| Glue ETL merge key | `(tenant_id, id)` — universal across all tables. Consistent, no per-table config needed. |

---

## Next

Layer 4 — Agent Runtime: how AI agents are defined, triggered, governed, and connected to the kernel and domain modules.
