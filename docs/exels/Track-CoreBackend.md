# Sheet: Track-CoreBackend

> Horizontal track. Monorepo scaffolding, shared auth primitives, org-chart permissions engine, audit, RLS + tenant isolation, outbox + relay, MS Graph adapter scaffolding, outbound email, rate limiter + kill switches, observability, shared BE commons. **No Planner-specific business logic lives here.**

## Block 1 — Purpose

Deliver the foundational backend slice that every Future module will reuse. Enough to unblock Planner's server-side work and to prove the patterns for subsequent modules (People · Time · Hiring · Projects · Performance · Finance · Goals · Insights).

## Block 2 — Scope

### 2.1 In scope

`03-Scope` Block 1 WBS rows `W-B01` .. `W-B16`:

- Monorepo scaffolding (Turborepo · Bun workspaces · shared tsconfig / eslint / prettier / lefthook / workspace template).
- Hexagonal + DDD module generator per project convention.
- Entra ID SSO primitive (OAuth flow · session · refresh · logout · tenant metadata).
- Magic link auth primitive (token mint · email delivery · validation · single-use).
- Org-chart permissions engine (`role_grant` · `role_permission` · delegation · `canDo()`).
- tRPC permission middleware + P2 visibility helpers + cross-hierarchy audit hook.
- Audit log primitive (schema + KernelAuditFacade + insert-only).
- RLS + tenant middleware with pool-client-per-request.
- Outbox event + polling relay + pg-boss harness.
- Rate limiter primitive + per-capability kill-switch primitive.
- Outbound email gateway (SES + SMTP · template registry · unsubscribe token).
- MS Graph adapter scaffolding (client wrapper · retry · rate-limit-aware batching · delta-query helper · subscription-renewal scheduler).
- Observability (OTel + Langfuse bridge · CloudWatch · structured logs · request-id propagation).
- Shared BE commons (error types · serializers · ID generators · clock abstraction · zod helpers · request-scoped context).

### 2.2 Out of scope

- Any module-specific business logic (Planner · People · Time etc.) — lives in those modules' tracks.
- User-facing features — none exist on this track.
- UI — Core Frontend owns.
- AI-specific primitives — Core AI Agent owns (LLM client · prompt store · confidence · HITL engine · tool registry).
- Data Platform (Glue · Iceberg · Athena · Cube) — that is a separate Core Data Platform track, contingent on DE onboarding.

### 2.3 Dependencies

- AWS account + VPC + ECS + ECR + Secrets Manager + RDS provisioning (D-03 on `07-DCA`).
- Microsoft 365 tenant admin consent for Entra ID + Graph scopes (D-01, D-02).
- SES sending domain + DNS (D-12).

## Block 3 — Deliverables & Acceptance

| #     | Deliverable                               | Acceptance                                                                                                              | Evidence                               | Milestone |
| ----- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------- |
| D-B01 | Monorepo + module template                | `turbo build` green from clean clone; new workspace via `turbo gen`; pre-commit runs lint + format + type-check + tests | CI log                                 | M01       |
| D-B02 | Entra ID SSO + magic link                 | Sign-in round-trip against real tenant; magic-link TTL enforced; session cookie httpOnly + SameSite                     | Integration tests                      | M01       |
| D-B03 | Org-chart permissions engine + middleware | `canDo()` correct across direct / delegated / cross-hierarchy matrix; P2 visibility enforced in list endpoints          | Unit + integration tests               | M01 / M03 |
| D-B04 | Audit log                                 | Insert-only; every logged operation appears; queryable by actor / subject / operation                                   | Query proof on staging                 | M01       |
| D-B05 | RLS + tenant middleware                   | Cross-tenant query denied at DB layer; lint rule blocks Promise.all on DB in handlers                                   | Automated test                         | M01       |
| D-B06 | Outbox + relay + jobs                     | Events published transactionally; relay delivers at-least-once; DLQ visible; scheduled jobs survive leader change       | Integration tests                      | M01       |
| D-B07 | MS Graph adapter scaffolding              | 429 backoff respected; subscription renewal ahead of expiry; delta queries batch                                        | Integration tests against test tenant  | M01 / M02 |
| D-B08 | Outbound email gateway                    | Template-driven emails send; bounce captured; unsubscribe respected                                                     | Sent + received email proof            | M01       |
| D-B09 | Rate limiter + kill switches              | 429 at threshold; kill switch disables route atomically with audit                                                      | Integration tests                      | M02       |
| D-B10 | Observability                             | Every tRPC call appears as span; trace IDs propagate worker boundaries                                                  | Langfuse + CloudWatch trace proof      | M01       |
| D-B11 | Shared BE commons                         | Utilities unit-tested; clock injected in time-sensitive handlers                                                        | Unit tests + usage in Planner handlers | M01       |

## Block 4 — WBS (task-level)

Full WBS on `03-Scope` Block 1 rows `W-B01` .. `W-B16`. Top 5 by effort:

| Rank | ID    | Feature                      | Effort High (MD) | Confidence | Owner |
| ---- | ----- | ---------------------------- | ---------------- | ---------- | ----- |
| 1    | W-B05 | Org-chart permissions engine | 8                | M          | FS#2  |
| 2    | W-B14 | MS Graph adapter scaffolding | 6                | M          | FS#2  |
| 3    | W-B09 | Outbox + polling relay       | 5                | H          | FS#2  |
| 4    | W-B03 | Entra ID SSO primitive       | 5                | H          | FS#2  |
| 5    | W-B13 | Outbound email gateway       | 5                | H          | FS#2  |

Track totals (indicative): ~41–74 MD across 16 rows.

## Block 5 — Sprint Plan (Core BE)

| Sprint     | Core BE goal                                                                                                                           | Exit criterion                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| S1 (W1–W2) | Monorepo + module template + SSO + magic link + permissions + audit + RLS + outbox + pg-boss + email gateway + observability + commons | `D-B01`..`D-B08` + `D-B10` + `D-B11` green; Planner team unblocked for Action domain work |
| S2 (W3–W4) | Rate limiter + kill switches + MS Graph adapter hardening (retry / backoff / subscription renewal)                                     | `D-B07` + `D-B09` green; Planner transcript webhook + MS Planner sync teams unblocked     |
| S3 (W5–W6) | Performance tuning on hot endpoints; index review; retention/archival path design                                                      | No performance regressions; SLO dashboards green                                          |
| S4 (W7–W8) | Data retention + admin deletion + export-on-request hook; pre-pilot hardening                                                          | Retention + deletion round-trip through audit log                                         |

## Block 6 — Track-specific Risks

| ID    | Risk                                                               | P   | I   | Mitigation                                                                                                            | Owner      | Status |
| ----- | ------------------------------------------------------------------ | --- | --- | --------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| RB-01 | Graph application permission approval delayed (D-02)               | M   | H   | Fallback to magic-link auth for development; parallel-track directory sync until consent lands                        | IT + PM    | Open   |
| RB-02 | RLS + pool-client-per-request adds latency to hot endpoints        | L   | M   | Benchmark in S1; connection-pool sizing per load test in S4                                                           | FS#2 + SRE | Open   |
| RB-03 | Outbox relay backlog grows under event spikes                      | M   | M   | Add parallelism with per-aggregate ordering; alerting on lag                                                          | FS#2       | Open   |
| RB-04 | Permissions engine logic missed an edge case; cross-hierarchy leak | L   | H   | Exhaustive unit test matrix; integration test with pilot-shaped org tree; included in `W-QA03` adversarial test scope | FS#2 + QA  | Open   |
| RB-05 | Email deliverability (SES reputation) low on first pilot send      | L   | M   | Warm up SES domain pre-pilot; monitor bounce/complaint rate; unsubscribe honoured                                     | FS#2 + IT  | Open   |

## Block 7 — Definition of Done (track-level)

- All `D-B01` .. `D-B11` deliverables accepted.
- Coverage ≥ 70% on all Core BE packages.
- SLO dashboards (CloudWatch + Langfuse) green for 2 hours on staging.
- Permission matrix exhaustively tested.
- SAST + dependency audit clean.
- Architecture documented in `02-Contract` Block 1 fields + inline in code.
- Core BE patterns demonstrably reusable (Planner track uses them end-to-end without modification).

## Block 8 — Open Questions

| Question                                                                                                                | Owner           | Needed by |
| ----------------------------------------------------------------------------------------------------------------------- | --------------- | --------- |
| Self-hosted Langfuse vs managed cloud (D-05)                                                                            | CTO             | W1        |
| Redis presence for rate limiter or Postgres-only                                                                        | FS#2 + CTO      | W1        |
| SES sending-domain name (reuses existing SETA domain?)                                                                  | IT              | W2        |
| Retention windows per entity type (action · transcript · evidence · audit log) — default is indefinite; any exceptions? | Sponsor + Legal | W4        |
| Which tracing sampling rate in staging vs prod?                                                                         | FS#2 + SRE      | W2        |
| MS Graph subscription resource scopes — are chat / transcript scopes granted at tenant level or filtered by Admin?      | IT + Admin      | W2        |
