# Future

**The enterprise OS where AI agents do the work — not just surface it.**

Most business software gives you a dashboard and leaves you to figure out what to do next. Future is different. Every workflow has an embedded agent that acts: reconciles payroll, surfaces contract expirations, routes approvals, answers "what's our margin on this project?" in seconds from data you can trust.

Built on a unified canonical data layer across HR, time, hiring, finance, projects, and goals — the kind of foundation that makes cross-functional answers possible without a three-day spreadsheet exercise.

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

```
Next.js 15 multi-zone frontend (11 zones + auth shell)
  ↕ tRPC (end-to-end type-safe)
NestJS modular monolith — one module per domain, strict DDD boundaries
  ↕ Drizzle ORM + PostgreSQL 16 with RLS (schema-per-module)
  ↕ pg-boss job queue + outbox event relay
Agent runtime — Vercel AI SDK + OpenAI, governed by kernel authority layer
  ↕ MCP tool contracts per module
AWS ECS Fargate (Graviton ARM64) · Terraform · ap-southeast-1
```

Every table has `tenant_id`. Every action leaves an `audit_event`. Every agent call is governed by the same role/permission layer as the UI.

---

## Get started

```bash
git clone <repo>
sh scripts/bootstrap.sh --full   # copies .env files, installs, starts DB, builds, migrates
bun run dev --filter=@future/api --filter=@future/web-shell
```

Full guide: [QUICKSTART.md](QUICKSTART.md)

---

## Set up with an AI agent

Already have GitHub Copilot, Cursor, Claude, or another coding agent open? Paste this prompt and let it do the setup:

```
I'm onboarding to the Future codebase. Please:
1. Read AGENTS.md and QUICKSTART.md in full before doing anything else.
2. Run `sh scripts/bootstrap.sh` to copy all .env files, then tell me which variables I still need to fill in manually.
3. Check that Docker is running, then run `sh scripts/bootstrap.sh --full` to install dependencies, start the database, build workspace packages, and run migrations.
4. Start the API and web-shell: `bun run dev --filter=@future/api --filter=@future/web-shell`
5. Confirm everything is running by checking http://localhost:4000 (API) and http://localhost:3000 (shell).
6. Give me a 3-bullet summary of the module I should look at first based on what I tell you I'm working on.

I'm working on: [describe your task here]
```

The agent will read the rules in `AGENTS.md` first, which keeps it from making architecture mistakes on day one.

---

## Docs

|                                                                  |                                                |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| [QUICKSTART.md](QUICKSTART.md)                                   | Setup, commands, port map, PR rules            |
| [AGENTS.md](AGENTS.md)                                           | Hard rules, DDD boundaries, module conventions |
| [DESIGN.md](DESIGN.md)                                           | Design system — read before any UI work        |
| [docs/architecture/overview.md](docs/architecture/overview.md)   | Full architecture diagram                      |
| [docs/engineering/tech-stack.md](docs/engineering/tech-stack.md) | Every technology choice with rationale         |
