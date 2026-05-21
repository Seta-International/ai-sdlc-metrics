# mock-data-generator

Generates six CSV files of mock task-assignment data under `<repo>/mock/`:

- `users.csv` (~300 rows)
- `plans.csv` (~50 rows)
- `plan_members.csv` (~1,500–2,500 rows)
- `buckets.csv` (~150–200 rows)
- `tasks.csv` (~600 rows)
- `timesheet.csv` (~400 rows)

Schema and intent live in:

- [`docs/superpowers/specs/2026-05-20-mock-data-schema-design.md`](../../../docs/superpowers/specs/2026-05-20-mock-data-schema-design.md) — base schema
- [`docs/superpowers/specs/2026-05-21-mock-data-email-rbac-design.md`](../../../docs/superpowers/specs/2026-05-21-mock-data-email-rbac-design.md) — email + RBAC delta

## Run

```sh
pnpm --filter @seta/tooling gen-mock
```

Optional flags:

- `--seed <int>` — RNG seed (default `20260520`). Same seed = byte-identical output.
- `--out <path>` — output directory (default `mock`, relative to the repo root; absolute paths are honored).

Example:

```sh
pnpm --filter @seta/tooling gen-mock -- --seed 123 --out tmp-mock
```

## Test

```sh
pnpm vitest run --project mock-data-generator
```

The test suite covers per-generator behavior, cross-table referential integrity, named-cast survival, determinism, and verifies every spec scenario (S1–S5) and edge (E1–E28) against the generated dataset.
