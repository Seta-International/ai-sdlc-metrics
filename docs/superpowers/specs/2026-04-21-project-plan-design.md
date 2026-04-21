# Project Plan — Design Spec

**Date:** 2026-04-21
**Owner:** Canh Ta (PM)
**Status:** Draft for review (v3 — PPTX full-coverage audit + kickoff 22 Apr + VN holiday capacity)
**Related:** `docs/modules/planner.md` (BRD, input only), `docs/raws/Project_Plan_Template.pptx` (structure template), `CLAUDE.md` (stack reference)

---

## 1. Purpose

Produce the Project Plan for the Future Planner MVP and its three foundational tracks (Core Backend, Core Frontend, Core AI Agent). The plan is the PMO-facing delivery artefact: contract, scope, WBS, timeline, governance, RACI, risks, executive support.

This spec describes _what the single Excel workbook will contain, its sheet structure, and where content comes from_. It does not author the plan content itself — that follows once this spec is approved.

Scope covers the full arc from Kickoff (W1, **Wed 22 Apr 2026**) through full-coverage rollout (waves TBD), not just the 8-week build.

**Known capacity hit in Sprint 1:** Vietnamese public holidays in the week of 27 Apr 2026 remove ~3 working days. The plan must account for this — Sprint 1 is effectively 7 working days, not 10. This shifts the "First Working Version" milestone risk rightward; mitigation is explicit in `04-Timeline` Working Days column and `04-Timeline` Block 5 Holiday Calendar.

## 2. Goals

- One authoritative Project Plan artefact the PMO can open and act on.
- PPTX-template-shape preserved so the document reads the way SETA PMO expects.
- Every PPTX section represented as a workbook sheet — narrative and tabular alike.
- Every BRD REQ/NFR traces to at least one deliverable row; nothing silently dropped.
- Phasing is explicit for the Core AI Agent track (Phase 1 W1–W4, Phase 2 W5–W8); the other three tracks are single-phase.

## 3. Deliverable

**One Excel workbook:** `docs/project-plan/project-plan.xlsx`. No supporting Markdown files. No README.md.

Workbook structure follows PPTX Option 1: one sheet per PPTX section (9 template sections), plus one sheet per track brief, plus appendices. Total 18 sheets. Every element present in the PPTX template maps to a block in one of these sheets — see §3.3 PPTX coverage matrix.

### 3.1 Sheet index

| #   | Sheet                    | Maps to PPTX | Content type                                                                                                                                       |
| --- | ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `00-Cover`               | Slide 1      | Title, version, date, owner, approver list                                                                                                         |
| 2   | `00-TOC`                 | Slide 2      | Table of contents with hyperlinks to each sheet                                                                                                    |
| 3   | `01-Overview`            | Slides 3-5   | Info fields · Problem/Solution narrative · Key Components · SMART Objectives table                                                                 |
| 4   | `02-Contract`            | Slides 6-7   | Internal charter fields · Milestones & Deliverables table · Legal & Compliance                                                                     |
| 5   | `03-Scope`               | Slides 8-10  | WBS-Master (feature-level rollup) · In/Out of scope · CR process · CR log                                                                          |
| 6   | `04-Timeline`            | Slides 11-12 | Master timeline band (image/shapes) · Milestone tracking table · Sprint plan table                                                                 |
| 7   | `05-Approach`            | Slides 13-23 | Org chart · Escalation · Comms plan · SDLC + DoR/DoD · KPI dashboard · Technical approach · QA · CI/CD · AI differentiator · Definition of Success |
| 8   | `06-Resources`           | Slide 17     | Allocation table + RACI matrix                                                                                                                     |
| 9   | `07-DCA`                 | Slide 24     | Dependencies · Constraints · Assumptions                                                                                                           |
| 10  | `08-Risks-Issues`        | Slides 25-26 | Risk register · Heat map · Issues log · Process                                                                                                    |
| 11  | `09-ExecSupport`         | Slide 27+    | Budget · Decision SLA · Kill criteria                                                                                                              |
| 12  | `Track-Planner`          | —            | Full track brief (purpose, scope, deliverables, WBS, sprint plan, risks, DoD, open Qs)                                                             |
| 13  | `Track-CoreBackend`      | —            | Full track brief                                                                                                                                   |
| 14  | `Track-CoreFrontend`     | —            | Full track brief                                                                                                                                   |
| 15  | `Track-CoreAIAgent`      | —            | Full track brief with Phase 1 + Phase 2 blocks inside every sub-section                                                                            |
| 16  | `Appendix-BA-Legacy`     | —            | Parallel BA workstream (stakeholder map + legacy system requirement briefs)                                                                        |
| 17  | `Appendix-BRD-Coverage`  | —            | Traceability matrix: BRD REQ-XX / NFR-XX → track sheet + deliverable row                                                                           |
| 18  | `Appendix-PPTX-Coverage` | —            | Coverage matrix: every PPTX slide / sub-element → workbook sheet + block                                                                           |

### 3.2 Sheet-level content schemas

Each sheet uses a consistent two-column header layout: merged title row + sub-section blocks stacked vertically. Narrative sub-sections use wrapped-text cells; tabular sub-sections use bordered tables with filter-enabled headers.

**`01-Overview`**

- Block 1 — **Information** (field/value grid): BMM = Internal/Cost-saving; Duration = 22 Apr 2026 → full-coverage (TBD); Methodology = Agile Scrum 2-week; Stakeholders = Hung Vu / Thu Mai / Hoang Nguyen; Budget = team time + 1× Claude Max x20 + ~$200 AI cap; Version = 1.0.
- Block 2 — **Problem & Solution** (wrapped text, 2 cells): five operational costs from BRD §2.
- Block 3 — **Key Components** (card grid, 4 rows): Planner · Core BE · Core FE · Core AI Agent. Core AI Agent cell notes Phase 1/2.
- Block 4 — **SMART Objectives** (table): Objective · Metric · Target · Timeline · Owner (5 rows from BRD §3).

**`02-Contract`**

- Block 1 — **Internal Charter Fields**: Sponsor = Hung Vu; Technical Sponsor = Thu Mai; PMO = Hoang Nguyen; Payment Model → "Acceptance Weight"; SLA → Kill Criteria (links to `09-ExecSupport`); Governance = Steering cadence.
- Block 2 — **Milestones & Deliverables** (table): ID · Milestone · Planned · Actual · Owner · Acceptance Criterion · Acceptance Weight · Status.
  - Rows: Kick-off (22 Apr · W1) · Core Foundations (W2) · First Working Version (W4) · Core Agent Phase 1 complete (W4) · MVP Pilot-ready (W8) · Core Agent Phase 2 complete (W8) · Pilot gate (W12) · Wave 1 (TBD) · Full coverage (TBD) · Post-rollout review (TBD). Sprint 1 Planned dates honour the 3-day VN holiday (see `04-Timeline` Block 5).
- Block 3 — **Legal & Compliance Checklist** (two-column checklist, per PPTX Slide 6): NDA signed · Data protection & privacy clause (GDPR / local law) · IP ownership & license scope. Each item shows Status (✓ / pending / N/A) + owner. Internal project substitutions noted inline (e.g., NDA = N/A for internal; IP = SETA-owned).
- Block 4 — **Regulatory context** (wrapped text, from BRD §11): MS 365 SSO standards, Teams consent inherited, no audio stored, AI vendor disclosure, ap-southeast-1 data residency.

**`03-Scope`**

- Block 1 — **WBS-Master** (table, feature-level rollup): Track · Module · Function · Feature · Effort Low (MD) · Effort High (MD) · Confidence (H/M/L) · Owner · Sprint · Acceptance. Populated from the four track sheets; ~30–40 rows.
- Block 2 — **In Scope** (bulleted list) — from BRD §4.1.
- Block 3 — **Out of Scope** (bulleted list) — from BRD §4.3.
- Block 4 — **Change Request Process** (5-step flow, rendered as numbered text + diagram image).
- Block 5 — **CR Log** (table): CR ID · Description · Impact (Scope/Time/Cost) · Decision · Status.

**`04-Timeline`**

- Block 1 — **Master Timeline** (image or Excel shapes): week-by-week band chart W0 → full coverage.
- Block 2 — **Milestone Tracking** (table, same schema as `02-Contract` milestones but updated weekly): ID · Milestone · Planned · Actual · Status · Notes.
- Block 3 — **Sprint Plan** (table): Sprint · Start · End · Working Days · Goal · Scope · Deliverable · Exit Criterion · Status. 4 sprints × 2 weeks for build; pilot + rollout rows beyond. Working Days column nets out public holidays (e.g., Sprint 1 loses 3 days to the Vietnamese holiday in W1).
- Block 4 — **Status Legend** (color key, per PPTX Slide 12): On-track / Done · At risk / Slight delay · Blocked / Critical. Used by Blocks 2-3 cell fills.
- Block 5 — **Holiday Calendar** (table): Date · Holiday · Working-day impact · Sprints affected. Surfaces VN public holidays across the plan horizon so sprint capacity is honest.

**`05-Approach`** (largest sheet; stacked blocks mirror PPTX slides 13-23)

- Block 1 — **Organisation Chart** (embedded image, PPTX Slide 13 top): Steering Co. → PM → (PO, SM, BA, Tech Lead, AI Eng, Designer).
- Block 2 — **Roles & Responsibilities** (table, PPTX Slide 13 bottom): Role · Responsibilities. One row per role (PM · PO · SM · BA · Tech Lead · Dev · AI Eng · QA · DevOps · Designer).
- Block 3 — **Escalation Path** (3-tier block + SLA table, PPTX Slide 14): L1 (team issue, 24h) · L2 (multi-team, PM to sponsor) · L3 (critical, Steering Committee). Response SLA: P1 15min/4h · P2 1h/1bd · P3 4h/3bd · P4 1d/next release.
- Block 4 — **Communication Plan** (table, PPTX Slide 15 top): Ceremony · Audience · Frequency · Duration · Owner · Output. Includes BA parallel legacy-discovery interviews as a separate row.
- Block 5 — **Stakeholder Engagement Matrix** (2×2 grid, PPTX Slide 15 bottom): High/High → Manage Closely · High/Low → Keep Satisfied · Low/High → Keep Informed · Low/Low → Monitor. Each cell names the stakeholders placed there.
- Block 6 — **Methodology & SDLC** (method pick block + DoR/DoD table, PPTX Slide 18): Agile Scrum 2-week selected. Table: Phase · Input · Output · DoR · DoD · Owner. DoR/DoD sourced from CLAUDE.md testing rules (≥70% coverage, TDD, co-located tests, no `__tests__/`).
- Block 7 — **KPI Tracking Dashboard** (PPTX Slide 19): four metric tiles (Progress · Defect rate · Uptime · CSAT with target + status colour) + Sprint Velocity chart placeholder + Burn-down chart placeholder. Charts empty at plan time; populated weekly from sprint data.
- Block 8 — **Technical Approach** (6-card grid, PPTX Slide 20): Frontend · Backend · Database · Infrastructure · Observability · Security. Content verbatim from CLAUDE.md — Next.js multi-zones · NestJS · Drizzle / Postgres 16 · AWS ECS Fargate ARM64 · Langfuse · Entra ID SSO + RLS.
- Block 9 — **QA Approach** (PPTX Slide 21): test pyramid diagram (Unit 70% / Integration 20% / System 8% / UAT 2%) + **Test Type Ownership** table (Test Type · Scope · Owner: Unit/Integration/System/Performance/Security/UAT) + exit criteria (0 critical · ≤2 high with workaround · ≥95% test pass · coverage ≥70% per CLAUDE.md · security scan clean).
- Block 10 — **CI/CD Approach** (6-step flow + DORA metrics, PPTX Slide 22): Source (GitHub) · Build (GH Actions: lint · unit · SAST · image) · Test (Jest · Playwright) · Package (Docker ARM64 · ECR · SBOM · sign) · Deploy (ECS rolling or blue-green) · Monitor (Langfuse · CloudWatch · Sentry). DORA targets: Daily deploys · <1 day lead time · <15% change failure · <1 hour MTTR.
- Block 11 — **AI Differentiator** (6-card grid, PPTX Slide 23): per-role AI uplift — Dev (↑ productivity 25-40%) · QA (↓ manual effort 50%) · PM (early warning 2-3 sprints) · BA (faster discovery 30%) · Ops (↓ MTTR 40%) · Client (optional copilot). Tuned for 1× Claude Max x20 shared subscription.
- Block 12 — **Definition of Success** (4 quadrants, PPTX Slide 16): Delivery · Quality · Adoption · Outcome. Each quadrant carries 3-4 measurable criteria tied to BRD §7.1.

**`06-Resources`**

- Block 1 — **Allocation** (table): Role · Person · Effort % · Tracks covered. BA row notes flexible split between Planner MVP and legacy discovery; no fixed percentages.
- Block 2 — **RACI Matrix** (table): Task · PM · PO · SM · BA · AI Eng · FS #1 · FS #2 · DE · Designer. Exactly one A per row.

**`07-DCA`**

- Block 1 — **Dependencies** (table): Description · Impact · Owner · Due Date. MS Graph transcript subscription, Entra ID directory read, MS Planner API, existing docs (`docs/agents/*`, `docs/architecture/agent-runtime*.md`) for Phase 1.
- Block 2 — **Constraints** (table): Type · Description · Impact. 2-month build, ~5.5 FTE, English-only, desktop-only, MS 365 tenant cooperation, DE contingent.
- Block 3 — **Assumptions** (table): Assumption · Impact if false. From BRD §10.3.

**`08-Risks-Issues`**

- Block 1 — **Risk Register** (table): ID · Risk · Probability · Impact · Score · Mitigation · Owner · Status. Seeded from BRD §10.2 R-01..R-08.
- Block 2 — **Risk Heat Map** (3×3 grid with cell references): Probability × Impact, risks plotted by ID.
- Block 3 — **Issues Log** (table): ID · Description · Severity · Owner · Status · ETA.
- Block 4 — **Process** (wrapped text): Identify → Assess → Mitigate → Monitor.

**`09-ExecSupport`**

- Block 1 — **Budget** (wrapped text): team time + 1× Claude Max x20 + ~$200 AI cap per BRD §9. No dollar project budget.
- Block 2 — **Decision SLA** (table): Decision type · Approver · SLA. Sponsor 48h · CTO 24h on architecture · PMO 48h on rollout.
- Block 3 — **Kill Criteria** (table, from BRD §7.3): Measure · Pause-and-tune threshold · Stop-and-reconsider threshold.

**`Track-<name>`** (four sheets, same shape; Core AI Agent adds Phase 1/2 blocks)

- Block 1 — **Purpose** (wrapped text).
- Block 2 — **Scope** (In/Out/Dependencies sub-blocks).
- Block 3 — **Deliverables & Acceptance** (table): Deliverable · Acceptance criterion · Evidence · Milestone · BRD REQ/NFR.
- Block 4 — **WBS (task-level)** (table): Module · Function · Feature · Screen/API · Description · Effort Low · Effort High · Confidence H/M/L · Owner · Sprint · Acceptance · BRD ref. Core AI sheet adds a Phase column.
- Block 5 — **Sprint plan** (table): Sprint · Goal · Deliverable · Exit Criterion. Core AI: sprints 1-2 = Phase 1, sprints 3-4 = Phase 2.
- Block 6 — **Track-specific Risks** (table, same schema as master Risk Register).
- Block 7 — **Definition of Done** (bulleted list).
- Block 8 — **Open Questions** (table): Question · Owner · Needed-by date.

**`Appendix-BA-Legacy`**

- Narrative + table of legacy systems + stakeholder map. Explicitly out of scope for Planner MVP acceptance; surfaced so PMO sees BA's full load.

**`Appendix-BRD-Coverage`**

- Table: BRD REQ-XX / NFR-XX · Description · Covered by (track sheet + deliverable row reference) · Status (Covered / Deferred / Out-of-scope).

**`Appendix-PPTX-Coverage`**

- Table: PPTX Slide # · Slide title · Sub-element · Workbook sheet · Block # · Notes. One row per distinct sub-element in the template; used to prove 100% coverage at review time.

### 3.3 PPTX coverage matrix (summary)

High-level mapping — the full per-sub-element table lives on `Appendix-PPTX-Coverage`.

| PPTX slide | Title                                                 | Covered by                                      |
| ---------- | ----------------------------------------------------- | ----------------------------------------------- |
| 1          | Title                                                 | `00-Cover`                                      |
| 2          | Table of Contents                                     | `00-TOC`                                        |
| 3          | Project Overview — Information                        | `01-Overview` Block 1                           |
| 4          | Project Overview — Problems & Solution                | `01-Overview` Block 2                           |
| 5          | Project Overview — Solutions & Objectives             | `01-Overview` Blocks 3-4                        |
| 6          | Project Contract (fields + legal checklist)           | `02-Contract` Blocks 1, 3, 4                    |
| 7          | Project Contract — Milestones & Deliverables          | `02-Contract` Block 2                           |
| 8          | Estimation & Scope — WBS                              | `03-Scope` Block 1 + per-track WBS on `Track-*` |
| 9          | Estimation & Scope — In/Out                           | `03-Scope` Blocks 2-3                           |
| 10         | Estimation & Scope — Change Request                   | `03-Scope` Blocks 4-5                           |
| 11         | Project Timeline — Master Timeline                    | `04-Timeline` Block 1                           |
| 12         | Project Timeline — Milestone + Sprint + Status legend | `04-Timeline` Blocks 2-4                        |
| 13         | Approach — Org Structure + R&R                        | `05-Approach` Blocks 1-2                        |
| 14         | Approach — Escalation + SLA                           | `05-Approach` Block 3                           |
| 15         | Approach — Communication + Stakeholder Matrix         | `05-Approach` Blocks 4-5                        |
| 16         | Approach — Definition of Success                      | `05-Approach` Block 12                          |
| 17         | Approach — Allocation + RACI                          | `06-Resources` Blocks 1-2                       |
| 18         | Approach — Methodology + DoR/DoD                      | `05-Approach` Block 6                           |
| 19         | Approach — KPI Dashboard + Velocity + Burndown        | `05-Approach` Block 7                           |
| 20         | Approach — Technical Approach                         | `05-Approach` Block 8                           |
| 21         | Approach — QA (pyramid + test ownership + exit)       | `05-Approach` Block 9                           |
| 22         | Approach — CI/CD + DORA                               | `05-Approach` Block 10                          |
| 23         | Approach — AI Differentiator                          | `05-Approach` Block 11                          |
| 24         | Dependencies & Constraints                            | `07-DCA` Blocks 1-2                             |
| 25         | Assumptions + Risk Register + Heat Map                | `07-DCA` Block 3 + `08-Risks-Issues` Blocks 1-2 |
| 26         | Risk Process + Issue Tracking Log                     | `08-Risks-Issues` Blocks 3-4                    |

**Executive Support content** (PPTX section 9 — budget buffer, decision SLA) lives on `09-ExecSupport`. **Kill Criteria** is a Future-specific addition from BRD §7.3 substituting for the template's generic closure criteria. Both are surfaced on the coverage matrix row for completeness.

## 4. Trade-offs accepted

- **Excel is binary — no meaningful git diffs on narrative or numbers.** Accepted in favour of single-artefact PMO workflow.
- **Narrative in cells reads worse than in Markdown.** Mitigated by wrapped-text cells with generous row heights and a consistent block-title / block-body layout.
- **Diagrams become embedded images or Excel shapes.** Less clean than Mermaid; accepted for visual parity with the PPTX template.
- **Programmatic authoring is harder.** The plan will be generated once by script (openpyxl or equivalent) from structured inputs, then owned in Excel thereafter. The script is a one-shot generator, not a round-trip tool.

## 5. Team & RACI

| Role                     | Effort                 | Accountable for                                                                                                                                                       |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM (Canh)                | 50%                    | Backlog, prioritisation, scope (veto from Hung Vu), delivery, sponsor comms                                                                                           |
| PO                       | TBD                    | Story acceptance at sprint review, user representation in refinement                                                                                                  |
| Scrum Master             | 50%                    | Ceremonies, velocity tracking, unblocking                                                                                                                             |
| BA                       | 50% (flexible)         | Planner MVP: requirements, user stories, UAT, pilot feedback. Legacy systems: stakeholder interviews, requirement briefs for future modules. PM covers capacity gaps. |
| AI Engineer              | 100%                   | Core AI Agent (Phase 1 + 2), Agent module, conversational AI                                                                                                          |
| Full-Stack #1            | 100%                   | Planner module + Core Frontend                                                                                                                                        |
| Full-Stack #2            | 100%                   | Core Backend                                                                                                                                                          |
| Data Engineer            | 100% (if onboarded W1) | Core Data Platform (deferred-capable per BRD §4.1)                                                                                                                    |
| Designer-Lead (borrowed) | Part-time              | HITL queue, aggregated dashboards, action detail view                                                                                                                 |

PM and PO Accountable cells are adjacent, not conflicting: PM owns "what/when", PO owns "did we build the right thing this sprint". Every RACI row still has exactly one A.

## 6. Content sources

| Sheet / Block                   | Primary source                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `01-Overview` Info              | User-provided + BRD §8                                                                                            |
| `01-Overview` Problem/Solution  | BRD §2                                                                                                            |
| `01-Overview` Key Components    | BRD §4.1 + AI Phase 1/2 shape                                                                                     |
| `01-Overview` SMART Objectives  | BRD §3                                                                                                            |
| `02-Contract` Fields            | Authored (sponsors from BRD §12)                                                                                  |
| `02-Contract` Milestones        | Authored from BRD §8.2 + AI Phase 1/2 additions                                                                   |
| `02-Contract` Legal             | BRD §11                                                                                                           |
| `03-Scope` WBS-Master           | Authored — rollup from four track sheets                                                                          |
| `03-Scope` In/Out               | BRD §4.1, §4.3                                                                                                    |
| `04-Timeline`                   | Authored                                                                                                          |
| `05-Approach` Technical         | CLAUDE.md verbatim                                                                                                |
| `05-Approach` QA                | CLAUDE.md + PPTX template                                                                                         |
| `05-Approach` CI/CD             | Authored per CLAUDE.md                                                                                            |
| `05-Approach` AI differentiator | Authored from PPTX Slide 23                                                                                       |
| `05-Approach` DoS               | PPTX Slide 16 + BRD §7.1                                                                                          |
| `06-Resources`                  | Authored                                                                                                          |
| `07-DCA`                        | BRD §10.1, §10.3 + authored MS Graph specifics                                                                    |
| `08-Risks-Issues`               | BRD §10.2 + track-specific from each `Track-*` sheet                                                              |
| `09-ExecSupport`                | BRD §9, §7.3                                                                                                      |
| `Track-*`                       | BRD §6.1.x scoped to track + `docs/architecture/*.md` + `docs/agents/*` (Core AI Phase 1) + `DESIGN.md` (Core FE) |

## 7. Sign-off & review cadence (baked into the plan)

1. **Kickoff week (W1):** track leads validate WBS estimates on their sheet and close Open Questions. Deliverable, not optional.
2. **End of each sprint (W2, W4, W6, W8):** `04-Timeline` Milestones + Sprint Plan updated; status delta captured in `02-Contract` milestone rows.
3. **Mid-build (W4):** First Working Version demo → sponsor review → scope re-check against `03-Scope` In/Out.
4. **Pre-pilot gate (W8):** MVP sign-off against `05-Approach` Definition of Success. Go/no-go recorded on the milestone row.
5. **Pilot-to-Wave gate (W12):** BRD §7.3 kill criteria evaluated on `09-ExecSupport`; Steering Committee decides proceed / pause-and-tune / pivot.

## 8. Validation of the workbook itself

Before considering the plan shipped:

- **BRD coverage check:** every REQ-XX / NFR-XX appears in `Appendix-BRD-Coverage` with a non-empty "Covered by" reference.
- **Cross-reference check:** every milestone in `02-Contract` appears in `04-Timeline` and in the relevant `Track-*` sprint plan.
- **RACI integrity:** exactly one A per row on `06-Resources`.
- **WBS sanity:** sum of Effort High across all tasks per track ≤ available MD per track lead × 8 weeks; flag tracks over capacity.
- **Hyperlink check:** `00-TOC` hyperlinks all resolve; cross-sheet cell references (e.g., `02-Contract` → `09-ExecSupport` Kill Criteria) all valid.
- **PPTX coverage check:** every PPTX slide + sub-element appears in `Appendix-PPTX-Coverage` with a non-empty workbook sheet/block reference. No "not covered" rows.
- **Holiday calendar check:** `04-Timeline` Block 5 populated with all VN public holidays in the W1–W12 window; every Sprint row's Working Days column reflects deductions.

## 9. Generation approach

The workbook will be authored **once** by a one-shot Python script (openpyxl) that reads structured inputs (BRD references, stack from CLAUDE.md, milestone dates, WBS rows) and produces `docs/project-plan/project-plan.xlsx`. After generation, ownership passes to the PM — the Excel is the live artefact, not the script.

The script lives at `scripts/generate-project-plan.py` and is **not** a round-trip tool. Running it again overwrites the workbook; weekly PMO edits in Excel are not preserved by re-running. This is accepted; regeneration would only happen for a major structural revision.

## 10. Out of scope for this plan

- Writing implementation plans for any of the tracks (separate artefacts, created after this plan is approved).
- Drafting the SRS (separate artefact; follows this Project Plan).
- Pilot playbook and wave rollout runbook (separate artefacts created closer to the dates).
- Detailed test plans (QA approach summarised in `05-Approach`; detailed plans live per track later).
- Budget negotiation with Finance (the plan reflects the approved shape from BRD §9).

## 11. Open items not resolved in this spec

- PO allocation percentage (`06-Resources` allocation block, currently TBD).
- Whether Data Engineer onboarded by W1 (triggers inclusion of Core Data Platform as a fifth track sheet; otherwise operational-DB queries carry the MVP per BRD §4.1).
- Designer-Lead weekly window confirmation per BRD R-02 mitigation.
- Exact Vietnamese public holiday dates in W1 — user flagged ~3 working days lost in the week of 27 Apr 2026; government announcement text to be pasted into `04-Timeline` Block 5. Plus remaining 2026 VN public holidays across the W1–W12 window (Reunification 30 Apr, Labour 1 May, National Day 2 Sep if in window, etc.).
