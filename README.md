# Seta Future AaaS

**One platform. One source of truth. AI agents that actually work.**

SETA runs on four disconnected internal apps today. Managers reconcile timesheets in Excel. Leadership waits days for KPI reports nobody fully trusts. Employees message HR to find out their leave balance. Every system built its own identity, its own approvals, its own data model — and nothing talks to anything else.

Future ends that. One unified platform with a canonical data layer underneath everything — so agents have trusted data to act on, workflows stop at the right person automatically, and every number in every dashboard comes from the same source.

SETA runs on it first. Then Vietnamese SMEs. Then globally.

---

## What gets replaced

| Legacy system | What Future delivers instead |
|---|---|
| EMS — people, org, contracts | People profiles, org hierarchy, contract lifecycle — unified, auditable |
| Timesheet app | Attendance, leave, OT, payroll-ready timesheets — automated, compliant |
| Hiring app | Full recruitment pipeline from role open to offer accepted |
| Resource Insight | Real-time utilization, project staffing, delivery tracking |

All four replaced by end of 2026. Legacy systems decommissioned — not "integrated."

---

## What the AI agents actually do

Because every module shares the same identity and authority model, agents can act across the full platform with governance built in:

- **Answer questions in plain language** — leave balances, project utilization, KPI status — from trusted canonical data, with sources shown
- **Route approvals automatically** — agents know who has authority right now (including delegations), so requests reach the right person without manual routing
- **Trigger across modules** — a completed hire automatically flows into People, then Time, then Projects without anyone chasing handoffs
- **Operate in every channel** — web chat, Microsoft Teams, Slack — same agent, same governance, same audit trail

Every agent action checks permissions, writes an immutable audit record, and can be explained.

---

## How it's built

| Layer | Technology |
|---|---|
| Frontend | Next.js Multi-Zones — 10 independent zones, zero deployment coupling |
| Backend | NestJS modular monolith (Turborepo) |
| API | tRPC — end-to-end type-safe |
| Database | PostgreSQL 16, Drizzle ORM, Row Level Security per tenant |
| Analytics | Glue ETL → S3 Bronze → S3 Gold (Iceberg) → Athena → Cube.js |
| Agent AI | Anthropic `claude-sonnet-4-6` (reasoning) · `claude-haiku-4-5` (classification) |
| Infrastructure | AWS ECS Fargate Graviton, Terraform, `ap-southeast-1` · ~$465/month total |
| Auth | Microsoft Entra OIDC (MSAL) |

The platform runs multi-tenant from day one. Every record carries a `tenant_id`. PostgreSQL RLS enforces isolation at the database layer — no application-level workarounds.

---

## 2026 goal

**By December 31, 2026 — Future is SETA's primary system of record.** Four legacy systems shut down. 300+ people running their daily work on it. Agents live and trusted for real workflows.

4 builders. Hard deadline. AI-accelerated development throughout.

---

## Docs

| | |
|---|---|
| [Product Vision](docs/product-vision.md) | Why this exists and who it's for |
| [2026 Master Roadmap](docs/roadmaps/2026-master-roadmap.md) | Outcomes, milestones, delivery gates |
| [2026 Execution Roadmap](docs/roadmaps/2026-execution-roadmap.md) | Build team workstreams and sequencing |
| [Architecture Overview](docs/architecture/overview.md) | Full stack diagram and infrastructure view |
| [Kernel](docs/architecture/kernel.md) | Identity, authority, decisions, audit — the foundation |
| [Application Architecture](docs/architecture/application.md) | Modules, tRPC, frontend zones, boundaries |
| [Agent Runtime](docs/architecture/agent-runtime.md) | Agent gateway, MCP tools, channels, guardrails |
| [Data Platform](docs/architecture/data-platform.md) | Lakehouse, Glue ETL, Cube.js, pgvector memory |
| [Deployment](docs/architecture/deployment.md) | ECS, RDS, Terraform, CI/CD, cost breakdown |

---

**CONFIDENTIAL** — SETA Internal · April 2026
