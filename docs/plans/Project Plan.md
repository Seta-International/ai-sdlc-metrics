# Seta Agent Foundation — Project Plan

---

## §0 — Business Case (read this first)

### The problem

Seta's SaaS ERP customers spend significant time on routine coordination work inside the product — looking up status, summarizing across plans, assigning follow-ups, building progress reports. Today this work is manual. Customers expect agent-native experiences in 2026; enterprise buyers now ask "what's your AI strategy?" in every RFP. Competitors (Microsoft Copilot Studio, Salesforce Agentforce, ServiceNow Now Assist) shipped first-generation agent surfaces 12–18 months ago.

### Why now, and cost of inaction

LLM costs have dropped ~10× in 18 months; multi-tenant agent patterns have matured. The 12-month window to establish agent-native positioning closes mid-2026. If we wait until late 2026 to start, we ship in 2027 against competitors who will have second-generation systems. **Cost of inaction**: pricing pressure on existing ERP renewals (customers ask "why no AI?"), lost expansion revenue, and a structural gap that takes 2+ years to close.

### The thesis (how this pays back)

| Lever                  | Mechanism                                                                                | Time-to-value             |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| Higher ARPU            | Agent capability sold as add-on or premium tier                                          | P3 (commercial readiness) |
| Lower churn            | Stickier daily-active workflow tied to ERP data                                          | P2 (first prod tenant)    |
| Faster module delivery | Agent + tools pattern reusable; future ERP domains land in ~3 weeks vs ~6 (proven by P1) | P2 onwards                |
| Sales positioning      | "Agent-native" answer in every RFP from M6 onward                                        | Immediate post-P1         |
| OSS lead generation    | `@seta/agent-core` public attracts developer awareness, recruiting funnel                | Post-P1                   |

### The "do nothing" alternative

Adopt an off-the-shelf agent platform (e.g., Microsoft Copilot Studio embedded in Teams). Cost: low up-front, ~$30/user/month recurring. Strategic cost: **locked into Microsoft's roadmap, no IP, no commercial leverage, no differentiation** in our own SaaS ERP. Reviewed and rejected — captured in ADR-0009 (Build vs. Buy).

### What success looks like (business KPIs)

Beyond the engineering acceptance criteria, P1 succeeds if:

| #    | Business KPI                                                      | Target                                                                            | Measured by                          | Owner          |
| ---- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------ | -------------- |
| BK-1 | At least **1 internal Seta team** uses @SetaAgent in Teams weekly | ≥ 5 weekly active users by M6+30 days                                             | Teams telemetry                      | CTO + PM       |
| BK-2 | At least **1 design-partner customer** committed to P2 pilot      | Letter of intent signed by M6+14 days                                             | Sales pipeline                       | CEO + Sales    |
| BK-3 | Token cost per agent run                                          | Average < $0.05/run on staging                                                    | CloudWatch + cost dashboard          | DevOps + PM    |
| BK-4 | End-to-end latency for common queries ("summarize my tasks")      | p95 < 4 seconds                                                                   | Synthetic monitoring on staging      | DevOps + QA    |
| BK-5 | OSS traction signal                                               | ≥ 50 GitHub stars + ≥ 5 external npm installs within 30 days of public flip       | GitHub Insights + npm download stats | PM + Marketing |
| BK-6 | Internal time-savings (qualitative; baseline for ROI)             | Survey of pilot users reports ≥ 20% reduction in manual Planner coordination time | Survey at M6+30 days                 | PM             |

These KPIs determine whether P2 (production cutover) is approved at the P1 gate.

---

## Sheet 1 — Executive Summary

### 1. Project Information

| Field           | Value                                                                                          | Field         | Value                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| Project Manager | Canh Ta                                                                                        | Sponsor       | Seta International (CEO + CTO)                                         |
| P1 Start        | 2026-05-11                                                                                     | P1 Target End | 2026-06-26                                                             |
| Project Code    | SETA-OS-P1                                                                                     | Convention    | 1 BMM = 22 working days · 1 SP ≈ 0.5 ideal MD                          |
| P1 Working Days | **35 (7 weeks)**                                                                               | Headcount     | **7** (1 PM · 1 FS · 1 Senior AG · **2 Fresher AG** · 1 QA · 1 DevOps) |
| Deploy target   | **AWS staging via infrastructure-as-code (Terraform)** — full cloud stack details in Sheet 7.2 | SP scale      | Fibonacci (1, 2, 3, 5, 8, 13)                                          |
| AI assist       | Claude Code — **upside only, not committed in budget**                                         | Full Roadmap  | **P1 → P4 = 21 weeks** to enterprise-grade production-ready            |

### 2. The one-paragraph version (90-second CEO read)

> Build a slim, multi-tenant, multi-channel agent platform for Seta's ERP. **P1 (7 weeks, 7 people)** delivers **three specialist agents** (Planner, Analytics, **Seta FAQ**) in Microsoft Teams that read, write, analyze, and answer questions about Seta itself via RAG over our corporate knowledge base — with **inbound SSO** (Entra + Google OIDC), **working memory**, **full RAG** (chunking + embeddings + vector + composition), deployed to AWS staging via Terraform, kernel published as open-source. **P2 (5 weeks, +1 frontend, ~$158k)** cuts over to production with Studio web UI, audit log, GDPR delete, and semantic-recall memory. Total program (P1–P4, **~$792k, 21 weeks**) reaches enterprise-grade production-ready with SOC 2 prep, multi-channel surfaces, and Knowledge Graph.

### 3. P1 Strategic Objectives

| #   | Objective                                                  | What it means in plain terms                                                                                                                     |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Three specialist agents live in Microsoft Teams**        | A Planner Agent (project management), an Analytics Agent (workload insights), and a Seta FAQ Agent (company knowledge) — all reachable in Teams. |
| 2   | **Full Planner workflow in one agent**                     | Users can read, create, update, analyze, and ask questions about Planner data without leaving Teams.                                             |
| 3   | **Seta knowledge base with citations**                     | Agent answers questions about Seta itself (pricing, policies, processes) and shows where the answer came from.                                   |
| 3b  | **Visualization-first responses — charts and tables, not just text** | When users ask "who's overloaded?" they get a bar chart; "what's overdue?" returns a structured table — all inside the Teams conversation.       |
| 4   | **Designed for multiple customer tenants from day one**    | Customer data isolated end-to-end; one customer cannot see another's data.                                                                       |
| 5   | **Web login (single sign-on)**                             | Foundation for users to log into a web admin in P2 — Entra ID and Google OIDC supported.                                                         |
| 6   | **Conversational memory within a session**                 | Agent remembers context across messages in the same conversation.                                                                                |
| 7   | **Foundation for knowledge-base Q&A in any future domain** | The same Seta-FAQ approach works for customer documentation, internal wikis, contract libraries — reusable.                                      |
| 8   | **Automated quality bar**                                  | 12 end-to-end tests run on every change; demo-able to any reviewer.                                                                              |
| 9   | **Live, publicly-accessible staging environment on AWS**   | Sponsor can interact with the system from a URL; not a localhost demo.                                                                           |
| 10  | **Open-source release**                                    | Public GitHub repo + first package published; positions Seta as agent-native vendor; recruiting funnel.                                          |
| 11  | **Production foundation in place**                         | Cloud infrastructure, secrets management, deployment automation — reusable for P2 production cutover.                                            |

### 4. Release Roadmap (P1, 7 weeks)

| Phase                                       | Window        | W1 05/11 | W2 05/18 | W3 05/25           | W4 06/01 | W5 06/08 | W6 06/15        | W7 06/22                  |
| ------------------------------------------- | ------------- | -------- | -------- | ------------------ | -------- | -------- | --------------- | ------------------------- |
| Research (R)                                | 05-11 → 05-15 | █        |          |                    |          |          |                 |                           |
| Setup (S)                                   | 05-11 → 05-15 | ◆        |          |                    |          |          |                 |                           |
| Kernel (K)                                  | 05-12 → 05-25 | █        | █        | ◆                  |          |          |                 |                           |
| Wrap (W)                                    | 05-12 → 05-28 | █        | █        | █                  |          |          |                 |                           |
| Early AWS (D1–D2)                           | 05-13 → 05-15 | █        |          |                    |          |          |                 |                           |
| MS365 (M)                                   | 05-26 → 06-03 |          |          | █                  | █        |          |                 |                           |
| Teams (T)                                   | 06-01 → 06-05 |          |          |                    | █        |          |                 |                           |
| Agents (A) + Wiring (N) + Orchestration (O) | 06-01 → 06-12 |          |          |                    | █        | █        |                 |                           |
| **Memory + RAG primitives (Y) + SSO (Z)**   | 06-15 → 06-23 |          |          |                    |          |          | █               | █                         |
| Deploy staging (D)                          | 06-08 → 06-22 |          |          |                    |          | █        | █               | ◆                         |
| E2E suite (Q4 — now 11 tests)               | 06-08 → 06-23 |          |          |                    |          | █        |                 | █                         |
| Hardening + Demo (H)                        | 06-22 → 06-26 |          |          |                    |          |          |                 | ◆                         |
| **Milestones**                              | —             |          |          | M1 Kernel · M2 API | M3 MS365 | M4 Teams | M5 Staging core | M6 Public Release (06-26) |

### 5. Key Milestones

| #   | Milestone                                       | Phase | Target Date | Days from kickoff | Gate                           |
| --- | ----------------------------------------------- | ----- | ----------- | ----------------: | ------------------------------ |
| M0  | Setup foundation green                          | S     | 2026-05-15  |                 4 | Capability S6                  |
| M1  | Kernel acceptance gate                          | K     | 2026-05-25  |                14 | K7 + Q5.1                      |
| M2  | API end-to-end (key → agent run → stream)       | W     | 2026-05-29  |                18 | W5, W6 + Q5.2                  |
| M3  | MS365 admin OAuth + Planner working             | M     | 2026-06-03  |                23 | M2 + Q5.3                      |
| M4  | Teams round-trip in dev tunnel                  | T+A   | 2026-06-10  |                30 | A5, Q4.2 + Q5.4                |
| M5  | AWS staging deploy + core 10 E2E tests green    | D+Q   | 2026-06-15  |                35 | D7, Q4.1–Q4.10 + Q5.5          |
| M5b | Memory + RAG primitives + SSO + Q4.11 E2E green | Y+Z+Q | 2026-06-23  |                43 | Y2, Z2, Q4.11                  |
| M6  | P1 public release + BK-1, BK-2 measured         | H     | 2026-06-26  |                46 | H4, H5 + business KPI baseline |

### 6. Day-1 Executable Work

The team fans out on Monday 2026-05-11 — no Week-1 idle time waiting for setup. Each role has a concrete first task:

| Role   | Day-1 capability                                                                                               |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| PM     | R1, R2, R4 — landscape research (OpenClaw, Helmet Security, AutoGen, others) + MS API analysis + risk register |
| FS     | S1, S3 — monorepo toolchain + repository hygiene                                                               |
| AG-S   | K1 (architecture: taxonomy + MessageList), K3 (interface + Anthropic SDK)                                      |
| AG-F   | K2 (Tool framework — well-scoped intro), K6 (TestKit — onboarding through tests)                               |
| QA     | Q1 — test strategy & policy draft                                                                              |
| DevOps | S2 (local dev env), D1 (AWS account + IAM + cost cap), early Terraform skeleton                                |

### 7. Build vs. Buy Position (ADR-0009)

Evaluated adopting an existing framework vs. building a slim in-house kernel. Decision: **build**.

| Concern                | Why building wins                                                              | Reference points reviewed                                            |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Multi-tenant by design | Most OSS frameworks assume single-tenant; retrofit is invasive                 | OpenClaw (single-user focus), AutoGen, CrewAI                        |
| Vendor neutrality      | We control the API; can evolve without waiting for upstream                    | –                                                                    |
| Right-size footprint   | Mature frameworks are 10–50× the code we need                                  | –                                                                    |
| Security posture       | Multi-tenant + encrypted token vault + RLS hard to assert about external code  | Helmet Security model for agent policy enforcement informs P2 design |
| OSS leverage           | We can release `@seta/agent-core` as a slim, focused alternative               | –                                                                    |
| Long-term cost         | ~6 weeks to own the kernel vs ongoing tax of working around framework opinions | –                                                                    |

R sub-phase spikes compare design against **OpenClaw**, **Helmet Security**, **AutoGen**, **CrewAI**, **LangGraph**, **Semantic Kernel**, and others. Decisions captured as ADRs in the repo.

### 8. Capacity & Allocation (P1)

**Two Agent dev tiers** — explicit seniority split:

- **AG-S (Senior)**: architecture decisions, security-sensitive code, novel patterns, complex algorithms. ~15% review/mentorship overhead pre-baked.
- **AG-F (Fresher)**: well-scoped pattern-following work. Pairs with AG-S on first task of each pattern. Productivity ramp 80%/90%/100% W1–W3 factored in.

**Now sized for 7-week P1** — supply per role rises from 30 to 35 MD; total team supply 210 MD.

| Role                   |    HC |    Base MD |      AI MD |            Supply MD | Base Util | AI Util | Status                                      |
| ---------------------- | ----: | ---------: | ---------: | -------------------: | --------: | ------: | ------------------------------------------- |
| PM                     |     1 |      15.00 |      12.75 |                 35.0 |       43% |     36% | Healthy                                     |
| Fullstack (FS)         |     1 |  **31.93** |      22.35 |                 35.0 |   **91%** |     64% | Healthy (M1 OAuth now FS)                   |
| AG-Senior              |     1 |  **29.22** |      20.10 |                 35.0 |   **83%** |     57% | Healthy (M moved to FS+AG-F1)               |
| AG-Fresher #1          |     1 |  **27.00** |      20.25 |                 35.0 |   **77%** |     58% | Healthy (M2 Graph/Planner client now AG-F1) |
| AG-Fresher #2 (new HC) |     1 |      12.50 |       9.38 | 28.0 (ramp-adjusted) |       45% |     33% | Healthy (new joiner, ramps W1→W3)           |
| QA                     |     1 |      31.25 |      25.00 |                 35.0 |       89% |     71% | Healthy                                     |
| DevOps (DO)            |     1 |      12.25 |       8.58 |                 35.0 |       35% |     25% | Spare                                       |
| **TOTAL**              | **7** | **159.15** | **118.41** |            **238.0** |   **67%** | **50%** | Healthy                                     |

> **Rebalanced**: MS365 work (M1 OAuth + token vault → FS; M2 Graph/Planner client → AG-F1) moved off AG-S. AG-S now focuses on kernel architecture (K1/K4/K5), security spike review, supervisor pattern (O2), multi-agent orchestration (O3), Teams JWT/OBO (T1.3/T1.7), and Planner WRITE/ANALYSIS logic. No role exceeds 91% base util — best balance to date.

**Mandatory pre-kickoff mitigations** (apply before 2026-05-11):

| #   | Action                                                                                          | From          | To            | MD freed | New util                             |
| --- | ----------------------------------------------------------------------------------------------- | ------------- | ------------- | -------: | ------------------------------------ |
| 1   | **Move N5.1 (prompt versioning) + N5.2 (token budget guard) from AG-S to AG-F**                 | AG-S          | AG-F          |      1.0 | AG-S → 98%, AG-F → 77%               |
| 2   | **DevOps takes Q4.7 (provider failover E2E) + Q4.8 (SDK quickstart) + Q4.9 (rate-limit burst)** | QA            | DO            |      2.5 | QA → 94%, DO → 39%                   |
| 3   | **Name FS as architectural backup for AG-S K-phase work** (FS has overlapping skillset)         | (contingency) | (contingency) |        – | Triggers if AG-S unavailable >3 days |

**Post-mitigation steady state**: PM 46% · FS 78% · AG-S 98% · AG-F 77% · QA 94% · DO 39%.

**Critical note for budget approval**: Plan and budget commit on **Base MD only** (130.40 MD raw human effort). AI assist (97.22 MD) is reported as upside — actual savings will be tracked weekly vs. baseline. **Do not commit to delivery dates assuming AI savings will materialize.**

---

## Sheet 2 — What the CEO/CTO/PMO Will See at End of P1 (the demo)

This is what the team will **show** at the M6 demo on 2026-06-19. Concrete, interactive — not slideware.

### 2.1 Live demo flow (5 minutes, recorded + live re-run)

| #   | What you see                                                                                                                                                         | Where                | Why it matters                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Open Microsoft Teams**, click into a channel where @SetaAgent is installed. Type: _"Summarize my open Planner tasks"_                                              | Teams desktop or web | Proof: real Teams integration; not a mockup                                                                                              |
| 2   | Watch streaming response render in real-time — chat bubble appears word-by-word                                                                                      | Teams chat           | Proof: streaming protocol works end-to-end (SSE through Bot Framework)                                                                   |
| 3   | Receive a **rich Adaptive Card** showing: 12 open tasks, due dates, status colors, assignee chips                                                                    | Teams chat           | Proof: structured UI; real Planner data integrated                                                                                       |
| 4   | Type follow-up: _"Who on my team is overloaded?"_                                                                                                                    | Teams chat           | Proof: multi-turn conversation, agent remembers context                                                                                  |
| 5   | Card returns **workload-by-assignee as a bar chart** (John: 15 tasks, Mary: 4, etc.) + underlying data table                                                          | Teams chat           | Proof: visualization-first output (chart + table), not just text. Same card system reusable for any future analytics in any agent.        |
| 6   | Type: _"Create three tasks under John's plan to clear his backlog"_                                                                                                  | Teams chat           | Proof: **Write** capability — the agent doesn't just read                                                                                |
| 7   | Agent asks for **confirmation** before writing: _"I'll create 3 tasks in plan 'Q3 Workstreams'. Proceed?"_                                                           | Teams chat           | Proof: write safety — no destructive ops without confirmation                                                                            |
| 8   | User confirms; agent creates tasks, returns card listing new task IDs + Planner links                                                                                | Teams chat           | Proof: round-trip — write reflects in Microsoft Planner immediately                                                                      |
| 9   | Type: _"What's overdue and who can I reassign things to?"_                                                                                                           | Teams chat           | Proof: **multi-agent orchestration** — Coordinator dispatches to Analytics agent for analysis, surfaces back to Planner agent for action |
| 10  | Agent emits status updates as it works ("Analyzing workload... Identifying candidates..."), returns a combined response with overdue list + reassignment suggestions | Teams chat           | Proof: complex orchestration works; lifecycle events visible                                                                             |

> Demo step 9–10 uses the **multi-agent orchestration infrastructure (O3.1–O3.6)** with the Coordinator agent driving the dispatch via prompt-engineered tool selection. No additional code macro required.

### 2.2 Tangible deliverables (shown after live demo)

| #   | Artifact                             | URL / Location                                                                                                               | Verifiable how?                         |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | **Live AWS staging URL**             | `https://staging-api.os.seta-international.com/healthz` → 200; `/docs` → OpenAPI explorer                                    | Open URL in browser                     |
| 2   | **Public GitHub repo**               | `github.com/Seta-International/seta-os` (private → public flipped); README, contributing guide, 13+ packages, green CI badge | Browse repo; see Actions tab            |
| 3   | **First npm packages live**          | `npmjs.com/package/@seta/agent-core` + `@seta/agent-sdk` at `0.1.0-next`                                                     | `npm view @seta/agent-core`             |
| 4   | **Terraform-managed AWS staging**    | `terraform plan` against staging is clean (no drift)                                                                         | Live `terraform plan` projected         |
| 5   | **10 E2E tests all green**           | GitHub Actions latest commit on main — Q4.1–Q4.10 all green                                                                  | Open Actions; expand E2E job            |
| 6   | **30-query eval set with pass rate** | `pnpm --filter @seta/agent eval` runs live                                                                                   | Run command; show pass/fail             |
| 7   | **CloudWatch dashboard** for staging | Latency p50/p95/p99, error rate, token usage, cost-per-1k-requests                                                           | Open dashboard URL                      |
| 8   | **Live curl against API**            | SSE stream from `staging-api.../agents/seta-planner/stream`                                                                  | Run in terminal; show chunks            |
| 9   | **Docs site**                        | README quickstart, Planner+Teams cookbook, 9 ADRs (0001–0009), 4 runbooks                                                    | Browse `os.seta-international.com/docs` |
| 10  | **5-min recorded demo video**        | Polished walkthrough for stakeholder sharing                                                                                 | Play during meeting                     |
| 11  | **Restore drill execution log**      | RDS snapshot restored in <15 min, dated runbook entry                                                                        | Read runbook; show timestamp            |
| 12  | **Cost-to-date for staging**         | AWS Cost Explorer: $X/month actual vs. budget                                                                                | Open Cost Explorer                      |

### 2.3 Business KPI baseline at M6 (the ROI-related part)

| BK # | Metric                            | Status at M6                                     |
| ---- | --------------------------------- | ------------------------------------------------ |
| BK-1 | Internal Seta WAU on @SetaAgent   | Baseline measured; 30-day target check at M6+30  |
| BK-2 | Design-partner LOI signed         | Sales-led; target by M6+14                       |
| BK-3 | Token cost / agent run            | Measured live on staging                         |
| BK-4 | p95 latency for "summarize tasks" | Measured live on staging                         |
| BK-5 | OSS traction (stars, installs)    | Counter starts at M6 (public flip); 30-day check |
| BK-6 | Internal time-savings             | Pilot survey at M6+30                            |

### 2.4 What you can do with this in the next 30 days

| What                                       | Possible because                                             | Path                                                                     |
| ------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Show to a prospective customer             | Working demo on staging URL; supports their tenant via OAuth | Issue tenant API key + walk through Entra consent                        |
| Onboard a 2nd ERP domain (e.g., Timesheet) | Architecture proven; pattern replicable                      | New module `modules/products/timesheet/`; ~3 weeks vs the 6 we just took |
| Add a 2nd channel (Slack)                  | Channel abstraction in place                                 | New module `modules/channels/slack/`; ~2 weeks                           |
| Migrate to production (P2)                 | Terraform modules reusable; runbooks established             | Execute §9 P2 plan (6 weeks)                                             |
| Onboard another engineer                   | Public repo; clean architecture; ADRs explain decisions      | Direct to README + ADRs; productive in <1 week                           |

### 2.5 What is explicitly NOT in the P1 demo (sets expectations)

| Not shown                                                | Why                                                                           | Available in           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------- |
| Production environment (`api.os.seta-international.com`) | P1 = staging only; prod cutover dedicated 6-week phase                        | **P2** (by 2026-07-31) |
| Web Studio UI                                            | Out of P1 scope; admin via API only                                           | **P2** (by 2026-07-31) |
| Inbound SSO (Entra/Google web login)                     | Teams handles identity in P1; web SSO needs Studio                            | **P2** (by 2026-07-31) |
| Audit log + GDPR delete                                  | Compliance baseline begins P2                                                 | **P2** (by 2026-07-31) |
| Knowledge-base Q&A (RAG)                                 | Not in P1; requires chunking + embeddings + vector                            | **P3** (by 2026-09-04) |
| Long-term memory across conversations                    | Not in P1; isolated per thread                                                | **P3** (by 2026-09-04) |
| Slack / Email / Voice channels                           | One channel proven (Teams); others follow same pattern                        | **P3** (by 2026-09-04) |
| Billing / metering integration                           | Counters logged in P1; enforcement + billing vendor (TBD) in commercial phase | **P3** (by 2026-09-04) |
| Multi-region failover                                    | Single region in P1/P2 is correct for our load                                | **P4** (by 2026-10-02) |
| SOC 2 audit ready                                        | Compliance baseline P2; full prep is multi-week                               | **P4** (by 2026-10-02) |

---

## Sheet 3 — P1 Capabilities (59 capabilities, 152.40 MD)

**Audience note** — This sheet has dual audience:

- **Executive readers (CEO, CFO, PMO)**: read the **Capability name + Why it matters** columns. Skip SP/MD/role columns — those are engineering planning detail.
- **Technical readers (CTO, engineering)**: read all columns. "Why it matters" includes some technical framing (e.g., "RLS backstop", "OBO flow", "RRF fusion") — these are intentional terms for the engineering planning layer.

Each row = **a business-meaningful capability**. Owner uses role short codes; multi-role splits shown as `A + B`. Detailed engineering tasks (sub-tasks per capability) tracked in team backlog, not in this document.

| Cap ID | Phase | Capability                                                                                                                                                                                                 | Why it matters                                                                                    | Owner(s)                                                                       |     SP |   Base MD |      AI MD | Start      | End   | Status      |
| ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -----: | --------: | ---------: | ---------- | ----- | ----------- |
|        |       | **R — Foundation Research**                                                                                                                                                                                | Locks design decisions; outputs ADRs                                                              |                                                                                | **23** |  **6.50** |   **5.85** |            |       |             |
| R1     | R     | Agent framework landscape research (OpenClaw, Helmet Security, AutoGen, CrewAI, LangGraph, Semantic Kernel + others) → kernel design ADRs                                                                  | Validates build-vs-buy decision; surfaces patterns to copy and anti-patterns to avoid             | PM + AG-S                                                                      |      9 |      2.50 |       2.25 | 05-11      | 05-12 | Not Started |
| R2     | R     | External API analysis (MS Graph, Bot Framework, Adaptive Cards)                                                                                                                                            | Surfaces quirks before implementation hits them                                                   | PM                                                                             |      7 |      2.00 |       1.80 | 05-12      | 05-13 | Not Started |
| R3     | R     | Security architecture (KMS envelope, tenancy backstop, agent policy model)                                                                                                                                 | Locks key handling + tenant isolation + Helmet-style policy model                                 | PM + FS                                                                        |      4 |      1.00 |       0.90 | 05-13      | 05-14 | Not Started |
| R4     | R     | Scope discipline + risk baseline                                                                                                                                                                           | "What we don't build" + weekly risk review                                                        | PM                                                                             |      4 |      1.00 |       0.90 | 05-15      | 05-15 | Not Started |
|        |       | **S — Foundation Setup**                                                                                                                                                                                   | Production-grade monorepo, CI/CD, local dev                                                       |                                                                                | **31** | **10.00** |   **5.85** |            |       |             |
| S1     | S     | Toolchain & build pipeline                                                                                                                                                                                 | Workspace, TypeScript strict, build, lint, test config                                            | FS                                                                             |     10 |      2.50 |       1.50 | 05-11      | 05-12 | Not Started |
| S2     | S     | Local development environment                                                                                                                                                                              | Postgres + pgvector + tracing stack one-command up                                                | DevOps                                                                         |      3 |      0.75 |       0.48 | 05-12      | 05-12 | Not Started |
| S3     | S     | Repository hygiene & quality gates                                                                                                                                                                         | Package scaffolder + CI guards (prevents drift)                                                   | FS                                                                             |      8 |      2.50 |       1.50 | 05-13      | 05-13 | Not Started |
| S4     | S     | Initial package scaffolding                                                                                                                                                                                | Empty-but-green scaffolds so all teams start parallel from W2                                     | FS                                                                             |      5 |      1.50 |       0.83 | 05-14      | 05-14 | Not Started |
| S5     | S     | CI/CD pipeline                                                                                                                                                                                             | Every PR validated; signed remote cache                                                           | DevOps                                                                         |      6 |      1.75 |       1.10 | 05-14      | 05-15 | Not Started |
| S6     | S     | Documentation foundation + setup acceptance gate                                                                                                                                                           | README, contribution guide, ADR stubs; validates green start                                      | PM + FS                                                                        |      3 |      1.00 |       0.45 | 05-15      | 05-15 | Not Started |
|        |       | **K — Agent Kernel (hand-rolled, slim)**                                                                                                                                                                   | The brain of every agent                                                                          |                                                                                | **53** | **16.00** |  **10.40** |            |       |             |
| K1     | K     | Message system (taxonomy, list, store, replay determinism)                                                                                                                                                 | Foundation for conversation state, persistence, deterministic testing                             | AG-S (architecture) + AG-F (cursor + replay)                                   |     11 |      3.00 |       1.95 | 05-12      | 05-19 | Not Started |
| K2     | K     | Tool framework                                                                                                                                                                                             | Standard contract for every agent capability                                                      | AG-F (with AG-S review)                                                        |      4 |      1.00 |       0.65 | 05-12      | 05-18 | Not Started |
| K3     | K     | Model layer: OpenAI + OpenAI-compatible adapter + router (works with Azure OpenAI, OpenRouter, Together AI, Ollama via base-URL override)                                                                  | No vendor lock-in within the OpenAI-compatible ecosystem                                          | AG-S (interface + compatible adapter + router) + AG-F (OpenAI primary)         |     10 |      3.00 |       2.00 | 05-13      | 05-20 | Not Started |
| K4     | K     | Run loop (multi-step, parallel tools, cancellation)                                                                                                                                                        | Core orchestration — complex concurrency                                                          | AG-S (step + loop + parallel) + AG-F (abort)                                   |     13 |      4.00 |       2.70 | 05-20      | 05-22 | Not Started |
| K5     | K     | Streaming protocol                                                                                                                                                                                         | Frozen protocol; all consumers depend on it. Subtle backpressure.                                 | AG-S                                                                           |      7 |      2.00 |       1.40 | 05-13      | 05-22 | Not Started |
| K6     | K     | Test infrastructure (LLM record + replay)                                                                                                                                                                  | Deterministic CI without live LLM costs. Great fresher onboarding.                                | AG-F                                                                           |      7 |      2.00 |       1.30 | 05-13      | 05-20 | Not Started |
| K7     | K     | Kernel acceptance gate                                                                                                                                                                                     | **Hard gate** — wrap work blocked until green                                                     | AG-S + AG-F                                                                    |      4 |      1.00 |       0.80 | 05-25      | 05-25 | Not Started |
|        |       | **W — API & Storage Wrap**                                                                                                                                                                                 | Multi-tenant data + HTTP API                                                                      |                                                                                | **40** | **12.50** |   **8.10** |            |       |             |
| W1     | W     | Multi-tenant data layer (Postgres + Drizzle + composite keys + RLS)                                                                                                                                        | Defense-in-depth tenant isolation                                                                 | FS                                                                             |     13 |      4.00 |       2.60 | 05-18      | 05-21 | Not Started |
| W2     | W     | Tenant isolation runtime (AsyncLocalStorage + guards)                                                                                                                                                      | Impossible to forget the WHERE clause                                                             | FS                                                                             |      4 |      1.00 |       0.65 | 05-19      | 05-20 | Not Started |
| W3     | W     | API authentication (issuance, verification, revocation, admin API)                                                                                                                                         | Only inbound auth in P1; SSO comes in P2                                                          | FS                                                                             |      7 |      2.00 |       1.45 | 05-22      | 05-25 | Not Started |
| W4     | W     | HTTP server foundation (Hono + middleware + OpenAPI + rate-limiting)                                                                                                                                       | Single deployable; spec drives SDK codegen                                                        | FS                                                                             |      8 |      2.50 |       1.60 | 05-20      | 05-26 | Not Started |
| W5     | W     | Agent HTTP API (run, stream, threads)                                                                                                                                                                      | Public API — what clients call                                                                    | AG-S (stream) + AG-F (sync + threads)                                          |      7 |      2.00 |       1.33 | 05-26      | 05-27 | Not Started |
| W6     | W     | TypeScript SDK                                                                                                                                                                                             | DX for any team integrating Seta agents                                                           | AG-F                                                                           |      3 |      1.00 |       0.60 | 05-28      | 05-28 | Not Started |
|        |       | **M — Microsoft 365 Integration**                                                                                                                                                                          | First domain — pattern for every future ERP module                                                |                                                                                | **23** |  **7.50** |   **4.88** |            |       |             |
| M1     | M     | OAuth & encrypted token vault (Entra + PKCE + AES-GCM)                                                                                                                                                     | Web auth flow + security — natural FS work                                                        | **FS** (with AG-S security review)                                             |     10 |      3.00 |       2.20 | 05-26      | 05-28 | Not Started |
| M2     | M     | Microsoft Graph + Planner client (full ops + delta sync)                                                                                                                                                   | HTTP client + CRUD + retries + pagination — pattern-following work                                | **AG-F1** (with AG-S consult on delta-sync edge cases)                         |     13 |      4.50 |       2.68 | 05-28      | 06-03 | Not Started |
|        |       | **T — Microsoft Teams Channel**                                                                                                                                                                            | First user-facing channel; pattern for Slack/Voice/Email                                          |                                                                                | **23** |  **9.00** |   **6.30** |            |       |             |
| T1     | T     | Bot Framework protocol (JWT, dispatch, replies, Teams SSO via OBO, manifest)                                                                                                                               | Hand-rolled (no MS SDK weight); full control                                                      | AG-S (JWT + OBO) + AG-F (types + dispatch) + FS (bot token + reply + manifest) |     23 |      9.00 |       6.30 | 06-01      | 06-05 | Not Started |
|        |       | **A — Agent Definitions**                                                                                                                                                                                  | Multiple specialist agents                                                                        |                                                                                | **10** |  **4.25** |   **2.83** |            |       |             |
| A1     | A     | Agent module scaffold                                                                                                                                                                                      | Foundation for all business modules                                                               | AG-F                                                                           |      2 |      0.50 |       0.28 | 06-03      | 06-03 | Not Started |
| A2     | A     | Two-agent system (Planner Agent + Analytics Agent)                                                                                                                                                         | Planner = full toolset (gpt-4o). Analytics = read+analysis only (gpt-4o-mini for cost).           | AG-S (Planner) + AG-F (Analytics)                                              |      4 |      1.50 |       1.00 | 06-03      | 06-04 | Not Started |
| A4     | A     | Rich response output — text, **data tables, charts (bar / line / pie)**, task-list, workload, overdue, plan-health cards                                                                                   | Visualization-first responses in Teams (Adaptive Cards + server-rendered chart images), not text-only. Patterns reusable across all future agents. | AG-F                                                                           |      3 |      1.00 |       0.65 | 06-05      | 06-05 | Not Started |
| A5     | A     | Teams handler with Coordinator dispatch                                                                                                                                                                    | Routes user intent between Planner and Analytics                                                  | AG-S                                                                           |      3 |      1.25 |       0.90 | 06-05      | 06-08 | Not Started |
|        |       | **N — Agent ↔ Planner Capabilities**                                                                                                                                                                       | The actual Planner ops agents perform                                                             |                                                                                | **47** | **11.50** |   **7.65** |            |       |             |
| N1     | N     | **READ** — list/search tasks, get details, list plans/buckets                                                                                                                                              | What every Q&A query reads                                                                        | AG-F                                                                           |      8 |      2.00 |       1.23 | 06-04      | 06-09 | Not Started |
| N2     | N     | **WRITE** + safety (dry-run, confirm for destructive ops)                                                                                                                                                  | Agent changes data, not just reads                                                                | AG-S                                                                           |      9 |      2.25 |       1.57 | 06-04      | 06-10 | Not Started |
| N3     | N     | **ANALYSIS** — workload by assignee, overdue + completion trend                                                                                                                                            | Insights LLM can't compute from raw lists. At-risk + plan-health deferred to P2.                  | AG-S                                                                           |      4 |      1.00 |       0.70 | 06-05      | 06-11 | Not Started |
| N4     | N     | **FAQ + evaluation** — 30-query eval set + replay harness                                                                                                                                                  | Foundation for regression-eval                                                                    | PM + AG-S + AG-F + QA                                                          |      9 |      2.75 |       2.25 | 06-08      | 06-11 | Not Started |
| N5     | N     | **Performance** — prompt versioning, token-budget guard, cost tracking. Response cache deferred to P2.                                                                                                     | Cost visibility day 1                                                                             | **AG-F** (per mitigation #1)                                                   |      6 |      1.50 |       0.99 | 06-08      | 06-11 | Not Started |
| N6     | N     | **Chunking** — pagination, truncation, "show more", summarization fallback                                                                                                                                 | Handles 1000s of tasks without blowing context                                                    | AG-F                                                                           |      8 |      2.00 |       1.40 | 06-08      | 06-12 | Not Started |
|        |       | **O — Multi-Agent Orchestration · Supervisor · Config**                                                                                                                                                    | Core P1 capability                                                                                |                                                                                | **27** |  **7.50** |   **5.30** |            |       |             |
| O1     | O     | Per-tenant agent configuration (override prompt/tools/model/limits)                                                                                                                                        | Different orgs configure agents without code changes                                              | FS + AG-F                                                                      |      7 |      1.75 |       1.22 | 06-01      | 06-09 | Not Started |
| O2     | O     | Supervisor pattern (scorer + retry-on-fail)                                                                                                                                                                | Quality safety net                                                                                | AG-S                                                                           |      6 |      1.50 |       1.10 | 06-08      | 06-11 | Not Started |
| O3     | O     | **Multi-agent orchestration** (subAgentTool + registry + protocol + concurrent + handoff + macro example)                                                                                                  | Planner delegates to Analytics. Foundation for any agent network. Demo step 9–10 depends on this. | AG-S + AG-F + PM                                                               |     12 |      3.25 |       2.32 | 06-08      | 06-12 | Not Started |
| O4     | O     | Run lifecycle observability (events + per-run trace)                                                                                                                                                       | Replay-debug any past agent run                                                                   | AG-F                                                                           |      4 |      1.00 |       0.68 | 06-08      | 06-09 | Not Started |
|        |       | **Q — Quality Assurance (cross-cutting)**                                                                                                                                                                  | 10 E2E tests + integration + contract + manual gates                                              |                                                                                | **80** | **30.00** |  **24.00** |            |       |             |
| Q1     | Q     | Test strategy & policy                                                                                                                                                                                     | Quality bar set day 1                                                                             | QA                                                                             |      5 |      1.50 |       1.28 | 05-11      | 05-15 | Not Started |
| Q2     | Q     | Test infrastructure (Vitest projects, msw fixtures, LLM recording, E2E harness, seed)                                                                                                                      | Foundation every test layer depends on                                                            | QA                                                                             |     12 |      4.00 |       2.88 | 05-18      | 05-26 | Not Started |
| Q3     | Q     | Unit + integration + contract coverage                                                                                                                                                                     | Catches drift before prod                                                                         | QA                                                                             |     19 |      7.00 |       5.30 | 05-25      | 06-12 | Not Started |
| Q4     | Q     | **End-to-end test suite (10 tests)** — streaming, Teams, tenant isolation, auth fuzz, OAuth, multi-turn, **provider failover (DevOps)**, **SDK quickstart (DevOps)**, **rate-limit (DevOps)**, multi-agent | Acceptance bar — all 10 must pass for P1 ship                                                     | QA (7) + DevOps (3, per mitigation #2)                                         |     28 |     13.00 |      10.05 | 06-08      | 06-12 | Not Started |
| Q5     | Q     | Manual milestone gate passes (5 gates: M1–M5)                                                                                                                                                              | Human sign-off complements automated tests                                                        | QA                                                                             |     10 |      2.50 |       2.50 | 05-25      | 06-15 | Not Started |
| Q6     | Q     | Operational quality (flake watch + release readiness checklist)                                                                                                                                            | Gates M6                                                                                          | QA                                                                             |      6 |      2.00 |       1.85 | 05-18      | 06-18 | Not Started |
| Q7     | Q     | Demo dry-runs (internal + stakeholder)                                                                                                                                                                     | Rehearse M6 demo                                                                                  | QA + PM                                                                        |      4 |      1.00 |       0.90 | 06-10      | 06-16 | Not Started |
|        |       | **D — AWS Staging Deployment (Terraform-managed)**                                                                                                                                                         | Live, publicly-accessible staging URL                                                             |                                                                                | **25** |  **8.75** |   **6.13** |            |       |             |
| D1     | D     | AWS environment (account, IAM OIDC, VPC, naming, Cost Explorer alerts)                                                                                                                                     | Cost discipline day 1; OIDC = no static creds in CI                                               | DevOps + PM                                                                    |      2 |      0.50 |       0.40 | 05-13      | 05-13 | Not Started |
| D2     | D     | Terraform skeleton + ECR                                                                                                                                                                                   | IaC foundation; reusable modules for P2 prod                                                      | DevOps                                                                         |      5 |      1.50 |       1.05 | 05-14      | 06-09 | Not Started |
| D3     | D     | Data & secrets infrastructure (RDS PostgreSQL + pgvector + Secrets Manager + KMS + AwsKmsProvider)                                                                                                         | Managed DB + managed secrets                                                                      | DevOps + FS                                                                    |      6 |      2.00 |       1.45 | 06-09      | 06-10 | Not Started |
| D4     | D     | Compute & ingress (ECS Fargate + ALB + ACM cert + Route53)                                                                                                                                                 | Public staging URL with HTTPS                                                                     | DevOps                                                                         |      3 |      1.00 |       0.70 | 06-10      | 06-11 | Not Started |
| D5     | D     | Deployment automation (GitHub Actions → AWS OIDC → ECR push → ECS task update)                                                                                                                             | Every merge to main auto-deploys; no static creds                                                 | DevOps                                                                         |      3 |      1.00 |       0.65 | 06-11      | 06-12 | Not Started |
| D6     | D     | External wiring (Entra redirect + Bot endpoint → staging URL)                                                                                                                                              | OAuth + Teams work against AWS staging                                                            | FS                                                                             |      3 |      0.75 |       0.65 | 06-12      | 06-12 | Not Started |
| D7     | D     | Acceptance & runbooks (smoke test + Terraform plan/apply runbook + RDS restore drill executed)                                                                                                             | Validates deploy stack is operable. **GATE for M5.**                                              | DevOps + QA + PM                                                               |      3 |      2.00 |       1.23 | 06-12      | 06-15 | Not Started |
|        |       | **H — Hardening, Demo, Public Release**                                                                                                                                                                    | P1 ship readiness                                                                                 |                                                                                | **22** |  **7.50** |   **5.43** |            |       |             |
| H1     | H     | Performance hardening + load smoke (50 concurrent streams)                                                                                                                                                 | Confirms staging holds; tunes rate-limiter                                                        | DevOps + QA                                                                    |      2 |      0.50 |       0.40 | 06-15      | 06-16 | Not Started |
| H2     | H     | OSS release readiness + **legal sign-off** (secret scrub, dep audit, README, CoC, LICENSE, IP-assignment confirmation, dep license compatibility review)                                                   | Pre-public checklist with Legal department sign-off — blocks H5 if not approved                   | PM + FS + Legal review                                                         |      3 |      1.00 |       0.85 | 06-15      | 06-16 | Not Started |
| H3     | H     | Demo to stakeholders (seed data + 5-min recording + live dry-run on AWS staging)                                                                                                                           | Validates the story end-to-end                                                                    | PM + QA + FS                                                                   |      7 |      2.50 |       2.13 | 06-15      | 06-18 | Not Started |
| H4     | H     | Documentation suite (README, quickstart, cookbook, per-pkg READMEs, ADRs 0001–0010 finalized)                                                                                                              | First impression for external developers                                                          | PM + FS                                                                        |      9 |      2.50 |       1.50 | 06-22      | 06-25 | Not Started |
| H5     | H     | Public flip + first npm publish                                                                                                                                                                            | **M6 release gate** — requires H2 Legal sign-off complete                                         | PM + FS                                                                        |      3 |      1.00 |       0.85 | 06-26      | 06-26 | Not Started |
|        |       | **Y — Working Memory (per-thread context)**                                                       | Multi-turn agent feels coherent across messages                                |        |     **5** |   **2.00** | **1.40**   |       |             |     |
| Y1     | Y     | Working memory infrastructure (per-thread scratchpad + LRU eviction + prompt injection middleware)                                                                                                         | Foundation for agent context awareness; semantic recall deferred to P2                            | AG-S + AG-F1                                                                   |      5 |      2.00 |       1.40 | 06-15      | 06-17 | Not Started |
|        |       | **X — RAG Stack + Seta Knowledge Base**                                                           | Powers Seta FAQ Agent; reusable for any future knowledge-Q&A use case          |        |    **28** |  **11.50** | **7.95**   |       |             |     |
| X1     | X     | `@seta/agent-chunking` package (token-aware text chunker)                                                                                                                                                  | Foundation primitive for RAG                                                                      | AG-F2                                                                          |      3 |      1.00 |       0.55 | 06-15      | 06-15 | Not Started |
| X2     | X     | `@seta/agent-embeddings` package (OpenAI text-embedding-3-small + LRU cache)                                                                                                                               | Foundation primitive for RAG                                                                      | AG-F2                                                                          |      5 |      1.50 |       0.83 | 06-16      | 06-17 | Not Started |
| X3     | X     | `@seta/agent-vector` package (pgvector store ops + HNSW + similarity search)                                                                                                                               | Foundation primitive for RAG                                                                      | AG-S + AG-F1                                                                   |      5 |      2.00 |       1.30 | 06-16      | 06-18 | Not Started |
| X4     | X     | `@seta/agent-rag` composition (RRF fusion + hybrid retrieval + reranking interface)                                                                                                                        | The full RAG pipeline used by Seta FAQ Agent                                                      | AG-S + AG-F1                                                                   |      5 |      2.00 |       1.50 | 06-18      | 06-22 | Not Started |
| X5     | X     | Seta knowledge corpus ingestion (scrape Seta docs/website → chunk → embed → store)                                                                                                                         | The actual knowledge base behind the FAQ agent                                                    | AG-F2 + FS                                                                     |      8 |      3.00 |       2.10 | 06-18      | 06-22 | Not Started |
| X6     | X     | Citation surfacing — RAG retrievals link back to source URLs in responses                                                                                                                                  | Trust + verifiability — answers point to source documents                                         | AG-F2                                                                          |      5 |      2.00 |       1.20 | 06-22      | 06-23 | Not Started |
|        |       | **Z — Inbound SSO (infrastructure, slim)**                                                        | Foundation for P2 web admin / Studio; users can log in to manage their tenant  |        |    **13** |   **5.00** | **3.50**   |       |             |     |
| Z1     | Z     | OIDC client (Entra + Google) + `sso_providers` + `sessions` tables + login/callback/logout endpoints                                                                                                       | Web auth foundation; admin UI deferred to P2 Studio                                               | FS + AG-S                                                                      |     13 |      5.00 |       3.50 | 06-22      | 06-26 | Not Started |
|        |       | **A6 — Seta FAQ Agent** (3rd specialist agent)                                                    | RAG-augmented agent answers questions about Seta itself                        |        |     **5** |   **1.50** | **1.05**   |       |             |     |
| A6     | A     | Seta FAQ Agent (read-only, RAG-augmented, model=gpt-4o-mini for cost) + Coordinator update to route Seta-FAQ queries                                                                                       | A real agent users can ask _"what's Seta's pricing?"_ or _"how does the refund process work?"_    | AG-F2 + AG-S (Coordinator)                                                     |      5 |      1.50 |       1.05 | 06-23      | 06-24 | Not Started |
|        |       | **Q4 expansion — 2 more E2E tests**                                                               | Total E2E suite: 12 tests                                                      |        |     **6** |   **2.00** | **1.60**   |       |             |     |
| Q4.11  | Q     | E2E: SSO login → session → authenticated agent run                                                                                                                                                         | Validates Z1 end-to-end with W3 API auth                                                          | QA + AG-F2                                                                     |      3 |      1.00 |       0.80 | 06-23      | 06-23 | Not Started |
| Q4.12  | Q     | E2E: Seta FAQ Agent answers question with valid citations to source docs                                                                                                                                   | Validates A6 + X4 + X5 end-to-end                                                                 | QA + AG-F2                                                                     |      3 |      1.00 |       0.80 | 06-24      | 06-24 | Not Started |
|        |       | **GRAND TOTAL (59 capabilities)**                                                                 |                                                                                |        |   **456** | **152.40** | **112.72** |       |             |     |
|        |       | **WITH 15% BUFFER**                                                                               |                                                                                |        |   **524** | **175.26** | **129.63** |       |             |     |

---

## Sheet 4 — Master Timeline (weekly Gantt)

`█` = active in week. ◆ = milestone.

| Cap | Capability                     | Owner(s)              | Base MD | Start | End   |  W1   | W2  |  W3   |  W4   |  W5   |  W6   |
| --- | ------------------------------ | --------------------- | ------: | ----- | ----- | :---: | :-: | :---: | :---: | :---: | :---: |
| R1  | Framework landscape research   | PM + AG-S             |    2.50 | 05-11 | 05-12 |   █   |     |       |       |       |       |
| R2  | External API analysis          | PM                    |    2.00 | 05-12 | 05-13 |   █   |     |       |       |       |       |
| R3  | Security architecture          | PM + FS               |    1.00 | 05-13 | 05-14 |   █   |     |       |       |       |       |
| R4  | Scope + risk baseline          | PM                    |    1.00 | 05-15 | 05-15 |   █   |     |       |       |       |       |
| S1  | Toolchain & build              | FS                    |    2.50 | 05-11 | 05-12 |   █   |     |       |       |       |       |
| S2  | Local dev env                  | DO                    |    0.75 | 05-12 | 05-12 |   █   |     |       |       |       |       |
| S3  | Repo hygiene & guards          | FS                    |    2.50 | 05-13 | 05-13 |   █   |     |       |       |       |       |
| S4  | Package scaffolding            | FS                    |    1.50 | 05-14 | 05-14 |   █   |     |       |       |       |       |
| S5  | CI/CD pipeline                 | DO                    |    1.75 | 05-14 | 05-15 |   █   |     |       |       |       |       |
| S6  | Docs + setup gate              | PM + FS               |    1.00 | 05-15 | 05-15 | █ ◆M0 |     |       |       |       |       |
| K1  | Message system                 | AG-S + AG-F           |    3.00 | 05-12 | 05-19 |   █   |  █  |       |       |       |       |
| K2  | Tool framework                 | AG-F                  |    1.00 | 05-12 | 05-18 |   █   |  █  |       |       |       |       |
| K3  | Multi-provider model           | AG-S + AG-F           |    3.00 | 05-13 | 05-20 |   █   |  █  |       |       |       |       |
| K4  | Run loop                       | AG-S + AG-F           |    4.00 | 05-20 | 05-22 |       |  █  |       |       |       |       |
| K5  | Streaming protocol             | AG-S                  |    2.00 | 05-13 | 05-22 |   █   |  █  |       |       |       |       |
| K6  | Test infrastructure            | AG-F                  |    2.00 | 05-13 | 05-20 |   █   |  █  |       |       |       |       |
| K7  | Kernel acceptance gate         | AG-S + AG-F           |    1.00 | 05-25 | 05-25 |       |     |  ◆M1  |       |       |       |
| W1  | Multi-tenant data              | FS                    |    4.00 | 05-18 | 05-21 |       |  █  |       |       |       |       |
| W2  | Tenant isolation runtime       | FS                    |    1.00 | 05-19 | 05-20 |       |  █  |       |       |       |       |
| W3  | API authentication             | FS                    |    2.00 | 05-22 | 05-25 |       |  █  |   █   |       |       |       |
| W4  | HTTP server foundation         | FS                    |    2.50 | 05-20 | 05-26 |       |  █  |   █   |       |       |       |
| W5  | Agent HTTP API                 | AG-S + AG-F           |    2.00 | 05-26 | 05-27 |       |     |   █   |       |       |       |
| W6  | TypeScript SDK                 | AG-F                  |    1.00 | 05-28 | 05-28 |       |     | █ ◆M2 |       |       |       |
| M1  | OAuth & token vault            | AG-S                  |    3.00 | 05-26 | 05-28 |       |     |   █   |       |       |       |
| M2  | Graph + Planner client         | AG-S + AG-F           |    4.50 | 05-28 | 06-03 |       |     |   █   | █ ◆M3 |       |       |
| T1  | Bot Framework protocol         | AG-S + AG-F + FS      |    9.00 | 06-01 | 06-05 |       |     |       |   █   |       |       |
| A1  | Agent module scaffold          | AG-F                  |    0.50 | 06-03 | 06-03 |       |     |       |   █   |       |       |
| A2  | Two-agent system               | AG-S + AG-F           |    1.50 | 06-03 | 06-04 |       |     |       |   █   |       |       |
| A4  | Response cards                 | AG-F                  |    1.00 | 06-05 | 06-05 |       |     |       |   █   |       |       |
| A5  | Teams handler + Coordinator    | AG-S                  |    1.25 | 06-05 | 06-08 |       |     |       |   █   |   █   |       |
| N1  | Planner READ                   | AG-F                  |    2.00 | 06-04 | 06-09 |       |     |       |   █   |   █   |       |
| N2  | Planner WRITE                  | AG-S                  |    2.25 | 06-04 | 06-10 |       |     |       |   █   |   █   |       |
| N3  | Planner ANALYSIS               | AG-S                  |    1.00 | 06-05 | 06-11 |       |     |       |   █   |   █   |       |
| N4  | FAQ + evaluation               | PM + AG-S + AG-F + QA |    2.75 | 06-08 | 06-11 |       |     |       |       |   █   |       |
| N5  | Performance optimization       | AG-F                  |    1.50 | 06-08 | 06-11 |       |     |       |       |   █   |       |
| N6  | Large-result handling          | AG-F                  |    2.00 | 06-08 | 06-12 |       |     |       |       |   █   |       |
| O1  | Per-tenant agent config        | FS + AG-F             |    1.75 | 06-01 | 06-09 |       |     |       |   █   |   █   |       |
| O2  | Supervisor pattern             | AG-S                  |    1.50 | 06-08 | 06-11 |       |     |       |       |   █   |       |
| O3  | Multi-agent orchestration      | AG-S + AG-F + PM      |    3.25 | 06-08 | 06-12 |       |     |       |       |   █   |       |
| O4  | Run lifecycle observability    | AG-F                  |    1.00 | 06-08 | 06-09 |       |     |       |       |   █   |       |
| Q1  | Test strategy                  | QA                    |    1.50 | 05-11 | 05-15 |   █   |     |       |       |       |       |
| Q2  | Test infrastructure            | QA                    |    4.00 | 05-18 | 05-26 |       |  █  |   █   |       |       |       |
| Q3  | Unit + integration + contract  | QA                    |    7.00 | 05-25 | 06-12 |       |     |   █   |   █   |   █   |       |
| Q4  | E2E test suite (10)            | QA + DO               |   13.00 | 06-08 | 06-12 |       |     |       |       | █ ◆M4 |       |
| Q5  | Manual milestone gates         | QA                    |    2.50 | 05-25 | 06-15 |       |     |   █   |   █   |   █   |   █   |
| Q6  | Operational quality            | QA                    |    2.00 | 05-18 | 06-18 |       |  █  |   █   |   █   |   █   |   █   |
| Q7  | Demo dry-runs                  | QA + PM               |    1.00 | 06-10 | 06-16 |       |     |       |       |   █   |   █   |
| D1  | AWS environment setup          | DO + PM               |    0.50 | 05-13 | 05-13 |   █   |     |       |       |       |       |
| D2  | Terraform + ECR                | DO                    |    1.50 | 05-14 | 06-09 |   █   |     |       |       |   █   |       |
| D3  | Data & secrets (RDS + KMS)     | DO + FS               |    2.00 | 06-09 | 06-10 |       |     |       |       |   █   |       |
| D4  | Compute & ingress              | DO                    |    1.00 | 06-10 | 06-11 |       |     |       |       |   █   |       |
| D5  | Deployment automation          | DO                    |    1.00 | 06-11 | 06-12 |       |     |       |       |   █   |       |
| D6  | External wiring                | FS                    |    0.75 | 06-12 | 06-12 |       |     |       |       |   █   |       |
| D7  | Acceptance & runbooks          | DO + QA + PM          |    2.00 | 06-12 | 06-15 |       |     |       |       |   █   | █ ◆M5 |
| H1  | Perf hardening + load smoke    | DO + QA               |    0.50 | 06-15 | 06-16 |       |     |       |       |       |   █   |
| H2  | OSS readiness + Legal sign-off | PM + FS + Legal       |    1.00 | 06-15 | 06-16 |       |     |       |       |       |   █   |
| H3  | Demo to stakeholders           | PM + QA + FS          |    2.50 | 06-15 | 06-18 |       |     |       |       |       |   █   |
| H4  | Documentation suite            | PM + FS               |    2.50 | 06-15 | 06-18 |       |     |       |       |       |   █   |
| H5  | Public flip + npm publish      | PM + FS               |    1.00 | 06-19 | 06-19 |       |     |       |       |       | █ ◆M6 |

---

## Sheet 5 — Resources Plan (weekly MM)

| Role           |    HC |       W1 |       W2 |       W3 |       W4 |       W5 |       W6 |   May MM |   Jun MM | TOTAL MM | TOTAL AI MM |
| -------------- | ----: | -------: | -------: | -------: | -------: | -------: | -------: | -------: | -------: | -------: | ----------: |
| PM             |     1 |     0.27 |     0.00 |     0.03 |     0.05 |     0.07 |     0.21 |     0.30 |     0.33 |     0.63 |        0.53 |
| Fullstack (FS) |     1 |     0.34 |     0.32 |     0.14 |     0.16 |     0.07 |     0.04 |     0.80 |     0.27 |     1.07 |        0.75 |
| AG-Senior      |     1 |     0.05 |     0.32 |     0.18 |     0.30 |     0.46 |     0.00 |     0.55 |     0.76 |     1.31 |        0.91 |
| AG-Fresher     |     1 |     0.05 |     0.23 |     0.16 |     0.32 |     0.27 |     0.00 |     0.44 |     0.59 |     1.03 |        0.77 |
| QA             |     1 |     0.07 |     0.16 |     0.18 |     0.18 |     0.50 |     0.30 |     0.41 |     0.98 |     1.39 |        1.15 |
| DevOps (DO)    |     1 |     0.16 |     0.00 |     0.00 |     0.00 |     0.25 |     0.07 |     0.16 |     0.32 |     0.42 |        0.29 |
| **TOTAL (MM)** | **6** | **0.94** | **1.03** | **0.69** | **1.01** | **1.62** | **0.62** | **2.66** | **3.25** | **5.85** |    **4.40** |

6 HC × 5/22 × 6 weeks ≈ **6.82 MM** capacity. Base 86% utilization; AI 64% utilization. W5 is crunch week — front-load Q2 to W2 and D1+D2 to W1 (already scheduled).

---

## Sheet 6 — Status Dashboard

### KPIs

| Total Capabilities | Total SP | Total Base MD | Total AI MD | Overall Progress % |
| -----------------: | -------: | ------------: | ----------: | -----------------: |
|                 50 |      401 |        130.40 |       97.22 |                 0% |

### Progress by Phase

| Phase     |   Caps |      SP |        PM |        FS |      AG-S |      AG-F |        QA |       DO |    Base MD |     AI MD |
| --------- | -----: | ------: | --------: | --------: | --------: | --------: | --------: | -------: | ---------: | --------: |
| R         |      4 |      23 |      5.60 |      0.30 |      0.60 |         0 |         0 |        0 |       6.50 |      5.85 |
| S         |      6 |      31 |      0.88 |      6.63 |         0 |         0 |         0 |     2.50 |      10.00 |      5.85 |
| K         |      7 |      53 |         0 |         0 |     10.00 |      6.00 |         0 |        0 |      16.00 |     10.40 |
| W         |      6 |      40 |         0 |      9.50 |      1.00 |      2.00 |         0 |        0 |      12.50 |      8.10 |
| M         |      2 |      23 |         0 |         0 |      5.25 |      2.25 |         0 |        0 |       7.50 |      4.88 |
| T         |      1 |      23 |         0 |      3.00 |      3.50 |      2.50 |         0 |        0 |       9.00 |      6.30 |
| A         |      4 |      10 |         0 |         0 |      2.25 |      2.00 |         0 |        0 |       4.25 |      2.83 |
| N         |      6 |      47 |      1.03 |         0 |      3.97 |      5.50 |      1.00 |        0 |      11.50 |      7.65 |
| O         |      4 |      27 |      0.50 |      1.00 |      3.50 |      2.50 |         0 |        0 |       7.50 |      5.30 |
| Q         |      7 |      80 |      0.50 |         0 |         0 |         0 |     29.50 |        0 |      30.00 |     24.00 |
| D         |      7 |      25 |      0.50 |      1.25 |         0 |         0 |      0.50 |     6.50 |       8.75 |      6.13 |
| H         |      5 |      22 |      4.75 |      1.75 |         0 |         0 |      0.75 |     0.25 |       7.50 |      5.43 |
| **TOTAL** | **50** | **401** | **13.75** | **23.43** | **30.47** | **22.75** | **31.75** | **9.25** | **130.40** | **97.22** |

> Note: v2.7 mitigation #1 moved N5.1+N5.2 (1.0 MD) from AG-S to AG-F. Per-phase view above reflects post-mitigation state.

### Top Risks (updated with CTO-grade concerns)

| #   | Risk                                                                                                    | Likelihood | Impact       | Mitigation                                                                                                                                                                                                           | Owner                 |
| --- | ------------------------------------------------------------------------------------------------------- | ---------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1   | **AG-Senior single point of failure** (resignation, illness, family emergency >3 days)                  | Med        | **Critical** | FS named as architectural backup (overlapping skillset). Trigger: AG-S unavailable >3 days → FS picks up K-phase critical path. Cross-pollinate via daily standups + pair-programming on K1.2, K4.1, M1.3, T1.7, O3. | PM                    |
| 2   | AG-Senior over capacity (98% post-mitigation)                                                           | Med        | High         | Pre-kickoff mitigations #1 + #3 applied. Weekly capacity check at Friday standup. If AG-S trends >85%, defer N3 (analysis) to P2.                                                                                    | PM                    |
| 3   | QA over capacity (94% post-mitigation)                                                                  | Med        | High         | DevOps absorbs Q4.7/Q4.8/Q4.9. If breached, Q4.7 (provider failover) goes nightly-only instead of every-PR.                                                                                                          | PM                    |
| 4   | **Microsoft Entra admin-consent friction** at Seta IT (often takes 2–4 weeks for new app permissions)   | High       | High         | PM kicks off Entra app registration paperwork **Week 0 (before kickoff)**. Fallback: dev tenant for M3 demo if prod consent delayed.                                                                                 | PM + Seta IT          |
| 5   | **MS Bot Framework / Graph API drift** mid-build                                                        | Med        | High         | Contract tests (Q3); ~1 day/quarter drift budget post-P1                                                                                                                                                             | AG-S                  |
| 6   | **LLM API cost overrun on staging** (eval runs + E2E loops)                                             | Med        | Med          | Recorded fixtures default; CloudWatch budget alert at $200/$400/$600 monthly thresholds; AG-F owns weekly cost review                                                                                                | DevOps + PM           |
| 7   | **Customer-data privacy review** for Planner data flowing through Anthropic/OpenAI                      | Med        | **High**     | Security + Legal review checkpoint at M3 (before Teams demo to stakeholders); zero-retention API agreements in place with both vendors; data-residency confirmation                                                  | PM + Security + Legal |
| 8   | **Legal review of OSS publishing** blocks H5 (license choice, IP assignment, dep license compatibility) | Med        | **High**     | H2 capability now explicitly includes Legal sign-off as blocker for H5. Engage Legal at M0 (Week 1) not at H2 (Week 6)                                                                                               | PM + Legal            |
| 9   | **AI assist savings don't materialize** for security/novel code                                         | Med        | Med          | Plan committed on Base MD (130.40) not AI MD. Weekly tracking of actual vs base; revert to base if AI savings <10% sustained                                                                                         | PM                    |
| 10  | **AWS RDS pgvector setup complexity**                                                                   | Low        | Med          | D3 spike-tested in W1 by DevOps; fallback to self-hosted Postgres on EC2 if RDS pgvector blocked                                                                                                                     | DevOps                |
| 11  | **Terraform state corruption** (state lock, accidental destroy)                                         | Low        | High         | Remote state in S3 + DynamoDB lock from D2; weekly state backup; no manual apply outside CI                                                                                                                          | DevOps                |
| 12  | **Multi-agent orchestration novel — first attempt risk**                                                | Med        | High         | R1 spike validates pattern; K7 hard gate; O3.7 macro deferred to P2                                                                                                                                                  | AG-S                  |
| 13  | **Scope creep mid-phase** (new "must-have" from stakeholders during P1)                                 | High       | Med          | Decision rights: PM can approve changes <2 MD without re-baseline; >2 MD requires CTO sign-off + scope swap from existing P1 items                                                                                   | PM + CTO              |
| 14  | **Hiring lead time for P2 Frontend** (recruiting takes 6–8 weeks)                                       | Med        | High         | Recruiting starts **Week 3 of P1** (2026-05-25), not after P1 ends. Job description finalized W2.                                                                                                                    | PM + HR               |
| 15  | **Design-partner customer not signed by M6+14** (blocks P2 business case)                               | Med        | High         | Sales team engaged Week 1; PM provides 1-pager deck for prospect conversations; 3 candidate accounts identified by M2                                                                                                | PM + Sales + CEO      |

---

## Sheet 7 — Cost & Commercials (P1–P4)

### 7.1 Headcount by phase

| Role                   | P1 (7w) | P2 (5w) | P3 (5w) | P4 (4w) |
| ---------------------- | :-----: | :-----: | :-----: | :-----: |
| PM                     |    1    |    1    |    1    |    1    |
| FS                     |    1    |    1    |    1    |    1    |
| AG-Senior              |    1    |    1    |    1    |    1    |
| AG-Fresher #1          |    1    |    1    |    1    |    1    |
| AG-Fresher #2          |    1    |    1    |    1    |    1    |
| QA                     |    1    |    1    |    1    |    1    |
| DevOps                 |    1    |    1    |    1    |    1    |
| Frontend (joins P2)    |    –    |    1    |    1    |    1    |
| AG-3 (joins P3)        |    –    |    –    |    1    |    1    |
| Frontend-2 (joins P3)  |    –    |    –    |    1    |    1    |
| SRE (joins P4)         |    –    |    –    |    –    |    1    |
| Security (joins P4)    |    –    |    –    |    –    |    1    |
| **HC total per phase** |  **7**  |  **8**  | **10**  | **12**  |

### 7.2 AWS infrastructure cost

| Phase            | Environment                                                                           | Monthly | Phase total |
| ---------------- | ------------------------------------------------------------------------------------- | ------: | ----------: |
| P1               | Staging (Fargate small, RDS db.t3.medium, ALB, NAT, ECR) + embedding ingestion bursts |     TBU |         TBU |
| P2               | Staging + Prod (Fargate HA, RDS Multi-AZ db.r6g.large, ALB×2, NAT×2)                  |     TBU |         TBU |
| P3               | + WAF, +CloudFront, +SES (email channel)                                              |     TBU |         TBU |
| P4               | + Multi-region (us-east-1 + us-west-2 active-active), +Aurora cluster                 |     TBU |         TBU |
| **AWS subtotal** |                                                                                       |         |     **TBU** |

### 7.3 LLM API budget (OpenAI + OpenAI-compatible providers)

| Phase            | Usage profile                                                                  | Monthly | Phase total |
| ---------------- | ------------------------------------------------------------------------------ | ------: | ----------: |
| P1               | Mostly recorded fixtures; embedding ingestion of Seta corpus; eval set + smoke |     TBU |         TBU |
| P2               | First prod tenant pilot; light traffic                                         |     TBU |         TBU |
| P3               | 3+ channels live; 2–5 paying tenants                                           |     TBU |         TBU |
| P4               | Scale phase; 10+ tenants                                                       |     TBU |         TBU |
| **LLM subtotal** |                                                                                |         |     **TBU** |

---

## Sheet 8 — Stakeholders, RACI & Communications Plan

### 8.1 Stakeholder map

| Stakeholder              | Role                                   | Interest | Influence | Engagement                                                      |
| ------------------------ | -------------------------------------- | -------- | --------- | --------------------------------------------------------------- |
| CEO                      | Sponsor (business outcome)             | High     | High      | Approve · Weekly summary · Gate reviews (M3, M6)                |
| CTO                      | Sponsor (technical)                    | High     | High      | Approve · Weekly · M0–M6 gate sign-off                          |
| PMO                      | Approver (program governance)          | High     | High      | Approve · Weekly status report · Risk register review bi-weekly |
| Head of Sales            | Consulted (design partner sourcing)    | High     | Med       | Inform · Bi-weekly · Owns BK-2                                  |
| Head of Customer Success | Consulted (rollout plan)               | Med      | Med       | Inform · Bi-weekly post-M3                                      |
| Head of Security         | Consulted (security review)            | Med      | High      | Approve at M3 gate + H2 OSS release · Owns Risk #7              |
| Head of Legal            | Consulted (OSS license, customer data) | Low      | High      | Approve H2 OSS release · Owns Risk #8                           |
| Head of Marketing        | Informed (OSS launch comms)            | Low      | Med       | Inform · M5 onwards · Owns BK-5                                 |
| Seta IT                  | Consulted (Entra admin consent)        | Low      | High      | Owns Risk #4 · Engage Week 0                                    |
| HR / Recruiting          | Consulted (P2 Frontend hiring)         | Low      | Med       | Owns Risk #14 · Engage W3 of P1                                 |
| Engineering org (wider)  | Informed                               | Low      | Low       | Inform · Bi-weekly tech-share session                           |
| Project team (6 HC)      | Responsible                            | High     | –         | Daily standup · Weekly retro                                    |

### 8.2 RACI for P1 phase gates

| Decision / Gate            | R (Responsible)  | A (Accountable) | C (Consulted)                   | I (Informed)                    |
| -------------------------- | ---------------- | --------------- | ------------------------------- | ------------------------------- |
| M0 Setup green             | PM + FS          | PM              | DevOps, AG-S, AG-F, QA          | CTO                             |
| M1 Kernel acceptance       | AG-S + AG-F      | PM              | QA, FS                          | CTO                             |
| M2 API end-to-end          | FS + AG-F        | PM              | QA, AG-S                        | CTO                             |
| M3 MS365 OAuth + Planner   | AG-S             | PM              | Security, Legal, Seta IT        | CEO, CTO                        |
| M4 Teams round-trip        | AG-S + AG-F + FS | PM              | QA, Security                    | CTO                             |
| M5 Staging deploy + 10 E2E | DevOps + QA      | PM              | All team                        | CEO, CTO, PMO                   |
| M6 P1 public release       | PM + FS          | PM              | Legal (H2), Security, Marketing | CEO, CTO, PMO, all stakeholders |
| P2 go/no-go                | PM               | CEO + CTO       | PMO, Sales (BK-2), Security     | All stakeholders                |

### 8.3 Communications cadence

| What                         | Audience                        | Frequency        | Format                              | Owner          |
| ---------------------------- | ------------------------------- | ---------------- | ----------------------------------- | -------------- |
| Daily standup                | Project team                    | Daily, 9:30 AM   | 15 min sync                         | PM             |
| Weekly status report         | CEO, CTO, PMO                   | Friday EOD       | 1-page email: progress, risks, asks | PM             |
| Bi-weekly stakeholder update | All stakeholders                | Every 2nd Friday | 30-min meeting + slide deck         | PM             |
| Risk register review         | PM + CTO                        | Bi-weekly        | 30 min, walks Sheet 6 risks         | PM             |
| Tech-share session           | Engineering org (wider)         | Bi-weekly        | 30 min open-invite demo             | AG-S           |
| Sales enablement             | Sales team                      | M2, M4, M6       | Demo + Q&A                          | PM + Sales     |
| Stakeholder demo             | CEO, CTO, PMO, all stakeholders | M6 (2026-06-19)  | 60 min + recording                  | PM + QA + AG-S |
| Postmortem                   | PM + team                       | M6+7 days        | Retrospective document              | PM             |

### 8.4 Decision rights (avoid mid-phase paralysis)

| Decision class                                       | Approver                 | Examples                             |
| ---------------------------------------------------- | ------------------------ | ------------------------------------ |
| Scope change <2 MD or trivial (renaming, file moves) | PM                       | Reassign a task between team members |
| Scope change 2–5 MD or swap of equal MD              | PM with CTO informed     | Defer N3.3 in exchange for N7.1      |
| Scope change >5 MD or affecting milestones           | CTO with PMO informed    | Defer entire sub-capability to P2    |
| Headcount change                                     | CEO + CTO                | Add/remove team member               |
| Tech stack change (e.g., AWS → GCP)                  | CTO with PMO informed    | Material framework swap              |
| Budget overrun >10%                                  | CEO + CTO + CFO          | Anything pushing P1 past $137k       |
| Public communication (OSS launch, blog)              | PM with Marketing review | M6 announcement                      |

### 8.5 Change management for Seta employees (post-M6)

| Audience                | Action                                                    | Owner          | When       |
| ----------------------- | --------------------------------------------------------- | -------------- | ---------- |
| First pilot team (BK-1) | Onboarding session + Teams app install + feedback channel | PM + CSM       | M6+7 days  |
| Wider engineering       | Tech-share on architecture + how to add new modules       | AG-S           | M6+14 days |
| All Seta employees      | Optional: company-wide demo + opt-in for early access     | PM + Marketing | M6+30 days |
| Sales team              | Sales-enablement deck + 2-min product video               | PM + Marketing | M6         |

---

## §9a — Multi-Phase Roadmap (P1 → P4 narrative)

| Phase     | Window                | Theme                                        | Headline deliverable                                                                                       |          $ | Production Status              |
| --------- | --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------: | ------------------------------ |
| **P1**    | 6 wks · 05-11 → 06-19 | **MVP on AWS staging**                       | Working agent in Teams; 10 E2E green; OSS published                                                        |      $125k | Staging only                   |
| **P2**    | 6 wks · 06-22 → 07-31 | **Production cutover**                       | Prod env (multi-AZ); inbound SSO; basic Studio UI; first design-partner tenant live                        |      $167k | **🟢 First production deploy** |
| **P3**    | 5 wks · 08-03 → 09-04 | **Channels + commercial + memory**           | Slack/Email channels; semantic-recall memory; metering + billing integration (vendor TBD); workflow engine |      $209k | Multi-channel prod             |
| **P4**    | 4 wks · 09-07 → 10-02 | **Scale + Knowledge Graph + security audit** | Multi-region active-active; Knowledge Graph; SOC 2 Type I prep; 3rd-party security audit                   |      $228k | **🟢 Enterprise-grade prod**   |
| **TOTAL** | **20 wks**            | **Zero → enterprise agent platform**         | All industry-standard features at production quality                                                       | **~$729k** | Full production-ready          |

### Production-Ready Definition (cumulative from end of P2)

| Pillar            | Standard                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Availability      | 99.9% SLA with documented incident response runbook                                                                                   |
| Disaster Recovery | RDS automated snapshots + WAL retention; cross-region replica P4; quarterly restore drill                                             |
| Security          | SOC 2 in-progress (P4); annual 3rd-party security audit; quarterly secret rotation; encryption at rest + in transit; KMS-wrapped DEKs |
| Observability     | OTel distributed tracing → CloudWatch + X-Ray; SLI/SLO dashboards; alerting                                                           |
| Compliance        | Append-only audit log per tenant; GDPR delete; data-residency options                                                                 |
| Commercial        | Metering enforced; per-tenant quotas; billing integration (vendor TBD); usage dashboard                                               |
| Scale             | Load-tested; horizontal scale validated; multi-region active-active by P4                                                             |
| Operations        | On-call rotation; top-10 incident runbooks; postmortem template                                                                       |

### Per-Phase Acceptance Gates

| Gate                          | At end of  | Pass criteria                                                                                                                                     |
| ----------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 Gate                       | 2026-06-19 | All Sheet 2 deliverables shown · 10 E2E green · BK-1 baseline measured · BK-2 design-partner LOI in flight · OSS public · npm publish live        |
| **Production Cutover**        | 2026-07-31 | Prod AWS env serving traffic · SLOs defined · Studio MVP usable · first design-partner tenant live and using it weekly · runbooks approved by ops |
| P3 Gate                       | 2026-09-04 | 3+ channels live in prod · billing live for 1+ tenant · workflow engine demonstrated · RAG-powered Q&A working · Python SDK on PyPI               |
| **Production-Ready Complete** | 2026-10-02 | Multi-region failover drill green · SOC 2 Type I evidence complete · security audit report clean · Knowledge Graph Q&A demonstrated               |

### Hiring Plan

| Phase | HC  | Add                            | Recruiting kickoff                                 |
| ----- | --- | ------------------------------ | -------------------------------------------------- |
| P1    | 6   | –                              | –                                                  |
| P2    | 7   | +1 Frontend (Studio)           | **Week 3 of P1** (2026-05-25) — 6–8 week lead time |
| P3    | 9   | +1 AG specialist + +1 Frontend | Week 1 of P2 (2026-06-22)                          |
| P4    | 11  | +1 SRE + +1 Security           | Week 1 of P3 (2026-08-03)                          |

## §9b — P2 Detailed Plan (preview)

P2 is scoped narrower than initially proposed (was 4 weeks, now 6 weeks) per Senior PM review — original P2 scope was 12+ weeks of work compressed into 4. Realistic P2:

| Sub-phase | Capability                                                                  | Effort (est MD) | Owner                                                                          |
| --------- | --------------------------------------------------------------------------- | --------------: | ------------------------------------------------------------------------------ |
| P2-A      | Production AWS environment (multi-AZ, prod-grade RDS, prod Secrets Manager) |              10 | DevOps                                                                         |
| P2-B      | Inbound SSO (Entra OIDC + Google OIDC)                                      |              12 | FS + AG-S                                                                      |
| P2-C      | Studio web UI MVP (agent list, config viewer, basic chat playground)        |              18 | Frontend (new HC) + FS                                                         |
| P2-D      | Audit log domain + GDPR delete capability                                   |               8 | FS                                                                             |
| P2-E      | Prod secret rotation automation                                             |               4 | DevOps                                                                         |
| P2-F      | CloudWatch SLO dashboards + alerting                                        |               5 | DevOps                                                                         |
| P2-G      | First design-partner onboarding (Entra consent, key issuance, training)     |               6 | PM + Sales + CSM                                                               |
| P2-H      | P2 hardening + demo + P3 plan                                               |               8 | PM + QA + all                                                                  |
| Subtotal  | **8 sub-phases**                                                            |      **~71 MD** | 7 HC × 6 wks = 210 MD capacity (34% util — comfortable for first prod cutover) |

**Deferred to P3** (was originally P2): RAG primitives, memory tiers — these are non-trivial features that deserve dedicated focus, not squeezed into prod-cutover phase.

---


## §10 — Pre-Kickoff Approval Checklist

Before this plan is approved and the project kicks off Monday 2026-05-11, the following must be true:

| #   | Item                                                           | Owner         | Status  |
| --- | -------------------------------------------------------------- | ------------- | ------- |
| 1   | Business case (§0) reviewed by CEO                             | CEO           | Pending |
| 2   | Total $ envelope (~$715k) approved by CFO                      | CFO           | Pending |
| 3   | P1 commit (~$125k + 6 HC × 6 wks opportunity cost) signed off  | CEO + CTO     | Pending |
| 4   | All 6 P1 team members confirmed available 100% from 2026-05-11 | CTO + HR      | Pending |
| 5   | Entra admin consent paperwork initiated with Seta IT           | PM + Seta IT  | Pending |
| 6   | Sales team briefed on BK-2 (design partner LOI by M6+14)       | PM + Sales    | Pending |
| 7   | Legal engaged for OSS license review (H2 prep)                 | PM + Legal    | Pending |
| 8   | Security briefed on customer-data review (M3 checkpoint)       | PM + Security | Pending |
| 9   | P2 Frontend recruiting brief drafted (kickoff W3 of P1)        | PM + HR       | Pending |
| 10  | This plan v2.7 (or successor) signed by CEO, CTO, PMO          | All           | Pending |

---
