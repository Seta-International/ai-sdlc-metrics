# Seta Agent Foundation — Project Plan

> **Plan revision: 2026-05-12 — compression rewrite.** This document supersedes plan v2.7. The previous plan budgeted 7 FTE × 7 weeks (35 working days) ending 2026-06-26. The current plan is sized for **3.5 FTE × ~14 working days** ending **2026-05-31**, with two **new** P1 platform packages added on top (`@seta/agent-memory`, `@seta/agent-workflows`). The math does not balance — see §0.5. The sponsor decisions in §11 must be answered before kickoff for this plan to be more than a best-effort document.

---

## §0 — Business Case (read this first)

### The problem

Seta's SaaS ERP customers spend significant time on routine coordination work inside the product — looking up status, summarizing across plans, assigning follow-ups, building progress reports. Today this work is manual. Customers expect agent-native experiences in 2026; enterprise buyers now ask "what's your AI strategy?" in every RFP. Competitors (Microsoft Copilot Studio, Salesforce Agentforce, ServiceNow Now Assist) shipped first-generation agent surfaces 12–18 months ago.

### Why now, and cost of inaction

LLM costs have dropped ~10× in 18 months; multi-tenant agent patterns have matured. The 12-month window to establish agent-native positioning closes mid-2026. If we wait until late 2026 to start, we ship in 2027 against competitors who will have second-generation systems. **Cost of inaction**: pricing pressure on existing ERP renewals (customers ask "why no AI?"), lost expansion revenue, and a structural gap that takes 2+ years to close.

### Compression note — strategic risk under the revised P1

The original plan delivered a wide P1 surface (3 specialist agents, RAG, inbound SSO web, Studio prep, OSS public flip, AWS staging) in 7 weeks with 7 FTE. The revised plan delivers **one specialist agent (Planner only) plus the kernel + memory + minimal workflow engine** in ~3 weeks with 3.5 FTE. This is a **deliberate de-scoping to ship something credible** within the new deadline — not a quality compromise on what does ship. The capability bar for "agent-native positioning" in RFPs slips: at 2026-05-31 we have an internal demo, not a public OSS release with a design-partner customer. The BK-2 (design-partner LOI) and BK-5 (OSS traction) KPIs from v2.7 are not achievable on this timeline and are deferred to a P1.5 increment (see §0.5).

### The thesis (how this pays back) — unchanged

| Lever                  | Mechanism                                                                                | Time-to-value             |
| ---------------------- | ---------------------------------------------------------------------------------------- | ------------------------- |
| Higher ARPU            | Agent capability sold as add-on or premium tier                                          | P3 (commercial readiness) |
| Lower churn            | Stickier daily-active workflow tied to ERP data                                          | P2 (first prod tenant)    |
| Faster module delivery | Agent + tools pattern reusable; future ERP domains land in ~3 weeks vs ~6 (proven by P1) | P2 onwards                |
| Sales positioning      | "Agent-native" answer in every RFP from M6 onward                                        | Post-P1.5 (was P1)        |
| OSS lead generation    | `@seta/agent-core` public attracts developer awareness, recruiting funnel                | Post-P1.5 (was P1)        |

### The "do nothing" alternative — unchanged

Adopt an off-the-shelf agent platform (e.g., Microsoft Copilot Studio embedded in Teams). Reviewed and rejected — captured in ADR-0009 (Build vs. Buy).

### What success looks like (revised business KPIs)

The v2.7 KPI table (BK-1 to BK-6) assumed a public OSS launch and a design-partner LOI inside P1. Neither is achievable on the 2026-05-31 deadline with 3.5 FTE. The revised KPI bar for the compressed P1:

| #     | Business KPI                                                          | Target (revised)                                                                          | Measured by                       | Owner    |
| ----- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- | -------- |
| BK-1  | Internal demo green to CTO+CEO on staging-equivalent (dev compose ok) | One live end-to-end demo: Planner READ + WRITE through Teams against MS Graph             | Live demo + recording             | PM + CTO |
| BK-3  | Token cost per agent run in demo                                      | Average < $0.10/run on demo set (relaxed from $0.05 — fewer fixtures, more live calls)    | Per-run usage log                 | AG-S     |
| BK-4  | End-to-end latency for "summarize my tasks"                           | p95 < 6 s on demo loop (relaxed from 4 s — no perf hardening pass in P1)                  | Synthetic check in smoke suite    | AG-S     |
| BK-6  | Internal feasibility evidence for sponsor decision on P1.5 / P2 scope | Sponsor reviews demo + capacity actuals on 2026-06-01 and approves next-increment scope   | Decision memo                     | PM       |
| BK-2  | **DEFERRED to P1.5** — design-partner LOI                             | Not achievable inside 14 working days; sales engagement runs in parallel                  | —                                 | —        |
| BK-5  | **DEFERRED to P1.5** — OSS traction                                   | Public flip removed from P1 scope                                                         | —                                 | —        |

These revised KPIs determine whether **P1.5** (a follow-on increment between this P1 and the original P2) is approved.

---

## §0.5 — Constraint reality check (read second)

Before any rosy framing, the honest capacity math:

### The math

| Item                                | Original plan (v2.7)        | Revised constraints (2026-05-12) |
| ----------------------------------- | --------------------------- | -------------------------------- |
| Headcount                           | 7 FTE                       | **3.5 FTE**                      |
| Working days (kickoff → deadline)   | 35 (2026-05-11 → 2026-06-26) | **~14 (2026-05-12 → 2026-05-31)** |
| Person-days of capacity (raw)       | 245 person-days             | **49 person-days**               |
| Capacity ratio vs. original         | 100%                        | **~20% (one-fifth)**             |
| Scope (capabilities counted)        | 62 capabilities             | 62 + **`@seta/agent-memory`** + **`@seta/agent-workflows`** (new P1 packages) |
| Scope delta                         | baseline                    | **larger** (two new platform packages added) |

The revised budget is **one-fifth of the original** and the scope is **larger**. The original plan budgeted 154.90 base MD against 245 days of supply (63% utilisation, healthy). The revised plan would need to deliver an equivalent or larger surface in 49 person-days — i.e., a **>3× compression of work-per-person-day**. That is not achievable. The team composition also removes the dedicated PM, QA, and DevOps headcount that v2.7 budgeted at 35 MD each.

### Team composition (revised)

| Role                       | FTE  | Notes                                                                                                  |
| -------------------------- | ---: | ------------------------------------------------------------------------------------------------------ |
| Senior AI (AG-S)           | 1.0  | 2 × 0.5 split — must operate as a single owner for the kernel + memory + workflow architecture         |
| Fresher AI (AG-F1, AG-F2)  | 2.0  | Two heads; supervised pattern-following work only — kernel run loop internals are off-limits for them  |
| Full-stack (FS)            | 0.5  | Owns `apps/api` composition, OAuth gaps, env / OTel wiring, smoke harness                              |
| **TOTAL**                  | **3.5** | **No dedicated PM, QA, or DevOps headcount.** See doubling-up note below.                          |

**Doubling-up note (no dedicated PM/QA/DevOps):**
- **PM duties** absorbed by AG-S (tech lead + plan owner + ADR author) with the FS as backup for cadence + status reporting.
- **QA duties** absorbed by the freshers — co-located unit + integration tests inside each package they ship; no separate Q-phase.
- **DevOps duties** absorbed by FS — docker compose for the demo environment, smoke script, GitHub Actions check that runs `pnpm typecheck && pnpm test:unit`. **No AWS staging deployment in P1** (see §1 Sheet 1).

This doubling-up is feasible for ~3 weeks; it is **not sustainable past P1**. P2 must restore at least dedicated DevOps and QA.

### Options (honest)

| #  | Option                                  | Description                                                                                                                       | Tradeoff                                                                                       | Recommendation |
| -- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------- |
| A  | **Hold scope, slip deadline**           | Keep something close to v2.7 scope; push deadline to mid-July 2026 to match the 3.5-FTE rate (~50 working days)                   | Misses sponsor-imposed 2026-05-31 date. Risks the "agent-native by mid-2026" positioning.      | Not chosen     |
| B  | **Hold deadline + scope, expand team**  | Bring 2 senior AI back to 1.0 each and add a dedicated FS or DevOps; restore ~5 FTE                                              | Requires hiring / re-allocation in <2 weeks. Likely infeasible; raises burn.                   | Not chosen     |
| C  | **Hold deadline, hard-cut scope** (recommended)  | Ship a credible, demonstrable kernel + Planner-only agent + memory + minimal workflow in Teams, against MS Graph, on dev machine. Everything else → P1.5 or P2. | KPIs BK-2 (LOI) and BK-5 (OSS) slip. Internal demo only — no public release.                  | **Recommended** |

The PM (acting AG-S) recommends **Option C**: it is the only option that keeps the deadline without manufacturing impossible velocity. The "what we drop" list is in §6 below. The sponsor must affirmatively accept Option C — questions in §11.

### What does fit in 49 person-days

A defensible 49-PD plan can cover, roughly:
- **AG-S (14 PD):** kernel architecture + run loop + streaming SSE + memory provider implementation + workflow DSL + write-tool safety (preview/commit). 100% utilisation, zero slack.
- **AG-F1 (14 PD):** Planner READ tools (list/search/get); model adapter implementation (OpenAI primary); LLM record/replay testkit; Teams JWT verifier with AG-S review.
- **AG-F2 (14 PD):** Planner WRITE tools (create/update with preview/commit + HMAC continuations); Graph client (`platform/ms-graph`) + MS365 Planner connector client; fixture recordings; unit tests.
- **FS (7 PD):** `apps/api/src/main.ts` wiring (mount kernel + memory + workflows + Planner product + Teams channel); OAuth completion (token vault read/write wiring for delegated flow); env + OTel boot; docker compose; smoke script.

This is tight even after cutting Analytics, FAQ, RAG, SSO web, Studio, AWS, and OSS. Any single rework cycle (kernel API change, streaming protocol redesign, MSAL OBO refresh edge case) consumes 10–20% of the buffer-free budget.

---

## Sheet 1 — Executive Summary

### 1. Project Information

| Field            | Value                                                                                          | Field            | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| Project Manager  | Canh Ta (acting; doubles as AG-S tech lead)                                                    | Sponsor          | Seta International (CEO + CTO)                                         |
| P1 Start         | 2026-05-12                                                                                     | P1 Target End    | **2026-05-31** (hard sponsor-imposed)                                  |
| Project Code     | SETA-OS-P1                                                                                     | Convention       | 1 SP ≈ 0.5 ideal PD                                                    |
| P1 Working Days  | **~14 (Mon–Fri, 05-12 → 05-29; final 2 days 05-30/05-31 are weekend — demo lands Friday 05-29)** | Headcount        | **3.5 FTE** (1.0 AG-S · 2.0 AG-F · 0.5 FS — no PM/QA/DevOps headcount) |
| Deploy target    | **Dev docker compose only** — AWS staging via Terraform deferred to P1.5/P2                    | SP scale         | Fibonacci (1, 2, 3, 5, 8, 13)                                          |
| AI assist        | Claude Code — **upside only, not committed in budget**                                         | Plan revision    | v3.0 (compression rewrite, 2026-05-12)                                 |

### 2. The one-paragraph version (90-second CEO read)

> Build a slim, multi-tenant agent foundation in TypeScript on top of the Epic-1 auth/oauth/audit foundation already shipped. **P1 (3 weeks, 3.5 FTE)** delivers a **single Planner specialist agent** in Microsoft Teams that reads from and writes to Microsoft Planner with confirmation-on-write safety; a minimum-viable **agent kernel** (`@seta/agent-core`: model router with OpenAI primary, run loop, streaming SSE, tool framework); the two newly-mandated P1 platform packages — **`@seta/agent-memory`** (real `MemoryProvider`, per-thread conversation persistence) and **`@seta/agent-workflows`** (linear `.then()` / `.parallel()` DAG with Postgres advisory-lock suspend/resume, in-process p-queue runner); and a 4-test smoke harness. **Analytics Agent, Seta FAQ Agent, the entire RAG track, inbound SSO web UI, Studio web app, AWS staging deployment, and the OSS public flip are deferred** to a P1.5 increment (the items most plausibly recoverable in 2–3 follow-on weeks) or to P2. The demo on 2026-05-29 is internal-only, on a dev machine via docker compose. See §6 for the explicit drop list and §11 for sponsor decisions required to confirm this scope.

### 3. P1 Strategic Objectives (revised — 6 objectives)

| #   | Objective                                                            | What it means in plain terms                                                                                                            |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **One specialist agent (Planner) live in Microsoft Teams**           | A Planner Agent reachable in Teams that reads tasks and writes safely (preview → confirm → commit).                                     |
| 2   | **Agent kernel that other modules can build on**                     | `@seta/agent-core` provides model adapter, run loop, tool contract, streaming protocol — frozen enough that P1.5/P2 don't re-architect. |
| 3   | **Memory persistence (P1 override)**                                 | `@seta/agent-memory` persists conversation history + working-memory scratchpad in Postgres; multi-turn feels coherent.                  |
| 4   | **Minimal workflow engine (P1 override)**                            | `@seta/agent-workflows` supports linear DAG (`.then()` / `.parallel()`) with suspend/resume; covers multi-step approvals for P1.5 use.  |
| 5   | **Multi-tenant from day one**                                        | All agent state (memory, workflow snapshots, tool continuations) carries `tenant_id` and runs under RLS via the existing Epic-1 seam.   |
| 6   | **4-test smoke suite green in CI**                                   | (i) kernel run loop streams text; (ii) Planner READ via Teams; (iii) Planner WRITE preview/commit; (iv) workflow suspend/resume.        |

### 4. Release Roadmap (revised — 2.5 weeks Mon–Fri working)

`█` = active. ◆ = milestone. Calendar dates Mon–Fri; weekends omitted.

| Phase / Stream                                  | W1 (05-12 → 05-15, 4d)                       | W2 (05-18 → 05-22, 5d)            | W3 (05-25 → 05-29, 5d)                          |
| ----------------------------------------------- | -------------------------------------------- | --------------------------------- | ----------------------------------------------- |
| **K — `@seta/agent-core` kernel**                 | █ AG-S: model adapter, ModelStream, run loop scaffold; AG-F1 testkit | █ AG-S: streaming SSE + tool exec; AG-F1: OpenAI adapter primary | ◆ K-gate 05-26                            |
| **MEM — `@seta/agent-memory` (P1 override)**     | █ AG-S: schema design, migration, provider class scaffold | █ AG-S: recall/saveTurn/working-memory impl + integration test | ◆ MEM-gate 05-27 (bound in apps/api)     |
| **WF — `@seta/agent-workflows` (P1 override)**   |                                              | █ AG-S: schema + DSL `.then()`/`.parallel()`; advisory-lock resume | █ AG-S: integration test + smoke wiring; ◆ WF-gate 05-28 |
| **MS — `platform/ms-graph` + Planner connector** | █ AG-F2: Graph client (auth+pagination+retry) | █ AG-F2: Planner read endpoints + fixtures | █ AG-F2: Planner write endpoints + cache/etag |
| **PRD — `modules/products/agent` (Planner only)** |                                              | █ AG-F1: Planner READ tools (list, get, search) | █ AG-F1/AG-S: Planner WRITE tools (preview/commit) + Coordinator-less direct binding |
| **CH — `modules/channels/teams`**                | █ FS: manifest + bot-token reply skeleton    | █ FS+AG-F1: JWT/JWKS verify; OBO refresh via existing oauth vault | █ FS: handler binds Planner product; ◆ CH-gate 05-28 |
| **WRP — `apps/api/src/main.ts` composition**     | █ FS: env + OTel boot; mount placeholders    | █ FS: mount kernel + memory + workflows; bind real providers | █ FS: smoke compose + 4-test smoke suite |
| **Demo + handover**                              |                                              |                                   | █ AG-S+FS: 5-min recorded demo; ◆ M6 2026-05-29 (Fri); 05-30/05-31 weekend buffer |
| **Milestones**                                   |                                              | M-K Kernel (05-22)                | M-MEM (05-27) · M-WF (05-28) · M-CH (05-28) · **M6 Demo (05-29)** |

**Note on the deadline:** 2026-05-31 is a Sunday. The last working day is Friday 2026-05-29. M6 lands on Friday; 05-30 and 05-31 are buffer-only.

### 5. Key Milestones (revised)

| #     | Milestone                                                                      | Phase          | Target Date | Working days from kickoff | Gate                                                                                        |
| ----- | ------------------------------------------------------------------------------ | -------------- | ----------- | ------------------------: | ------------------------------------------------------------------------------------------- |
| M-K   | `@seta/agent-core` kernel green — run loop streams text + one tool call works  | K              | 2026-05-22  |                         9 | Unit smoke + integration replay test                                                        |
| M-MEM | `@seta/agent-memory` provider bound in `apps/api/src/main.ts` (not Null)       | MEM            | 2026-05-27  |                        12 | Real provider returns persisted turns; integration test green                               |
| M-WF  | `@seta/agent-workflows` smoke — `.then(a).parallel([b,c])` suspends and resumes | WF             | 2026-05-28  |                        13 | Advisory-lock contention test green; suspend snapshot persisted; resume returns same output |
| M-CH  | Teams round-trip in dev tunnel — Planner READ end-to-end                       | CH+PRD         | 2026-05-28  |                        13 | Live Teams message → SSE stream back → Adaptive Card with task list                         |
| **M6** | **Internal demo + recording — Planner READ + WRITE + memory + workflow**     | Demo           | **2026-05-29** |                       14 | 5-min recording on dev compose; CTO/CEO review next business day                            |

### 6. What is explicitly NOT in this P1 (the drop list)

Each row names what's gone and why. **All of these were present in v2.7.** Sponsor visibility is the point of this table.

| Dropped item                                                  | From v2.7 phase | Reason for drop in revised P1                                | Where it lands       |
| ------------------------------------------------------------- | --------------- | ------------------------------------------------------------ | -------------------- |
| **Analytics Agent** (workload-by-assignee, overdue analysis)  | A2 / N3         | Budget compression — second agent doesn't fit in 14 working days | P1.5 if time permits |
| **Seta FAQ Agent**                                            | A6              | Depends on RAG track which is fully P2                       | P2                   |
| **Multi-agent Coordinator + handoff** (subAgentTool, registry)| O3              | Single agent (Planner) only — no dispatch needed in P1       | P1.5 / P2            |
| **Supervisor pattern** (scorer + retry-on-fail)               | O2              | Quality net deferred; single-agent + smoke is the safety bar | P2                   |
| **Per-tenant agent config** (override prompt/tools/model)     | O1              | Static config in code for P1                                 | P2                   |
| **Visualization-first responses** (bar/line/pie chart cards)  | A4              | P1 uses text + simple table Adaptive Cards only              | P1.5 / P2            |
| **Entire RAG track** — chunking / embeddings / vector / rag   | X1–X6           | Already P2-deferred per setup.md §6 — confirmed not P1       | P2                   |
| **RAG data survey (X0.1–X0.3)**                               | X0              | No P1 consumer once FAQ Agent is dropped                     | P2                   |
| **Inbound SSO web UI** (Entra OIDC + Google OIDC)             | Z1              | Teams SSO (OBO) is the only inbound auth in P1               | P1.5 / P2            |
| **Studio web app**                                            | (P2 originally) | Frontend role not on team                                    | P2                   |
| **OSS public flip + npm publish + Legal sign-off**            | H2, H5          | Repo stays private; Legal review removed from P1 critical path | P1.5 / P2            |
| **Public-facing AWS staging via Terraform**                   | D1–D7           | Dev docker compose only; no DevOps headcount                 | P1.5 / P2            |
| **12 → 4 E2E tests**                                          | Q4              | 4 smoke tests inline, owned by freshers; no dedicated QA     | P1.5 expands         |
| **30-query eval set + replay harness**                        | N4              | LLM record/replay testkit lands but no curated eval set      | P1.5 / P2            |
| **Sentry / CloudWatch dashboards / cost alerts**              | D / H1          | OTel local Jaeger only; no cloud sinks                       | P2                   |
| **Demo dry-runs (internal + stakeholder rehearsal)**          | Q7              | Single 5-min recording on 2026-05-29                         | —                    |
| **Documentation suite (README polish, cookbook, ADRs 1–10)**  | H4              | Only ADRs for irreversible decisions land in P1              | P1.5                 |
| **Working roadmap milestones M0, M1, M2, M3, M4, M5, M5b, M5c** | (v2.7 set)    | Replaced by M-K / M-MEM / M-WF / M-CH / M6                   | —                    |

### 7. Day-1 executable work — 2026-05-12 (Tue)

| Role  | Day-1 task                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| AG-S  | Create `@seta/agent-core` package via `pnpm new:package`; commit `ModelAdapter` + `KernelChunk` types + `ModelStream<T>` interface; ADR-0010 (kernel boundary). |
| AG-F1 | Create `@seta/agent-core/testkit` shape; implement `setupLLMRecording({name})` via msw — needed by every other test from W2 onward. |
| AG-F2 | Fill in missing files in `modules/connectors/ms365-planner/` per its SCOPE.md "Missing vs setup.md §11": `client.ts`, `cache.ts`, `etag.ts`, `schema.ts`, `drizzle.config.ts`, `migrations/`. Start with `schema.ts` + first migration. |
| FS    | Audit `apps/api/src/main.ts` and `env.ts` for the env vars listed in `apps/api/SCOPE.md`; wire OTel boot per CLAUDE.md footgun (start via `node --import ./instrumentation.ts`); commit docker compose with Postgres + pgvector + Jaeger. |

---

## Sheet 2 — What the sponsor will see at M6 demo (revised)

### 2.1 Live demo flow (5 minutes, recorded on 2026-05-29)

| #  | What you see                                                                                  | Where                | Why it matters                                                                       |
| -- | --------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| 1  | Open Microsoft Teams (dev tunnel via `ngrok`), type "Summarize my open Planner tasks"         | Teams desktop        | Real Teams round-trip; not slideware                                                 |
| 2  | Streaming response renders word-by-word                                                       | Teams chat           | Kernel + SSE protocol works end-to-end                                               |
| 3  | Receive a simple Adaptive Card with a task list (no charts in P1)                             | Teams chat           | Real Planner data through MS Graph                                                   |
| 4  | Type a follow-up referring to the prior turn ("Which of those are due this week?")            | Teams chat           | `@seta/agent-memory` persisted the prior turn; recall returns prior context          |
| 5  | Type "Create a task in plan X called Y"                                                       | Teams chat           | WRITE path with preview/commit safety                                                |
| 6  | Agent returns a **preview card** with confirmation buttons                                    | Teams chat           | `write_continuations` HMAC-protected preview/commit gate                             |
| 7  | User confirms; agent commits; new task appears in Microsoft Planner                           | Teams chat + Planner | Write reflects in real MS Planner immediately                                        |
| 8  | (Optional, time permitting) Demonstrate a 2-step workflow via dev shell — kick off `wf.run()` + show resume after suspend | Terminal             | Proves `@seta/agent-workflows` minimum surface; no UI for it yet                     |

> **Removed from v2.7 demo:** the "who is overloaded" workload chart, the multi-agent coordinator dispatch (Planner → Analytics), the live AWS staging URL, the GitHub Actions public CI badge, the npm registry packages, the CloudWatch dashboard, the Terraform plan, the restore drill, the 30-query eval, the cost-to-date dashboard.

### 2.2 Tangible deliverables (revised)

| # | Artifact                                              | Where it lives                                                                                             |
| - | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1 | Recorded 5-min demo                                   | `docs/demos/2026-05-29-p1-demo.mp4` in repo                                                                |
| 2 | Repo at green CI on `main`                            | `pnpm typecheck && pnpm lint && pnpm test:unit` green; 4-test smoke green                                  |
| 3 | New packages: `@seta/agent-core`, `@seta/agent-memory`, `@seta/agent-workflows` | All three with real code, migrations, integration tests                                |
| 4 | ADR-0010 (kernel boundary), ADR-0011 (workflow minimum-viable surface), ADR-0012 (memory implementation home) | `docs/adr/`                                              |
| 5 | Decision memo for sponsor (P1.5 / P2 scoping)         | `docs/plans/2026-05-31-p1-outcome.md`                                                                      |
| 6 | Dev docker compose                                    | `pnpm db:up && pnpm dev` reproduces the demo                                                               |

### 2.3 What is explicitly NOT in the P1 demo

Already enumerated in §6 (drop list). Repeating the highest-impact items: no AWS staging URL, no public repo, no npm packages, no Analytics agent, no FAQ agent, no charts, no SSO web login, no Studio, no eval set.

---

## Sheet 3 — Stream / package breakdown with SP estimates

The original Sheet 3 listed 62 capabilities at 154.90 base MD. The revised plan groups work by **package** because the team is too small to coordinate at capability granularity.

| Stream                          | Owner(s)        | Packages touched                                              | SP (Fib) | PD est. | Capacity budget                            |
| ------------------------------- | --------------- | ------------------------------------------------------------- | -------: | ------: | ------------------------------------------ |
| K — Kernel (`@seta/agent-core`) | AG-S + AG-F1    | `platform/agent/core`                                         |       21 |    10–11 | AG-S 8 PD + AG-F1 3 PD (testkit + adapter) |
| MEM — Memory                    | AG-S            | `platform/agent/memory` (new), `platform/db` (`OWNER_ORDER`)  |        8 |     4–5 | AG-S 4 PD                                  |
| WF — Workflows                  | AG-S            | `platform/agent/workflows` (new), `platform/db`               |        8 |     4–5 | AG-S 4 PD                                  |
| MS — Graph + Planner connector  | AG-F2           | `platform/ms-graph`, `modules/connectors/ms365-planner`       |       13 |     8–9 | AG-F2 9 PD                                 |
| PRD — Planner product (agent)   | AG-F1 + AG-S    | `modules/products/agent` (`tools/planner/{read,write}`)       |       13 |     7–8 | AG-F1 6 PD + AG-S 1 PD review              |
| CH — Teams channel              | FS + AG-F1      | `modules/channels/teams`                                      |        8 |     4–5 | FS 3 PD + AG-F1 2 PD (JWT verify)          |
| WRP — `apps/api` composition    | FS              | `apps/api/src/main.ts`, `env.ts`, `instrumentation.ts`        |        5 |     2–3 | FS 3 PD                                    |
| Smoke + demo                    | AG-S + FS       | 4 smoke tests at repo root; demo recording                    |        3 |     1–2 | shared, last 2 days                        |
| **TOTAL (planned)**             |                 |                                                               |  **79**  | **40–48 PD** | **49 PD supply (3.5 FTE × 14d)**           |

**Utilisation:** 40–48 / 49 = **82–98%** before any rework, any sick day, any spec ambiguity. This has **zero slack** — see Risk #1 in §8.

**Note on SP-to-PD ratio:** the v2.7 convention was 1 SP ≈ 0.5 ideal PD. The revised plan uses **1 SP ≈ 0.5–0.6 PD** because freshers + first-time AG-S patterns run lower than the v2.7 baseline (which assumed an established codebase). If actuals show >0.6 PD/SP after W1, scope is recut at the W1 checkpoint (Risk-1 mitigation in §8).

---

## Sheet 4 — Master Timeline (compressed weekly)

`█` = active. ◆ = milestone. Dates are Mon–Fri working days only.

| Stream                  | Owner          | PD  | W1 05-12 → 05-15 | W2 05-18 → 05-22 | W3 05-25 → 05-29 |
| ----------------------- | -------------- | --: | :--------------: | :--------------: | :--------------: |
| K — Kernel              | AG-S + AG-F1   |  10 |        █         |       █ ◆        |                  |
| MEM — Memory            | AG-S           |   4 |        █         |        █         |       █ ◆        |
| WF — Workflows          | AG-S           |   4 |                  |        █         |       █ ◆        |
| MS — Graph + Planner    | AG-F2          |   9 |        █         |        █         |        █         |
| PRD — Planner product   | AG-F1 + AG-S   |   8 |                  |        █         |       █ ◆        |
| CH — Teams channel      | FS + AG-F1     |   5 |        █         |        █         |       █ ◆        |
| WRP — apps/api wiring   | FS             |   3 |        █         |        █         |        █         |
| Smoke + demo            | AG-S + FS      |   2 |                  |                  |       █ ◆ M6     |

---

## Sheet 5 — Resources Plan (weekly person-days)

Each "FTE" cell below is in person-days for the week. Working days: W1 = 4, W2 = 5, W3 = 5. Demand should not exceed Supply per role per week.

| Role              | FTE | W1 supply | W1 demand   | W2 supply | W2 demand              | W3 supply | W3 demand                              | Total supply | Total demand |
| ----------------- | --: | --------: | ----------: | --------: | ---------------------: | --------: | -------------------------------------: | -----------: | -----------: |
| AG-S              | 1.0 |      4    | 4 (K3 + MEM1) | 5       | 5 (K4 + MEM3 + WF2)    | 5         | 5 (WF2 + PRD WRITE1 + demo)            | 14           | 14 (100%)    |
| AG-F1             | 1.0 |      4    | 3 (K-testkit) | 5       | 4 (OpenAI adapter + Planner READ2) | 5         | 5 (Planner READ + Teams JWT2)         | 14           | 12 (86%)     |
| AG-F2             | 1.0 |      4    | 4 (Graph client) | 5    | 5 (Planner connector READ) | 5         | 5 (Planner connector WRITE)            | 14           | 14 (100%)    |
| FS                | 0.5 |      2    | 2 (apps/api boot) | 2.5   | 2.5 (Teams skeleton + mount) | 2.5       | 2.5 (smoke + demo dry-run)             | 7            | 7 (100%)     |
| **TOTAL**         | **3.5** | **14**| **13**      | **17.5**  | **16.5**               | **17.5**  | **17.5**                               | **49**       | **47 (96%)** |

96% utilisation across the program, single-digit slack. **One sick day per fresher** consumes the entire buffer for that stream. See Risk #2.

---

## Sheet 6 — Status Dashboard (revised)

### KPIs (engineering)

| Total streams | Total SP | Total PD est. | Total PD supply | Pre-rework util |
| ------------: | -------: | ------------: | --------------: | --------------: |
|             8 |       79 |        40–48  |              49 |        82–96%   |

### Progress by stream (kickoff state)

| Stream | Caps | SP | Owner pool   | PD est. | Status      |
| ------ | ---: | -: | ------------ | ------: | ----------- |
| K      |    1 | 21 | AG-S + AG-F1 |   10–11 | Not started |
| MEM    |    1 |  8 | AG-S         |    4–5  | Not started |
| WF     |    1 |  8 | AG-S         |    4–5  | Not started |
| MS     |    1 | 13 | AG-F2        |    8–9  | Not started |
| PRD    |    1 | 13 | AG-F1 + AG-S |    7–8  | Not started |
| CH     |    1 |  8 | FS + AG-F1   |    4–5  | Not started |
| WRP    |    1 |  5 | FS           |    2–3  | Not started |
| Smoke  |    1 |  3 | AG-S + FS    |    1–2  | Not started |

---

## §7 — Risk register (revised — top 5 only)

| #  | Risk                                                                                                                            | Likelihood | Impact       | Mitigation                                                                                                                                                                                                                          | Owner       |
| -- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1  | **The capacity math doesn't work** — planned PD (40–48) consumes 82–98% of supply (49 PD) before any rework, illness, or ambiguity. Slippage is the base case, not the tail. | **High**   | **Critical** | **End-of-W1 scope re-cut checkpoint on 2026-05-15 (Fri).** If any stream is >1 PD behind plan, AG-S + FS hold a 30-min cut review and either (a) drop a stream (workflow MVP first, then memory recall persistence; kernel is non-negotiable) or (b) escalate to sponsor for deadline relief. **No silent slips.** | AG-S (PM)   |
| 2  | **Senior AI single point of failure** — 2 × 0.5 split is operationally fragile. One illness day eliminates 1.0 of AG-S that week. Architecture work is on the AG-S critical path for K, MEM, WF (≈12 PD of 14 supply). | Med        | **Critical** | FS named as architecture backup with overlapping skillset (per v2.7 mitigation, still applicable). Daily 15-min sync with FS on AG-S decisions; AG-S writes ADR-0010/0011/0012 as the design unfolds — FS can pick up from the ADRs. | AG-S + FS   |
| 3  | **No dedicated QA** — freshers double as QA via co-located tests. Tests slip when feature work slips; the 4-test smoke suite is the only acceptance bar. | Med        | High         | The 4 smoke tests are CI-gated from W1; failing a smoke test blocks merge. Test ownership is **part of the feature SP, not separate** — review enforces this. | AG-S        |
| 4  | **MS Graph / Entra admin consent friction** — same risk as v2.7 Risk #4, but with no PM dedicated to driving Seta IT engagement. Often 2–4 weeks for new app permissions. | High       | High         | Reuse the existing Entra app registration from Epic 1 (already has `Tasks.ReadWrite`, `Group.ReadWrite.All` per `modules/connectors/ms365-planner/SCOPE.md`). If new scopes are needed mid-build, fall back to a personal dev tenant for the demo. **Sponsor decision: see §11 Q3.** | AG-S        |
| 5  | **`@seta/agent-workflows` minimum surface is novel work** — even the "minimum-viable" advisory-lock + p-queue runner is new code. Spike `05-workflows.md` originally said "P2 defer." Re-injecting it adds 4–5 PD of AG-S to an already 100%-utilised slot. | Med        | High         | If WF integration test isn't green by EOD 2026-05-27, AG-S **explicitly drops `.parallel()`** and ships `.then()`-only with a SCOPE.md note. Sponsor escalation if even `.then()` slips past 2026-05-28. | AG-S        |

### Risks de-emphasised vs v2.7

The compressed plan removes (or downgrades) these v2.7 risks because the corresponding scope is dropped:
- **#7 Customer-data privacy review** (no design-partner customer in P1; only internal Seta data flows through LLM)
- **#8 Legal review of OSS publishing** (no public flip in P1)
- **#9 AI assist savings don't materialize** (plan is committed on raw PD only; AI is upside)
- **#10 AWS RDS pgvector setup** (no AWS in P1)
- **#11 Terraform state corruption** (no Terraform in P1)
- **#14 P2 Frontend hiring lead time** (separate concern; not P1 risk)
- **#15 Design-partner LOI by M6+14** (KPI deferred — see §0 revised KPIs)

---

## §8 — What was deferred to P1.5 / P2 (explicit, for sponsor visibility)

P1.5 is a proposed 2–3 week follow-on increment starting 2026-06-01 that captures the items most plausibly recoverable with the same 3.5 FTE. The sponsor must decide whether to authorise it (see §11 Q1).

### Deferred to P1.5 (recoverable in a 2–3 week follow-on)

| Item                                                | Reason for deferral                  | Recovery cost (est.)  |
| --------------------------------------------------- | ------------------------------------ | --------------------: |
| Analytics Agent (workload, overdue)                 | Budget compression                   | ~3–4 PD (AG-S + AG-F) |
| Multi-agent Coordinator + handoff                   | Single agent only in P1              | ~3 PD AG-S            |
| Visualization-first responses (charts)              | No dedicated card-rendering time     | ~2 PD AG-F            |
| Sentry wiring                                       | No DevOps headcount in P1            | ~1 PD FS              |
| Inbound SSO web UI (Entra OIDC + Google OIDC)       | Scope override                       | ~5 PD FS + AG-S       |
| 30-query eval set + replay harness                  | No QA headcount in P1                | ~3 PD                 |
| Documentation suite + cookbook                      | Cut from P1 critical path            | ~2 PD                 |
| Public OSS flip + npm publish + Legal sign-off      | Cut from P1 critical path            | ~3 PD                 |

### Deferred to P2 (originally planned for P2; confirmed not P1)

| Item                                          | Confirms                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `@seta/agent-chunking`, `-embeddings`, `-vector`, `-rag` (full RAG track) | Per setup.md §6 and spike punch list                                  |
| Seta FAQ Agent (depends on RAG)               | Confirmed                                                                      |
| AWS staging via Terraform (multi-AZ prod env) | Confirmed                                                                      |
| Studio web UI                                 | Confirmed; frontend role not on team                                           |
| Audit log domain + GDPR delete                | Confirmed                                                                      |
| Production secret rotation automation         | Confirmed                                                                      |
| CloudWatch SLO dashboards + alerting          | Confirmed                                                                      |
| Workflow engine `.branch()` / `.dowhile()` / `.foreach()` + pluggable `ExecutionEngine` | Per `platform/agent/workflows/SCOPE.md` minimum-viable surface |
| Semantic-recall memory (vector-backed)        | Per `platform/agent/memory/SCOPE.md` — P2 RAG dependency                       |
| Long-term memory across conversations         | Per v2.7 §2.5 "P3" classification                                              |
| Slack / Email / Voice channels                | Per v2.7 §2.5                                                                  |
| Billing / metering integration                | Per v2.7 §2.5                                                                  |
| Multi-region failover                         | Per v2.7 §2.5                                                                  |
| SOC 2 prep                                    | Per v2.7 §2.5                                                                  |

---

## §9 — Stakeholders, RACI & comms (compressed)

### 9.1 Stakeholder map (revised)

| Stakeholder                      | Role                       | Engagement (compressed cadence)                                        |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| CEO + CTO                        | Sponsor                    | **Twice-weekly written status** (Tue + Fri EOD); demo 2026-05-29       |
| PMO                              | Approver                   | Friday-only written status; risk register attached                     |
| Head of Sales                    | Consulted                  | M6 demo recording shared; LOI track deferred to P1.5                   |
| Head of Security                 | Consulted                  | One review checkpoint at M-MEM (2026-05-27) — Postgres schema + RLS    |
| Head of Legal                    | (Not engaged in P1)        | Re-engaged in P1.5 if OSS publishing is authorised                     |
| Seta IT                          | Consulted (Entra)          | Already engaged via Epic 1; only re-engage if new MS Graph scopes needed |
| Project team (3.5 FTE)           | Responsible                | Daily 15-min standup (9:30); Friday 30-min retro                       |

### 9.2 RACI for the revised P1 gates

| Gate                    | R (Responsible)  | A (Accountable) | C (Consulted)         | I (Informed)        |
| ----------------------- | ---------------- | --------------- | --------------------- | ------------------- |
| M-K Kernel acceptance   | AG-S + AG-F1     | AG-S (PM)       | FS                    | CTO                 |
| M-MEM Memory bound      | AG-S             | AG-S            | FS, Security          | CTO                 |
| M-WF Workflow smoke     | AG-S             | AG-S            | FS                    | CTO                 |
| M-CH Teams round-trip   | FS + AG-F1       | AG-S            | AG-F2 (Graph data)    | CTO, Seta IT        |
| **M6 Demo (2026-05-29)** | AG-S + FS       | AG-S            | All team              | CEO, CTO, PMO       |
| P1.5 go/no-go decision  | AG-S (recommend) | CEO + CTO       | PMO                   | All stakeholders    |

### 9.3 Communications cadence (compressed)

| What                  | Audience           | Frequency                        | Format                                      | Owner   |
| --------------------- | ------------------ | -------------------------------- | ------------------------------------------- | ------- |
| Daily standup         | Project team       | Mon–Fri 9:30                     | 15 min sync                                 | AG-S    |
| Written status        | CEO, CTO, PMO      | Tue + Fri EOD (W1 + W2 + W3)     | 1-page email: progress vs §4 roadmap + Risk #1 status | AG-S    |
| Weekly retro          | Project team       | Fri 16:00                        | 30 min                                      | AG-S    |
| Scope re-cut review   | AG-S + FS          | Fri 2026-05-15 16:30             | 30 min, walks Risk #1 trigger conditions    | AG-S    |
| **M6 demo**           | CEO, CTO, PMO      | Fri 2026-05-29 14:00             | 5-min recording + 25 min Q&A                | AG-S    |
| Post-P1 decision memo | CEO, CTO, PMO      | Mon 2026-06-01 EOD               | Written: P1.5 scope proposal + budget       | AG-S    |

---

## §10 — Decisions required from sponsor (BEFORE kickoff)

The plan above is the **best honest scope** under the stated constraints. The PM (acting AG-S) needs the following affirmative decisions before commencing on 2026-05-12. Absence of a decision defaults to the listed assumption.

| #  | Decision                                                                                                                                                | Default if not answered                                                                                                                                                       | Deadline       |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Q1 | **Is 2026-05-31 a hard deadline, or can it slip to 2026-06-12 (≈10 additional working days) to preserve more of the v2.7 scope?** Option A in §0.5 vs Option C. | Treated as **hard** per the brief — Option C (hard-cut scope) is in effect.                                                                                            | 2026-05-12 AM  |
| Q2 | **Is the OSS public flip (private → public repo + npm publish) required at 2026-05-31, or can it slip to P1.5?**                                        | Treated as **slips to P1.5** — H2 Legal sign-off and H5 public flip are removed from P1 critical path.                                                                        | 2026-05-12 AM  |
| Q3 | **Is the Analytics Agent a P1 hard requirement or a stretch goal?** Per §6 drop list it's currently dropped.                                            | Treated as **dropped from P1** — recoverable in P1.5 at ~3–4 PD.                                                                                                              | 2026-05-12 AM  |
| Q4 | **Is AWS staging deployment mandatory, or can the M6 demo be on a dev machine (docker compose + ngrok tunnel for Teams)?**                              | Treated as **demo on dev machine** — saves the entire D stream from v2.7 (~8.75 MD originally).                                                                              | 2026-05-12 AM  |
| Q5 | **Are the two P1 overrides (memory + workflow) firm, or is the sponsor open to one or both being dropped if W1 burn rate trips Risk #1?**               | Treated as **firm** — both packages are committed scope. Drop order if forced: `.parallel()` from WF (single-`.then()` only), then full WF deferral, then memory recall (keep working-memory only). | 2026-05-13 EOD |
| Q6 | **Is the sponsor authorising a P1.5 increment (2 to 3 working weeks starting 2026-06-01)?** This is the natural home for Analytics, web SSO, OSS flip, and any P1 slippage. | Treated as **TBD — confirm at M6 demo**. Recruiting / contracting decisions for P1.5 cannot be triggered yet.                                                                | 2026-06-01     |
| Q7 | **In the event of slippage, which is the preferred remedy — deadline relief, scope cut, or team expansion?** Risk #1 mitigation depends on this.        | Treated as **scope cut** per the Option C choice. AG-S will not request deadline relief unilaterally.                                                                        | 2026-05-12 AM  |
| Q8 | **Is the sponsor accepting "no dedicated QA in P1" (freshers double as QA via co-located tests)?**                                                       | Treated as **yes** — the 4-test smoke suite is the only acceptance bar.                                                                                                       | 2026-05-12 AM  |

---

## §11 — Pre-kickoff approval checklist (revised)

| #   | Item                                                                                                | Owner         | Status  |
| --- | --------------------------------------------------------------------------------------------------- | ------------- | ------- |
| 1   | §0.5 capacity math reviewed and acknowledged by CEO + CTO                                           | CEO + CTO     | Pending |
| 2   | Option C (hard-cut scope) explicitly chosen over Options A and B                                    | CEO + CTO     | Pending |
| 3   | §10 sponsor decisions Q1–Q8 answered (or defaults accepted in writing)                              | CEO + CTO     | Pending |
| 4   | §6 drop list reviewed; sponsor accepts Analytics, FAQ, RAG, SSO web, Studio, AWS, OSS slip          | CEO + CTO     | Pending |
| 5   | §0 revised BK KPIs accepted (BK-1/3/4/6 only — BK-2 and BK-5 deferred)                              | CEO + CTO     | Pending |
| 6   | All 3.5 P1 team members confirmed available 100% of their FTE from 2026-05-12 to 2026-05-29        | CTO + HR      | Pending |
| 7   | Entra admin consent for existing Planner scopes verified (reuse Epic 1 app registration)            | AG-S + Seta IT | Pending |
| 8   | Acknowledgement that this plan has zero rework slack — slippage triggers §7 Risk #1 escalation      | AG-S + CEO + CTO | Pending |

---

## §12 — Changelog vs prior plan (v2.7 → v3.0)

This section documents the disposition of every v2.7 section. No content has been silently dropped.

### Removed sections (with reason)

| v2.7 section                                                  | Disposition in v3.0                                                                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sheet 1 §7 "Build vs. Buy Position (ADR-0009)"                | Removed — decision still binding via ADR-0009 itself; no change.                                                              |
| Sheet 1 §7b "Dual-Language Architecture Decision"             | Removed — **single-language (TypeScript) only** in revised P1. Python framework + FastAPI service deferred to P1.5/P2. No room in 3.5 FTE × 14 days for two stacks. |
| Sheet 1 §8 "Capacity & Allocation" + mitigations table        | Replaced by §0.5 + Sheet 5; mitigations not applicable (no v2.7 over-utilisation pattern to fix).                            |
| Sheet 2 §2.3 "Business KPI baseline at M6"                    | Folded into §0 revised KPIs.                                                                                                  |
| Sheet 2 §2.4 "What you can do with this in the next 30 days"  | Removed — irrelevant under Option C (no public release, no design partner).                                                  |
| Sheet 3 capability table (62 rows)                            | Replaced by Sheet 3 stream-level table (8 streams). Capability granularity is too fine for 3.5 FTE × 14d.                    |
| Sheet 5 resources weekly MM (v2.7 6-HC table)                 | Replaced by Sheet 5 PD-level table at 3.5 FTE.                                                                                |
| Sheet 6 "Top Risks (15 rows)"                                  | Replaced by §7 (5 rows). De-emphasised risks listed in §7 with reasons.                                                       |
| Sheet 7 "Cost & Commercials (P1–P4)"                          | **Removed entirely** — no commercial budget approved for the compressed P1. Costs to be re-budgeted at P1.5 / P2 planning.   |
| Sheet 8 RACI + Comms                                          | Replaced by compressed §9 (3-row stakeholder map, 5-row RACI, 6-row comms cadence).                                          |
| §9a "Multi-Phase Roadmap (P1 → P4)"                           | Removed — under Option C the P2/P3/P4 envelopes are stale. Re-baselined at the post-M6 decision memo (2026-06-01).            |
| §9b "P2 Detailed Plan (preview)"                              | Removed — see above; P1.5 + P2 to be re-planned post-M6.                                                                      |
| §10 "Pre-Kickoff Approval Checklist" (10 items)               | Replaced by §11 (8 items) with revised content.                                                                               |

### New sections in v3.0

| New section                                                   | Purpose                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| §0.5 Constraint reality check                                 | Honest capacity math — the centrepiece of v3.0.                                                                               |
| Sheet 1 §6 "What is explicitly NOT in this P1 (drop list)"    | Replaces Sheet 2 §2.5 with a sharper, P1-vs-P1.5-vs-P2 disposition.                                                            |
| §8 Deferred to P1.5 / P2                                       | Sponsor-visible drop list with recovery cost estimates.                                                                       |
| §10 Decisions required from sponsor (Q1–Q8)                   | Replaces buried decision points; surfaces what's blocking.                                                                    |
| §12 Changelog vs prior plan (this section)                    | Per the brief's no-silent-drop requirement.                                                                                   |

### References to external contracts

- The two new platform packages reflect the 2026-05-12 P1 scope override documented in `docs/explorations/2026-05-12-mastra-spike/README.md` § "P1 scope override (2026-05-12)":
  - **`@seta/agent-memory`** — see [`platform/agent/memory/SCOPE.md`](../../platform/agent/memory/SCOPE.md).
  - **`@seta/agent-workflows`** — see [`platform/agent/workflows/SCOPE.md`](../../platform/agent/workflows/SCOPE.md).
- The kernel contract is locked by [`platform/agent/core/SCOPE.md`](../../platform/agent/core/SCOPE.md) — Epic 1 left it as `export {}`; v3.0 closes the gap.
- The Planner connector gaps to be filled in W1 are listed in [`modules/connectors/ms365-planner/SCOPE.md`](../../modules/connectors/ms365-planner/SCOPE.md) § "Current state (Epic 1)".
- `platform/db` `OWNER_ORDER` must be expanded by 2 owners (memory, workflows) — confirmed in [`platform/db/SCOPE.md`](../../platform/db/SCOPE.md) § "Current state (Epic 1)".

---

**End of plan v3.0 (compression rewrite, 2026-05-12).**
