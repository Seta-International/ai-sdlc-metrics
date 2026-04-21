# Sheet: 05-Approach

> PPTX Slides 13-23. Largest sheet — 12 stacked blocks covering Org, R&R, Escalation, Communication, Stakeholder Matrix, Methodology + DoR/DoD, KPIs, Technical Approach, QA, CI/CD, AI Differentiator, Definition of Success.

## Block 1 — Organisation Chart

Render as embedded shapes / image. Text preview:

```
                         Board / Steering Committee
              (Hung Vu — Sponsor & Product Owner · Thu Mai — CTO
                        · Hoang Nguyen — PMO)
                                    |
                          Project Manager (Canh Ta)
                                    |
   +-------------+-------------+----------+---------+------------+--------+
   |             |             |          |         |            |        |
 Product       Scrum        Business   Tech Lead  AI Engineer  FS#1   FS#2
 Owner         Master       Analyst    (rotates)              (full-stack) (full-stack)
 (Hung Vu)                                                    (owns assigned (owns assigned
                                                              modules/      modules/
                                                              features)     features)
```

**Notes:**

- **Hung Vu is dual-hatted: Sponsor (CEO) and Product Owner.** The PO role is embedded in the BOD; story acceptance at sprint review is Hung Vu's call.
- BOD triplet (Hung Vu + Thu Mai + Hoang Nguyen) meets **weekly** for a sync on status, scope, and risk (separate from the monthly Steering Committee formal session for gate decisions).
- PM reports to Sponsor; owns delivery accountability, backlog, and prioritisation.
- SM + BA are 50%-effort cross-cutting roles.
- FS#1 + FS#2 + AI Engineer form the builder core; Tech Lead hat rotates (typically FS#2 owns architectural decisions).
- Designer-Lead (Mia / Darcy) is borrowed from another project; owns three critical surfaces: HITL queue, aggregated dashboards, action detail view.

## Block 2 — Roles & Responsibilities

| Role                     | Responsibilities                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PM                       | Overall delivery · backlog · prioritisation · scope (veto authority from Sponsor) · stakeholder communication · escalation · sprint planning chair                                                                                                                                                                 |
| PO                       | Story acceptance at sprint review · user representation in refinement · ensures "did we build the right thing this sprint"                                                                                                                                                                                         |
| SM                       | Ceremonies · velocity tracking · blocker unblocking · retrospective facilitation · coaching on DoR/DoD                                                                                                                                                                                                             |
| BA                       | Planner MVP: requirements · user stories · acceptance criteria · UAT design · pilot feedback coordination. Parallel stream: legacy systems discovery (stakeholder interviews · per-system requirement briefs feeding future Future modules). Flexible allocation between the two streams; PM covers capacity gaps. |
| Tech Lead                | Architecture decisions · code review gatekeeper · tech-risk mitigation · cross-module contract adjudication (default-assigned to FS#2)                                                                                                                                                                             |
| FS Dev #1                | Full-stack. Owns assigned Planner module features and Core-slice work end-to-end — BE, FE, and integration layers. Split of modules / features between FS#1 and FS#2 decided at Kickoff.                                                                                                                           |
| FS Dev #2                | Full-stack. Same framing as FS#1 — owns assigned modules / features end-to-end. No BE-vs-FE specialisation between the two devs.                                                                                                                                                                                   |
| AI Engineer              | Core AI Agent Phase 1 + Phase 2 · Planner-domain Agent integration (transcript sub-agent, extraction prompts, conversational executor)                                                                                                                                                                             |
| QA                       | Test plan · execution · defect tracking (shared across team with dedicated QA lead TBD at Kickoff)                                                                                                                                                                                                                 |
| DevOps / SRE             | CI/CD · ECS deployments · observability alerts · release runbook (shared function)                                                                                                                                                                                                                                 |
| Designer-Lead (borrowed) | HITL queue UX · aggregated dashboards UX · action detail view · design-system adherence reviews                                                                                                                                                                                                                    |
| Data Engineer            | Core Data Platform (if onboarded by W1; otherwise this role's work is deferred post-MVP and aggregated views run on direct operational-DB queries)                                                                                                                                                                 |

**Rule:** Every task has exactly one Accountable on the RACI matrix (`06-Resources` Block 2). PM + PO roles are explicitly complementary, not overlapping.

## Block 3 — Escalation Path + Response SLA

### Escalation tiers

| Level | Trigger                                                            | Action                                   |
| ----- | ------------------------------------------------------------------ | ---------------------------------------- |
| L1    | Team blocker or daily issue                                        | Track lead + SM resolve within 24 hours  |
| L2    | Delay >3 days, multi-team issue, or cross-track dependency slip    | PM escalates to Sponsor within 48 hours  |
| L3    | Critical risk · scope/budget breach · pilot kill-criterion tripped | Steering Committee decides within 1 week |

### Response SLA

| Severity                                               | Response       | Resolve         |
| ------------------------------------------------------ | -------------- | --------------- |
| P1 — Critical (pilot-impacting or security)            | 15 minutes     | 4 hours         |
| P2 — High (blocking pilot feature)                     | 1 hour         | 1 business day  |
| P3 — Medium (degraded behaviour, workaround available) | 4 hours        | 3 business days |
| P4 — Low (cosmetic, nice-to-have)                      | 1 business day | Next release    |

## Block 4 — Communication Plan

| Ceremony / Meeting                        | Audience                                                             | Frequency                    | Duration       | Owner                | Output                                                          |
| ----------------------------------------- | -------------------------------------------------------------------- | ---------------------------- | -------------- | -------------------- | --------------------------------------------------------------- |
| Daily stand-up                            | Delivery team (PM, PO, SM, builders, designer)                       | Daily                        | 15 min         | SM                   | Blockers, today's plan                                          |
| Sprint planning                           | Delivery team + PO                                                   | Bi-weekly (sprint start)     | 2 h            | PM                   | Sprint backlog; exit criterion                                  |
| Sprint review / demo                      | Delivery + stakeholders + PO                                         | Bi-weekly (sprint end)       | 1 h            | PM + PO              | Accepted / rejected stories; demo recording                     |
| Retrospective                             | Delivery team                                                        | Bi-weekly                    | 1 h            | SM                   | Action items, filed as CRs or track-level tasks                 |
| **BOD weekly sync**                       | **Hung Vu (Sponsor + PO) · Thu Mai (CTO) · Hoang Nguyen (PMO) · PM** | **Weekly**                   | **30 min**     | **PM**               | **Status · scope changes · risks · BOD-level decisions needed** |
| Steering Committee (formal)               | BOD triplet + CTO + PMO + PM                                         | Monthly (W4, W8, W12 gates)  | 1 h            | PM + Sponsor         | Gate decisions (M03, M04, M06); budget / scope rebaselines      |
| Weekly status report                      | All stakeholders                                                     | Weekly (written)             | —              | PM                   | Progress · RAG · risks · decisions needed                       |
| BA legacy-discovery interviews            | Stakeholder representatives (per legacy system)                      | Weekly (parallel workstream) | 45 min × N     | BA                   | Stakeholder notes; per-system requirement brief updates         |
| HITL review queue daily digest            | Meeting organisers + Admin                                           | Daily email                  | —              | System               | Pending proposal count + expiry risk                            |
| Pilot measurement interview (post-launch) | BA + pilot team reps                                                 | One-off (pilot W4)           | 20 min × 15-20 | BA + Pilot Team Lead | Interview transcript + outcome scores                           |

## Block 5 — Stakeholder Engagement Matrix

Place each stakeholder by influence (row) × interest (column). Cells name the strategy plus the named stakeholders.

|                    | High Interest                                                                                                        | Low Interest                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **High Influence** | **Manage Closely** — Hung Vu (Sponsor), Thu Mai (CTO), Hoang Nguyen (PMO), Mia/Darcy (Designer-Lead)                 | **Keep Satisfied** — SETA Finance (budget watcher), IT Infrastructure lead |
| **Low Influence**  | **Keep Informed** — Pilot team members, line managers of pilot users, PMO analyst, BA counterparts on future modules | **Monitor** — General SETA staff; non-pilot departments until Wave 1       |

## Block 6 — Methodology & SDLC Governance

**Methodology selected:** Agile Scrum, 2-week sprints. Not Waterfall. Not Hybrid.

### DoR / DoD per phase

| Phase                 | Input               | Output                                   | Definition of Ready (DoR)                            | Definition of Done (DoD)                                                                                                                                                                                                                                                       | Owner                |
| --------------------- | ------------------- | ---------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Analysis              | Business need + BRD | User story with acceptance criteria      | Stakeholder confirms problem; metric is quantifiable | Story has AC + effort estimate + sprint assignment                                                                                                                                                                                                                             | BA                   |
| Design                | Story               | High-level + low-level design; UX mockup | Scope signed-off in sprint planning                  | Tech-review passed; design token adherence verified                                                                                                                                                                                                                            | Tech Lead + Designer |
| Dev                   | Design + story      | Code + unit tests + integration tests    | Task ≤ 5 MD; one owner; AC is measurable             | **Test-first: test written and failing before code · ≥70% coverage (lines · functions · branches) · no `__tests__/` dirs (tests co-located) · no Promise.all on DB queries in handlers · no `.js` extensions on relative imports · code review approved by Tech Lead or peer** | Dev                  |
| QA                    | Build               | Test report; defect list                 | Test plan approved; UAT environment reachable        | 0 critical · ≤ 2 high with documented workaround · ≥ 95% test pass · coverage ≥ 70% · security scan clean                                                                                                                                                                      | QA                   |
| UAT / Pilot rehearsal | Signed build        | Pilot rehearsal sign-off                 | UAT env with realistic data; pilot playbook drafted  | ≥ 95% pass on pilot rehearsal scripts; no blocker                                                                                                                                                                                                                              | PM + BA              |
| Release               | UAT sign-off        | Pilot-staging deployment                 | Runbook ready; rollback plan in place                | Smoke test passes; Langfuse + CloudWatch dashboards green for 2 hours on staging                                                                                                                                                                                               | DevOps               |

## Block 7 — KPI Tracking Dashboard

### Metric tiles (populated weekly)

| Metric                                | Target              | Week Value | Status  |
| ------------------------------------- | ------------------- | ---------- | ------- |
| Progress (% of MVP scope delivered)   | 100% by W8          | —          | Planned |
| Defect rate (P1+P2 / total closed)    | < 2%                | —          | Planned |
| Coverage (lines, functions, branches) | ≥ 70% per CLAUDE.md | —          | Planned |
| Pilot CSAT (set at pilot W4)          | ≥ 4 / 5             | —          | Planned |

### Sprint Velocity

Captured at each sprint end. Populate post-S1.

| Sprint | Planned story points | Delivered story points | Note                       |
| ------ | -------------------- | ---------------------- | -------------------------- |
| S1     | TBD (after planning) | —                      | 3-day holiday capacity hit |
| S2     | —                    | —                      |                            |
| S3     | —                    | —                      |                            |
| S4     | —                    | —                      |                            |

### Burn-down

Populate at each daily stand-up. Use line chart on the workbook with remaining story points on the Y-axis and sprint day on the X-axis.

## Block 8 — Technical Approach

### Stack (card grid, 6 cards)

| Card               | Choice                                                                                                                                  | Rationale                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**       | Next.js 16 (multi-zones, 11 zones + shell) · TypeScript 6 · React 19 · Tailwind v4 · `@future/ui` (CVA-based) · next-themes             | Multi-zone architecture isolates zone failures; Tailwind + design tokens enforce DESIGN.md discipline; zones fully autonomous |
| **Backend**        | NestJS 11 modular monolith · Turborepo · tRPC 11 (end-to-end type-safe) · Hexagonal + DDD per module · Bun 1.3 runtime                  | One API service; cross-module communication via QueryFacade + domain events; no FK across schema boundaries; module autonomy  |
| **Database**       | PostgreSQL 16 · Drizzle ORM · schema-per-module · RLS on every tenant-scoped table · `tenant_id` mandatory · pgBouncer pool             | Schema-per-module keeps boundaries; RLS prevents cross-tenant data escape by construction; pool-client-per-request enforced   |
| **Infrastructure** | AWS ECS Fargate Graviton ARM64 · ECR · CloudFront · WAF · Secrets Manager · ap-southeast-1 region                                       | ARM64 only for cost; Secrets Manager only for credentials; no console changes (Terraform only)                                |
| **Observability**  | Langfuse (self-hosted ECS) for LLM traces · CloudWatch logs · Sentry for FE errors · OpenTelemetry for spans                            | Langfuse bridges LLM + tool + sub-agent traces; OTel + Langfuse unified through AI SDK wiring                                 |
| **Security**       | Zero-trust · Entra ID SSO · RLS + `canDo` + tRPC middleware · KMS-encrypted at rest · TLS in transit · SAST/DAST in CI · SBOM per image | Defence-in-depth; LLM outputs are never trusted to perform privileged operations                                              |

### Jobs & events

- pg-boss for scheduled + triggered jobs (reminders, digest, sync polling, subscription renewal).
- `outbox_event` table + polling relay for cross-module events (zero-dependency plain-TS shapes in `packages/event-contracts`).

### AI runtime

- Vercel AI SDK + OpenAI (`gpt-5.4-nano` classify, `gpt-5.4` reason, `text-embedding-3-small` embeddings).
- Tool/MCP registry with ToolGateway 10-step pipeline (auth · permission · taint · rate · budget · args-validate · execute · sanitize · log · trace).

## Block 9 — QA Approach

### Test pyramid (target mix)

```
UAT         2%
System / E2E 8%
Integration  20%
Unit         70%
```

### Test Type Ownership

| Test Type             | Scope                                                                      | Owner                               | Tooling                                                            |
| --------------------- | -------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Unit                  | Function / class / handler / component                                     | Dev                                 | Vitest · Testing Library · co-located tests (no `__tests__/` dirs) |
| Integration           | Module API · cross-handler flows · tRPC contract                           | Dev + QA                            | Vitest + real Postgres (testcontainers)                            |
| System / E2E          | End-to-end user flow                                                       | QA                                  | Playwright · critical flows only                                   |
| Performance           | Load / stress on hot endpoints                                             | QA + SRE                            | k6 · run pre-M04                                                   |
| Security              | SAST · DAST · dependency audit · prompt-injection suite · penetration test | Security (+ AI Eng for AI boundary) | CodeQL · Snyk · custom adversarial suite · `bun audit`             |
| UAT / Pilot rehearsal | Business scenario                                                          | BA + Pilot Team                     | Scripted rehearsal + real pilot users                              |

### Exit criteria (gate every milestone)

- 0 critical bugs
- ≤ 2 high bugs with documented workaround
- ≥ 95% test pass rate
- ≥ 70% coverage (lines, functions, branches) per CLAUDE.md
- Security scan clean (SAST + dependency audit)
- AI adversarial test suite green (Phase 2)

### Discipline rules

- **Test first.** No test = feature not started. Test not passing = not done.
- Handlers: unit test every error path, not just the happy path.
- Cross-module: integration test against a real database.
- Critical user flows: Playwright E2E.

## Block 10 — CI/CD Approach

### 6-step pipeline

1. **Source** — GitHub · trunk-based with feature branches · PR review required · CI green + 1 approval to merge
2. **Build** — GitHub Actions · Turborepo remote cache · lint · unit · SAST · image build (ARM64 only)
3. **Test** — Vitest · Playwright · integration against real Postgres via testcontainers · coverage report attached to PR
4. **Package** — Docker ARM64 image · ECR push · SBOM generation · Cosign sign
5. **Deploy** — ECS Fargate rolling deploy to a **single pilot-staging env** (no production env in this MVP) · auto-rollback on health check failure. Production environment is a post-pilot scope item; the pilot itself runs on staging.
6. **Monitor** — Langfuse · CloudWatch · Sentry · SLO dashboards · on-call rotation (pilot only)

### DORA targets (Elite-level aim)

| DORA metric          | Target                               |
| -------------------- | ------------------------------------ |
| Deploy frequency     | Daily (at least during build phase)  |
| Lead time for change | < 1 day from PR-open to staging-live |
| Change failure rate  | < 15%                                |
| MTTR                 | < 1 hour                             |

## Block 11 — AI Approach — The Differentiator

AI is integrated into each role to accelerate delivery and reduce manual effort. Budgeted on 1× Claude Max x20 shared subscription + ~$200 AI API cap.

| Role                | AI Use                                                                          | Impact Target                                          |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Dev                 | Code assistant · auto-completion · unit-test generation · architecture Q&A      | ↑ Productivity 25–40%                                  |
| QA                  | Auto-generated test cases · visual regression · adversarial prompt generation   | ↓ Manual effort 50%                                    |
| PM                  | Risk prediction · velocity forecast · early-warning retro synthesis             | Early warning 2–3 sprints                              |
| BA                  | Requirement parsing · user-story refinement · legacy-system interview synthesis | Faster discovery 30%                                   |
| Ops                 | Anomaly detection · incident triage · RCA assist                                | ↓ MTTR 40%                                             |
| Client (in-product) | Agent + conversational AI (optional add-on to the product itself)               | Business-value uplift measured in pilot outcomes G1–G7 |

**Principle:** Human-in-the-loop by default. Sample any AI-generated code in CR. No autonomous writes in user-facing paths without HITL approval.

## Block 12 — Definition of Success

Four quadrants. Each quadrant is green for pre-pilot sign-off.

### Delivery

- Go-live (pilot start) within ±1 week of plan (Wed 17 Jun 2026).
- Budget variance ≤ 10% of approved shape.
- 100% of MVP scope from `03-Scope` Block 2 delivered or explicitly deferred via CR.
- 0 critical bugs at pre-pilot gate.

### Quality

- ≥ 70% coverage per CLAUDE.md (lines, functions, branches).
- ≥ 95% pre-pilot rehearsal pass rate.
- Defect leakage to pilot < 5%.
- Security scan clean + penetration test returns zero permission-leak incidents.

### Adoption

- Pilot active-user rate ≥ 80% in pilot W4 (measured: logged in ≥ 3 times in the week).
- Pilot CSAT ≥ 4 / 5 in W4 interviews.
- Training / onboarding completion ≥ 90% among pilot users.
- Support-ticket volume trending downward across pilot W1 → W4.

### Outcome

- G1 chase-up reduction: meaningful reduction measured by time diary.
- G2 workaround displacement: < 1/3 of pilot users still keep side-records.
- G3 leadership behaviour change: ≥ 2 of 5 leaders answer yes concretely to all three interview questions.
- G4 AI capture recall ≥ 70%; reviewer acceptance ≥ 70%.
- G7 conversational AI first-attempt correctness ≥ 80%; zero permission-leak incidents.
