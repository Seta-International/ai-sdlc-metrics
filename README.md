# Seta Hackathon Dataset

Postgres 16 dataset for Seta's AI hackathon — 5 schemas, Vietnamese seed data, 416 pgTAP tests.

## Schemas

| Schema | Coverage |
|--------|----------|
| `core` | Employees, projects, roles, skills |
| `pmo`  | Plans, resource allocation, timesheets |
| `ta`   | Headcount, JD templates, candidates |
| `elc`  | Performance, violations, salary bands |
| `lnd`  | Training roadmap, courses, assessments |

## Usage

```bash
make up       # start Postgres
make rebuild  # migrate + seed
make test     # 416 tests
make down     # stop + remove volume
```

## Export

```bash
pip3 install -r scripts/requirements.txt  # one-time

make export-csv    # → datasets/output/*.csv (61 files)
make export-excel  # → datasets/output/hackathon_dataset.xlsx (61 sheets)
```
