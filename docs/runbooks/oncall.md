# Runbook — On-call

> Production responder playbook for `seta-os`. Companion docs:
> - SLOs and alert-rule contract: `seta-os/docs/production-readiness/slo-alerting.md`
> - How code reaches the environment that fires these alerts: `seta-os/docs/production-readiness/deployment-pipeline.md`
> - Restore drill detail: `seta-os/docs/runbooks/restore-drill.md`
> - Secret rotation drill detail: `seta-os/docs/runbooks/secret-rotation.md`
>
> **Scope today (2026-05-12).** P1 has only local observability (OTel collector + Jaeger at `http://localhost:16686` via `docker-compose.yml`, setup.md §12). Production alerting backend, pager service, and synthetic monitors are P1.5+ — see `slo-alerting.md` § "Implementation deferred". Until that lands, this runbook is **the design** responders will follow; alert thresholds and triage queries are wired in advance so the cutover is mechanical.

---

## Rotation policy

- **Weekly rotation, Monday 10:00 ICT handoff** (Seta operates in Asia/Ho_Chi_Minh; document local time on every page).
- **Primary + secondary** every week. The primary is the first to be paged; the secondary covers gaps (PTO, lost phone, slept through the page).
- **Outgoing primary writes a handoff note** in `#incidents-handoff` (Slack): open incidents, deferred follow-ups, known-flaky alerts, anything paused mid-investigation.
- **Coverage** is North American + Europe friendly via the secondary slot — the primary is always Seta-Vietnam; the secondary is whoever on the rota has best timezone overlap with current customers.

### Escalation chain

| Step | Action                                | Trigger                                  |
| ---- | ------------------------------------- | ---------------------------------------- |
| 1    | Page **primary**                      | Alert fires (paging severity)            |
| 2    | Page **secondary**                    | 5 min no-ack from primary                |
| 3    | Page **CTO**                          | 10 min no-ack from primary AND secondary |
| 4    | Page **CEO**                          | 30 min no resolution AND customer-facing |

"Ack" = a human responded in the incident channel, claimed the incident, and the pager service records the ack. Joining the channel without acking does **not** count.

---

## Pager scope

Each rule below is mirrored 1:1 in `slo-alerting.md` § "Alert rules table". Keep them in sync — divergence is a bug.

| #  | Alert                            | Trigger                                                                                | Threshold     | Window | Severity     | First response                                                                                                                                                              |
| -- | -------------------------------- | -------------------------------------------------------------------------------------- | ------------- | ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | API 5xx rate                     | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` | > 1%          | 5 min  | **page**     | Open `api-overview` dashboard; find top failing route; pull a failing trace from Jaeger; check Sentry for grouped error.                                                    |
| 2  | API p99 latency                  | `histogram_quantile(0.99, http_request_duration_seconds_bucket)`                       | > 5s          | 5 min  | **page**     | Check `agent-runs` dashboard for model-call duration; suspect upstream LLM provider; check Postgres `pg_stat_activity` for slow queries.                                    |
| 3  | Postgres connection saturation   | postgres-js `connect_timeout` errors per second                                        | > 5/s         | 1 min  | **page**     | `SELECT count(*) FROM pg_stat_activity WHERE state IN ('active','idle in transaction') GROUP BY usename;` Look for runaway tx; bump `PG_POOL_MAX` only if not a leak.       |
| 4  | Bot Framework outbound auth      | Graph/Bot Framework reply API returns 401 / 403                                        | > 5 in 1 min  | 1 min  | **page**     | Token rotation likely — check `oauth-tokens` dashboard refresh-failure rate per tenant; trigger manual refresh via `@seta/oauth`; see `secret-rotation.md`.                  |
| 5  | LLM provider outage              | Adapter call failure rate (OpenAI + Anthropic combined)                                | > 50%         | 1 min  | **page**     | Check provider status pages; failover model in `@seta/agent-core` config if cross-vendor still healthy; declare degraded mode in #incidents.                                |
| 6  | KMS Decrypt failure spike        | `Decrypt` call errors with `InvalidCiphertextException` or AccessDenied               | > 3 in 1 min  | 1 min  | **page-P0**  | Likely `EncryptionContext` drift or IAM regression. **STOP DEPLOYS.** See `secret-rotation.md`. KMS errors mean stored tokens can't be read — outage spreads fast.            |
| 7  | Audit log write failure          | `@seta/audit` insert errors                                                            | > 0 in 5 min  | 5 min  | **page-P0**  | Data-integrity event. Stop tenant-data writes if possible; capture pg logs; inspect `audit_writer` errors in Sentry; see CLAUDE.md "Idempotent external boundaries".         |
| 8  | Postgres disk usage              | `pg_filesystem_size_bytes` — `pg_filesystem_free_bytes`                                | > 80% used    | 5 min  | **page**     | Run `SELECT pg_size_pretty(pg_database_size('seta'));`; identify top tables; check WAL retention; provision more disk; never auto-`VACUUM FULL` mid-incident.               |

> All paging rules above are P0/P1 by definition. "Ticket-only" alerts (latency creep, dependency upgrades, capacity warnings) live in `slo-alerting.md` and never wake anyone.

---

## Ack flow

1. **Page received.** Within **5 minutes**, click ACK on the page and post `ack <alert-name>` in `#incidents`.
2. **Spin up incident channel** named `#inc-YYYY-MM-DD-<short-slug>` (e.g. `#inc-2026-05-29-pg-saturation`). Pin a thread to the parent `#incidents`.
3. **Declare severity** (P0/P1/P2). Default to one notch higher than your gut — easier to downgrade than to apologise for under-calling.
4. **State-update every 15 minutes** in the incident channel even if "still investigating". Silence reads as panic to stakeholders.
5. **Declare end-of-incident** with a one-message summary: what broke, how it was patched, current state, follow-up owners.
6. **File the post-mortem ticket** within 24 hours; **publish the post-mortem doc** within 5 business days (see § Post-incident below).

---

## Common triage runbooks

Each entry is ≤ 8 lines. If you cannot fix in 15 minutes following the playbook, escalate per § Rotation policy.

### #1 — API 5xx rate spike

1. Grafana → `api-overview` → break errors by route.
2. Jaeger search: `service.name=seta-api`, error tag set, last 10m; open a failing trace.
3. The Hono `onError` maps `DomainError` to 4xx, so a 5xx is unhandled — find the throwing span (setup.md §8 + `apps/api/SCOPE.md` "Patterns to follow").
4. Sentry → grouped issue with `release: <git_sha>` (setup.md §8 Sentry block) — same trace_id appears in log line via the pino OTel mixin (setup.md §8 lines 651-659).
5. If a single tenant: check `tenant_id` tag on the error — could be tenant-specific data shape.
6. If many tenants: suspect a deploy regression — see `deployment-pipeline.md` § Rollback procedure.

### #2 — p99 latency over 5s

1. Grafana → `agent-runs` → split by `model` and `tenant_id`.
2. Slow span? If the LLM `doStream` is the dominant span, see triage #5.
3. If Postgres dominates: `SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20;`.
4. Check pgvector recall path — `iterative_scan` enabled? Setup.md §6 covers HNSW tuning + iterative scan; a missed gate makes vector queries slow.
5. Latency creep typically precedes saturation — review `pg-postgres` dashboard for the past 2h.

### #3 — Postgres connection saturation

1. `SELECT pid, usename, state, query_start, state_change, wait_event_type, wait_event, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;`.
2. Long `idle in transaction`? Caller forgot to `await` inside `withTenant` — find via Jaeger spans missing closing edge.
3. `PG_POOL_MAX` exceeded? Confirm it is a leak before bumping the cap — bumping masks the bug.
4. Bot Framework spike? Inbound traffic may have outstripped pool — apply `@seta/middleware` rate limiter if not already in front (setup.md §11 composition order).

### #4 — Bot Framework outbound 401/403

1. Likely token rotation. Open `oauth-tokens` dashboard.
2. Inspect `oauth.oauth_tokens` row for the failing tenant: `expires_at`, `refresh_failure_count`.
3. Check single-flight refresh contention — setup.md §4 uses `SELECT … FOR UPDATE`; a stuck holder blocks others.
4. If admin consent was revoked tenant-side: surface in `audit_stream` dashboard as `consent_revoked` event; ping tenant admin.
5. Cross-cite `secret-rotation.md` for the recovery walkthrough.

### #5 — LLM provider outage

1. Provider status pages: status.openai.com, status.anthropic.com.
2. If a single provider degraded: cut traffic via `ModelAdapter` env-driven failover (setup.md §5).
3. If both degraded: declare degraded mode; serve cached responses if any; consider freezing intake.
4. Long-running streams: `streamKernelSSE` (`@seta/agent-core`, setup.md §5 lines 397-426) wires `onAbort` + 15s keep-alive — clients will reconnect, no manual drop needed.
5. BK-3 ($0.15/run) cost discipline: high-retry storms during recovery burn cost — confirm `pRetry` `maxRetries: 2` cap holds (per `docs/explorations/2026-05-12-mastra-spike/03-run-loop.md` § "Punch list").

### #6 — KMS Decrypt failure spike (P0)

1. **Freeze deploys immediately.** A `EncryptionContext` mismatch usually traces to a bad deploy.
2. Confirm whether failures are global (KMS region down) or per-tenant (key/policy change).
3. AWS KMS console → key → CloudTrail events for the affected key — look for recent `PutKeyPolicy` / `DisableKey`.
4. **Do NOT rotate the DEK during the incident** — that compounds the failure. Stabilise first.
5. If tenants can't decrypt OAuth tokens, the cascade is: Bot Framework outbound fails → channels can't reply → 5xx rate climbs (alert #4 will also fire). Treat as one incident.
6. See `secret-rotation.md` for the recovery sequence.

### #7 — Audit log write failure (P0)

1. `@seta/audit` writes are SOR per CLAUDE.md "Idempotent external boundaries" — a failure means we cannot prove what happened.
2. Check Postgres: is the `audit` schema reachable? `SELECT count(*) FROM audit.events WHERE created_at > now() - interval '5 minutes';`.
3. Disk full on pg host (alert #8) is the most common cause — handle that first, audit recovers.
4. If audit insert is rejected by RLS: the writer is connecting under the wrong role (`tenant_user` vs `platform_admin`). Setup.md §3 "App connects as `tenant_user`".
5. While audit is down, **do not accept tenant-data writes**. Apply rate limiter cap at zero on write routes if possible.

### #8 — Postgres disk > 80%

1. `\dt+` and `\di+` in psql — find the biggest table/index.
2. `SELECT * FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 20;` — autovacuum keeping up?
3. WAL retention: 7 days per setup.md §3 "Backup / PITR" — if disk pressure is WAL, the snapshot/PITR archive sink may have stopped.
4. **Never `VACUUM FULL` mid-incident** — it takes an `ACCESS EXCLUSIVE` lock and blocks every writer.
5. Add disk (managed Postgres → resize), then investigate. Cross-cite `restore-drill.md` if recovery requires snapshot.

---

## Pre-incident readiness checklist

Before being placed on the rotation a responder must confirm **all** of the following. The on-call lead audits quarterly.

- [ ] VPN access to the production VPC works (test by `ssh`-ing to a bastion or by hitting the private health endpoint).
- [ ] AWS IAM role assumed: **KMS read** (`kms:Decrypt`, `kms:DescribeKey`) — **never write** (no `kms:PutKeyPolicy`, no `kms:Disable*`). Setup.md §4 KMS provider abstraction.
- [ ] Postgres **read-replica** creds (read-only role) in 1Password vault. Production primary creds are break-glass only.
- [ ] Jaeger UI access (P1: `http://localhost:16686` for dev; production URL TBD per `slo-alerting.md` § "Open questions").
- [ ] Sentry org membership + can view the `seta-api` project.
- [ ] Pager service installed on phone, paging schedule verified by a test page.
- [ ] Slack `#incidents` channel joined; notifications NOT muted.
- [ ] `deployment-pipeline.md` bookmarked — you may need § Rollback procedure under stress.
- [ ] This runbook printed and stored offline (a single-page emergency card) — observability tools can themselves fail.
- [ ] Microsoft Bot Framework portal access for the dev/prod App Registration (setup.md §7).
- [ ] Azure AD App Registration access for the multi-tenant Entra ID app (setup.md §4 MSAL block).

---

## Post-incident

- **Post-mortem doc due within 5 business days.** Use the template at `docs/runbooks/post-mortem-template.md`. **FOLLOW-UP: that template does not exist as of 2026-05-12.** First incident commander after the template lands writes it; until then, copy the headings from §"Post-mortem structure" below.
- **Blameless review.** The published doc never names individual fault. It names systems, missing tests, missing alerts, undocumented assumptions.
- **Named action items with owners.** Each action item links to a Linear/Jira ticket with a single named owner (no "team to decide") and a due date.
- **Review cadence.** All P0 post-mortems reviewed at the next engineering all-hands. P1 reviewed in the next platform-team weekly.

### Post-mortem structure (until template file lands)

1. **Summary** (2–3 sentences, no jargon).
2. **Impact** — customers affected, duration, data lost (if any), SLO budget burned (cross-cite `slo-alerting.md` § Error budget).
3. **Timeline** (UTC + ICT, minute resolution).
4. **Root cause** (technical chain).
5. **Trigger** (the change that exposed it).
6. **What went well** / **What went poorly**.
7. **Action items** (`OWNER — DUE — DESCRIPTION` rows, linked to tickets).

---

## Communications

| When                                                  | Who notifies whom                                              | How                                              |
| ----------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------ |
| Any customer-facing outage > 5 min                    | Incident commander → customers                                 | Status page update; subscribers auto-notified    |
| Any P0 or P1 active                                   | Incident commander → Seta engineering                          | `#incidents` channel, state every 15 min         |
| Any P0 or any data-loss / integrity event             | Incident commander → CTO                                       | Phone call + Slack DM; do not rely on @-mention  |
| Customer-facing outage > 30 min                       | CTO → sponsor                                                  | Phone call + email                               |
| End of incident, regardless of severity               | Incident commander → `#incidents`                              | Closing summary message                          |
| Post-mortem published                                 | Author → `#incidents` and `#engineering-allhands`              | Link + 3-line tl;dr                              |

> **Status page.** P1 has no status page yet — surfacing this is a P1.5 ticket. Until then, customer-facing outage notifications are direct (email/Slack) to the known pilot tenants only. See `slo-alerting.md` § "Synthetic monitoring" for the canary that should drive status-page state automatically.

---

## Tools / access

| Tool                          | URL (dev)                          | URL (prod)                                                          |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Jaeger UI                     | `http://localhost:16686`           | **TBD** — depends on backend pick (`slo-alerting.md` § Open Q)      |
| OTel collector OTLP endpoint  | `http://localhost:4318`            | **TBD**                                                             |
| Grafana                       | not deployed                       | **TBD — P1.5**                                                      |
| Sentry                        | not enabled in P1                  | env-gated by `SENTRY_DSN` (setup.md §8 lines 723-768)               |
| Postgres console              | `psql` against docker compose      | bastion + read-replica role                                         |
| AWS KMS console               | n/a in `KMS_PROVIDER=env` mode     | AWS console, read-only IAM role                                     |
| Microsoft Bot Framework portal | https://dev.botframework.com/     | same                                                                |
| Azure AD App Registrations    | https://portal.azure.com           | same                                                                |
| Pager service                 | none (P1)                          | **TBD — P1.5** (PagerDuty / Opsgenie / Better Stack; see `slo-alerting.md` § Open Q) |

### How telemetry reaches you

Per setup.md §8 (full pino + OTel + redact pipeline) and `platform/observability/SCOPE.md`:
- Every log line carries `req_id`, `tenant_id` (when known), and (when the `mixin()` lands per the SCOPE.md "Open questions") `trace_id` / `span_id` — so a Sentry error grouping resolves directly to a Jaeger trace.
- Redact paths (setup.md §8 lines 637-649) drop OAuth tokens, API keys, `Authorization` / `cookie` headers, DEKs, plaintext, and well-known env-var secrets **before** the line is serialised. **Do not bypass this** — never add `console.log` to chase an incident.
- OTel SDK init order is non-negotiable: `apps/api` boots via `node --import ./instrumentation.{ts,js}` (setup.md §8 lines 682-721 and `apps/api/SCOPE.md` § "Composition order"). If a deploy ever drops the `--import` flag, the symptom is "Jaeger shows zero HTTP spans" — that is itself a paging-worthy regression (add to `slo-alerting.md` § "Log-based alerts" as an implementation note).
- Graceful shutdown drains HTTP before flushing OTel (setup.md §11 lines 1050-1075). When a deploy or rollback completes, the last-seen spans in Jaeger should always reach `finish`; missing final spans on SIGTERM indicates a regression in the shutdown wiring (`apps/api/SCOPE.md` § "Composition order" step 9).

---

## Document health

- **Owner:** Platform team.
- **Review cadence:** every 4 weeks, and after every P0.
- **Source-of-truth for thresholds:** `slo-alerting.md` § "Alert rules table". This file's § "Pager scope" mirrors it; if they disagree, the slo-alerting doc wins and this file is the one with the bug.
