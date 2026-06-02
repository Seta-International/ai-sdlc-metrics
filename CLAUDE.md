# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
make up              # build + start Postgres 16 with pgTAP
make rebuild         # drop schemas → migrate → seed
make test            # run all pgTAP tests
make down            # stop + destroy volume

make export-csv      # → datasets/output/<schema>__<table>.csv
make export-excel    # → datasets/output/hackathon_dataset.xlsx
```

Single test file:
```bash
docker compose -f db/docker-compose.yml exec -T db pg_prove -U postgres -d hackathon /work/tests/core/01_happy_path.sql
```

## Structure

Migrations and seeds share the same numbering (`000__core` → `007__lnd_effectiveness`). Each must run in order — later files depend on earlier schemas. Tests mirror the same grouping under `db/tests/<schema>/`.

## Conventions

- **Natural keys** (`*_code text not null unique`) are used for all cross-references in seed files — never raw integer IDs.
- **No stored aggregates** — computed values live in views, defined at the bottom of each migration file.
- **`updated_at`** is maintained automatically via `core.set_updated_at()` trigger wired to every table.
- **Test files**: `00_`/`10_` = structure, `01_`/`11_` = happy path, `02_`/`12_` = edge cases, `03_`/`13_` = constraint enforcement. Schemas with two migration files (`pmo`, `ta`, `lnd`) have two test sets (00–03 and 10–13).
- All seed data (names, descriptions) is in Vietnamese.
