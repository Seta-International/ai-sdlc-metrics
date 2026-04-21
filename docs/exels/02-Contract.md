# Sheet: 02-Contract

> PPTX Slides 6-7. Internal Charter (contract-equivalent for internal project) + Milestones & Deliverables + Legal & Compliance checklist.

## Block 1 — Internal Charter Fields

| Field              | Detail                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Charter ID         | FUTURE-PLANNER-MVP-2026-01                                                                                                                                      |
| Sign Date          | 22 Apr 2026                                                                                                                                                     |
| Parties            | SETA (internal project) — no external client                                                                                                                    |
| Sponsor            | Hung Vu (CEO) — Project Owner                                                                                                                                   |
| Technical Sponsor  | Thu Mai (CTO) — Platform Architecture Authority                                                                                                                 |
| PMO Representative | Hoang Nguyen                                                                                                                                                    |
| Payment Model      | Internal — no billable milestones. "Payment %" template column is repurposed to **Acceptance Weight** (unitless) to reflect gate strictness.                    |
| SLA                | Internal — formal uptime SLA is explicitly out of scope for this MVP. Pilot-phase operational response times captured in `05-Approach` Block 3 Escalation SLA.  |
| Governance         | Steering Committee monthly (PM + Sponsor + CTO + PMO) · PM weekly sync with sponsor · Sprint Review biweekly · Retro biweekly. Detail on `05-Approach` Block 4. |
| Termination / exit | "Termination" in the internal charter = Pilot-to-Wave gate decision at W12. Kill criteria on `09-ExecSupport` Block 3.                                          |

## Block 2 — Milestones & Deliverables

Status legend colour applies per `04-Timeline` Block 4.

| ID  | Milestone                                   | Planned             | Actual | Owner               | Key Deliverable                                                                                                                                                      | Acceptance Criterion                                                                                                                            | Acceptance Weight | Status  |
| --- | ------------------------------------------- | ------------------- | ------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------- |
| M00 | Kickoff                                     | 22 Apr 2026 · W1    |        | PM                  | Project Plan v1.0 signed · track leads named · Kickoff Open Questions closed by EOW                                                                                  | Sponsor approval recorded on this sheet                                                                                                         | 5%                | Planned |
| M01 | Core Foundations ready                      | 6 May 2026 · W2     |        | Tech Lead           | Identity + permissions + audit + RLS + outbox operational; design system tokens locked; AI Phase 1 deps installed; Agent runtime gateway stub running                | Smoke tests green across API + each zone; internal demo passes                                                                                  | 10%               | Planned |
| M02 | Core AI Agent Phase 1 complete              | 20 May 2026 · W4    |        | AI Engineer         | LLM client + prompt store + confidence scoring + HITL routing + bounded tool registry + Langfuse telemetry                                                           | Phase 1 exit-criteria suite green (on `Track-CoreAIAgent` Block 5); read-only sub-agent responds to smoke queries within SLA                    | 15%               | Planned |
| M03 | First Working Version (internally demoable) | 20 May 2026 · W4    |        | PM                  | Planner action CRUD, Personal Hub, Meetings page shell, HITL review queue (wired to Agent Phase 1), minimal aggregated view, basic admin console                     | Internal demo to sponsor + CTO passes; no critical bugs; ≥70% coverage across changed modules                                                   | 15%               | Planned |
| M04 | MVP Pilot-ready                             | 17 Jun 2026 · W8    |        | PM                  | Complete Planner feature set · executive digest · MS Planner bidirectional sync · conversational AI interface · pilot team nominated · measurement instruments ready | Pre-pilot gate criteria on `05-Approach` Block 12 Definition of Success all green; sponsor go/no-go                                             | 25%               | Planned |
| M05 | Core AI Agent Phase 2 complete              | 17 Jun 2026 · W8    |        | AI Engineer         | Prompt tuning · prompt-injection defence · permission enforcement at AI boundary · free-form query router · adversarial security test suite passing                  | Penetration-style test by PM/BA returns zero permission-leak incidents; conversational interface first-attempt correctness ≥80% on baseline set | 10%               | Planned |
| M06 | Pilot-to-Wave gate                          | 15 Jul 2026 · W12   |        | Sponsor + Committee | Pilot 4-week report with outcome measures; Kill-criteria evaluation; Go / pause-and-tune / pivot decision recorded                                                   | Committee decision recorded in this sheet; kill-criteria thresholds evaluated on `09-ExecSupport`                                               | 10%               | Planned |
| M07 | Wave 1 rollout complete                     | TBD (post W12 gate) |        | IT + PMO            | First rollout wave (~2 weeks); wave health report                                                                                                                    | No critical blocking issues; adoption metric maintained                                                                                         | 5%                | Planned |
| M08 | Full-coverage rollout complete              | TBD                 |        | IT + PMO            | All target users provisioned; legacy side-channel parking                                                                                                            | Active-user count reached target; side-channel tracking stopped                                                                                 | 3%                | Planned |
| M09 | Post-rollout review                         | TBD                 |        | PM + Committee      | 4-week stable-operation report; next module scoped                                                                                                                   | Committee sign-off on Future roadmap continuation                                                                                               | 2%                | Planned |

**Total acceptance weight:** 100%.

## Block 3 — Legal & Compliance Checklist

Template-native checklist from PPTX Slide 6, adapted for internal project.

| #   | Item                                                | Status     | Owner      | Note                                                                                                                                                                                      |
| --- | --------------------------------------------------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | NDA signed                                          | N/A        | Legal      | Internal project — all participants under existing SETA employment NDAs                                                                                                                   |
| 2   | Data protection & privacy clause (GDPR / local law) | Pending W2 | PM + Legal | Apply SETA internal Data Protection Policy; align with VN Decree 13/2023 on Personal Data Protection; no external data processors beyond OpenAI (covered under Block 4 vendor disclosure) |
| 3   | IP ownership & license scope                        | Confirmed  | CTO        | SETA-owned across all codebases; no third-party IP licensing required for this MVP; OSS dependencies tracked in SBOM (auto-generated by CI per `05-Approach` Block 10)                    |
| 4   | Vendor data-processing disclosure                   | Pending W1 | PM         | Approval of this charter acknowledges action content and transcript excerpts are transmitted to OpenAI for Agent extraction under SETA vendor and data policies                           |
| 5   | Audit-log retention policy                          | Pending W4 | CTO        | Indefinite retention per regulatory baseline; no audio stored; archival/pruning strategy locked before pilot                                                                              |

## Block 4 — Regulatory Context

- **Authentication:** Microsoft 365 SSO via Entra ID exclusively; no local accounts. Aligns with SETA identity standards.
- **Data captured:** Names, work email, team membership, reporting structure (from Entra ID); Teams-produced transcript text content. No audio stored. No biometric data.
- **Meeting consent:** Handled natively in Microsoft Teams; platform inherits the Teams posture. User-level opt-outs per BRD REQ-12 add an additional privacy layer.
- **Data residency:** All infrastructure in AWS `ap-southeast-1` (Singapore). No region leakage; cross-region access is blocked at infrastructure level.
- **AI-originated actions:** Distinguishable from human-originated actions in the audit log (per `05-Approach` Block 4 DoR/DoD, audit event schema).
- **Cross-hierarchy raw access:** Every Admin-initiated cross-hierarchy read is logged with a stated reason. Enforced by Core Backend permissions engine.
