# Hackathon Dataset — Database

Postgres 16 + pgTAP, built from plain SQL.

## Quick start
```bash
cd db
make up        # build + start Postgres, install pgtap
make rebuild   # drop schemas -> apply migrations -> load seed
make test      # run pgTAP suites via pg_prove
make down      # stop + remove volume
```
Dev loop while changing SQL: `make rebuild && make test`.
