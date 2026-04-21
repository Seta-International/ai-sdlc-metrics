# Sheet: 01-Overview

> PPTX Slides 3-5. Info + Problem/Solution + Key Components + SMART Objectives.

## Block 1 — Information (field/value grid)

| Field                | Value                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project Name         | Future — Planner MVP (with foundational Core Backend, Core Frontend, Core AI Agent slices)                                                                                       |
| Business Model (BMM) | Internal · Cost-saving                                                                                                                                                           |
| Duration             | 22 Apr 2026 → full-coverage rollout (TBD)                                                                                                                                        |
| Project Type         | Internal build · Non-billable                                                                                                                                                    |
| Methodology          | Agile Scrum · 2-week sprints                                                                                                                                                     |
| Stakeholders         | Hung Vu (CEO, Sponsor) · Thu Mai (CTO, Technical Sponsor) · Hoang Nguyen (PMO) · Pilot team (TBD W6)                                                                             |
| Budget               | Team time + 1× Claude Max x20 shared subscription + ~$200 AI API cap. No dollar project budget. Infrastructure + MS 365 licences covered under existing organisational accounts. |
| Version              | 1.0 — first published 22 Apr 2026                                                                                                                                                |

## Block 2 — Problem & Solution

### Current pain point

SETA's ~400 staff make commitments constantly — in standups, ceremonies, client calls, account reviews, leadership syncs, kickoffs — and those commitments live in Teams chats, personal notes, and people's heads. This produces five operational costs:

1. **The chase-up tax.** Managers spend a meaningful share of their week pinging team members on Teams about earlier commitments. It does not appear in timesheets but consumes real time and creates friction.
2. **No authoritative record.** When a manager asks, "What did we agree on last Thursday?" there is no single place to look.
3. **Completion without evidence.** "Done" means the owner said so — insufficient for high-stakes commitments.
4. **Portfolio blindness.** Leadership, line managers, and PMO cannot see in real time whether their area is healthy. Status is compiled manually on weekly cycles, stale by the time it is read.
5. **Strategic commitments evaporate.** Commitments made in leadership meetings carry the highest stakes and are the most likely to be forgotten, because the people making them are the busiest.

### Solution

Future's **Planner module** captures commitments made in Microsoft Teams meetings, tracks them to completion with evidence, synchronises bidirectionally with Microsoft Planner, and surfaces aggregated health views at every level of SETA's org chart. The **Agent module** (Core AI Agent + transcript-driven extraction) reduces the chase-up tax through AI-with-human-oversight. The **conversational AI interface** gives every role a natural-language way to query their action and meeting data.

This MVP also proves out **four foundational Future modules** — Core Backend, Core Frontend, Core AI Agent, and (contingent on Data Engineer onboarding) Core Data Platform — that every subsequent Future module will reuse.

## Block 3 — Key Components

| #   | Component                      | Role in MVP                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Planner (user-facing)**      | Action tracking, evidence capture, Meetings page, HITL review queue, aggregated views, executive digest, Microsoft Planner bidirectional sync. Built on top of Core BE + FE.                                                                                                                                                   |
| 2   | **Core Backend**               | Identity (Entra ID SSO), org-chart permissions engine (NFR-04), audit logging, RLS, MS 365 integration (Teams transcript webhook, Planner API, Entra directory read), outbound email gateway.                                                                                                                                  |
| 3   | **Core Frontend**              | Shared UI component library (`@future/ui`), design system per DESIGN.md, layout + navigation primitives (`@future/app-layout`), multi-zone pattern for 11 zones + web-shell.                                                                                                                                                   |
| 4   | **Core AI Agent (two phases)** | **Phase 1 (W1–W4):** LLM client, prompt management, confidence scoring, HITL routing engine, bounded tool/MCP registry. **Phase 2 (W5–W8):** Fine-tuning, security hardening (prompt-injection defence, permission enforcement at AI boundary, adversarial testing), free-form conversational queries beyond Phase 1 registry. |

**Out of build but feeds into:** Core Data Platform (Glue → Iceberg → Athena) runs on Core Data Platform timeline if DE onboarded by W1; otherwise deferred, aggregated views/digest run on direct operational DB for the MVP.

## Block 4 — SMART Objectives

| #   | Objective                                             | Metric                                                                                | Target                                                                                                                   | Timeline | Owner       |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- | ----------- |
| G1  | Reduce manager chase-up effort                        | Pilot managers' time-diary minutes spent chasing actions                              | Meaningful reduction W1-baseline → W4-pilot; fewer than 1/3 ICs report nudges unnecessary                                | Pilot W4 | PM          |
| G2  | Establish authoritative record of commitments         | Pilot Week-4 interview: "did you also write it down elsewhere?"                       | < 1/3 of pilot users still keep side-records                                                                             | Pilot W4 | BA          |
| G3  | Give every hierarchy level a useful area overview     | Leadership interview (5 leaders × 3 questions: saw it? acted on it? miss it if gone?) | ≥ 2 of 5 answer yes concretely to all three                                                                              | Pilot W4 | PM          |
| G4  | Catch commitments previously lost                     | BA manually extracts actions from ~12-20 sampled meetings; compared to Agent recall   | Recall ≥70%; reviewer acceptance ≥70%                                                                                    | Pilot W4 | BA + AI Eng |
| G5  | Build foundational modules that extend cleanly        | CTO architectural-review pass/fail on interface fitness                               | Pass (no rework needed for future modules)                                                                               | W8 gate  | CTO         |
| G6  | Prove the AI-with-human-oversight pattern             | HITL acceptance rate · review latency · reviewer feedback                             | Acceptance ≥70%, median latency ≤24h, reusable pattern                                                                   | Pilot W4 | AI Eng      |
| G7  | Establish natural-language interaction as first-class | ~30 sampled conversational queries — first-attempt correctness                        | ≥80% first-attempt correctness; no permission-leak incidents; ≥50% of interviewed pilot users have tried and find useful | Pilot W4 | AI Eng      |
