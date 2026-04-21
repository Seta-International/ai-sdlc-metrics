# Project Plan — Design Spec

**Date:** 2026-04-21
**Owner:** Canh Ta (PM)
**Status:** Draft for review
**Related:** `docs/modules/planner.md` (BRD, input only), `docs/raws/Project_Plan_Template.pptx` (structure template), `CLAUDE.md` (stack reference)

---

## 1. Purpose

Produce the Project Plan for the Future Planner MVP and its three foundational tracks (Core Backend, Core Frontend, Core AI Agent). The plan is the PMO-facing delivery artefact: contract, scope, WBS, timeline, governance, RACI, risks, executive support.

This spec describes _what documents we will produce, their shape, and where their content comes from_. It does not author the plan content itself — that follows once this spec is approved.

Scope covers the full arc from Kickoff (W1, 20 Apr 2026) through full-coverage rollout (waves TBD), not just the 8-week build.

## 2. Goals

- One authoritative Project Plan that a PMO reader can open and act on.
- Four track briefs that track leads own day-to-day and update weekly.
- Tabular artefacts (WBS, milestones, risks, RACI, sprint status) in a format suited to weekly editing — Excel, not Markdown.
- Every BRD REQ/NFR traces to at least one deliverable; nothing silently dropped.
- Phasing is explicit for the Core AI Agent track; the other three tracks are single-phase.

## 3. Deliverables

Five Markdown files plus one Excel workbook under `docs/project-plan/`:

```
docs/project-plan/
├── README.md                         # 1-page index: audience, ownership, how to navigate
├── 00-master-plan.md                 # PMO-facing; follows PPTX template literally, 9 sections
├── project-plan.xlsx                 # all tabular artefacts, one sheet per concern
└── tracks/
    ├── 10-planner.md
    ├── 20-core-backend.md
    ├── 30-core-frontend.md
    └── 40-core-ai-agent.md
```

**Naming convention:** two-digit prefixes for reading order. No dates in filenames; version + date live in document headers. Master doc is authoritative for cross-track concerns (contract, timeline rollup, RACI, risks, governance). Each track brief is authoritative for its own WBS, acceptance, sprint plan, and track-specific risks.

## 4. Markdown ↔ Excel split

**Rule of thumb:** tables that get edited weekly go in Excel; narrative and one-time-authored content stays in Markdown. Markdown sections that need to reference a table carry a _snapshot_ with a "generated from sheet `X` as of `DATE`" footer.

### 4.1 Excel workbook — `project-plan.xlsx`

One sheet per artefact. Column schemas:

| Sheet          | Maps to template slide | Columns                                                                                                                                            |
| -------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WBS-Master`   | Slide 8                | Track · Module · Function · Feature · Effort Low (MD) · Effort High (MD) · Confidence (H/M/L) · Owner · Sprint · Acceptance                        |
| `WBS-Planner`  | Slide 8                | Module · Function · Feature · Screen/API · Description · Effort Low · Effort High · Confidence · Owner · Sprint · Acceptance · BRD REQ/NFR         |
| `WBS-CoreBE`   | Slide 8                | (same schema as WBS-Planner)                                                                                                                       |
| `WBS-CoreFE`   | Slide 8                | (same schema as WBS-Planner)                                                                                                                       |
| `WBS-CoreAI`   | Slide 8                | Phase · Module · Function · Feature · Screen/API · Description · Effort Low · Effort High · Confidence · Owner · Sprint · Acceptance · BRD REQ/NFR |
| `Milestones`   | Slide 7, 12            | ID · Milestone · Planned · Actual · Owner · Acceptance · Status                                                                                    |
| `Sprints`      | Slide 12               | Sprint · Start · End · Goal · Scope · Deliverable · Exit Criterion · Status                                                                        |
| `RACI`         | Slide 17               | Task · PM · PO · SM · BA · AI Eng · FS #1 · FS #2 · DE · Designer (A/R/C/I, one A per task)                                                        |
| `Risks`        | Slide 25               | ID · Risk · Probability · Impact · Score · Mitigation · Owner · Status                                                                             |
| `Dependencies` | Slide 24               | Description · Impact · Owner · Due Date                                                                                                            |
| `Issues`       | Slide 26               | ID · Description · Severity · Owner · Status · ETA                                                                                                 |
| `CR-Log`       | Slide 10               | CR ID · Description · Impact (Scope / Time / Cost) · Decision · Status                                                                             |
| `DoR-DoD`      | Slide 18               | Phase · Input · Output · DoR · DoD · Owner                                                                                                         |

Excel is authoritative for all numbers (effort, dates, status). Markdown snapshots are read-only views.

**Known trade-off:** Excel is binary, so git diffs are unhelpful. Accepted — PMO editing productivity outweighs reviewable diffs.

### 4.2 Markdown files keep

Narrative (Problem/Solution, SMART Objectives, technical/QA/CI-CD/AI approach, communication plan, Definition of Success), process flows (CR process, escalation path, risk process), and links into Excel.

## 5. Master plan outline — `00-master-plan.md`

Follows the PPTX template structure 1:1, 9 sections. Internal-charter substitutions for Section 2.

```
# Future — Project Plan (Planner MVP)
Version 1.0 · 2026-04-21 · Owner: Canh Ta, Nguyen Hương Ly

## 1. Project Overview
  1.1 Information
    BMM = Internal / Cost-saving; Duration W1 (20-Apr-2026) → wave full-coverage (TBD);
    Methodology = Agile Scrum 2-week; Stakeholders = Hung Vu (Sponsor), Thu Mai (CTO),
    Hoang Nguyen (PMO); Budget = team time + 1× Claude Max x20 + ~$200 AI cap.
  1.2 Problem & Solution
    Restate BRD §2 five operational costs (chase-up tax, no authoritative record,
    completion without evidence, portfolio blindness, strategic commitments evaporate).
  1.3 Key Components
    Four tracks: Planner · Core Backend · Core Frontend · Core AI Agent.
    Core AI Agent is phased (Phase 1 W1-W4, Phase 2 W5-W8); others single-phase.
  1.4 SMART Objectives (table)
    Objective · Metric · Target · Timeline · Owner — derived from BRD §3 G1-G7.

## 2. Project Contract (Internal Charter)
  2.1 Fields
    Sponsor = Hung Vu; Technical Sponsor = Thu Mai; PMO = Hoang Nguyen;
    Payment % column renamed "Acceptance Weight"; SLA credits → Kill criteria (§9.3);
    Termination → Pilot-to-Wave gate decisions.
  2.2 Milestones & Deliverables → xlsx#Milestones
    Kick-off (W1) · Core Foundations (W2) · First Working Version (W4) ·
    Core Agent Phase 1 complete (W4) · MVP Pilot-ready (W8) ·
    Core Agent Phase 2 complete (W8) · Pilot gate (W12) · Wave 1 (TBD) ·
    Full coverage (TBD) · Post-rollout review (TBD).
  2.3 Legal & Compliance
    From BRD §11: MS 365 SSO standards, Teams consent inherited, no audio stored,
    AI vendor disclosure, ap-southeast-1 data residency.

## 3. Estimation & Scope
  3.1 WBS (feature-level rollup) → xlsx#WBS-Master (~30-40 rows across 4 tracks)
  3.2 In Scope / Out of Scope — from BRD §4.1 and §4.3
  3.3 Change Request process — 5-step flow per PPTX Slide 10 → xlsx#CR-Log

## 4. Project Timeline
  4.1 Master timeline — week-by-week band chart W0 → full coverage
  4.2 Milestone tracking → xlsx#Milestones
  4.3 Sprint plan → xlsx#Sprints — 4 sprints × 2 weeks for build; pilot + rollout tracked
       separately in xlsx#Milestones

## 5. Project Approach
  5.1 Organisation & RACI → xlsx#RACI
    Org chart: Steering Co. → PM → (PO, SM, BA, Tech Lead, AI Eng, Designer).
    Accountable overlap: PM Accountable for backlog/prioritisation/scope/delivery;
    PO Accountable for story acceptance at sprint review.
  5.2 Escalation path — L1/L2/L3 + response SLA (P1-P4) per PPTX Slide 14
  5.3 Communication plan (table)
    Daily (SM) · Sprint Planning (PM+PO) · Sprint Review (PO) · Retro (SM) ·
    PM weekly sync (PM) · Steering Committee monthly (PM+Sponsor) ·
    Weekly status report (PM). BA runs parallel legacy-discovery interviews.
  5.4 Methodology & SDLC → xlsx#DoR-DoD per phase
    Agile Scrum 2-week per BRD §8; DoR/DoD sourced from CLAUDE.md testing rules.
  5.5 KPI dashboard — 4 KPIs: Progress, Defect rate, Uptime, CSAT (targets only).
  5.6 Technical approach — stack verbatim from CLAUDE.md.
  5.7 QA approach — test pyramid + CLAUDE.md TDD rules (≥70% coverage).
  5.8 CI/CD approach — GitHub Actions · Turborepo · Docker ARM64 · ECR · ECS rolling.
  5.9 AI differentiator — per-role AI uplift (Dev/QA/PM/BA/Ops) per PPTX Slide 23,
      tuned for 1× Claude Max x20 shared subscription.
  5.10 Definition of Success — Delivery · Quality · Adoption · Outcome quadrants,
       tied to BRD §7 outcome measures.

## 6. Resource Management
  6.1 Allocation — % per role per track (bar chart). BA 50% is flexible between
      Planner MVP and legacy discovery; no fixed split.
  6.2 RACI matrix → xlsx#RACI

## 7. Dependencies, Constraints, Assumptions
  7.1 Dependencies → xlsx#Dependencies
    MS Graph transcript subscription, Entra ID directory read, MS Planner API,
    existing docs (docs/agents/*, docs/architecture/agent-runtime*.md) for Phase 1.
  7.2 Constraints — 2-month build, ~5.5 FTE, English-only, desktop-only,
      MS 365 tenant cooperation, DE contingent on onboarding.
  7.3 Assumptions — Teams dominant, transcription enabled, scheduled meetings only,
      Admin configures scope conservatively.

## 8. Risk & Issue Management
  8.1 Top-5 risk register → xlsx#Risks (seeded from BRD §10.2 R-01..R-08)
  8.2 Risk heat map — text-based P × I matrix
  8.3 Issue tracking → xlsx#Issues
  8.4 Process — Identify → Assess → Mitigate → Monitor

## 9. Executive Support
  9.1 Budget — team time + 1× Claude Max x20 + ~$200 AI cap (per BRD §9); no
      dollar project budget.
  9.2 Decision SLA — Sponsor 48h · CTO 24h on architecture · PMO 48h on rollout.
  9.3 Kill criteria — from BRD §7.3 (recall <40%, side-records >75%, chase-up ≤0%,
      permission leak = immediate stop).

## Appendix A — Parallel workstream: BA legacy systems discovery
  Not a build track; outputs are a stakeholder map and per-legacy-system requirement
  briefs feeding future Future modules (People, Project, Finance, etc.). Explicitly
  out of scope for Planner MVP acceptance; surfaced so PMO sees the BA's full load.

## Appendix B — BRD coverage matrix
  Table mapping every BRD REQ-XX / NFR-XX to the track brief and deliverable row
  that implements it. Catches silent drops before sign-off.
```

## 6. Track brief outline — `tracks/*.md`

One shape for all four briefs so they're directly comparable. Core AI Agent brief adds Phase 1 / Phase 2 splits inside every sub-section.

```
# Track: <name>
Track lead · Version · 2026-04-21

## 1. Purpose
  One paragraph: what this track delivers to the MVP and why it is a separate track.

## 2. Scope
  2.1 In scope — BRD REQs / Core-slice pieces this track owns
  2.2 Out of scope — explicit carve-outs
  2.3 Dependencies — other tracks + external (MS Graph, Entra ID, etc.)

## 3. Deliverables & Acceptance
  Table: Deliverable · Acceptance criterion · Evidence · Milestone · BRD ref
  Feature-level. Every row traces to ≥1 BRD REQ/NFR.

## 4. WBS (task-level) → xlsx#WBS-<Track>
  Inline snapshot: top 5 tasks by effort.
  Every row: Module · Function · Feature · Screen/API · Description · Effort Low/High ·
  Confidence H/M/L · Owner · Sprint · Acceptance · BRD ref.

## 5. Sprint plan
  4 sprints × 2 weeks (W1-W8). Each sprint: goal · deliverable · exit criterion.
  Core AI Agent: sprints 1-2 = Phase 1, sprints 3-4 = Phase 2; each phase has its
  own exit criterion. Phase 2 gated on adversarial security testing (BRD R-6).

## 6. Track-specific risks
  Top 3-5 risks scoped to this track only. Schema matches master xlsx#Risks.

## 7. Definition of Done (track-level)
  Exit gates that let the track sign off. Rolls up into master §5.10.

## 8. Open questions
  Unresolved decisions that block or threaten the track. Owner and needed-by date.
  Closed by end of Kickoff week.
```

### 6.1 Track-specific shape

| Track         | Lead                   | Notable                                                                                                                                                                                                                                                                |
| ------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planner       | Full-Stack #1          | Largest WBS (action CRUD, Meetings page, HITL queue, MS Planner sync, aggregated views, exec digest)                                                                                                                                                                   |
| Core Backend  | Full-Stack #2          | Identity (Entra ID SSO), permissions engine (NFR-04), audit log, MS Graph integration, outbound email gateway                                                                                                                                                          |
| Core Frontend | Full-Stack #1 (shared) | Design system, layout + nav primitives, `@future/ui`, `@future/app-layout`; DESIGN.md is primary source                                                                                                                                                                |
| Core AI Agent | AI Engineer            | Two-phase: Phase 1 = foundational (LLM client, prompts, confidence, HITL routing, bounded tool/MCP registry); Phase 2 = fine-tuning, security hardening, free-form queries beyond Phase 1 registry. Phase 2 acceptance includes penetration-style adversarial testing. |

## 7. Team & RACI

| Role                     | Effort                   | Accountable for                                                                                                                                                              |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM (Canh)                | 50%                      | Backlog, prioritisation, scope (veto from Hung Vu), delivery, sponsor comms                                                                                                  |
| PO                       | TBD                      | Story acceptance at sprint review, user representation in refinement                                                                                                         |
| Scrum Master             | 50%                      | Ceremonies, velocity tracking, unblocking                                                                                                                                    |
| BA                       | 50% _(flexible split)_   | Planner MVP: requirements, user stories, UAT design, pilot feedback. Legacy systems: stakeholder interviews, requirement briefs for future modules. PM covers capacity gaps. |
| AI Engineer              | 100%                     | Core AI Agent (Phase 1 + Phase 2), Agent module, conversational AI                                                                                                           |
| Full-Stack #1            | 100%                     | Planner module + Core Frontend                                                                                                                                               |
| Full-Stack #2            | 100%                     | Core Backend                                                                                                                                                                 |
| Data Engineer            | 100% _(if onboarded W1)_ | Core Data Platform (deferred-capable per BRD §4.1)                                                                                                                           |
| Designer-Lead (borrowed) | Part-time                | HITL queue, aggregated dashboards, action detail view                                                                                                                        |

Accountable overlap between PM and PO is explicit: one A per RACI row, but the two are adjacent rather than conflicting — PM owns "what/when", PO owns "did we build the right thing this sprint".

## 8. Content sources

| Master section                         | Primary source                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Information                        | User-provided + BRD §8                                                                                                        |
| 1.2 Problem & Solution                 | BRD §2                                                                                                                        |
| 1.3 Key Components                     | BRD §4.1 + AI Phase 1/2 shape                                                                                                 |
| 1.4 SMART Objectives                   | BRD §3                                                                                                                        |
| 2.1 Contract                           | Authored (sponsors from BRD §12)                                                                                              |
| 2.2 Milestones                         | Authored from BRD §8.2 + AI Phase 1/2 additions                                                                               |
| 2.3 Legal & Compliance                 | BRD §11                                                                                                                       |
| 3.1 WBS-Master                         | Authored — rollup from four track briefs                                                                                      |
| 3.2 In/Out of scope                    | BRD §4.1, §4.3                                                                                                                |
| 4 Timeline/Milestones/Sprints          | Authored                                                                                                                      |
| 5.1-5.5 Org/SDLC/Comms/KPIs            | Authored from PPTX template, adjusted for team of 5.5 FTE                                                                     |
| 5.6 Technical approach                 | CLAUDE.md verbatim                                                                                                            |
| 5.7 QA approach                        | CLAUDE.md + PPTX template                                                                                                     |
| 5.8 CI/CD approach                     | Authored per CLAUDE.md                                                                                                        |
| 5.9 AI differentiator                  | Authored from PPTX Slide 23                                                                                                   |
| 5.10 Definition of Success             | PPTX Slide 16 + BRD §7.1                                                                                                      |
| 6 Resource Management                  | Authored                                                                                                                      |
| 7 Dependencies/Constraints/Assumptions | BRD §10.1, §10.3 + authored MS Graph specifics                                                                                |
| 8 Risks                                | BRD §10.2 + track-specific in briefs                                                                                          |
| 9 Executive Support                    | BRD §9, §7.3                                                                                                                  |
| Track briefs                           | BRD §6.1.x REQs/NFRs scoped to track, plus `docs/architecture/*.md`, `docs/agents/*` (Core AI Phase 1), `DESIGN.md` (Core FE) |

## 9. Sign-off & review cadence (baked into the plan)

1. **Kickoff week (W1):** track leads validate WBS estimates and close §8 Open Questions. Deliverable, not optional.
2. **End of each sprint (W2, W4, W6, W8):** Excel `Milestones` + `Sprints` updated; one-line status in master §4.2.
3. **Mid-build (W4):** First Working Version demo → sponsor review → scope re-check.
4. **Pre-pilot gate (W8):** MVP sign-off against §5.10 Definition of Success. Go/no-go decision recorded.
5. **Pilot-to-Wave gate (W12):** BRD §7.3 kill criteria evaluated; Steering Committee decides proceed / pause-and-tune / pivot.

## 10. Validation of the plan document itself

Before committing the plan:

- **BRD coverage check:** every REQ-XX and NFR-XX maps to ≥1 deliverable row across the four track briefs. Output is Appendix B.
- **Cross-reference check:** every milestone in master §2.2 appears in §4.2 and in the relevant track brief §5 sprint plan.
- **RACI integrity:** exactly one Accountable per task row in xlsx#RACI.
- **WBS totals sanity:** sum of Effort High across all tasks per track ≤ available MD per track lead × 8 weeks; flag any track over capacity.

## 11. Out of scope for this plan

- Writing the implementation plans for any of the tracks (separate artefacts, created after this plan is approved).
- Drafting the SRS (separate artefact; will follow this Project Plan).
- Pilot playbook and wave rollout runbook (separate artefacts created closer to the dates).
- Detailed test plans (QA approach is summarised in §5.7; detailed plans live per track).
- Budget negotiation with Finance (the plan reflects the approved shape from BRD §9).

## 12. Open items not resolved in this spec

- PO allocation percentage (shown as _tbd_ in §7).
- Whether Data Engineer onboarded by W1 (triggers inclusion of Core Data Platform as a fifth track; BRD §4.1 says otherwise operational-DB queries carry the MVP).
- Designer-Lead weekly window confirmation per BRD R-02 mitigation.
