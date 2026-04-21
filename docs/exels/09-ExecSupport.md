# Sheet: 09-ExecSupport

> PPTX Slide 27+. Budget · Decision SLA · Kill criteria.

## Block 1 — Budget

The approved budget shape, not a dollar figure.

### Resources approved

| Category               | Scope                                                                                                                                                                                       | Note                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Team time              | 2× Full-Stack Dev (100%) · 1× AI Engineer (100%) · 1× Data Engineer (100%, contingent) · 50% each of PM, Scrum Master, Business Analyst · borrowed Designer-Lead (part-time, named windows) | 8-week build + 4-week pilot + phased rollout TBD                                                            |
| AI assistance (build)  | 1× Claude Max x20 shared subscription                                                                                                                                                       | Used for code generation, test generation, design drafting, documentation, prompt development               |
| AI API runtime         | ~$200 cap on OpenAI API usage                                                                                                                                                               | For Agent extraction, confidence scoring, conversational queries. Circuit-breaker in Core AI W-A13 enforces |
| Infrastructure         | AWS (ap-southeast-1), ECS Fargate ARM64, ECR, Secrets Manager, RDS, S3, CloudFront, WAF, ALB                                                                                                | Under existing SETA organisational AWS account                                                              |
| Microsoft 365 licences | Existing SETA tenant — no additional licences                                                                                                                                               | Entra ID + Teams + Planner coverage already present                                                         |
| Observability          | Langfuse (self-hosted ECS) · CloudWatch · Sentry                                                                                                                                            | Self-hosted to avoid per-trace cost                                                                         |
| Buffer                 | 10-15% time buffer already absorbed into effort ranges on `03-Scope` Block 1                                                                                                                | No monetary buffer line; scope is the buffer                                                                |

### Excluded from budget

- No external professional services (e.g., Microsoft consulting, external QA firm).
- No external penetration test during the 2-month build (scheduled post-pilot pre-Wave-1 as a separate budget ask).
- No commercial product licences (e.g., Datadog, Figma upgrade, CI usage beyond GitHub Actions baseline).
- No dedicated customer-success or training contractor; pilot coaching runs on internal time.

### Budget tracking cadence

Weekly BOD sync reviews:

- OpenAI API spend vs cap (circuit-breaker state).
- Builder days consumed vs planned (from `04-Timeline` Block 3).
- Any CR-driven budget change requests (routed via `03-Scope` Block 4 process).

## Block 2 — Decision SLA

Time targets for getting decisions back to builders. Missing these SLAs means work blocks.

| Decision type                         | Approver                                                                 | Response SLA                                               | Escalation                                       |
| ------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------ |
| Sprint scope / backlog prioritisation | PM                                                                       | 24 hours                                                   | Sponsor if PM unavailable                        |
| Story acceptance at sprint review     | PO (Hung Vu, dual-hatted)                                                | At sprint review + 24 h grace for async follow-up          | PM to chase; escalate to Sponsor if 48 h         |
| Architectural change on Core slice    | Tech Lead (FS#2) with CTO approval                                       | CTO within 24 hours on Core architecture questions         | PM escalates to Sponsor at 48 h                  |
| Scope change (CR)                     | PM (under veto authority); CCB (Sponsor + CTO + PMO) for material change | PM 48 hours for small CR; CCB 5 business days for material | PM escalates to Sponsor; CCB is scheduled ad-hoc |
| Budget variance                       | Sponsor                                                                  | 48 hours                                                   | —                                                |
| Kill-criteria threshold triggered     | Steering Committee                                                       | 1 week to convene and decide                               | —                                                |
| Pilot-to-Wave gate decision           | Steering Committee (M06)                                                 | W12                                                        | —                                                |
| Wave rollout go / no-go               | Sponsor + PMO                                                            | 48 hours per wave                                          | —                                                |
| Post-incident review                  | PM + Tech Lead                                                           | Within 1 week of incident closure                          | —                                                |

## Block 3 — Kill Criteria

Thresholds that, if crossed, trigger a mandatory re-evaluation. Evaluated at the Pilot-to-Wave gate (M06) and during the pilot. Require Steering Committee endorsement before the pilot begins.

| Measure                            | Pause-and-tune threshold                           | Stop-and-reconsider threshold                                             |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| AI capture recall (G4)             | < 60% — 4 weeks of prompt tuning before continuing | < 40% — fundamentally reconsider the Agent approach                       |
| Workaround displacement (G2)       | 50% of pilot users still keep side-records         | ≥ 75% — product is parallel, not primary — rework UX                      |
| Chase-up reduction (G1)            | < 20% vs baseline                                  | 0% or negative — core value proposition not landing                       |
| Leadership behaviour change (G3)   | 0 of 5 leaders answered yes to all three questions | Same threshold — 0 of 5                                                   |
| Conversational AI correctness (G7) | < 70% first-attempt correctness                    | **Any permission-leak incident is an immediate stop** (no pause-and-tune) |
| HITL acceptance rate (G6)          | < 50% acceptance                                   | < 30% — proposal quality is not salvageable in the near term              |
| Team health / burnout signal       | Any team member reports overload in retro          | Two or more team members signal overload                                  |
| Budget overrun                     | AI API spend > 150% of $200 cap                    | AI API spend > 250% of cap without justified scope expansion              |

### Process on trigger

1. **PM flags** the triggered threshold in the weekly BOD sync.
2. **Steering Committee convenes** within 1 week; decides: **Proceed · Pause-and-tune · Pivot · Stop.**
3. **Decision recorded** on this sheet with date + reason.
4. If Stop or Pivot: close-out plan authored by PM, reviewed by CTO; communications by PM; archival of work products.

### Stage acceptance (rollup)

| Stage                    | Criterion                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build complete (M04)     | All `03-Scope` Block 2 scope delivered or explicitly deferred via CR; `05-Approach` Block 9 QA exit criteria met; pilot team onboarded; measurement instruments ready |
| Pilot-to-Wave gate (M06) | Five outcome measures (G1–G7) reviewed against Kill Criteria above; Committee decision: **proceed / pause-and-tune / pivot**                                          |
| Wave-to-wave gate        | IT and PMO confirm no blocking issues; outcome measurements repeated lightly on the new wave; adoption drop-off monitored                                             |
| Project closure (M09)    | Full coverage + 4 weeks stable operation; Steering Committee review; next Future module scoped per SETA priority                                                      |
