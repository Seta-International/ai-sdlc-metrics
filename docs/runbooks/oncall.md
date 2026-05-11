# Runbook — On-call

> Stub. Fill in as ops experience accumulates.

## Pager scope (P1)

- `apps/api` 5xx rate > 1% over 5min → page.
- `apps/api` p99 latency > 5s over 5min → page.
- Postgres connection exhaustion (postgres-js `connect_timeout`) → page.
- Sentry release-level error spike → page.

## First steps

1. Open Jaeger (`http://localhost:16686` local; prod URL TBD) and find a recent failing trace.
2. Check Postgres pool: `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' GROUP BY usename;`
3. Check Bot Framework JWKS cache age — stale JWKS during MS rotation is the most common P1 outage.

## Common incidents

### Tenant sees zero rows where rows should exist

Cause: query bypassed `withTenant`. RLS is doing its job — `app.tenant_id` was unset. Find the offending query in the trace and route it through `withTenant`.

### "Connection slot already in use"

Cause: postgres-js pool exhausted. Either bump `PG_POOL_MAX` (see §3) or look for a leaking `withTenant` transaction (a forgotten `await` inside the callback).

### Bot Framework JWT verification rejects valid tokens after MS rotation

Cause: JWKS cache miss on a new `kid`. `jose`'s `cooldownDuration` throttles re-fetches; either wait it out or invalidate the cache manually.

## Escalation

- Platform team primary: TBD
- Cloud team (KMS / network): TBD
