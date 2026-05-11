# Runbook — Postgres restore drill

> Run once per quarter. Dated entry below for every drill.

## Goal

Verify that a Postgres snapshot + WAL replay restores to a working application state. We measure: time-to-restore and time-to-green-tests.

## Procedure

1. Pick a recent daily snapshot and a target PITR timestamp within the 7-day WAL window.
2. Restore the snapshot into an isolated database (do NOT replace production).
3. Apply WAL until the target timestamp.
4. Point a freshly-built `apps/api` at the restored database (`DATABASE_URL`).
5. Run `pnpm test:integration` against it.
6. Spot-check at least 3 tenants for row counts and a representative LLM-tool flow.
7. Tear down the restored instance.

## Pass criteria

- All integration tests green within 10 minutes of restore completion.
- Row counts within ±0.1% of the snapshot baseline for sampled tables.

## Log

| Date       | Operator | Snapshot age | Time to restore | Time to green tests | Notes |
|------------|----------|--------------|------------------|----------------------|-------|
| _stub_     | _stub_   | _stub_       | _stub_           | _stub_               | _stub_ |
