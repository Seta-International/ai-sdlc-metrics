# Future — Business Context

> For AI agents: read before any task. Pure business context — what this company does, who it serves, why it exists, and how it operates. Last updated: 2026-04-12.

---

## The Company

**SETA** is a 300+ person IT outsourcing company in Vietnam. The product being built — **Future** — is SETA's answer to its own operational fragmentation. SETA is customer zero.

SETA runs four separate internal systems today: **EMS** (employee master, contracts, staffing), **Timesheet** (attendance, leave, OT), **Hiring** (recruitment pipeline, offers), and **Resource Insight** (performance reviews). They share no identity layer. A single employee exists as four unrelated records with four incompatible ID formats. Cross-domain questions — "what is the OT pattern of employees under performance review?" — require manual spreadsheet work and take days.

---

## The Problem We're Solving

**Fragmented data is a strategic blocker, not an inconvenience.**

| Who                 | Pain Today                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Board / Leadership  | No trusted single view. KPI system can't be built on 4 disconnected databases. Answers take days, from spreadsheets nobody fully trusts.                                                               |
| HR Manager          | 2 days every month reconciling timekeeping + leave + payroll in Excel. Contract expirations tracked in personal spreadsheets. Vietnamese labor law (PIT, insurance, contract rules) lives in her head. |
| Delivery Lead / COO | No real-time utilization. Project profitability assembled quarterly — by the time it's ready, the project is over.                                                                                     |
| Finance             | Billing and payroll assembled manually from multiple exports.                                                                                                                                          |
| Employees           | Message HR on chat to ask leave balances or payslip details. Wait for someone to manually look it up.                                                                                                  |

---

## What Future Is

**An agent-native enterprise operating system delivered as AaaS (Agent as a Service).**

Not a chatbot bolted onto existing software. A complete replacement — one platform where a modern UI and AI agents work together on a single source of truth.

The core promise: **governed agent work on canonical data.** Agents on fragmented data produce faster mistakes. Agents on clean, governed data produce trusted, auditable actions.

### The Four Layers

1. **Process Kernel** — canonical data layer. Every entity (person, project, account, decision) has one authoritative record. Unified identity, explicit authority and delegation, immutable event log, enforced data quality.

2. **Agent Runtime** — sandboxed, governed environment. Every agent action is checked against authority and logged. Agents earn autonomy phase by phase through demonstrated accuracy.

3. **Domain Modules** — seven business areas: HR & People Ops, Workforce Operations, Staffing & Project Ops, Finance Ops, OKR & KPI, Business Intelligence, and Agent tooling. Each extends the kernel; none fragment it.

4. **Channel Layer** — agents work through web, MS Teams, Slack, mobile, and event triggers. Same agent, any channel.

---

## Agent Capability Phases

Trust is earned, not declared. Capability rolls out in four phases:

| Phase                     | What users experience                                      | Risk                                       |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| A — Knowledge & Q&A       | Agents answer questions over documents, policies, and data | Read-only, zero risk                       |
| B — Data & Insights       | Agents query metrics, generate charts, summarize trends    | Read-only                                  |
| C — Action Proposals      | Agents draft workflows for human review and approval       | Nothing executes without human sign-off    |
| D — Autonomous Monitoring | Agents detect anomalies and propose scheduled actions      | Earned only after verified accuracy in A–C |

---

## Business Domains (Modules)

| Domain          | What it manages                                                   |
| --------------- | ----------------------------------------------------------------- |
| **People**      | Employment profiles, contracts, org placements, offboarding       |
| **Time**        | Attendance, leave, overtime, timesheets, approval chains          |
| **Hiring**      | Recruitment pipeline, interviews, offers, candidate deduplication |
| **Performance** | Review cycles, evaluations, feedback, dual-hierarchy routing      |
| **Projects**    | Staffing, resource allocation, assignments, delivery tracking     |
| **Finance**     | Invoices, payroll, billing, budget, project profitability         |
| **Goals**       | OKRs, KPIs — first external commitment (Aeris account, Q3 2026)   |
| **Insights**    | Analytics across all domains — real-time + historical             |
| **Planner**     | Task tracking, AI reminders, KPI linkage                          |
| **Agents**      | Agent configurations, sessions, tool registry                     |
| **Admin**       | Tenant settings, AI config, module toggles                        |

---

## Primary Users (who we optimize for, in order)

| Persona                | Primary concern                                            |
| ---------------------- | ---------------------------------------------------------- |
| Project Manager        | Project health at a glance, resource allocation, risk      |
| Delivery Lead / COO    | Utilization, margins, pipeline vs. capacity                |
| Finance / Accounting   | Accuracy, auditability, cash flow                          |
| HR / Talent            | Skills inventory, compliance, headcount                    |
| Developer / Consultant | Speed, minimum clicks, clear feedback on timesheet + tasks |

---

## 2026 Goal

**By December 31, 2026: Future replaces all 4 legacy internal systems at SETA.**

- All 7 domain modules live in production inside SETA
- Full data platform live — S3 lakehouse, Glue ETL, Iceberg, Athena, Cube.js
- Agent capability tiers A through D live for selected internal workflows
- Legacy systems (EMS, Timesheet, Hiring, Resource Insight) fully decommissioned

SETA is customer zero. Every bug found internally is fixed before any external customer touches the platform. 2026 = internal replacement and trust-building. External GTM follows in 2027.

---

## Market Opportunity

### Vietnam (beachhead)

- 500,000 SMEs being pushed to digitize by government mandate by 2030 (Decision 433), backed by subsidies
- Companies that land on the wrong platform are locked in for years
- MISA dominates with 170K+ customers on 20-year-old legacy architecture — "AI" is a chatbot on monolithic ERP, no unified process layer underneath
- Base.vn (FPT-acquired) has clean UI but no cross-module kernel; agents reason per-app, not per-org

### Global

- 500 million SMBs face the same structural problem — fragmented tools, no process layer
- AI-as-a-Service market projected at $43–63B by 2028 (35–45% CAGR)
- Salesforce Agentforce: $800M ARR but $200K+/year, CRM-centric, inaccessible to SMB
- ServiceNow + Moveworks ($2.85B acquisition): enterprise-only, not a full OS

**The gap:** Incumbents have local market but outdated architecture. Global players have architecture but wrong price point. Future has both.

---

## The Build Strategy

**Hybrid approach:** Platform-first (kernel and modules), with a lightweight read-only batch feed from legacy providing early analytics visibility. Each time a new module goes live, the legacy feed for that domain is retired and replaced by clean platform data.

This avoids:

- **Path 1 risk** (Data-first): CDC on 4 legacy systems is brittle; analytics quality is permanently bounded by ID fragmentation
- **Path 2 risk** (Platform-first only): No user-visible output during the 2–3 month foundation period

**Operating constraints:** 4 dedicated builders, hard deadline December 31, 2026, AI-assisted SDLC throughout. The bottleneck is not engineering volume — it is architectural clarity and protected focus.

---

## What Makes This Different

Most platforms build top-down: UI first, AI second, data third. That is why 95% of AI pilots fail to scale — agents on fragmented data produce faster mistakes, not better operations.

Future builds bottom-up: canonical data layer → governed agent runtime → domain modules → channels. By the time an agent takes an action, every entity it touches has a single authoritative record, every action is checked against explicit authority, and every outcome is logged immutably.

The visual design reflects this: not a chatbot UI, not legacy ERP gray. Every screen is built to make data inspectable and actions accountable — closer to Vercel/Linear density than Salesforce forms.
