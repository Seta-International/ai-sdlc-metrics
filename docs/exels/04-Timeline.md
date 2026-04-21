# Sheet: 04-Timeline

> PPTX Slides 11-12. Master timeline · Milestone tracking · Sprint plan · Status legend · Holiday calendar.

## Block 1 — Master Timeline (week-by-week band chart)

Render as a Gantt-style band chart in Excel (one row per workstream; horizontal bands coloured by phase). Below is the ASCII preview for transcription.

```
Week                W1  W2  W3  W4  W5  W6  W7  W8  | W9   W10  W11  W12  | Waves ...
Calendar (approx)   22-Apr    06-May    20-May    17-Jun |   Pilot (4w)    |
Kickoff              ■
Core BE foundations  ███████
Core FE foundations  ███████
Core AI Phase 1      ███████
Planner core build   ████████████████
Core AI Phase 2               ███████████████
Planner MVP polish                        ███████
MS Planner sync                    ███████████
Conversational AI                         ███████
Integration + pilot rehearsal                 ███
Pilot                                              █████████████
Pilot-to-Wave gate                                              ■
Wave 1 (TBD)                                                          ████
Full-coverage (TBD)                                                              ████
Post-rollout review                                                                  ■
```

Legend:

- `■` = milestone day
- `█` = active work band

## Block 2 — Milestone Tracking

Updated weekly. Planned dates are calendar-aligned; Actual captured when event occurs. Status uses `Block 4` legend colouring.

| ID  | Milestone                      | Planned                   | Actual | Status  | Notes                                                                                                   |
| --- | ------------------------------ | ------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------- |
| M00 | Kickoff                        | Wed 22 Apr 2026           |        | Planned | Project Plan v1.0 signed; track leads confirmed; open questions closed                                  |
| M01 | Core Foundations ready         | Tue 05 May 2026 (W2 end)  |        | Planned | Monorepo · identity · permissions · audit · RLS · outbox · design tokens · AI Phase 1 scaffolding       |
| M02 | Core AI Agent Phase 1 complete | Tue 19 May 2026 (W4 end)  |        | Planned | LLM client + prompt store + confidence + HITL routing + tool registry + Langfuse                        |
| M03 | First Working Version          | Tue 19 May 2026 (W4 end)  |        | Planned | Internal demo to sponsor + CTO                                                                          |
| M04 | MVP Pilot-ready                | Tue 16 Jun 2026 (W8 end)  |        | Planned | Full Planner feature set · MS Planner sync · conversational AI · digest · pilot measurement instruments |
| M05 | Core AI Agent Phase 2 complete | Tue 16 Jun 2026 (W8 end)  |        | Planned | Prompt-injection defence · permission boundary · router · cost meter · eval CI                          |
| M06 | Pilot-to-Wave gate             | Tue 14 Jul 2026 (W12 end) |        | Planned | Outcome measures + kill-criteria review; Steering Committee decision                                    |
| M07 | Wave 1 complete                | TBD                       |        | Planned | First department wave (~2 weeks)                                                                        |
| M08 | Full-coverage rollout          | TBD                       |        | Planned | All target users live                                                                                   |
| M09 | Post-rollout review            | TBD                       |        | Planned | Committee review; next module scoped                                                                    |

## Block 3 — Sprint Plan

4 sprints × 2 weeks for build; pilot + rollout tracked as milestone rows rather than sprints. Working Days column nets VN public holidays.

| Sprint | Start           | End             | Working Days                                   | Goal                                             | Scope summary                                                                                                                                                                                                                                           | Deliverable                                                           | Exit Criterion                                                                                                                                    | Status  |
| ------ | --------------- | --------------- | ---------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| S1     | Wed 22 Apr 2026 | Tue 05 May 2026 | **7** (3 days lost to VN holiday, see Block 5) | Core foundations + Planner core scaffold         | Core BE monorepo + identity + permissions + audit + RLS + outbox; Core FE multi-zone + `@future/ui` core + `@future/app-layout`; Core AI Phase 1 LLM client + prompt store + tool registry + Langfuse; Planner action domain + CRUD handlers + basic UI | Foundations demo: user signs in, creates an action, sees it on a list | Core smoke tests green; all three Core tracks boot together in dev; Planner CRUD end-to-end works                                                 | Planned |
| S2     | Wed 06 May 2026 | Tue 19 May 2026 | 10                                             | First Working Version + Core AI Phase 1 complete | Planner views (Board/Grid/Schedule/Charts) · Personal Hubs · Meetings page shell · HITL queue UI · Teams transcript webhook · Planner-domain sub-agent · confidence + routing · admin console scope config · notifications · theme toggle               | M02 + M03: demoable First Working Version                             | M02 + M03 acceptance criteria (`02-Contract` Block 2) green; internal demo passes                                                                 | Planned |
| S3     | Wed 20 May 2026 | Tue 02 Jun 2026 | 10                                             | Feature completion + Phase 2 security            | Aggregated views (Team + PMO first) · MS Planner sync (OAuth + discovery + push) · escalation engine · anomaly detection · Core AI Phase 2 prompt-injection defence + permission enforcement · responsive layouts                                       | All non-MVP-critical polish items deferred to S4                      | Aggregated views deliver for pilot-relevant roles; MS sync round-trips title/status/deadline                                                      | Planned |
| S4     | Wed 03 Jun 2026 | Tue 16 Jun 2026 | 10                                             | MVP Pilot-ready + Core AI Phase 2 complete       | Conversational AI (router + eval CI) · cost metering · executive digest · retention/deletion · pilot measurement instruments · final security testing · integration + stabilisation + pilot rehearsal                                                   | M04 + M05: pilot-ready                                                | Pre-pilot gate green on Definition of Success (`05-Approach` Block 12); no critical bugs; penetration test returns zero permission-leak incidents | Planned |
| Pilot  | Wed 17 Jun 2026 | Tue 14 Jul 2026 | ~18 (BA + PM running measurement)              | Pilot operations + outcome measurement           | Live pilot · outcome measures (G1–G7) · weekly health checks · BA conducts interviews + time diary                                                                                                                                                      | Pilot gate decision                                                   | Kill-criteria review clean; Steering Committee decision recorded (M06)                                                                            | Planned |
| Wave 1 | TBD             | TBD             | —                                              | First rollout wave                               | IT + PMO-coordinated rollout to first department                                                                                                                                                                                                        | Wave health report                                                    | No critical blockers; adoption metrics maintained                                                                                                 | Planned |

## Block 4 — Status Legend (colour key)

Used across this sheet and the Milestone rows on `02-Contract`.

| Status                 | Colour fill (hex) | Description                                     |
| ---------------------- | ----------------- | ----------------------------------------------- |
| On-track / Done        | Green `#16a34a`   | Trending to plan; no action needed              |
| At risk / Slight delay | Yellow `#eab308`  | Within tolerance but needs attention; PM review |
| Blocked / Critical     | Red `#dc2626`     | Off-track; escalation active                    |
| Planned                | Grey `#6b7280`    | Future activity; not yet started                |
| Done                   | Blue `#2563eb`    | Completed and accepted                          |

Apply to `Status` columns on `02-Contract` Block 2, `04-Timeline` Block 2 + 3, each `Track-*` sheet Sprint plan.

## Block 5 — Holiday Calendar

VN public holidays across the W1–W12 build + pilot window, plus any other non-working dates that affect capacity.

| Date            | Day | Holiday                             | Working-day impact | Sprints affected      |
| --------------- | --- | ----------------------------------- | ------------------ | --------------------- |
| Mon 27 Apr 2026 | Mon | Hung Kings Commemoration (observed) | -1                 | S1                    |
| Thu 30 Apr 2026 | Thu | Reunification Day                   | -1                 | S1                    |
| Fri 01 May 2026 | Fri | International Labour Day            | -1                 | S1                    |
| Wed 02 Sep 2026 | Wed | National Day                        | -1                 | Post-pilot wave phase |

**Total capacity deduction in Sprint 1 = 3 working days.** Sprint 1 available = 7 working days per FTE instead of 10.

Reconfirm exact observed dates with the VN government labour announcement on file (HR to provide at Kickoff). Add any bridge days granted in that announcement.

## Block 6 — Weekly Cadence Overview

Visible on one row per week for PMO at-a-glance view.

| Week         | Theme                                | Sprint | Key events                               |
| ------------ | ------------------------------------ | ------ | ---------------------------------------- |
| W1 (22 Apr)  | Kickoff + foundations                | S1     | Kickoff Wed; open-questions close Fri W1 |
| W2 (29 Apr)  | Foundations push (holiday-shortened) | S1     | M01 Core Foundations ready               |
| W3 (06 May)  | Feature build starts                 | S2     | Planner views + HITL queue wiring        |
| W4 (13 May)  | First Working Version                | S2     | M02 + M03 demo to sponsor                |
| W5 (20 May)  | Aggregated views + MS sync           | S3     | AI Phase 2 security begins               |
| W6 (27 May)  | Pilot team nomination                | S3     | Pilot team + measurement instruments     |
| W7 (03 Jun)  | Conversational AI + digest           | S4     | MVP polish                               |
| W8 (10 Jun)  | Integration + pilot rehearsal        | S4     | M04 + M05 pre-pilot gate                 |
| W9 (17 Jun)  | Pilot begins                         | Pilot  | Baseline measurements                    |
| W10 (24 Jun) | Pilot week 2                         | Pilot  | Mid-pilot check                          |
| W11 (01 Jul) | Pilot week 3                         | Pilot  | Interview scripts in use                 |
| W12 (08 Jul) | Pilot week 4 + gate                  | Pilot  | M06 Pilot-to-Wave gate Tue 14 Jul        |
