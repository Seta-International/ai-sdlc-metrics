# ai-sdlc-metrics

Automated AI adoption and DORA metrics across the SDLC.

Reads from GitHub and Jira, writes to a shared RDS Postgres, and displays live
dashboards in Grafana — one for the team (current-sprint operational view) and
one for the BOD (sprint-over-sprint strategic view).

Reusable across projects: add a per-project caller workflow and two secrets to
track any additional Jira project + GitHub repo pair.

## Local dashboards (no credentials, no RDS)

`infra/docker/compose.local.yml` spins up a throwaway Postgres (schema + views +
seed data) and Grafana with the generated dashboards, so you can eyeball the
Future and BOD dashboards locally:

```bash
python3 infra/grafana/generate.py                        # (re)generate dashboards
docker compose -f infra/docker/compose.local.yml up -d
open http://localhost:3030                               # login: admin / admin
docker compose -f infra/docker/compose.local.yml down    # stop (Postgres is ephemeral — down+up reseeds)
```

Postgres auto-loads `infra/db/init.sql` → `views.sql` → `seed.sql` on first
start (host port 5433). Seed data (`infra/db/seed.sql`) is two projects (Future + TeacherZone) across
three sprints with improving trends, plus monthly/quarterly manual inputs, so
the BOD portfolio dashboard shows real cross-project comparison — **local only,
never run it against a real reporting database**. The local datasource in
`infra/docker/local-provisioning/` reuses the production `reporting-postgres`
uid so the same generated dashboards bind unchanged (`sslmode: disable`).
