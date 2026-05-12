# SLOs & Alerting

> The contract for what `seta-os` promises and how we measure it. Companion docs:
> - On-call responder playbook: `seta-os/docs/runbooks/oncall.md` (mirrors the paging rules below)
> - How code reaches the environment we measure: `seta-os/docs/production-readiness/deployment-pipeline.md`
>
> **Scope today (2026-05-12).** P1 ships local OTel collector + Jaeger via `docker-compose.yml` (setup.md §12). Production-grade alerting (Prometheus/Alertmanager + Grafana + a synthetic monitor + a pager service) is deferred — see § "Implementation deferred (P1.5 / P2)". This doc is **the design** we're committing to so the cutover is mechanical.

---

## 1. Service Level Objectives

### Tiering

- **Production** = the post-pilot environment, P2+.
- **Staging** = pilot environment, lower SLO; P1.5 deferred (`Project Plan v3.1` § 6 disposition: "AWS Terraform staging — DROPPED" for P1, lands P1.5).
- **Dev** = local docker-compose; not under SLO.

### Availability

| Environment | Monthly SLO | Allowed downtime / month |
| ----------- | ----------- | ------------------------ |
| Production  | **99.5 %**  | ~3 h 36 min              |
| Staging     | 99.0 %      | ~7 h 12 min              |
| Dev         | n/a         | —                        |

Production tiers up post-pilot — 99.9 % becomes a candidate once we have multi-AZ Postgres and at least two API instances (which triggers Redis adoption per setup.md §3 "Scaling triggers"). Until then, 99.5 % is honest given a single-instance, single-AZ shape.

### Latency (per-route p95 / p99)

Targets are **rolling 5-minute windows**, measured by the OTel HTTP server instrumentation.

| Route / operation                                     | p95             | p99               | Source                                                                                   |
| ----------------------------------------------------- | --------------- | ----------------- | ---------------------------------------------------------------------------------------- |
| `GET /healthz`                                        | < 200 ms        | < 400 ms          | `apps/api/SCOPE.md` § "HTTP endpoints" — liveness, no external deps.                     |
| `GET /me`                                             | < 500 ms        | < 1 s             | Future endpoint; single DB read + RLS check.                                             |
| Agent run end-to-end (Planner "summarize my tasks")   | **< 6 s**       | < 12 s            | `Project Plan v3.1` § "What success looks like — BK-4": *"p95 < 6 s Planner"*.           |
| Agent run end-to-end (FAQ retrieve + answer)          | **< 8 s**       | < 16 s            | `Project Plan v3.1` BK-4: *"p95 < 8 s FAQ (RAG retrieve adds ~1.5 s)"*.                  |
| SSE first-byte (stream `start` chunk)                 | < 1.5 s         | < 3 s             | `streamKernelSSE` keep-alive cadence is 15 s (setup.md §5 lines 397-426); first-byte must beat the keep-alive. |

> **Note on the original spec.** The internal task spec for this doc said "p95 < 4 s end-to-end". `Project Plan v3.1` (this repo, 2026-05-12) sets BK-4 at p95 < 6 s Planner / < 8 s FAQ. **The Project Plan is the source of truth** — the 4 s target is a stretch goal, not a contractual SLO. When BK-4 is re-tightened in P1.5+, revise the table above first.

### Error rate

- **< 1 % of requests over a rolling 5-minute window** at `apps/api`. 4xx (`DomainError` mapped by `@seta/middleware`'s `onError`, setup.md §12 lines 1406-1492 + CLAUDE.md "Errors") is normal user error and does **not** count toward this budget. Only 5xx counts.

### Data durability

- **99.999999999 % (11 nines)** — provided by managed Postgres snapshots + 7-day WAL retention (setup.md §3 "Backup / PITR"). Operationally validated by a **quarterly restore drill** (`docs/runbooks/restore-drill.md`). A restore-drill failure is a paging incident on its own.

---

## 2. Error budget

For a 99.5 % monthly availability SLO over 30 days = **3 h 36 min budget**.

### Burn-rate alerts

| Burn rate (multiple of SLO budget consumption) | Over window | Action                          |
| ---------------------------------------------- | ----------- | ------------------------------- |
| **2×**                                         | 1 h         | **Page** (consumes ~5 % of monthly budget per hour) |
| **14×**                                        | 1 h         | **Page-immediately + freeze deploys** (consumes ~33 % per hour — that is "the SLO will be blown today") |

Burn-rate semantics follow Google SRE Workbook conventions; the 14× / 1h threshold is chosen because it implies the monthly budget would be exhausted inside ~3 hours.

---

## 3. Alert taxonomy

Every alert is classified at definition time. The taxonomy is **enforced** — an alert that doesn't fit the criteria below must not page.

### Paging — wakes a human

Criteria (any one): **data integrity at risk** · **customer-facing outage** · **security event** · **SLO budget burning fast enough to blow the month**.

- 5xx rate spike, p99 latency, pg connection saturation, Bot Framework outbound auth failure, LLM provider outage, KMS Decrypt failures, audit-log write failures, disk usage, 14× burn-rate over 1 h.

### Ticket — opens an issue, no page

Criteria: **degradation that is not yet customer-facing** · **operational hygiene** · **capacity headroom**.

- Latency creep (slow drift toward p95 budget over 24 h), SLO burn at 2× over 24 h (informational), non-blocking dep upgrades, capacity headroom < 30 %, deploy-pipeline failures on `main`, dependabot security advisories.

### Informational — chat-only, daily digest

- Daily summary of run counts / tokens / cost per tenant (cross-cite `Project Plan v3.1` BK-3: *"Average < $0.15/run on demo set"*).
- Weekly cost report against BK-3.
- Weekly capacity / headroom report.

---

## 4. Alert rules table

Recommendation: **OTel Collector → Prometheus → Alertmanager → Grafana**. Rationale:
- OSS and already implied by setup.md §8 (OTel SDK + collector are pinned today).
- No vendor lock-in versus Datadog / Grafana Cloud / CloudWatch; the choice is deferred to § Open questions.
- Alertmanager has first-class concepts for `inhibit` / `silence` that paging services lack.

Each rule is mirrored 1:1 in `oncall.md` § "Pager scope". **If this table and that table disagree, this table wins** — `oncall.md` is the responder's view of these rules.

| #  | Name                          | Severity / class       | Query (PromQL-style)                                                                                                          | Window | Threshold     | Page or ticket | Runbook                                       |
| -- | ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | ------------- | -------------- | --------------------------------------------- |
| 1  | `api_5xx_rate_high`           | page · availability    | `sum(rate(http_requests_total{service="seta-api",status=~"5.."}[5m])) / sum(rate(http_requests_total{service="seta-api"}[5m]))` | 5 m    | > 0.01        | **page**       | `oncall.md` § Triage #1                       |
| 2  | `api_p99_latency_high`        | page · latency         | `histogram_quantile(0.99, sum by (le, route) (rate(http_request_duration_seconds_bucket{service="seta-api"}[5m])))`             | 5 m    | > 5 s         | **page**       | `oncall.md` § Triage #2                       |
| 3  | `pg_connection_saturation`    | page · capacity        | `sum(rate(postgres_connect_timeouts_total[1m]))`                                                                              | 1 m    | > 5/s         | **page**       | `oncall.md` § Triage #3                       |
| 4  | `bf_outbound_auth_failures`   | page · auth            | `sum(rate(botframework_reply_failures_total{status=~"401|403"}[1m]))`                                                          | 1 m    | > 5 / 1 m     | **page**       | `oncall.md` § Triage #4 + `secret-rotation.md` |
| 5  | `llm_provider_outage`         | page · upstream        | `sum(rate(llm_adapter_failures_total[1m])) / sum(rate(llm_adapter_calls_total[1m]))`                                          | 1 m    | > 0.5         | **page**       | `oncall.md` § Triage #5                       |
| 6  | `kms_decrypt_failures`        | **page-P0** · security | `sum(rate(kms_decrypt_failures_total[1m]))`                                                                                   | 1 m    | > 3 / 1 m     | **page**       | `oncall.md` § Triage #6 + `secret-rotation.md` |
| 7  | `audit_write_failures`        | **page-P0** · integrity | `sum(rate(audit_write_failures_total[5m]))`                                                                                 | 5 m    | > 0           | **page**       | `oncall.md` § Triage #7                       |
| 8  | `pg_disk_usage_high`          | page · capacity        | `(1 - (pg_filesystem_free_bytes / pg_filesystem_size_bytes))`                                                                 | 5 m    | > 0.80        | **page**       | `oncall.md` § Triage #8 + `restore-drill.md`  |
| 9  | `deploy_pipeline_failed_main` | ticket · ops           | `last_over_time(github_workflow_run_conclusion{branch="main",workflow="ci"}[1h])` non-success                                  | 1 h    | any failure   | ticket         | `deployment-pipeline.md` § CI gates           |
| 10 | `dependabot_security_alert`   | ticket · security      | GitHub Security webhook on `severity in (high, critical)`                                                                     | n/a    | any open      | ticket         | `deployment-pipeline.md` § Container hardening |
| 11 | `slo_burn_2x_1h`              | ticket · budget        | `(1 - slo_success_ratio_1h) * (30*24*60 / 60) > 2 * (1 - 0.995)`                                                              | 1 h    | sustained 1 h | ticket         | this doc § Error budget                       |
| 12 | `slo_burn_14x_1h`             | **page** · budget      | same as #11 with `> 14 * (1 - 0.995)`                                                                                         | 1 h    | sustained 1 h | **page**       | this doc § Error budget                       |
| 13 | `cost_over_bk3_per_run`       | ticket · cost          | `avg_over_time(agent_run_cost_usd[24h])`                                                                                      | 24 h   | > $0.15       | ticket         | `Project Plan v3.1` BK-3                      |

> Rules #4, #6, and #7 reference metric names (`botframework_reply_failures_total`, `kms_decrypt_failures_total`, `audit_write_failures_total`) that must be emitted by the implementing packages (`@seta/teams`, `@seta/oauth`, `@seta/audit`). Wiring these counters is a P1.5 follow-up; until then the rules are placeholders captured for the cutover.

---

## 5. Synthetic monitoring

Black-box probes that run from **outside** the system. They catch the failure mode that internal metrics miss: "internal metrics say everything is green because nothing is being measured."

| Probe                                    | Cadence    | Detects                                                              | Status (2026-05-12) |
| ---------------------------------------- | ---------- | -------------------------------------------------------------------- | ------------------- |
| `/healthz` HTTP ping                     | every 60 s | Process up, port open, TLS valid                                     | **P1.5 deferred**   |
| Canary agent run via Studio API          | every 5 m  | End-to-end agent loop works (kernel + tool call + reply path)        | **P1.5 deferred**   |
| OAuth admin-consent round-trip           | daily      | MSAL ConfidentialClientApplication + tenant_connectors write path    | **P1.5 deferred**   |
| Quarterly restore-drill                  | quarterly  | Backup + WAL pipeline restores to a verified state (`restore-drill.md`) | manual today        |

The canary agent run is what gates a "green deploy" — see `deployment-pipeline.md` § CD gates step 4.

---

## 6. Dashboards

Each dashboard listed below must exist before production cutover. Today none of them are provisioned — see § "Implementation deferred".

| Dashboard         | What it shows                                                                                              | Source                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `api-overview`    | request rate by route; 4xx vs 5xx; p50/p95/p99 by route; in-flight request gauge.                          | OTel HTTP server auto-instrumentation (setup.md §8 lines 609-614).                    |
| `agent-runs`      | runs/sec by tenant + model; tool-call distribution per agent; tokens/run; **cost/run vs BK-3 $0.15 line**. | `@seta/agent-core` emits a `agent_run` span; `Project Plan v3.1` § BK-3.              |
| `pg-postgres`     | active connections by usename; query duration p95; vacuum / autovacuum lag; replication lag.               | `pg_stat_statements` (enabled by docker-compose `shared_preload_libraries`, setup.md §12). |
| `oauth-tokens`    | refresh rate per tenant; refresh-failure rate per tenant; consent revocations.                             | `@seta/oauth` emits per-tenant counters (setup.md §4 MSAL block).                     |
| `audit-stream`    | write rate; write failures; backlog age if a queue is introduced.                                          | `@seta/audit` (setup.md §3 + CLAUDE.md "Idempotent external boundaries").             |
| `kernel-stream`   | SSE keep-alive events; client disconnect rate; abort vs error split.                                       | `streamKernelSSE` (setup.md §5 lines 397-426 + `docs/explorations/2026-05-12-mastra-spike/03-run-loop.md` § Punch list "split abort vs error branches"). |

---

## 7. Log-based alerts

For events that don't have a clean metric. All log-based alerts are driven by structured pino logs (setup.md §8 lines 616-676; `platform/observability/SCOPE.md`).

| Alert                            | Log query                                                                                  | Severity     | Why log-based                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------------------------ |
| RLS policy bypass attempt        | `level=error AND message="rls_unset" AND tenant_id IS NULL`                                | **page-P0**  | RLS is the backstop (setup.md §3); a log this exists at all means the app-layer check missed. |
| Tenant context unset on DB query | `level=warn AND code="tenant_context_missing"`                                              | ticket       | Indicates a `withTenant` was bypassed; CLAUDE.md "Tenant id is never a function parameter". |
| Sentry `beforeSend` dropped warning storm | derived counter from drop callback in setup.md §8 lines 742-746                       | ticket       | If we're dropping >100/min, the warning is signal we filtered wrongly.         |
| OTel SDK init missing            | absence of any `span` records in a 1-min window after deploy                               | **page**     | Means `--import` flag was dropped from the start script (setup.md §8 lines 682-721 footgun). |

---

## 8. What we explicitly do NOT alert on

Listing these because over-alerting is the most common cause of responder burnout.

- **4xx rate.** `DomainError` → 4xx is normal user error; mapped by `@seta/middleware`'s `onError` (setup.md §12 lines 1406-1492). Spiking 4xx warrants a *ticket* (probably a misuse pattern) — never a page.
- **Any single 5xx.** Need a rate; one 500 is noise (could be a network blip, an upstream retry, a long-tail race). The window is 5 min and threshold is 1 %.
- **Sentry events at `warning` level.** Setup.md §8 lines 742-746: `beforeSend` drops these. Re-introducing them as alert source is a regression.
- **`pino` redaction hits.** Useful in dev as a signal someone tried to log a secret; in prod it just confirms redaction works. Surface in dashboards, never page.
- **OTel collector queue saturation (local).** Collector is a sidecar; if it backs up, *spans* are delayed but *requests* are fine. P2 may add this as ticket.
- **CPU > 80 %.** Capacity headroom is a ticket-class signal; only saturation that translates to user-facing latency / errors pages.

---

## 9. Implementation deferred (P1.5 / P2)

The following are designed here but **not yet deployed**:

| Component                     | Status (2026-05-12)                  | Lands when                                  |
| ----------------------------- | ------------------------------------ | ------------------------------------------- |
| Prometheus + Alertmanager     | not deployed                         | P1.5 — paired with AWS Terraform staging    |
| Grafana dashboards (above)    | not provisioned                      | P1.5 — provisioned-as-code via Terraform    |
| Pager service integration     | none                                 | P1.5 — see § Open questions (PagerDuty et al.) |
| Synthetic monitor service     | none                                 | P1.5 — black-box-style external prober      |
| Sentry init                   | code path designed (setup.md §8 lines 723-768); env var `SENTRY_DSN` not declared in `apps/api/src/env.ts` yet (see `apps/api/SCOPE.md` § "Open questions") | When `SENTRY_DSN` is provisioned per env    |
| `pino-opentelemetry-transport` (log → OTLP) | not installed; `platform/observability/SCOPE.md` § Open Q notes the decision is deferred | When prod logs flow over OTLP            |
| `mixin()` for `trace_id` in logs | not enabled; `platform/observability/SCOPE.md` § Open Q | Before P1.5 cutover — required for log↔trace correlation in production |

P1 today is **OTel SDK + collector + Jaeger local**, end-of-story. Anything in this doc beyond that is design.

---

## 10. Open questions

These block production cutover. Each needs a single owner + a decision date.

- **Production OTel backend.** Self-hosted Tempo/Loki on AWS, Grafana Cloud, Datadog APM, or self-host Jaeger? Trade-off is cost vs operational overhead. Pinning needed before § "Synthetic monitoring" can be specified concretely. Owner: Platform team. Due: by P1.5 kickoff.
- **Sentry plan.** Sentry Node 8+ + `skipOpenTelemetrySetup: true` per setup.md §8 lines 723-768. Free tier likely too small for prod volumes; Team plan covers it. Owner: Platform team.
- **On-call paging service.** PagerDuty (mature, expensive), Opsgenie (Atlassian-bundled if we end up with Jira), or Better Stack (cheapest, less proven). The choice affects § Alert rules table integration. Owner: Platform team + Sponsor (cost question).
- **Status page service.** Statuspage.io, BetterStack Status, or a self-hosted Hugo page. The synthetic monitor canary drives this. Owner: Sponsor (customer-comms question).
- **BK-4 production target.** Project Plan v3.1 says < 6 s Planner / < 8 s FAQ. The original task spec for this doc says < 4 s. Get sponsor confirmation on which target survives into production SLO. Until then, Project Plan wins.
