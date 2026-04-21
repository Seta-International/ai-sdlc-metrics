# Sheet: 06-Resources

> PPTX Slide 17. Allocation + RACI matrix.

## Block 1 — Allocation

| Role                     | Person                | Effort                                  | Tracks covered                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | --------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM                       | Canh Ta               | 50%                                     | All tracks (delivery · backlog · prioritisation · scope · comms)                                                                                                                                                                                                                                                                                                                                   |
| PM (co-owner)            | Nguyen Hương Ly       | TBD                                     | Joint ownership; allocation set at Kickoff                                                                                                                                                                                                                                                                                                                                                         |
| PO + Sponsor             | Hung Vu (dual-hatted) | BOD-level (weekly sync + sprint review) | Story acceptance at sprint review; Definition of Success sign-off; scope veto; kill-criteria evaluation; gate decisions                                                                                                                                                                                                                                                                            |
| Scrum Master             | TBD                   | 50%                                     | Ceremonies, velocity, unblocking                                                                                                                                                                                                                                                                                                                                                                   |
| BA                       | TBD                   | 50% (flexible)                          | Planner MVP requirements / UAT / pilot feedback + parallel legacy-systems discovery (EMS · Timesheet · Hiring · Resource Insight). PM covers capacity gaps.                                                                                                                                                                                                                                        |
| AI Engineer              | TBD                   | 100%                                    | Core AI Agent (Phase 1 + Phase 2) + Planner-domain Agent integration (transcript sub-agent, conversational executor)                                                                                                                                                                                                                                                                               |
| Full-Stack #1            | TBD                   | 100%                                    | Both full-stack devs own their assigned modules/features end-to-end (BE + FE + Core-slice work for those features). Split between FS#1 and FS#2 is **by module/feature, not by BE vs FE discipline** — neither dev specialises in one layer. Per-feature ownership finalised at Kickoff (see `03-Scope` Block 1 WBS Owner column for provisional assignment) and reflected in this allocation row. |
| Full-Stack #2            | TBD                   | 100%                                    | See Full-Stack #1 — both devs full-stack. Per-feature ownership finalised at Kickoff; provisional split on `03-Scope` Block 1.                                                                                                                                                                                                                                                                     |
| Data Engineer            | TBD                   | 100% (contingent on W1 onboarding)      | Core Data Platform (deferred from MVP if onboarding slips; operational-DB queries carry aggregated views during pilot)                                                                                                                                                                                                                                                                             |
| Designer-Lead (borrowed) | Mia / Darcy           | Part-time, named windows                | HITL review queue UX · aggregated dashboards UX · action detail view UX · design-system adherence reviews                                                                                                                                                                                                                                                                                          |

### Allocation % per track (indicative, for the bar chart)

Each Full-Stack dev is shown with a total 100% that is split across tracks; the same-row % for the two FS devs reflects the expected per-Kickoff split. Both are full-stack — these percentages are by module/feature scope, not by BE-vs-FE discipline.

| Track                                   | PM  | PO  | SM  | BA                                  | AI Eng                  | FS#1 | FS#2 | DE          | Designer |
| --------------------------------------- | --- | --- | --- | ----------------------------------- | ----------------------- | ---- | ---- | ----------- | -------- |
| Planner (module features, BE + FE)      | 20% | 20% | 15% | 35% MVP share (flexible)            | 40% (Agent integration) | 60%  | 40%  | 30% (if in) | 60%      |
| Core Backend (horizontal)               | 10% | 5%  | 10% | 0%                                  | 0%                      | 10%  | 30%  | 10% (if in) | 0%       |
| Core Frontend (horizontal)              | 10% | 5%  | 10% | 0%                                  | 0%                      | 20%  | 20%  | 0%          | 40%      |
| Core AI Agent (horizontal, Phase 1 + 2) | 10% | 5%  | 15% | 0%                                  | 60%                     | 10%  | 10%  | 0%          | 0%       |
| Governance + ceremonies                 | 50% | 65% | 50% | 0%                                  | 0%                      | 0%   | 0%   | 0%          | 0%       |
| BA legacy-discovery (parallel)          | 0%  | 0%  | 0%  | 65% (flexible — inverse of Planner) | 0%                      | 0%   | 0%   | 60% (if in) | 0%       |

Rows add to ~100% per role across all tracks. **FS#1 and FS#2 allocations are illustrative** — the actual per-feature ownership is decided at Kickoff; both devs cover their share of Planner + Core work end-to-end. The Data Engineer row is shown twice (Planner aggregated views + legacy-discovery data feeding) because the likely allocation is split between Core Data Platform work and feeding legacy-system data into the future modules pipeline.

## Block 2 — RACI Matrix

**Rule:** Every task row has **exactly one Accountable**. R = Responsible (does the work), A = Accountable (one person, owns the outcome), C = Consulted (provides input), I = Informed (kept in the loop).

| Task                                                                           | PM  | PO  | SM  | BA  | AI Eng | FS#1  | FS#2  | DE  | Designer | Sponsor |
| ------------------------------------------------------------------------------ | --- | --- | --- | --- | ------ | ----- | ----- | --- | -------- | ------- |
| Requirements definition                                                        | A   | C   | I   | R   | I      | I     | I     | I   | I        | I       |
| Architecture decisions                                                         | A   | I   | I   | I   | C      | C     | R     | C   | I        | I       |
| UX / design artefacts                                                          | A   | C   | I   | C   | I      | C     | I     | I   | R        | I       |
| Backlog prioritisation                                                         | A/R | C   | I   | C   | C      | C     | C     | I   | I        | I       |
| Sprint planning                                                                | A   | R   | R   | C   | C      | C     | C     | I   | I        | I       |
| Story acceptance at sprint review                                              | C   | A/R | I   | C   | I      | R     | R     | I   | C        | I       |
| Planner module implementation (BE + FE — per-feature ownership set at Kickoff) | I   | I   | I   | I   | I      | A/R\* | R     | I   | C        | I       |
| Core Backend (horizontal) implementation                                       | I   | I   | I   | I   | I      | R     | A/R\* | C   | I        | I       |
| Core Frontend (horizontal) implementation                                      | I   | I   | I   | I   | I      | A/R\* | R     | I   | C        | I       |
| Core AI Agent implementation (Phase 1 + 2)                                     | I   | I   | I   | I   | A/R    | C     | C     | I   | I        | I       |
| Planner Agent integration (transcript, HITL, conversational)                   | I   | I   | I   | I   | A/R    | C     | R     | I   | I        | I       |
| Testing (unit + integration)                                                   | I   | I   | I   | I   | R      | R     | R     | R   | I        | I       |
| Testing (system / E2E)                                                         | C   | I   | I   | C   | R      | R     | R     | R   | I        | I       |
| Adversarial / penetration testing (AI boundary)                                | C   | I   | I   | C   | A/R    | I     | R     | I   | I        | I       |
| Release / deployment                                                           | A   | I   | I   | I   | R      | R     | R     | I   | I        | I       |
| Pilot measurement + interviews                                                 | C   | I   | I   | A/R | C      | I     | I     | I   | I        | I       |
| Scope change approval (CR)                                                     | A/R | C   | C   | C   | C      | C     | C     | I   | I        | C       |
| Scope veto                                                                     | A/R | I   | I   | I   | I      | I     | I     | I   | I        | C       |
| Kill-criteria evaluation                                                       | C   | I   | I   | R   | C      | I     | I     | I   | I        | A       |
| Wave rollout decision                                                          | R   | I   | I   | I   | I      | I     | I     | I   | I        | A       |
| Pilot-to-Wave gate decision                                                    | R   | I   | I   | C   | I      | I     | I     | I   | I        | A       |
| Project closure                                                                | R   | I   | I   | C   | I      | I     | I     | I   | I        | A       |

Read: **PM is Accountable for delivery and backlog; PO (Hung Vu, dual-hatted) is Accountable for story acceptance; Sponsor (also Hung Vu) is Accountable for gate decisions and closure.** Every other row has exactly one A.

**\* On the Planner / Core BE / Core FE rows,** `A/R*` indicates the feature owner (either FS#1 or FS#2) for a given feature; the R next to it is the partner dev who contributes. Per-feature ownership is set at Kickoff and recorded in the Owner column of `03-Scope` Block 1 WBS-Master. Each full-stack dev owns their assigned features end-to-end — both BE and FE layers of those features.
