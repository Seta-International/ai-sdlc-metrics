# Seta Agent Foundation — Project Plan

> **Plan revision: 2026-05-12 (v3.1) — re-expansion after sponsor scope additions.** This document supersedes plan v3.0 (compression rewrite from earlier today). On 2026-05-12 the sponsor rejected part of v3.0's drop list and mandated three items back into P1: **Analytics Agent**, **Seta FAQ Agent**, and the **full RAG track** (`@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`, `@seta/agent-rag`) plus a parallel **RAG data survey + corpus ingestion** track. Headcount (3.5 FTE), deadline (2026-05-31), and the previously-dropped items (web SSO, Studio, OSS flip, dual-language Python, AWS Terraform staging) remain unchanged. The math has now moved from *marginally infeasible* (v3.0) to *structurally infeasible* — see §0.5. The remainder of this plan is best-effort under that mandate; the sponsor decisions in §10 are the single biggest determinant of whether P1 lands as a coherent release or a partial slip.

---

## §0 — Business Case (read this first)

### The problem

Seta's SaaS ERP customers spend significant time on routine coordination work inside the product — looking up status, summarizing across plans, assigning follow-ups, building progress reports. Today this work is manual. Customers expect agent-native experiences in 2026; enterprise buyers now ask "what's your AI strategy?" in every RFP. Competitors (Microsoft Copilot Studio, Salesforce Agentforce, ServiceNow Now Assist) shipped first-generation agent surfaces 12–18 months ago.

### Why now, and cost of inaction

LLM costs have dropped ~10× in 18 months; multi-tenant agent patterns have matured. The 12-month window to establish agent-native positioning closes mid-2026. If we wait until late 2026 to start, we ship in 2027 against competitors who will have second-generation systems. **Cost of inaction**: pricing pressure on existing ERP renewals (customers ask "why no AI?"), lost expansion revenue, and a structural gap that takes 2+ years to close.

### Scope re-expansion note — strategic risk under v3.1

The v3.0 plan delivered a slim P1 (Planner-only agent + kernel + memory + minimal workflow) in 14 working days with 3.5 FTE at 82–98% utilisation. The sponsor's 2026-05-12 scope expansion re-injects three substantial workstreams (Analytics Agent, FAQ Agent, full RAG track + corpus survey) — **adding +20 to +25 PD of demand to an already-tight 40–48 PD demand against 49 PD supply**. The literal mandate (all P1 scope, 3.5 FTE, 2026-05-31 hard deadline) cannot be satisfied. The PM's job is to surface this clearly so the sponsor chooses one of A/B/D in §0.5; Option C (further scope cut) directly contradicts the new sponsor direction and is recorded but not recommended.

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

### What success looks like (revised business KPIs — v3.1)

The v3.0 KPI bar was already trimmed (BK-1/3/4/6 only). Under v3.1 the *aspirational* bar is wider (three agents, RAG-backed FAQ with citations) but the *achievable* bar — without an Option A/B/D sponsor decision — is at best a partial subset of v3.0.

| #     | Business KPI                                                                  | Target (revised v3.1)                                                                                       | Measured by                       | Owner    |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------- | -------- |
| BK-1  | Internal demo green to CTO+CEO on staging-equivalent (dev compose ok)         | One live end-to-end demo: Planner READ + WRITE through Teams against MS Graph; Analytics chart-card; FAQ Q&A with citations | Live demo + recording             | PM + CTO |
| BK-3  | Token cost per agent run in demo                                              | Average < $0.15/run on demo set (further relaxed from v3.0's $0.10 — FAQ RAG calls add cost)               | Per-run usage log                 | AG-S     |
| BK-4  | End-to-end latency for "summarize my tasks" (Planner) and FAQ retrieve+answer | p95 < 6 s Planner; p95 < 8 s FAQ (RAG retrieve adds ~1.5 s)                                                | Synthetic check in smoke suite    | AG-S     |
| BK-6  | Internal feasibility evidence for sponsor decision on P1.5 / P2 scope         | Sponsor reviews demo + capacity actuals on 2026-06-01 and approves next-increment scope                    | Decision memo                     | PM       |
| BK-7  | **(NEW)** Cited answer rate on FAQ Agent for the curated demo question set    | ≥80% of FAQ answers carry ≥1 retrieved-chunk citation                                                      | Manual review of FAQ demo loop    | AG-S     |
| BK-2  | **DEFERRED to P1.5** — design-partner LOI                                     | Not achievable inside 14 working days                                                                       | —                                 | —        |
| BK-5  | **DEFERRED to P1.5** — OSS traction                                           | Public flip removed from P1 scope                                                                           | —                                 | —        |

These revised KPIs determine whether **P1.5** is approved — and, under Option D in §0.5, P1.5 is *where the cited demo actually lands*.

---

## §0.5 — Constraint reality check (read second)

> *After the 2026-05-12 sponsor scope additions (Analytics, FAQ, full RAG), the literal mandate (all P1 scope, 3.5 FTE, 2026-05-31 hard deadline) is structurally infeasible. The remainder of this plan is best-effort under that mandate; the sponsor decisions in §10 are the single biggest determinant of whether P1 lands as a coherent release or a partial slip.*

### The math

| Item                                                     | v2.7 baseline | v3.0 (slim P1) | **v3.1 (post-2026-05-12 expansion)** |
| -------------------------------------------------------- | ------------- | -------------- | ------------------------------------ |
| Headcount                                                | 7 FTE         | 3.5 FTE        | **3.5 FTE**                          |
| Working days (kickoff → deadline)                        | 35            | ~14            | **~14 (2026-05-12 → 2026-05-29)**    |
| Person-days of capacity (raw)                            | 245 PD        | 49 PD          | **49 PD**                            |
| Demand (planned PD)                                      | 154.9 base    | 40–48 PD       | **~60–73 PD**                        |
| Capacity ratio (supply / demand)                         | 158%          | 102–122%       | **67%–82%**                          |
| Demand as % of supply                                    | 63%           | 82–98%         | **122%–149% — STRUCTURALLY OVER**    |

The v3.0 plan ran at 82–98% utilisation with zero slack. **v3.1 adds ~20–25 PD of new demand on top:**

| New demand item (v3.1)                                              | PD estimate (conservative) | Owner pool                  |
| ------------------------------------------------------------------- | -------------------------: | --------------------------- |
| Analytics Agent (definition + 2-3 read-only tools + chart-card UX)  |                       5–6  | AG-F (defn+tools) + AG-S (review) |
| Seta FAQ Agent (definition + RAG retrieve/cite tools)               |                       4–5  | AG-F + AG-S (RAG wiring)    |
| `@seta/agent-chunking`                                              |                          2 | AG-F                        |
| `@seta/agent-embeddings`                                            |                          2 | AG-F                        |
| `@seta/agent-vector` (schema + pgvector HNSW + iterative_scan gate) |                          4 | AG-S (schema + correctness) |
| `@seta/agent-rag` (composition over chunking+embeddings+vector)     |                          3 | AG-S                        |
| RAG data survey (corpus collection, curation, structuring)          |                          4 | FS + AG-F (part-time)       |
| RAG ingestion run (chunk + embed + upsert; FTS fallback)            |                          2 | FS                          |
| **Subtotal new demand**                                             |                  **26–28** |                             |
| Optimistic compression (parallel survey, reused fixtures, sharing)  |                       –5–6 |                             |
| **Net added demand**                                                |                  **20–22** |                             |

Combined with v3.0's 40–48 PD baseline, **v3.1 demand lands at ~60–70 PD** against **49 PD supply** — a structural deficit of **11–21 PD** (22%–43% over supply) before any rework, sick day, or spec ambiguity. No realistic reorder of the same hours closes that gap.

### The honest options

Option C (the v3.0 pick) is now off the table — it directly contradicts the 2026-05-12 sponsor direction to put Analytics + FAQ + RAG back into P1.

| #  | Option                                                       | Description                                                                                                                                                                                                                                                                            | Tradeoff                                                                                                                                                                              | Recommendation |
| -- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A  | **Deadline extension to ~2026-06-12**                        | Extend by ~10 additional working days (49 → ~84 PD supply). Same team, same scope. Demand 60–70 PD lands at ~71–83% utilisation — healthy.                                                                                                                                            | Slips the sponsor-imposed 2026-05-31. May affect external commitments / RFP messaging.                                                                                                | **VIABLE**     |
| B  | **Team expansion (+1 senior AI + 0.5 DevOps)**               | Add 1.0 FTE dedicated senior AI engineer (not 2×0.5 split) and 0.5 DevOps from 2026-05-12. Effective supply ~70+ PD on the original deadline.                                                                                                                                          | Requires immediate hire/contract. If the hire isn't onboarded by 2026-05-15 the option collapses. Burn ↑.                                                                              | **VIABLE if hire is immediate** |
| C  | **Further scope cut (drop FAQ or drop RAG)**                 | Drop Seta FAQ Agent (most expensive due to RAG dependency) **or** drop the full RAG track and keep FAQ as static knowledge served from a YAML file in W2-W3 (no vector store). Either path brings demand back to ~50 PD.                                                              | **Directly contradicts the 2026-05-12 sponsor mandate.** Recorded for completeness only.                                                                                              | Not recommended |
| D  | **Accept the slip; pre-announce P1.5 split**                 | Proceed under current constraints. Land what's stable by 2026-05-29 as **P1.0** (Planner Agent + kernel + memory + workflow + RAG-1 + Teams round-trip). Ship Analytics Agent, FAQ Agent, RAG-2/3 composition, and full corpus integration as **P1.5** on 2026-06-01 → 2026-06-12.   | Pre-announce, don't surprise. Honest delivery, no heroics. Closest in spirit to "all sponsor scope honoured" without violating physics.                                              | **Recommended under the literal mandate** |

**The PM's recommendation: Option A or Option B is the only path that delivers the full sponsor mandate.** If the sponsor cannot move the deadline (Option A) and cannot authorise the hire (Option B), then **Option D is the only honest plan** — accept the slip, pre-announce P1.5, and let the team deliver well rather than deliver everything badly. **Option C is not chosen** because it overrides the sponsor's most recent decision and the PM does not override sponsors unilaterally.

### Why the prior "Option C in v3.0" no longer holds

v3.0 picked Option C (hard scope cut) because the sponsor at that time accepted the drop list. The 2026-05-12 sponsor reversal *materially changes* the constraint set: three substantial streams returned. The PM cannot satisfy "all scope, original team, original deadline" by reorganising hours — the gap is too large. **The honest answer is the slip; the rest of §10 makes the trade visible.**

### Team composition (unchanged from v3.0)

| Role                       | FTE  | Notes                                                                                                  |
| -------------------------- | ---: | ------------------------------------------------------------------------------------------------------ |
| Senior AI (AG-S)           | 1.0  | 2 × 0.5 split — must operate as a single owner for kernel + memory + workflow + agent-vector + agent-rag composition |
| Fresher AI (AG-F1, AG-F2)  | 2.0  | Two heads; supervised pattern-following — kernel/run-loop internals + vector-store correctness off-limits |
| Full-stack (FS)            | 0.5  | Owns `apps/api` composition, OAuth gaps, env/OTel wiring, smoke harness, **and RAG corpus ingestion**  |
| **TOTAL**                  | **3.5** | **No dedicated PM, QA, or DevOps headcount.** Doubling-up note (unchanged from v3.0) still applies.  |

### What does fit in 49 PD under v3.1 (Option D allocation)

Under Option D, **the 2026-05-29 demo carries P1.0**: Planner READ+WRITE, kernel, memory, workflow `.then()`, Teams round-trip, **RAG-1 packages built but not integrated end-to-end**, RAG-2 vector schema in place with one tenant fixture, **corpus survey complete with structured drops** but no end-user FAQ Agent yet. Analytics Agent and FAQ Agent **slip to P1.5** (2026-06-01 → 2026-06-12).

A defensible 49-PD plan covers, roughly:

- **AG-S (14 PD):** kernel + run loop + streaming SSE + memory provider + workflow DSL + `agent-vector` schema (HNSW + iterative_scan correctness gate) + `agent-rag` composition spike + write-tool safety review. 100% utilisation, zero slack.
- **AG-F1 (14 PD):** Planner READ tools + OpenAI adapter + `agent-chunking` library + LLM record/replay testkit + Teams JWT verifier (AG-S review). Analytics Agent definition stretches into the budget but lands in P1.5 if W2 burn is at plan.
- **AG-F2 (14 PD):** Planner WRITE tools (preview/commit) + Graph client + MS365 Planner connector + `agent-embeddings` library + fixture recordings.
- **FS (7 PD):** `apps/api/src/main.ts` wiring + OAuth completion + env/OTel + docker compose + smoke harness + **RAG corpus ingestion driver script** (part-time, parallel to wiring).

The Analytics-Agent, FAQ-Agent, and RAG-3 composition wiring deliberately do **not** fit and are pre-announced as P1.5. See §6 for the explicit split and §10 Q9 for the sponsor "if exactly one ships" choice.

---

## Sheet 1 — Executive Summary

### 1. Project Information

| Field            | Value                                                                                          | Field            | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------- |
| Project Manager  | Canh Ta (acting; doubles as AG-S tech lead)                                                    | Sponsor          | Seta International (CEO + CTO)                                         |
| P1 Start         | 2026-05-12                                                                                     | P1 Target End    | **2026-05-31** (hard sponsor-imposed — see §10 Q1)                     |
| Project Code     | SETA-OS-P1                                                                                     | Convention       | 1 SP ≈ 0.5 ideal PD                                                    |
| P1 Working Days  | **~14 (Mon–Fri, 05-12 → 05-29; 05-30/05-31 are weekend — demo lands Friday 05-29)** | Headcount        | **3.5 FTE** (1.0 AG-S · 2.0 AG-F · 0.5 FS — no PM/QA/DevOps headcount) |
| Deploy target    | **Dev docker compose only** — AWS staging via Terraform deferred to P1.5/P2                    | SP scale         | Fibonacci (1, 2, 3, 5, 8, 13)                                          |
| AI assist        | Claude Code — **upside only, not committed in budget**                                         | Plan revision    | **v3.1 (re-expansion after 2026-05-12 sponsor reversal)**              |
| **P1.0 / P1.5 split** | **P1.0 lands 2026-05-29 (Option D); P1.5 lands 2026-06-12 — see §0.5 + §6**           | **In-scope agents** | **Planner (P1.0); Analytics + FAQ (P1.5 under Option D)**          |

### 2. The one-paragraph version (90-second CEO read)

> Build a slim, multi-tenant agent foundation in TypeScript on top of the Epic-1 auth/oauth/audit foundation already shipped. The sponsor mandate as of 2026-05-12 calls for **three specialist agents** (Planner, Analytics, Seta FAQ), the **kernel** (`@seta/agent-core`), **`@seta/agent-memory`**, **`@seta/agent-workflows`**, and the **full RAG track** (`@seta/agent-chunking`, `@seta/agent-embeddings`, `@seta/agent-vector`, `@seta/agent-rag`) plus a **parallel RAG data survey**, all in 14 working days with 3.5 FTE. The capacity math shows demand of 60–70 PD against supply of 49 PD — **the literal mandate cannot be met** (§0.5). The PM recommends **Option A (deadline extension)** or **Option B (one immediate senior-AI hire)**; failing both, **Option D (accept the slip, pre-announce P1.5)** lands Planner + kernel + memory + workflow + RAG-1 packages + corpus survey by 2026-05-29 as **P1.0**, with Analytics, FAQ, RAG-2/3 composition and corpus integration shipping 2026-06-01 → 2026-06-12 as **P1.5**. Inbound web SSO, Studio, OSS public flip, dual-language Python, and AWS Terraform staging remain deferred. The demo on 2026-05-29 is internal-only, on a dev machine via docker compose. **§10 Q1 and Q10 must be answered by 2026-05-15 EOD or the team defaults to Option D.**

### 3. P1 Strategic Objectives (revised v3.1 — 9 objectives, P1.0 vs P1.5 marked)

| #   | Objective                                                                    | Tier | What it means in plain terms                                                                                                  |
| --- | ---------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Planner Agent live in Microsoft Teams**                                    | P1.0 | A Planner Agent reachable in Teams that reads tasks and writes safely (preview → confirm → commit).                          |
| 2   | **Agent kernel that other modules can build on**                             | P1.0 | `@seta/agent-core`: model adapter, run loop, tool contract, streaming protocol — frozen enough that P1.5/P2 don't re-architect. |
| 3   | **Memory persistence (P1 override)**                                         | P1.0 | `@seta/agent-memory` persists conversation history + working-memory scratchpad in Postgres; multi-turn feels coherent.        |
| 4   | **Minimal workflow engine (P1 override)**                                    | P1.0 | `@seta/agent-workflows` supports linear DAG (`.then()` / `.parallel()`) with suspend/resume.                                  |
| 5   | **RAG-1: chunking + embeddings libraries**                                   | P1.0 | `@seta/agent-chunking` + `@seta/agent-embeddings` shipped as libraries; unit + integration tested.                            |
| 6   | **RAG-2: vector store with HNSW + iterative_scan**                           | P1.0 | `@seta/agent-vector` ships schema (`agent_vector.chunks` per setup.md §6) + pgvector HNSW index + iterative_scan correctness gate. |
| 7   | **RAG corpus survey + structuring**                                          | P1.0 | Seta corporate knowledge corpus identified, collected, structured into ingestion-ready chunks (parallel track from W1).      |
| 8   | **Analytics Agent (chart-card responses)**                                   | P1.5 | Workload analysis specialist with chart-card adaptive cards — "who's overloaded", "task distribution".                       |
| 9   | **Seta FAQ Agent (RAG-backed, citation-bearing)**                            | P1.5 | RAG-3 composition + FAQ Agent definition + retrieve/cite tools; ≥80% answers carry ≥1 citation (BK-7).                       |

Under **Option A (deadline 2026-06-12)** or **Option B (hire authorised)** all nine objectives are P1. Under **Option D (slip)** objectives 1–7 are P1.0 (lands 2026-05-29), objectives 8–9 are P1.5 (lands 2026-06-12). Under **Option C (further cut, NOT recommended)** objective 9 drops; 8 lands as text-only (no chart cards).

### 4. Release Roadmap (revised v3.1 — 3 weeks Mon–Fri working + P1.5 increment)

`█` = active. ◆ = milestone. Calendar dates Mon–Fri; weekends omitted. P1.5 column shown for sponsor visibility under Option D.

| Phase / Stream                                  | W1 (05-12 → 05-15, 4d)                                              | W2 (05-18 → 05-22, 5d)                                                          | W3 (05-25 → 05-29, 5d)                                                                  | **P1.5 W4 (06-01 → 06-05, 5d)** | **P1.5 W5 (06-08 → 06-12, 5d)** |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------- |
| **K — `@seta/agent-core` kernel**                | █ AG-S: model adapter, ModelStream, run loop; AG-F1 testkit         | █ AG-S: streaming SSE + tool exec; AG-F1: OpenAI adapter                       | ◆ K-gate 05-26                                                                          |                                 |                                 |
| **MEM — `@seta/agent-memory`**                   | █ AG-S: schema, migration, scaffold                                 | █ AG-S: recall/saveTurn/working-memory + integration test                      | ◆ MEM-gate 05-27                                                                        |                                 |                                 |
| **WF — `@seta/agent-workflows`**                 |                                                                     | █ AG-S: schema + DSL `.then()`/`.parallel()`; advisory-lock resume             | █ integration test + smoke wiring; ◆ WF-gate 05-28                                      |                                 |                                 |
| **X0 — RAG data survey (parallel)**              | █ FS + AG-F (part-time): corpus inventory, sources, access rights   | █ FS: corpus curation + chunk-source structuring                                | █ FS: ingestion driver dry-run on subset; ◆ X0-gate 05-29 (corpus ready)                | █ Full corpus ingest            |                                 |
| **RAG-1 chunking + embeddings**                  | █ AG-F1: `agent-chunking` package scaffold + chunk strategies      | █ AG-F1: chunking complete + tests; AG-F2: `agent-embeddings` package + provider abstraction | █ AG-F2: embeddings tests + record/replay fixtures; ◆ RAG-1-gate 05-28           |                                 |                                 |
| **RAG-2 vector**                                 |                                                                     | █ AG-S: `agent_vector.chunks` schema + HNSW index + RLS + iterative_scan gate  | █ AG-S: per-tenant fixture tests; ◆ RAG-2-gate 05-29                                    |                                 |                                 |
| **RAG-3 composition (`agent-rag`)**              |                                                                     | █ AG-S: composition spike (chunking + embeddings + vector wired)               | █ AG-S: package shipped library-only (no end-user product yet); ◆ RAG-3-gate 05-29     | █ Wire into FAQ Agent           |                                 |
| **MS — `platform/ms-graph` + Planner connector** | █ AG-F2: Graph client (auth + pagination + retry)                  | █ AG-F2: Planner read endpoints + fixtures                                     | █ AG-F2: Planner write endpoints + cache/etag                                           |                                 |                                 |
| **PRD-P — Planner Agent (Product)**              |                                                                     | █ AG-F1: Planner READ tools (list, get, search)                                | █ AG-F1/AG-S: Planner WRITE tools (preview/commit)                                      |                                 |                                 |
| **A1 — Analytics Agent (P1.5)**                  |                                                                     |                                                                                 |                                                                                          | █ AG-F1: definition + 2-3 read-only aggregation tools | █ AG-F1+AG-S: chart-card adaptive cards; ◆ A1-gate 06-12 |
| **A2 — Seta FAQ Agent (P1.5)**                   |                                                                     |                                                                                 |                                                                                          | █ AG-F2: definition + retrieve/cite tools | █ AG-S: RAG-3 wire + citation review; ◆ A2-gate 06-12 |
| **CH — `modules/channels/teams`**                | █ FS: manifest + bot-token reply skeleton                          | █ FS+AG-F1: JWT/JWKS verify; OBO refresh                                       | █ FS: handler binds Planner product; ◆ CH-gate 05-28                                   |                                 |                                 |
| **WRP — `apps/api/src/main.ts`**                 | █ FS: env + OTel boot                                              | █ FS: mount kernel + memory + workflows                                        | █ FS: smoke compose + smoke suite                                                       |                                 |                                 |
| **Demo + handover**                              |                                                                     |                                                                                 | █ AG-S+FS: 5-min P1.0 recorded demo; ◆ M6 P1.0 2026-05-29                              |                                 | ◆ M7 P1.5 2026-06-12            |
| **Milestones**                                   |                                                                     | M-K (05-22)                                                                     | M-MEM (05-27) · M-WF (05-28) · M-CH (05-28) · M-RAG (05-29) · **M6 P1.0 (05-29)**       |                                 | **M7 P1.5 (06-12)**             |

**Note on the deadline:** 2026-05-31 is a Sunday. The last working day of P1.0 is Friday 2026-05-29. Under Option D, P1.5 lands Friday 2026-06-12. Under Option A, the unified P1 deadline is 2026-06-12. Under Option B, the original 2026-05-31 holds with the new hire onboarded by 2026-05-15.

### 5. Key Milestones (revised v3.1)

| #     | Milestone                                                                                              | Phase          | Target Date | Working days from kickoff | Gate                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------ | -------------- | ----------- | ------------------------: | --------------------------------------------------------------------------------------------------- |
| M-K   | `@seta/agent-core` kernel green                                                                         | K              | 2026-05-22  |                         9 | Unit smoke + integration replay test                                                                |
| M-MEM | `@seta/agent-memory` provider bound in `apps/api/src/main.ts`                                           | MEM            | 2026-05-27  |                        12 | Real provider returns persisted turns; integration test green                                       |
| M-WF  | `@seta/agent-workflows` smoke — `.then(a).parallel([b,c])` suspends and resumes                          | WF             | 2026-05-28  |                        13 | Advisory-lock contention test green; suspend snapshot persisted; resume returns same output         |
| M-CH  | Teams round-trip in dev tunnel — Planner READ end-to-end                                                | CH+PRD-P       | 2026-05-28  |                        13 | Live Teams message → SSE stream back → Adaptive Card with task list                                 |
| M-RAG | RAG-1 + RAG-2 + RAG-3 library green; corpus ingestion dry-run on subset                                 | RAG + X0       | 2026-05-29  |                        14 | `agent_vector.chunks` schema applied; HNSW + iterative_scan integration test green per tenant fixture |
| **M6 (P1.0)** | **Internal demo + recording — Planner READ + WRITE + memory + workflow + RAG libraries shipped**  | Demo           | **2026-05-29** |                       14 | 5-min recording on dev compose; CTO/CEO review next business day                                    |
| M7 (P1.5)     | **Analytics Agent + FAQ Agent demo (Option D)**                                                     | A1 + A2        | **2026-06-12** |                       24 | Chart-card response live; FAQ Q&A with ≥1 citation per answer on demo loop                          |

### 6. P1 disposition table — what lands when (v3.1)

This table replaces the v3.0 single "drop list" with a tri-state disposition: **P1.0** (lands 2026-05-29), **P1.5** (lands 2026-06-12 under Option D, lands 2026-05-29 under Options A/B), **DROPPED** (not in P1 at all under any option).

| Item                                                          | Disposition under recommended path (Option D) | Disposition under Option A (deadline 06-12) | Disposition under Option C (NOT recommended) | Where dropped items land |
| ------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | -------------------------------------------- | ------------------------ |
| **Planner Agent**                                             | P1.0                                          | P1                                          | P1                                            | —                        |
| `@seta/agent-core` kernel                                     | P1.0                                          | P1                                          | P1                                            | —                        |
| `@seta/agent-memory`                                          | P1.0                                          | P1                                          | P1                                            | —                        |
| `@seta/agent-workflows`                                       | P1.0                                          | P1                                          | P1                                            | —                        |
| `@seta/agent-chunking`                                        | P1.0 (library)                                | P1                                          | P1 if RAG kept; DROPPED if RAG cut           | P2                       |
| `@seta/agent-embeddings`                                      | P1.0 (library)                                | P1                                          | P1 if RAG kept; DROPPED if RAG cut           | P2                       |
| `@seta/agent-vector` (schema + HNSW + iterative_scan)         | P1.0 (schema in place; per-tenant fixture)    | P1 (fully integrated)                       | P1 if RAG kept; DROPPED if RAG cut           | P2                       |
| `@seta/agent-rag` composition                                 | P1.0 (library; not wired to product)          | P1 (wired to FAQ)                           | P1 if RAG kept; DROPPED if RAG cut           | P2                       |
| RAG corpus survey + structuring                               | P1.0 (corpus ready)                           | P1 (corpus + ingestion complete)            | P1 if RAG kept                               | P2                       |
| Full RAG corpus ingestion (production-scale)                  | P1.5                                          | P1                                          | DROPPED if RAG cut                            | P2                       |
| **Analytics Agent**                                           | **P1.5**                                      | P1                                          | If forced (Option C), DROPPED                | P2                       |
| **Seta FAQ Agent**                                            | **P1.5**                                      | P1                                          | If forced (Option C), DROPPED                | P2                       |
| Teams channel + JWT/JWKS + OBO                                | P1.0                                          | P1                                          | P1                                            | —                        |
| Inbound SSO web UI (Entra OIDC + Google OIDC)                 | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| Studio web app                                                | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| OSS public flip + npm publish + Legal sign-off                | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| Dual-language Python framework + FastAPI service              | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| AWS Terraform staging                                         | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| 12 → 4 E2E tests                                              | 4 smoke tests in P1.0                          | 4 smoke + expand toward 12                  | 4 smoke                                       | P1.5 expands             |
| 30-query eval set + replay harness                            | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| Sentry / CloudWatch dashboards / cost alerts                  | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| Multi-agent Coordinator + handoff                             | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |
| Supervisor pattern (scorer + retry-on-fail)                   | DROPPED                                       | DROPPED                                     | DROPPED                                      | P2                       |

### 7. Day-1 executable work — 2026-05-12 (Tue)

| Role  | Day-1 task                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------- |
| AG-S  | Create `@seta/agent-core` package via `pnpm new:package`; commit `ModelAdapter` + `KernelChunk` types + `ModelStream<T>` interface; ADR-0010 (kernel boundary). **Spike `agent_vector.chunks` schema design in parallel notebook** to de-risk the W2 RAG-2 stream. |
| AG-F1 | Create `@seta/agent-core/testkit` shape; implement `setupLLMRecording({name})` via msw. Scaffold `@seta/agent-chunking` package (W1 second-half work). |
| AG-F2 | Fill in missing files in `modules/connectors/ms365-planner/` per its SCOPE.md "Missing vs setup.md §11": `client.ts`, `cache.ts`, `etag.ts`, `schema.ts`, `drizzle.config.ts`, `migrations/`. Scaffold `@seta/agent-embeddings` package (W1 second-half work). |
| FS    | Audit `apps/api/src/main.ts` and `env.ts` for env vars; wire OTel boot per CLAUDE.md footgun (start via `node --import ./instrumentation.ts`); commit docker compose with Postgres + pgvector + Jaeger. **Kick off RAG data survey (X0) — corpus source inventory by EOD 2026-05-13.** |

---

## Sheet 2 — What the sponsor will see at M6 demo (revised v3.1)

### 2.1 Live demo flow — P1.0 on 2026-05-29 (5 minutes, recorded)

| #  | What you see                                                                                  | Where                | Why it matters                                                                       |
| -- | --------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ |
| 1  | Open Microsoft Teams (dev tunnel via `ngrok`), type "Summarize my open Planner tasks"         | Teams desktop        | Real Teams round-trip                                                                |
| 2  | Streaming response renders word-by-word                                                       | Teams chat           | Kernel + SSE protocol end-to-end                                                     |
| 3  | Receive a simple Adaptive Card with a task list (no charts in P1.0)                           | Teams chat           | Real Planner data through MS Graph                                                   |
| 4  | Type a follow-up referring to the prior turn                                                  | Teams chat           | `@seta/agent-memory` recall returns prior context                                    |
| 5  | Type "Create a task in plan X called Y"                                                       | Teams chat           | WRITE path with preview/commit safety                                                |
| 6  | Agent returns a **preview card** with confirmation buttons                                    | Teams chat           | `write_continuations` HMAC-protected preview/commit gate                             |
| 7  | User confirms; agent commits; new task appears in Microsoft Planner                           | Teams chat + Planner | Write reflects in real MS Planner immediately                                        |
| 8  | (Optional) Demonstrate workflow `.then(a).parallel([b,c])` via dev shell                      | Terminal             | Proves `@seta/agent-workflows` minimum surface                                       |
| 9  | **(NEW)** Show CLI ingestion: `pnpm rag:ingest --subset` → vector store fills; query returns top-k chunks for a sample query | Terminal | Proves RAG-1 + RAG-2 + RAG-3 libraries work end-to-end, even though no user-facing FAQ Agent yet |

### 2.2 Live demo flow — P1.5 on 2026-06-12 (under Option D)

| #  | What you see                                                                                  | Where        | Why it matters                                                       |
| -- | --------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| 1  | "Who is overloaded this week?" → Analytics Agent returns bar-chart Adaptive Card              | Teams chat   | Analytics Agent + chart-card UX live                                 |
| 2  | "Summarize task distribution across plans X / Y / Z" → grouped chart                          | Teams chat   | Read-only aggregation tools                                          |
| 3  | "What is Seta's PTO policy?" → FAQ Agent returns answer with **inline citations** to corpus chunks | Teams chat | RAG-3 wired; ≥80% citation coverage on demo loop (BK-7)              |
| 4  | Click a citation → expands to source chunk (provenance gate)                                  | Teams chat   | Multi-tenant RAG with auditable provenance                           |

### 2.3 Tangible deliverables (revised)

| #  | Artifact                                                                                                            | Where it lives                                                                                             | Tier |
| -- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| 1  | Recorded 5-min P1.0 demo                                                                                            | `docs/demos/2026-05-29-p1.0-demo.mp4`                                                                      | P1.0 |
| 2  | Repo at green CI on `main`                                                                                          | `pnpm typecheck && pnpm lint && pnpm test:unit` green; smoke suite green                                   | P1.0 |
| 3  | New packages: `@seta/agent-core`, `-memory`, `-workflows`, `-chunking`, `-embeddings`, `-vector`, `-rag`             | Seven new platform packages                                                                                | P1.0 |
| 4  | ADR-0010 (kernel boundary), ADR-0011 (workflow MV surface), ADR-0012 (memory home), ADR-0013 (vector schema + iterative_scan), ADR-0014 (RAG corpus structure) | `docs/adr/`                                  | P1.0 |
| 5  | Decision memo for sponsor (P1.5 scope confirmation)                                                                 | `docs/plans/2026-05-31-p1.0-outcome.md`                                                                    | P1.0 |
| 6  | Dev docker compose                                                                                                  | `pnpm db:up && pnpm dev`                                                                                   | P1.0 |
| 7  | Corpus inventory + structured drops                                                                                 | `docs/corpus/` + `apps/api/data/corpus/`                                                                   | P1.0 |
| 8  | **(P1.5)** Analytics Agent + FAQ Agent live + recorded demo                                                         | `docs/demos/2026-06-12-p1.5-demo.mp4`                                                                      | P1.5 |

### 2.4 What is explicitly NOT in the P1 demo (any option)

No AWS staging URL, no public repo, no npm packages, no SSO web login, no Studio, no Python framework, no eval set, no Sentry / CloudWatch / cost dashboards, no multi-agent Coordinator, no Supervisor scorer.

---

## Sheet 3 — Stream / package breakdown with SP estimates (revised v3.1)

The revised plan groups work by **package** because the team is too small to coordinate at capability granularity.

| Stream                                  | Owner(s)        | Packages touched                                              | SP (Fib) | PD est. | Tier | Capacity budget                            |
| --------------------------------------- | --------------- | ------------------------------------------------------------- | -------: | ------: | ---- | ------------------------------------------ |
| K — Kernel (`@seta/agent-core`)         | AG-S + AG-F1    | `platform/agent/core`                                         |       21 |    10–11 | P1.0 | AG-S 8 PD + AG-F1 3 PD                     |
| MEM — Memory                            | AG-S            | `platform/agent/memory`, `platform/db`                        |        8 |     4–5 | P1.0 | AG-S 4 PD                                  |
| WF — Workflows                          | AG-S            | `platform/agent/workflows`, `platform/db`                     |        8 |     4–5 | P1.0 | AG-S 4 PD                                  |
| **X0 — RAG data survey + structuring**  | FS + AG-F (PT)  | `docs/corpus/`, `apps/api/data/corpus/`                       |    **8** | **4**   | P1.0 | FS 3 PD + AG-F 1 PD                        |
| **RAG-1a — `@seta/agent-chunking`**     | AG-F1           | `platform/agent/chunking` (new)                               |    **5** | **2**   | P1.0 | AG-F1 2 PD                                 |
| **RAG-1b — `@seta/agent-embeddings`**   | AG-F2           | `platform/agent/embeddings` (new)                             |    **5** | **2**   | P1.0 | AG-F2 2 PD                                 |
| **RAG-2 — `@seta/agent-vector`**        | AG-S            | `platform/agent/vector` (new), `platform/db`                  |    **8** | **4**   | P1.0 | AG-S 4 PD                                  |
| **RAG-3 — `@seta/agent-rag`**           | AG-S            | `platform/agent/rag` (new)                                    |    **5** | **3**   | P1.0 | AG-S 3 PD                                  |
| MS — Graph + Planner connector          | AG-F2           | `platform/ms-graph`, `modules/connectors/ms365-planner`       |       13 |     8–9 | P1.0 | AG-F2 9 PD                                 |
| PRD-P — Planner product (agent)         | AG-F1 + AG-S    | `modules/products/agent` (`tools/planner/{read,write}`)       |       13 |     7–8 | P1.0 | AG-F1 6 PD + AG-S 1 PD                     |
| CH — Teams channel                      | FS + AG-F1      | `modules/channels/teams`                                      |        8 |     4–5 | P1.0 | FS 3 PD + AG-F1 2 PD                       |
| WRP — `apps/api` composition            | FS              | `apps/api/src/main.ts`, `env.ts`, `instrumentation.ts`        |        5 |     2–3 | P1.0 | FS 2 PD                                    |
| Smoke + P1.0 demo                       | AG-S + FS       | 4 smoke tests + demo recording                                |        3 |     1–2 | P1.0 | shared, last 2 days                        |
| **A1 — Analytics Agent (P1.5 under D)** | AG-F1 + AG-S    | `modules/products/agent` (Analytics defn + tools)             |    **8** | **5–6** | P1.5 | AG-F1 4 PD + AG-S 1 PD                     |
| **A2 — Seta FAQ Agent (P1.5 under D)**  | AG-F2 + AG-S    | `modules/products/agent` (FAQ defn + retrieve/cite tools)     |    **8** | **4–5** | P1.5 | AG-F2 3 PD + AG-S 2 PD                     |
| **TOTAL P1.0 (planned)**                |                 |                                                               |  **110** | **57–69 PD** | — | **49 PD supply (3.5 FTE × 14d)**           |
| **TOTAL P1.5 (planned, under D)**       |                 |                                                               |   **16** | **9–11 PD**  | — | **17.5 PD supply (3.5 FTE × 5d, parallel ramp-down assumed)** |

**Utilisation (P1.0 only):** 57–69 / 49 = **116%–141% — STRUCTURALLY OVER.** This is the v3.1 capacity crisis in one number. Even at the optimistic end (57 PD) the team is 8 PD over supply; at the conservative end (69 PD) the gap is 20 PD. Mitigation: Options A/B/D in §0.5. **There is no realistic reshuffle of these hours that closes the gap inside 49 PD.**

**Note on SP-to-PD ratio:** v3.0 used 1 SP ≈ 0.5–0.6 PD. v3.1 retains the same ratio. RAG-1a/1b are sized at the low end (1 SP ≈ 0.4 PD) reflecting library-only deliverables with limited integration burden in P1.0; RAG-2 is at the high end (1 SP ≈ 0.5 PD) reflecting the schema correctness work. If actuals come in higher, RAG-3 composition collapses first.

---

## Sheet 4 — Master Timeline (compressed weekly, revised v3.1)

`█` = active. ◆ = milestone. Dates Mon–Fri working days only. P1.5 columns shown under Option D.

| Stream                  | Owner          | PD  | W1 05-12 → 05-15 | W2 05-18 → 05-22 | W3 05-25 → 05-29 | P1.5 W4 06-01 → 06-05 | P1.5 W5 06-08 → 06-12 |
| ----------------------- | -------------- | --: | :--------------: | :--------------: | :--------------: | :-------------------: | :-------------------: |
| K — Kernel              | AG-S + AG-F1   |  10 |        █         |       █ ◆        |                  |                       |                       |
| MEM — Memory            | AG-S           |   4 |        █         |        █         |       █ ◆        |                       |                       |
| WF — Workflows          | AG-S           |   4 |                  |        █         |       █ ◆        |                       |                       |
| **X0 — RAG survey**     | FS + AG-F (PT) |   4 |        █         |        █         |       █ ◆        |          █            |                       |
| **RAG-1a chunking**     | AG-F1          |   2 |        █         |        █         |        ◆         |                       |                       |
| **RAG-1b embeddings**   | AG-F2          |   2 |                  |        █         |       █ ◆        |                       |                       |
| **RAG-2 vector**        | AG-S           |   4 |                  |        █         |       █ ◆        |                       |                       |
| **RAG-3 composition**   | AG-S           |   3 |                  |        █         |       █ ◆        |                       |                       |
| MS — Graph + Planner    | AG-F2          |   9 |        █         |        █         |        █         |                       |                       |
| PRD-P — Planner Agent   | AG-F1 + AG-S   |   8 |                  |        █         |       █ ◆        |                       |                       |
| CH — Teams channel      | FS + AG-F1     |   5 |        █         |        █         |       █ ◆        |                       |                       |
| WRP — apps/api wiring   | FS             |   3 |        █         |        █         |        █         |                       |                       |
| Smoke + P1.0 demo       | AG-S + FS      |   2 |                  |                  |    █ ◆ M6 P1.0   |                       |                       |
| **A1 — Analytics (P1.5)** | AG-F1 + AG-S |   6 |                  |                  |                  |          █            |       █ ◆ M7          |
| **A2 — FAQ (P1.5)**     | AG-F2 + AG-S   |   5 |                  |                  |                  |          █            |       █ ◆ M7          |

---

## Sheet 5 — Resources Plan (weekly person-days, revised v3.1)

Each "FTE" cell is in person-days for the week. Working days: W1 = 4, W2 = 5, W3 = 5. **Demand exceeds supply per role in W2 and W3 even with aggressive parallelisation.** This is the capacity crisis in tabular form.

| Role              | FTE | W1 supply | W1 demand                                          | W2 supply | W2 demand                                                                       | W3 supply | W3 demand                                                                       | Total supply | Total demand | Overrun |
| ----------------- | --: | --------: | -------------------------------------------------: | --------: | ------------------------------------------------------------------------------: | --------: | ------------------------------------------------------------------------------: | -----------: | -----------: | ------: |
| **AG-S** (1.0)    | 1.0 |      4    | 4 (K3 + MEM1)                                       | 5         | 7 (K2 + MEM2 + WF1 + RAG-2 1 + RAG-3 1)                                          | 5         | 7 (WF2 + PRD WRITE1 + RAG-2 2 + RAG-3 2)                                         | 14           | **18**       | **+4**  |
| **AG-F1** (1.0)   | 1.0 |      4    | 4 (K-testkit 2 + RAG-1a chunking 1 + Planner READ prep 1) | 5    | 6 (OpenAI adapter 1 + RAG-1a chunking 1 + Planner READ 3 + Teams JWT 1)        | 5         | 6 (Planner READ 2 + Teams JWT 1 + smoke 1 + buffer 2)                          | 14           | **16**       | **+2**  |
| **AG-F2** (1.0)   | 1.0 |      4    | 4 (Graph client)                                    | 5         | 6 (Planner connector READ 3 + RAG-1b embeddings 2 + fixtures 1)                  | 5         | 6 (Planner connector WRITE 3 + RAG-1b embeddings 1 + fixtures 2)                | 14           | **16**       | **+2**  |
| **FS** (0.5)      | 0.5 |      2    | 3 (apps/api boot 1.5 + X0 corpus survey 1.5)        | 2.5       | 4 (Teams skeleton 1.5 + mount 1 + X0 corpus curation 1.5)                       | 2.5       | 3 (smoke 1 + demo 1 + X0 ingestion dry-run 1)                                   | 7            | **10**       | **+3**  |
| **TOTAL**         | **3.5** | **14**| **15**                                              | **17.5**  | **23**                                                                          | **17.5**  | **22**                                                                          | **49**       | **60**       | **+11** |

Utilisation: **60 / 49 = 122%**. Conservative estimate; high end of band reaches **149%** (73 PD demand). **Every role is over.** AG-S is over by 4 PD (29% over capacity) — and AG-S is the single point of failure for kernel + memory + workflow + vector + RAG composition. One sick day collapses three streams.

### Capacity overruns by role (visible to sponsor)

| Role  | Supply | Demand (mid) | Overrun | What gets dropped first if not mitigated                                          |
| ----- | -----: | -----------: | ------: | --------------------------------------------------------------------------------- |
| AG-S  |    14  |          18  |    +4   | RAG-3 composition (defers to P1.5); then `.parallel()` from WF                    |
| AG-F1 |    14  |          16  |    +2   | Planner READ "search" tool (keep list + get only); Analytics defn stretch removed |
| AG-F2 |    14  |          16  |    +2   | RAG-1b embeddings deeper test coverage; Planner WRITE etag edge cases             |
| FS    |     7  |          10  |    +3   | X0 ingestion dry-run (corpus stays as files, not vectorised in W3); smoke pared   |

**Total overrun: ~11 PD on the mid estimate; up to 24 PD on the conservative end.** Without Options A/B/D this is the slip in numerical form.

---

## Sheet 6 — Status Dashboard (revised v3.1)

### KPIs (engineering)

| Total streams | Total SP (P1.0) | Total PD est. (P1.0) | Total PD supply | Pre-rework util | P1.5 streams | P1.5 PD est. |
| ------------: | --------------: | -------------------: | --------------: | --------------: | -----------: | -----------: |
|            13 |             110 |              57–69   |              49 |    **116–141%** |            2 |        9–11  |

### Progress by stream (kickoff state)

| Stream     | SP | Owner pool      | PD est. | Tier | Status      |
| ---------- | -: | --------------- | ------: | ---- | ----------- |
| K          | 21 | AG-S + AG-F1    |   10–11 | P1.0 | Not started |
| MEM        |  8 | AG-S            |    4–5  | P1.0 | Not started |
| WF         |  8 | AG-S            |    4–5  | P1.0 | Not started |
| X0         |  8 | FS + AG-F (PT)  |    4    | P1.0 | Not started |
| RAG-1a     |  5 | AG-F1           |    2    | P1.0 | Not started |
| RAG-1b     |  5 | AG-F2           |    2    | P1.0 | Not started |
| RAG-2      |  8 | AG-S            |    4    | P1.0 | Not started |
| RAG-3      |  5 | AG-S            |    3    | P1.0 | Not started |
| MS         | 13 | AG-F2           |    8–9  | P1.0 | Not started |
| PRD-P      | 13 | AG-F1 + AG-S    |    7–8  | P1.0 | Not started |
| CH         |  8 | FS + AG-F1      |    4–5  | P1.0 | Not started |
| WRP        |  5 | FS              |    2–3  | P1.0 | Not started |
| Smoke+demo |  3 | AG-S + FS       |    1–2  | P1.0 | Not started |
| A1 (Analytics) | 8 | AG-F1 + AG-S |    5–6  | P1.5 | Not started |
| A2 (FAQ)   |  8 | AG-F2 + AG-S    |    4–5  | P1.5 | Not started |

---

## §7 — Risk register (revised v3.1 — top 5, sharpened)

| #  | Risk                                                                                                                                                                                                                                                                                                                                                                                                                          | Likelihood   | Impact       | Mitigation                                                                                                                                                                                                                                                                                                                                                                          | Owner       |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1  | **PLAN DEMAND EXCEEDS SUPPLY BY 22–49%. Slip is the central case, not the tail.** v3.1 demand 60–73 PD against 49 PD supply (§0.5, Sheet 5). Slip cannot be engineered away by reordering hours; it can only be addressed by Option A (deadline), Option B (hire), or Option D (pre-announce P1.5).                                                                                                                                                              | **Certain (without sponsor decision)** | **Critical** | **Sponsor decision on §10 Q1 and Q10 by 2026-05-15 EOD.** If neither A nor B is chosen, AG-S executes Option D: P1.0 lands Planner + RAG libraries on 2026-05-29; Analytics + FAQ pre-announced as P1.5 on 2026-06-12. **No silent slips.** The 2026-05-15 EOD checkpoint is the only honest pivot point. | AG-S (PM)   |
| 2  | **RAG track is the largest single bet of new work** — 4 new packages + corpus collection + chart-card UX (P1.5), none of which existed in any form before this week. High execution risk; high integration risk between chunking↔embeddings↔vector↔rag. setup.md §6 explicitly calls out the iterative_scan correctness gate, which is silent-failure on regression.                                                       | **High**     | **Critical** | RAG-2 schema spike on Day 1 (2026-05-12, AG-S in parallel notebook). RAG-1a + RAG-1b ship as **libraries only in P1.0** — no product integration until P1.5 unless Option A/B chosen. Per-tenant correctness fixtures land before any product wires to vector. RAG-3 composition is the first stream dropped if AG-S overruns.                                                  | AG-S        |
| 3  | **Senior AI 2 × 0.5 split is the single most fragile element.** AG-S now serves kernel + memory + workflow + agent-vector + RAG composition oversight (18 PD demand vs 14 PD supply per Sheet 5). One sick day collapses three streams. Architecture work is on the AG-S critical path for K, MEM, WF, RAG-2, RAG-3.                                                                                                       | **Med-High** | **Critical** | FS named architecture backup. Daily 15-min sync. AG-S writes ADRs as design unfolds (FS can pick up from them). **If AG-S is sick for >1 day, drop RAG-3 composition first, then `.parallel()` from WF, then `agent-vector` HNSW (keep schema only with sequential scan).**                                                                                                          | AG-S + FS   |
| 4  | **FAQ Agent has a hard external dependency** — the corpus from the RAG data survey (X0). If the corpus isn't usable by EOD W2 (2026-05-22), FAQ Agent cannot integration-test in W3 even under Options A/B. Corpus risks: data not collected, format inconsistent, access rights unclear, citation requirements not met.                                                                                                  | **High**     | High         | X0 corpus inventory completes by EOD 2026-05-13 (Day 2). FS escalates immediately if any corpus source has unclear access rights or licensing. **If corpus isn't usable by 2026-05-22, FAQ Agent slips to P1.5 regardless of option** (Option D base case); Analytics Agent stays on 05-29 under Options A/B. PM communicates the corpus-readiness gate to sponsor on the 2026-05-15 status.                                       | FS + AG-S   |
| 5  | **Multi-tenant pgvector + HNSW + iterative_scan + RLS is a known-correctness footgun zone.** setup.md §6 specifically flags the iterative_scan fix; errors here are **silent** — wrong rows returned, no exception. Cross-tenant data leak is the worst-case outcome. RLS bypass via vector similarity is a regression surface every test must hit.                                                                       | Med          | **Critical** | Per-tenant fixture tests **before** any production data lands in the vector store. Explicit `SET LOCAL app.tenant_id` test that runs an identical similarity query as two tenants and asserts disjoint chunk IDs. iterative_scan correctness test from setup.md §6 is a CI gate. AG-S owns the schema; freshers never write directly to `agent_vector.chunks` migrations.       | AG-S        |

### Risks de-emphasised vs v3.0 (and why)

- **v3.0 Risk #4 (MS Graph admin consent friction)** — still present but lower likelihood under v3.1 because RAG-2 silent-correctness now dominates. Mitigation: reuse Epic 1 app registration; new scopes via dev tenant fallback.
- **v3.0 Risk #5 (WF minimum surface)** — now subsumed under v3.1 Risk #3 (AG-S critical path). Same drop order applies.

### Risks de-emphasised vs v2.7 — unchanged from v3.0

The compressed plan removes (or downgrades) these v2.7 risks because the corresponding scope is dropped: Customer-data privacy review, Legal/OSS, AI assist savings, AWS RDS pgvector setup, Terraform state, P2 Frontend hiring lead time, Design-partner LOI.

---

## §8 — What was deferred to P1.5 / P2 (explicit, for sponsor visibility, revised v3.1)

P1.5 is a proposed 2-week follow-on increment **2026-06-01 → 2026-06-12** that captures what doesn't fit in P1.0 under Option D. The sponsor must decide whether to authorise it (see §10 Q6) — but absent Options A or B, the team will deliver Option D regardless of authorisation: the only question is whether P1.5 is funded as a named increment or appears as an unplanned slip.

### Deferred to P1.5 (Option D base case)

| Item                                                  | Reason for deferral                  | Recovery cost (est.) | Lands by   |
| ----------------------------------------------------- | ------------------------------------ | -------------------: | ---------- |
| **Analytics Agent** (definition + tools + chart-card) | v3.1 capacity overrun                | ~5–6 PD              | 2026-06-12 |
| **Seta FAQ Agent** (definition + retrieve/cite)       | v3.1 capacity overrun + corpus dependency | ~4–5 PD          | 2026-06-12 |
| RAG-3 composition wired to FAQ product                | Library lands P1.0; product wire P1.5 | ~2 PD AG-S           | 2026-06-12 |
| Full corpus ingestion run                             | Dry-run only in P1.0                 | ~2 PD FS             | 2026-06-12 |
| Sentry wiring                                         | No DevOps headcount in P1            | ~1 PD FS             | P1.5       |
| Inbound SSO web UI (Entra OIDC + Google OIDC)         | Sponsor confirmed deferral           | ~5 PD FS + AG-S      | P2         |
| 30-query eval set + replay harness                    | No QA headcount in P1                | ~3 PD                | P1.5       |
| Documentation suite + cookbook                        | Cut from P1.0 critical path          | ~2 PD                | P1.5       |
| Public OSS flip + npm publish + Legal sign-off        | Sponsor confirmed deferral           | ~3 PD                | P2         |

### Deferred to P2 (confirmed not P1 under any option)

| Item                                          | Confirms                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| AWS staging via Terraform (multi-AZ prod env) | Confirmed                                                                      |
| Studio web UI                                 | Confirmed; frontend role not on team                                           |
| Dual-language Python framework + FastAPI      | Confirmed                                                                      |
| Audit log domain + GDPR delete                | Confirmed                                                                      |
| Production secret rotation automation         | Confirmed                                                                      |
| CloudWatch SLO dashboards + alerting          | Confirmed                                                                      |
| Workflow engine `.branch()` / `.dowhile()` / `.foreach()` + pluggable `ExecutionEngine` | Per `platform/agent/workflows/SCOPE.md` |
| Semantic-recall memory (vector-backed)        | Per `platform/agent/memory/SCOPE.md`                                            |
| Long-term memory across conversations         | Per v2.7 §2.5 "P3"                                                              |
| Slack / Email / Voice channels                | Per v2.7 §2.5                                                                  |
| Billing / metering integration                | Per v2.7 §2.5                                                                  |
| Multi-region failover                         | Per v2.7 §2.5                                                                  |
| SOC 2 prep                                    | Per v2.7 §2.5                                                                  |

---

## §9 — Stakeholders, RACI & comms (compressed, revised v3.1)

### 9.1 Stakeholder map (revised)

| Stakeholder                      | Role                       | Engagement (compressed cadence)                                        |
| -------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| CEO + CTO                        | Sponsor                    | **Twice-weekly written status** (Tue + Fri EOD); **mid-W1 capacity-gate decision Fri 2026-05-15 16:00**; P1.0 demo 2026-05-29; P1.5 demo 2026-06-12 (under Option D) |
| PMO                              | Approver                   | Friday-only written status; risk register attached                     |
| Head of Sales                    | Consulted                  | M6 demo recording shared; LOI track P1.5+                              |
| Head of Security                 | Consulted                  | Two review checkpoints: M-MEM (2026-05-27) + **M-RAG vector RLS gate (2026-05-29)** |
| Head of Legal                    | (Not engaged in P1)        | Re-engaged in P1.5+ if OSS publishing authorised                       |
| Seta IT                          | Consulted (Entra + corpus) | Engaged via Epic 1; **also engaged for corpus access rights review by EOD 2026-05-13** |
| Project team (3.5 FTE)           | Responsible                | Daily 15-min standup (9:30); Friday 30-min retro                       |

### 9.2 RACI for the revised P1 gates

| Gate                              | R (Responsible)  | A (Accountable) | C (Consulted)         | I (Informed)        |
| --------------------------------- | ---------------- | --------------- | --------------------- | ------------------- |
| **W1 capacity-gate (2026-05-15)** | AG-S             | **CEO + CTO**   | FS                    | PMO                 |
| M-K Kernel acceptance             | AG-S + AG-F1     | AG-S            | FS                    | CTO                 |
| M-MEM Memory bound                | AG-S             | AG-S            | FS, Security          | CTO                 |
| M-WF Workflow smoke               | AG-S             | AG-S            | FS                    | CTO                 |
| **M-RAG (vector + RLS gate)**     | AG-S             | AG-S            | **Security**          | CTO                 |
| **X0-gate (corpus ready)**        | FS               | AG-S            | Seta IT               | CTO                 |
| M-CH Teams round-trip             | FS + AG-F1       | AG-S            | AG-F2                 | CTO, Seta IT        |
| **M6 P1.0 Demo (2026-05-29)**     | AG-S + FS        | AG-S            | All team              | CEO, CTO, PMO       |
| **M7 P1.5 Demo (2026-06-12)**     | AG-S + AG-F      | AG-S            | All team              | CEO, CTO, PMO       |
| P1.5 / P2 go/no-go                | AG-S (recommend) | CEO + CTO       | PMO                   | All stakeholders    |

### 9.3 Communications cadence (compressed)

| What                              | Audience           | Frequency                        | Format                                      | Owner   |
| --------------------------------- | ------------------ | -------------------------------- | ------------------------------------------- | ------- |
| Daily standup                     | Project team       | Mon–Fri 9:30                     | 15 min sync                                 | AG-S    |
| Written status                    | CEO, CTO, PMO      | Tue + Fri EOD                    | 1-page email: progress + Risk #1 status     | AG-S    |
| **W1 capacity-gate review**       | CEO, CTO, AG-S, FS | **Fri 2026-05-15 16:00**         | **30 min — sponsor picks A/B/C/D**          | AG-S    |
| Weekly retro                      | Project team       | Fri 16:00                        | 30 min                                      | AG-S    |
| **M6 P1.0 demo**                  | CEO, CTO, PMO      | Fri 2026-05-29 14:00             | 5-min recording + 25 min Q&A                | AG-S    |
| Post-P1.0 decision memo           | CEO, CTO, PMO      | Mon 2026-06-01 EOD               | Written: P1.5 scope + execution status      | AG-S    |
| **M7 P1.5 demo (Option D)**       | CEO, CTO, PMO      | Fri 2026-06-12 14:00             | 5-min recording + 25 min Q&A                | AG-S    |

---

## §10 — Decisions required from sponsor (BEFORE 2026-05-15 EOD)

v3.1 sharpens the sponsor-decision list because the deadline for the most important question (Q1) has moved earlier. Under the v3.1 mandate, **Q1 must be answered before W1 close** — if 2026-05-31 is still hard and the hire is not authorised, Option D is the only achievable path and the sponsor must hear it now to avoid a surprise on 2026-05-29.

| #   | Decision                                                                                                                                                                                                                                                                                | Default if not answered                                                                                                                            | Deadline       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Q1  | **Is 2026-05-31 still a hard deadline given the v3.1 scope additions, or will it move to 2026-06-12 (Option A)?** §0.5 demonstrates the literal mandate is infeasible. If 05-31 is hard *and* Q10 says "no hire", Option D is the only honest plan.                                | Treated as **hard** — Option D in effect (P1.0 on 05-29; P1.5 on 06-12).                                                                          | **2026-05-15 EOD** |
| Q2  | OSS public flip + npm publish — confirmed slip to P1.5+?                                                                                                                                                                                                                                | Treated as **slipped** (no change from v3.0).                                                                                                       | 2026-05-12 AM  |
| Q3  | Inbound web SSO (Entra + Google OIDC web flow) — confirmed deferred to P2?                                                                                                                                                                                                              | Treated as **deferred** (no change from v3.0).                                                                                                      | 2026-05-12 AM  |
| Q4  | AWS staging deployment — confirmed dev compose only?                                                                                                                                                                                                                                    | Treated as **dev compose only** (no change from v3.0).                                                                                              | 2026-05-12 AM  |
| Q5  | Memory + workflow P1 overrides — still firm under v3.1?                                                                                                                                                                                                                                 | Treated as **firm**. Drop order if forced: `.parallel()` from WF, then RAG-3 composition, then full WF, then memory recall (working-memory only). | 2026-05-13 EOD |
| Q6  | **P1.5 increment (2026-06-01 → 2026-06-12) — authorised?** This is the home for Analytics + FAQ + RAG product wire under Option D. Recruiting/contracting for P1.5 needs notice now if planned.                                                                                       | Treated as **TBD — confirm at M6 demo 2026-05-29**. AG-S executes P1.5 work plan regardless, but staffing decisions stall without authorisation.   | 2026-05-15 EOD |
| Q7  | In the event of slippage, preferred remedy — deadline relief (A), team expansion (B), scope cut (C, contradicts mandate), or pre-announced split (D)?                                                                                                                                  | Treated as **Option D** per PM recommendation in §0.5.                                                                                              | **2026-05-15 EOD** |
| Q8  | "No dedicated QA in P1" — sponsor accepts freshers doubling as QA?                                                                                                                                                                                                                      | Treated as **yes** (no change from v3.0).                                                                                                           | 2026-05-12 AM  |
| **Q9** | **(NEW) Of the three agents (Planner / Analytics / FAQ), if exactly one must ship by 2026-05-31, which is it?** AG-S recommends **Planner** (lowest external dependency; most tool-call complete via Epic-1 ground work). Analytics ships next under Option D (read-only, no RAG). **FAQ slips to P1.5** because it has the most external dependencies (corpus + RAG-3 wire + citation review). | Treated as **Planner only on 05-29**; Analytics + FAQ to P1.5.                                                                                     | **2026-05-15 EOD** |
| **Q10** | **(NEW) Will the sponsor authorise a +1 senior AI hire (Option B), onboarded by 2026-05-15, to make P1 + 2026-05-31 achievable with full scope?** This is the only path to "all scope, original deadline" without heroics. A "no" here, combined with a "hard" Q1, forces Option D. | Treated as **no hire** — Option D execution proceeds.                                                                                              | **2026-05-15 EOD** |

**The three decisions that must come by 2026-05-15 EOD** to avoid a silent slip: **Q1 (deadline), Q7 (remedy preference), Q10 (hire authorisation)**. Q6 and Q9 are strongly preferred by 2026-05-15 but can land within W2 without breaking the plan.

---

## §11 — Pre-kickoff approval checklist (revised v3.1)

| #   | Item                                                                                                                  | Owner            | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| 1   | §0.5 capacity math reviewed and acknowledged by CEO + CTO                                                              | CEO + CTO        | Pending |
| 2   | **Option A / B / C / D chosen explicitly** (PM recommends A or B; failing both, D)                                    | CEO + CTO        | **Pending — 2026-05-15 EOD** |
| 3   | §10 sponsor decisions Q1–Q10 answered (or defaults accepted in writing)                                                | CEO + CTO        | Pending |
| 4   | §6 disposition table reviewed; sponsor accepts the P1.0/P1.5/DROPPED split for the chosen option                       | CEO + CTO        | Pending |
| 5   | §0 revised BK KPIs accepted (BK-1/3/4/6/7 — BK-2, BK-5 deferred)                                                       | CEO + CTO        | Pending |
| 6   | All 3.5 P1 team members confirmed available 100% of their FTE from 2026-05-12 to 2026-05-29 (and to 2026-06-12 under D) | CTO + HR         | Pending |
| 7   | Entra admin consent for existing Planner scopes verified; **corpus access rights for X0 confirmed by 2026-05-13**     | AG-S + Seta IT   | Pending |
| 8   | Acknowledgement that v3.1 demand exceeds supply by 22–49% — slip is the central case without a sponsor decision        | AG-S + CEO + CTO | Pending |
| **9** | **(NEW) Q10 (hire authorisation) answered by 2026-05-15 EOD** — if "no" and Q1 is "hard", Option D is in force      | CEO + CTO + HR   | **Pending — 2026-05-15 EOD** |

---

## §12 — Changelog vs prior plans

This section documents the disposition of every prior section. No content has been silently dropped.

### v3.0 → v3.1 changes (this revision, 2026-05-12)

| Area                                          | v3.0 state                                                       | v3.1 state                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| §0.5 capacity math                            | Demand 40–48 PD vs supply 49 PD (marginally infeasible)          | **Demand 60–73 PD vs supply 49 PD (structurally infeasible)** — opens with explicit honest framing.                     |
| §0.5 options                                  | A / B / C with C recommended                                     | **A / B / C / D; A or B recommended, D as honest fallback under literal mandate. C explicitly NOT recommended** (contradicts sponsor reversal). |
| §3 objectives                                 | 6 objectives                                                     | **9 objectives, P1.0 / P1.5 tier marked**                                                                               |
| §4 roadmap                                    | 3 weeks                                                          | **3 weeks P1.0 + 2 weeks P1.5 columns**; 6 new streams added (X0, RAG-1a, RAG-1b, RAG-2, RAG-3, A1, A2)                  |
| §5 milestones                                 | M-K, M-MEM, M-WF, M-CH, M6                                       | **+ M-RAG, X0-gate, M7 P1.5**                                                                                            |
| §6 disposition                                | Single drop list                                                 | **Tri-state disposition table: P1.0 / P1.5 / DROPPED, with Option-A vs Option-D vs Option-C columns**                  |
| Sheet 3 SP table                              | 8 streams, 79 SP, 40–48 PD                                       | **15 streams, 126 SP total, 57–69 PD P1.0 + 9–11 PD P1.5**                                                              |
| Sheet 5 capacity table                        | 96% utilisation                                                  | **122% utilisation (mid); every role overrun visible per row**                                                          |
| §7 risks                                      | Top 5; #1 was "math doesn't work, slip is base case"             | **Top 5 sharpened**: #1 = structural infeasibility; #2 = RAG bet; #3 = AG-S split; #4 = corpus dependency; #5 = pgvector + iterative_scan + RLS silent-failure |
| §10 sponsor decisions                         | Q1–Q8                                                            | **Q1–Q10; Q9 (one-agent-by-05-31) and Q10 (hire authorisation) NEW; Q1 deadline moves earlier to 2026-05-15 EOD**       |
| §11 pre-kickoff checklist                     | 8 items                                                          | **9 items; item 2 makes the A/B/C/D choice explicit**                                                                   |

### Re-added to P1 in v3.1 (vs v3.0 drop list)

- **Analytics Agent** — back in P1.5 under Option D; back in P1 fully under Options A/B.
- **Seta FAQ Agent** — back in P1.5 under Option D; back in P1 fully under Options A/B.
- **Full RAG track** (`@seta/agent-chunking`, `-embeddings`, `-vector`, `-rag`) — libraries in P1.0; product wire in P1.5 under Option D; fully in P1 under Options A/B.
- **RAG data survey + corpus structuring** — parallel from W1 regardless of option.

### Items still dropped in v3.1 (sponsor has NOT overridden)

- Inbound web SSO (Entra + Google OIDC web flow) — Teams SSO + OBO only.
- Studio web UI.
- OSS public flip + npm publish.
- Dual-language Python framework + FastAPI service.
- AWS Terraform staging.
- (Plus all v2.7 → v3.0 items already listed in §6.)

### References to external contracts (unchanged + additions)

- The kernel + memory + workflow contracts: same as v3.0 (`platform/agent/core/SCOPE.md`, `platform/agent/memory/SCOPE.md`, `platform/agent/workflows/SCOPE.md`).
- **(NEW)** The RAG track contracts must land as new SCOPE.md files in W1 for each new package — `platform/agent/chunking/SCOPE.md`, `platform/agent/embeddings/SCOPE.md`, `platform/agent/vector/SCOPE.md`, `platform/agent/rag/SCOPE.md`. AG-S authors these alongside ADR-0013 (vector schema + iterative_scan).
- `platform/db` `OWNER_ORDER` must be expanded by 3 owners under v3.1: memory, workflows, **vector**.
- setup.md §6 specifies `agent_vector.chunks` schema, pgvector HNSW, and the iterative_scan fix — all are P1.0 requirements and the M-RAG gate.

---

**End of plan v3.1 (re-expansion after 2026-05-12 sponsor reversal).**
