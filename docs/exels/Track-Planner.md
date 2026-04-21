# Sheet: Track-Planner

> Vertical track. User-facing Planner module. Integrates Core BE + Core FE + Core AI Agent horizontal slices into a product.

## Block 1 — Purpose

Deliver the Planner MVP: action tracking, evidence capture, Meetings page, HITL review queue, aggregated views, executive digest, Microsoft Planner bidirectional sync, conversational AI interface, and admin console — the user-facing product that proves Future's agent-native module pattern works and gives SETA's ~400 staff a single place to track commitments.

Planner is the only user-facing track in this MVP. Everything the pilot users touch is on this track; the three Core tracks are foundations underneath it.

## Block 2 — Scope

### 2.1 In scope

Everything listed on `03-Scope` Block 1 WBS rows prefixed `W-P`. Feature summary:

- Action domain + CRUD + lifecycle + priority + stakes + project tag + deadline + owner + delegator (unified across manual / AI-proposed / MS-Planner-synced sources).
- Evidence, attachments, comments, checklists.
- Plan / project CRUD, membership, labels, buckets.
- Action views: Board · Grid · Schedule · Charts.
- Personal Hubs: My Plans · My Tasks · My Day (with carry-over).
- Meetings page: list + transcript viewer + linked actions + on-demand "Extract actions with AI".
- HITL review queue: proposals list + detail + accept / edit-and-accept / reject + unassigned-owner routing + bulk-reject.
- Planner-domain Agent sub-agent for transcript extraction (consumes Core AI runner).
- Aggregated views: Team health · Manager drill-down · Account Manager · PMO portfolio · Admin system health.
- Executive weekly digest email.
- Microsoft Planner bidirectional sync: OAuth + discovery + push + pull + conflict resolution (title · status · deadline).
- Admin console: scope config · role assignment · kill switches · rate limits · anomaly thresholds · proposal expiry · backlog view · audit-log view.
- Conversational AI query UI (read-only, session-scoped, permission-enforced; backed by Core AI router + Planner executor).
- Notifications: email + in-app for lifecycle + deterministic 3-day / 1-day / overdue reminders.
- Escalation engine (AI-drafted, HITL-approved) and anomaly-auto-pause.

### 2.2 Out of scope

Inherit `03-Scope` Block 3 plus these Planner-specific carve-outs:

- No write operations via conversational AI for this release.
- No custom chart builder or user-selected metrics. Pre-built chart set only.
- No in-product coaching / onboarding tours (launch comms pack covers this out-of-band).
- No import from legacy action-tracking tools (users start fresh).
- No cross-tenant collaboration.
- No AI-drafted evidence text (evidence note is manual per BRD REQ-05).

### 2.3 Dependencies

- Core Backend track: identity · permissions · audit · RLS · outbox · MS Graph adapter · email gateway — needed by S1–S2.
- Core Frontend track: `@future/ui` · `@future/app-layout` · design tokens · theme toggle · notifications popover · SSE client — needed by S1–S2.
- Core AI Agent track Phase 1: LLM client · prompt store · confidence scoring · HITL routing engine · tool registry + ToolGateway · SSE — needed by S2.
- Core AI Agent track Phase 2: prompt-injection defence · permission at AI boundary · free-form router · cost meter — needed by S4.
- External: Microsoft 365 tenant admin consent (D-01 · D-02 on `07-DCA`).
- Designer-Lead weekly window for HITL queue, aggregated dashboards, action detail.

## Block 3 — Deliverables & Acceptance

High-level deliverables rolling up WBS rows. Each ties to at least one milestone.

| #     | Deliverable                                                            | Acceptance                                                                                         | Evidence                                          | Milestone                     |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| D-P01 | Action core (domain · CRUD · lifecycle · evidence · comments)          | Users can create · edit · complete actions with evidence and comments end-to-end                   | Playwright e2e + unit coverage ≥ 70%              | M03                           |
| D-P02 | Plans + Views                                                          | Board / Grid / Schedule / Charts views render for personal + plan scope with filter + group-by     | Visual QA + Playwright                            | M03                           |
| D-P03 | Personal Hubs + Dashboard                                              | My Day / My Plans / My Tasks with carry-over; dashboard counts match filters                       | UI tests + dashboard snapshot test                | M03                           |
| D-P04 | Meetings page + on-demand extraction                                   | Meeting list + transcript view + linked actions + rate-limited extraction triggering HITL proposal | Integration + e2e; rate-limit enforced            | M03                           |
| D-P05 | HITL review queue                                                      | Queue flow round-trips to Agent; routing + expiry + backlog alerts working                         | Integration + agent trace review                  | M03                           |
| D-P06 | Agent integration (transcript sub-agent + prompts + confidence wiring) | Transcript → proposal end-to-end with confidence-scored output                                     | Langfuse trace visible; proposal schema validated | M03                           |
| D-P07 | Aggregated views (Team + Manager + PMO + Account Mgr + Line Mgr)       | Drill-down respects reporting chain; no cross-hierarchy bypass; charts from live data              | UI + permission tests                             | M04                           |
| D-P08 | Executive weekly digest                                                | Phone-first email renders; dry-run passes                                                          | Email render proof on real client                 | M04                           |
| D-P09 | Microsoft Planner bidirectional sync                                   | Round-trip ≤ 5 min on title/status/deadline; deletion marks Cancelled                              | Integration tests against test tenant             | M04                           |
| D-P10 | Admin console                                                          | Scope config + kill switches + rate limits + backlog view + audit log                              | UI + backend config tests                         | M03 (phase 1) / M04 (phase 2) |
| D-P11 | Conversational AI interface                                            | Query preview before execute; permission enforced; 30-query eval ≥ 80%                             | Eval suite green                                  | M04                           |
| D-P12 | Notifications + Reminders                                              | Per-event email + in-app; deterministic reminders firing                                           | Worker logs + user mailbox proof                  | M03                           |
| D-P13 | Escalation engine + anomaly detection                                  | AI-drafted escalation reviewed + sent; anomaly threshold auto-pauses                               | Integration tests                                 | M04                           |
| D-P14 | Data retention + admin deletion                                        | Admin delete with reason; logged to audit                                                          | Audit-log query proof                             | M04                           |

## Block 4 — WBS (task-level)

Full task-level WBS lives on `03-Scope` Block 1 rows `W-P01` .. `W-P30`. Top 5 tasks by effort on this track:

| Rank | ID    | Feature                                  | Effort High (MD) | Confidence | Owner  |
| ---- | ----- | ---------------------------------------- | ---------------- | ---------- | ------ |
| 1    | W-P19 | Microsoft Planner bidirectional sync     | 14               | L          | FS#2   |
| 2    | W-P07 | Views (Board · Grid · Schedule · Charts) | 10               | H          | FS#1   |
| 3    | W-P20 | Team + Manager aggregated views          | 10               | M          | FS#1   |
| 4    | W-P23 | Admin Console — scope + role + kill      | 10               | M          | FS#1   |
| 5    | W-P26 | Planner query executor (conversational)  | 9                | L          | AI Eng |

**Track totals (indicative, from WBS rollup):** ~113–191 MD across 30 rows.

## Block 5 — Sprint Plan (Planner-specific)

Overlays the master sprint plan on `04-Timeline` Block 3.

| Sprint                     | Planner goal                                                                                                            | Exit criterion                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| S1 (W1–W2, 7 working days) | Action domain + CRUD + basic UI on top of Core foundations                                                              | Users can create / edit / complete / delete an action in staging via real SSO |
| S2 (W3–W4)                 | Views + Personal Hubs + Meetings page + HITL queue + transcript sub-agent + admin scope config                          | First Working Version demoable; HITL proposals round-trip through the queue   |
| S3 (W5–W6)                 | Team + Manager + PMO aggregated views; MS Planner sync (OAuth + discovery + push); escalation engine; anomaly detection | Aggregated views live for pilot roles; push-to-Planner round-trips            |
| S4 (W7–W8)                 | Conversational AI UI + executor; executive digest; pilot measurement instruments; polish + integration                  | All `D-P*` deliverables green; pre-pilot gate (M04) passes                    |

## Block 6 — Track-specific Risks

Track-only risks; cross-track risks live on `08-Risks-Issues`.

| ID    | Risk                                                                        | P   | I   | Mitigation                                                                                                                                                       | Owner         | Status |
| ----- | --------------------------------------------------------------------------- | --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| RP-01 | MS Planner sync conflict resolution gets too complex under concurrent edits | M   | H   | Start with last-write-wins on a narrow field set (title / status / deadline) per scope in W-P19; document edge cases; defer richer conflict logic to post-MVP CR | FS#2          | Open   |
| RP-02 | HITL queue grows too fast; meeting organisers overwhelmed                   | M   | M   | Daily digest batching; 7-day auto-expiry with Admin fallback; bulk-reject in UI. Also risk R-08 on `08-Risks-Issues`.                                            | AI Eng + FS#1 | Open   |
| RP-03 | Aggregated views performance degrades under real data volume                | M   | M   | Charts use daily snapshot tables (not live aggregation) from S3; query budgets per view; add indexes pre-pilot                                                   | FS#1          | Open   |
| RP-04 | Conversational AI permission-leak path                                      | M   | H   | Every query passes through the same permissions engine; penetration-style test pre-pilot (see R-07)                                                              | AI Eng        | Open   |
| RP-05 | Designer-Lead HITL queue + aggregated dashboard windows slip                | M   | M   | Time windows named at Kickoff; PM escalates if slip (see R-02)                                                                                                   | PM            | Open   |

## Block 7 — Definition of Done (track-level)

The Planner track ships when:

- All `D-P01` .. `D-P14` deliverables accepted on this sheet.
- Coverage ≥ 70% on all Planner modules.
- E2E Playwright suite green for critical flows (sign-in · create action · complete with evidence · HITL review · MS Planner sync round-trip · conversational query).
- Penetration test on conversational AI returns zero permission-leak incidents.
- Pilot measurement instruments (W-BA03) ready and reviewed with PM.
- MS Planner test-tenant sync round-trips within 5-minute latency.
- Exec digest dry-run reviewed by Sponsor.
- Admin console signed off by Admin role-holders.

## Block 8 — Open Questions

Close by end of Kickoff week (W1).

| Question                                                                             | Owner         | Needed by       |
| ------------------------------------------------------------------------------------ | ------------- | --------------- |
| Which pilot team? (target: 1 SETA dept + 1 project, ~20-30 users)                    | PMO + PM      | Fri 29 May (W6) |
| MS Planner sync: which plans are Admin-designated for pilot?                         | Admin + PM    | W5              |
| Conversational AI: start with pre-built query cards (safe set) or direct NL from W8? | AI Eng + PM   | W4              |
| Unassigned-owner confidence threshold initial value                                  | AI Eng + BA   | W5              |
| Executive digest recipient list + time-of-day preference                             | Sponsor + PMO | W6              |
| HITL review-window default (BRD suggests 7 days; pilot may shorten)                  | PM + BA       | W3              |
| Admin role-holders for pilot (who gets kill-switch access?)                          | Sponsor + PM  | W2              |
| Notifications: opt-out granularity (all / per-event type / per-project?)             | BA + FS#1     | W2              |
