# Sheet: 08-Risks-Issues

> PPTX Slides 25-26. Risk register · Heat map · Issues log · Process.

## Block 1 — Risk Register

Probability (P) and Impact (I) scored as L / M / H. Score = worst of P×I (L, M, H, H+). Status updated weekly.

| ID   | Risk                                                                                                                                                                                                         | P   | I   | Score  | Mitigation                                                                                                                                                                                                                                                                                                    | Owner          | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| R-01 | **Scope accumulation.** PM at 50% with shared coordination duties; without explicit scope authority, features accumulate mid-build.                                                                          | H   | H   | **H+** | PM given written veto authority by Sponsor at Kickoff. Bi-weekly scope check in retros. Every addition requires an explicit cut. Scope-change discipline on `03-Scope` Block 4.                                                                                                                               | PM             | Open   |
| R-02 | **Designer-Lead availability slip.** Designer (Mia/Darcy) is borrowed from another project; demands may compete with their primary project.                                                                  | H   | H   | **H+** | Time commitment agreed in writing with named weekly windows per critical surface (HITL queue · aggregated dashboards · action detail). PM escalates to Sponsor if availability slips.                                                                                                                         | PM + Sponsor   | Open   |
| R-03 | **Capacity over-commit.** Midpoint WBS estimate (~348 MD) exceeds builder capacity (~114 MD over 8 weeks net of VN holidays) by ~3.1×.                                                                       | H   | H   | **H+** | At Kickoff: pick scope-trade path per `03-Scope` Block 1 Recommendation (defer Admin console · compress aggregated views · scope conversational AI to pre-built queries · lean on DE if onboarded). Rebaseline via CR.                                                                                        | PM             | Open   |
| R-04 | **DE onboarding delay.** Core Data Platform is on the critical path for optimal aggregated views and the executive digest.                                                                                   | M   | M   | M      | If DE not onboarded by W1, Core DP is deferred; aggregated views and digest run on direct operational-DB queries in pilot. Architecture revisited before Wave 2.                                                                                                                                              | CTO            | Open   |
| R-05 | **AI proposal quality** (hallucination · wrong owner · wrong deadline).                                                                                                                                      | M   | M   | M      | Pilot informs prompt tuning. Per-capability kill switch. Rejection rate tracked in Langfuse. Confidence threshold tuned during pilot.                                                                                                                                                                         | AI Eng         | Open   |
| R-06 | **Single-person dependency on AI Engineer.** Owns Core AI Agent Phase 1 + 2, Planner-domain sub-agent, extraction prompts, conversational executor.                                                          | M   | M   | M      | Cross-team knowledge sharing W1. Architecture decisions captured in `02-Contract` Block 1 and on each sprint's review. Conversational AI scope kept tightly read-only (REQ-22 per BRD §4.3).                                                                                                                  | AI Eng + PM    | Open   |
| R-07 | **Permission-leak via conversational AI.** A query returns data the user should not have access to due to a gap in how AI translates natural language into the permissions engine.                           | M   | H   | **H+** | Every conversational query passes through the same permissions engine as UI queries (NFR-04). AI generates structured queries permission-checked before execution. Penetration-style testing in pre-pilot W8 with deliberately adversarial queries. Zero permission-leak incidents required for M04 sign-off. | AI Eng + QA    | Open   |
| R-08 | **Meeting organiser flooded with disambiguation requests.** Heavy meeting organisers (PMs · CEO in strategy meetings) accumulate many unassigned-owner proposals.                                            | M   | M   | M      | Confidence threshold tuned during pilot to set the right precision/recall balance. Disambiguation proposals batched into a single daily email per organiser. 7-day auto-expiry with Admin fallback. Bulk-reject in queue UI.                                                                                  | AI Eng         | Open   |
| R-09 | **Microsoft Planner polling architecture.** Graph does not provide change notifications for Planner tasks; aggressive polling across many plans risks throttling. Conservative polling extends sync latency. | M   | M   | M      | Polling interval Admin-configurable. Start at 5-minute intervals for pilot; monitor rate-limit headers and tune. Scope narrowed to Admin-designated plans. Delta queries used where available.                                                                                                                | FS#2           | Open   |
| R-10 | **Microsoft Graph tenant admin consent delay.** Required for Entra ID SSO, directory sync, Teams transcript subscription, Planner CRUD.                                                                      | M   | H   | M      | Raised at Kickoff with IT. Fallback: ship identity + permission primitives behind magic-link in W1 so development is not blocked; wire SSO when consent lands.                                                                                                                                                | IT + PM        | Open   |
| R-11 | **OpenAI cost runaway.** Free-form queries + Phase 2 router fan-out to multiple sub-agents; unbounded token spend if router misclassifies.                                                                   | M   | M   | M      | Circuit breaker at the cost layer (per-user + per-tenant daily budget). Budget dashboard visible to Admin. Hard cap on concurrent sub-agent spawn. Kill switch disables conversational AI independently.                                                                                                      | AI Eng + Admin | Open   |
| R-12 | **Transcript subscription latency / reliability.** Graph change-notification delivery variance; subscription renewal can miss; transcripts may arrive minutes to hours after the meeting ends.               | M   | M   | M      | Subscription-renewal job runs ahead of expiry with alerting. Fallback reconciliation job polls `callRecords` endpoint for missed transcripts. Planner UI surfaces "transcript pending" state transparently.                                                                                                   | FS#2 + AI Eng  | Open   |
| R-13 | **VN holiday capacity hit in Sprint 1.** Effective 7 working days instead of 10 in S1 shifts M01 risk rightward.                                                                                             | H   | M   | M      | Calendar-captured on `04-Timeline` Block 5. Sprint 1 scope trimmed to foundations-only; feature build starts S2. PM monitors burn-down; rebaseline via CR if M01 slips.                                                                                                                                       | PM             | Open   |
| R-14 | **Team rotation during the build.** Core team members pulled onto other projects; ramp-up cost + rework.                                                                                                     | M   | H   | M      | Written commitment from Sponsor at Kickoff that core team is not rotated for the 8-week build. Pairing + documentation on every architectural decision reduces bus-factor.                                                                                                                                    | Sponsor + PM   | Open   |
| R-15 | **Pilot measurement incomplete.** BA at 50% with parallel legacy-discovery workstream; pilot interviews + ground-truth extraction may starve.                                                                | M   | M   | M      | Ground-truth sample reduced from ~20 to ~12 meetings to fit BA capacity. Pilot Team Lead co-conducts IC interviews (peer rapport). PM covers BA capacity gaps. Allocation flexibility confirmed at Kickoff.                                                                                                   | BA + PM        | Open   |
| R-16 | **Penetration test insufficient.** PM + BA adversarial testing pre-pilot may miss deeper security flaws that an external pentest would catch.                                                                | M   | H   | M      | Defence-in-depth at every layer (RLS · canDo · tRPC middleware · AI boundary). External pentest scheduled post-pilot before Wave 1. Document scope of PM/BA pre-pilot test on this workbook.                                                                                                                  | PM + Sponsor   | Open   |
| R-17 | **Launch communication backfires** (managers use aggregated views punitively rather than coachingly).                                                                                                        | M   | M   | M      | Launch comms pack (W-PM05) coaches on coaching-first framing. Pilot Week-1 interview asks managers what they did with team-health view; course-correct if needed.                                                                                                                                             | PM + BA        | Open   |

## Block 2 — Risk Heat Map

Place risk IDs in cells. Colour the cell fill matching `04-Timeline` Block 4 status legend (H+ = red, H = red, M = yellow, L = green).

|         | Impact L | Impact M                                             | Impact H               |
| ------- | -------- | ---------------------------------------------------- | ---------------------- |
| **P H** | —        | R-13                                                 | R-01, R-02, R-03       |
| **P M** | —        | R-04, R-05, R-06, R-08, R-09, R-11, R-12, R-15, R-17 | R-07, R-10, R-14, R-16 |
| **P L** | —        | —                                                    | —                      |

## Block 3 — Issues Log

Defects, blockers, and operational issues picked up during the build and pilot. Empty at Kickoff; populated throughout.

| Issue ID | Description                                       | Severity | Owner | Status | ETA |
| -------- | ------------------------------------------------- | -------- | ----- | ------ | --- |
| ISS-000  | Template row — delete when first real issue lands | —        | —     | —      | —   |

### Severity definitions

| Severity      | Meaning                                  | SLA (from `05-Approach` Block 3) |
| ------------- | ---------------------------------------- | -------------------------------- |
| P1 — Critical | Pilot-impacting, security, data loss     | 15 min response · 4 h resolve    |
| P2 — High     | Blocks pilot feature or gate             | 1 h response · 1 bd resolve      |
| P3 — Medium   | Degraded behaviour, workaround available | 4 h response · 3 bd resolve      |
| P4 — Low      | Cosmetic, nice-to-have                   | 1 bd response · next release     |

## Block 4 — Risk & Issue Management Process

Four steps, run weekly at the BOD sync and daily at stand-up.

1. **Identify.** Capture from team, stakeholder, retrospective, pilot user, or customer. Every new risk / issue gets an ID on this sheet.
2. **Assess.** Probability × Impact → scoring → prioritise. Sort this sheet by score descending at every BOD weekly sync.
3. **Mitigate.** Action plan with owner, due date, and — if needed — budget ask. Record the mitigation in this sheet's Mitigation column.
4. **Monitor.** Weekly review at BOD sync; mark as closed when resolved. No silent closure — status change is a row update.

### Cadence

- **Daily stand-up:** SM runs through open issues sorted by severity.
- **Weekly BOD sync:** PM walks through open risks + top issues; decisions recorded in the sheet.
- **Sprint retrospective:** SM prompts "any new risks to surface?"; filed before next sprint.
- **Monthly Steering Committee:** PM presents risk heat map and top mitigations.
