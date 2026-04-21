# Future

<p align="center">
  <strong>The enterprise OS where AI agents do the work — not just surface it.</strong><br/>
  Built by <a href="https://seta-international.com">SETA International</a> · 17 years of enterprise engineering
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white"/>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js"/>
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-modular_monolith-E0234E?logo=nestjs"/>
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white"/>
  <img alt="Bun" src="https://img.shields.io/badge/Bun-1.3-fbf0df?logo=bun"/>
  <img alt="AWS ECS" src="https://img.shields.io/badge/AWS-ECS_Fargate-FF9900?logo=amazon-aws&logoColor=white"/>
</p>

---

Most business software gives you a dashboard and leaves you to figure out what to do next. Future is different. Every workflow has an embedded agent that **acts**: reconciles payroll, surfaces contract expirations, routes approvals, answers "what's our margin on this project?" in seconds from data you can trust.

Built on a unified canonical data layer across HR, time, hiring, finance, projects, and goals — the kind of foundation that makes cross-functional answers possible without a three-day spreadsheet exercise.

---

## Table of Contents

- [What it does](#what-it-does)
- [How it's built](#how-its-built)
- [Set up with an AI agent](#set-up-with-an-ai-agent)
- [Get started](#get-started)
- [Docs](#docs)

---

## What it does

| Module          | What the agent handles                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| **People**      | Employment lifecycle, org changes, offboarding — with compliance guardrails    |
| **Time**        | Attendance, leave, OT, timesheets — automated reconciliation against payroll   |
| **Hiring**      | Pipeline, interviews, offers — agents draft, route, and remind                 |
| **Performance** | Review cycles, 360 feedback — structured and on schedule                       |
| **Finance**     | Invoices, payroll, project profitability — real-time, not end-of-quarter       |
| **Goals**       | OKRs and KPIs drawn from live operational data — not manually updated          |
| **Planner**     | Tasks, evidence, delivery tracking — synced with MS 365 Planner                |
| **Insights**    | Cross-module analytics via Athena — ask in plain language, get sourced answers |

---

## How it's built

The frontend is **11 independent Next.js zones** — one per domain — talking to a single NestJS API over tRPC. No monolithic frontend. No shared state between zones. Each zone deploys independently.

The backend is a **modular monolith**: 13 domain modules (People, Time, Hiring, Finance...), each owning its own Postgres schema and Drizzle ORM layer. Modules never import each other's internals — cross-module reads go through typed facades, async writes go through a durable outbox. Row-level security enforces tenant isolation at the database level.

**Agents** live inside the `agents` module and reach other modules through MCP tool contracts — the same authorization layer the UI uses. No agent bypasses the kernel permission check. Every action leaves an `audit_event`.

```mermaid
flowchart TD
    subgraph Browser ["Browser (11 Next.js zones)"]
        Z1[People] -..- Z2[Time] -..- Z3[Hiring] -..- Z4[...]
    end

    subgraph Channels ["Agent Channels"]
        C1[Teams / Slack / SSE]
    end

    subgraph API ["NestJS API — Modular Monolith"]
        T[tRPC router]
        K[Kernel · Auth · RLS]
        M[13 Domain Modules]
        T --> K --> M
    end

    subgraph Data ["Data Layer"]
        PG[(PostgreSQL 16\nschema-per-module · RLS)]
        BG[pg-boss job queue]
        OB[Outbox event relay]
    end

    subgraph Analytics ["Data Platform"]
        ETL[Hourly Glue ETL]
        S3[S3 Parquet · Iceberg]
        ATH[Athena]
        ETL --> S3 --> ATH
    end

    subgraph AgentRT ["Agent Runtime"]
        AR[Vercel AI SDK + OpenAI]
        MCP[MCP tool contracts]
        AR --> MCP
    end

    Browser -->|tRPC over HTTPS| T
    C1 --> AR
    MCP -->|same permission layer| K
    M --> PG
    M --> BG
    M --> OB
    M -->|Insights proxy| ATH

    style Browser fill:#0f172a,color:#94a3b8
    style API fill:#1e1b4b,color:#a5b4fc
    style Data fill:#14532d,color:#86efac
    style AgentRT fill:#431407,color:#fdba74
    style Analytics fill:#1c1917,color:#a8a29e
    style Channels fill:#1e3a5f,color:#93c5fd
```

> Deployed on **AWS ECS Fargate (Graviton ARM64)** · Terraform · ap-southeast-1

---

## Set up with an AI agent

Open your agent and paste:

```
Read AGENTS.md and QUICKSTART.md, then run `sh scripts/bootstrap.sh --full`. Tell me which .env values still need filling in, then start the dev server. I'm working on: [your task]
```

---

## Get started

```bash
git clone <repo>
sh scripts/bootstrap.sh --full   # copies .env files, installs, starts DB, builds, migrates
bun run dev --filter=@future/api --filter=@future/web-shell
```

Full guide: [QUICKSTART.md](QUICKSTART.md)

---

## Docs

|                                                                  |                                                |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| [QUICKSTART.md](QUICKSTART.md)                                   | Setup, commands, port map, PR rules            |
| [AGENTS.md](AGENTS.md)                                           | Hard rules, DDD boundaries, module conventions |
| [DESIGN.md](DESIGN.md)                                           | Design system — read before any UI work        |
| [docs/architecture/overview.md](docs/architecture/overview.md)   | Full architecture diagram                      |
| [docs/engineering/tech-stack.md](docs/engineering/tech-stack.md) | Every technology choice with rationale         |
