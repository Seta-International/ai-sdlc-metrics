# Setup Checklist

Run these steps once per new project onboarding onto AI SDLC metrics.
Automated steps use `gh`/`aws`/`psql`. Manual steps are marked ⚠️.

Everything in this file happens **on the project's own repo** (e.g.
`agent-platform`), not on this repo — `ai-sdlc-metrics` only holds the
shared collector code, the shared reporting schema, and the shared Grafana.
See "What lives where" at the bottom.

## 1. GitHub (the project's own repo)

```bash
gh auth switch --user seta-canhta

# Labels
gh label create "ai-assisted" --repo <org>/<repo> --color "0075ca" --description "PR had AI assistance"
gh label create "ai-agent"    --repo <org>/<repo> --color "e4e669" --description "PR created by agent"

# Append the AI usage checklist block to .github/pull_request_template.md
# (see agent-platform's copy for the exact block)
```

⚠️ **Branch protection / secret scanning are GitHub-plan-gated**: on a
*private* repo without GitHub Pro/GHAS, both `PUT
/branches/main/protection` and enabling secret scanning return 403
("Upgrade to GitHub Pro or make this repository public"). Either upgrade the
plan, make the repo public, or skip these two — they aren't required for
the collector to function.

```bash
# Production environment (skip if it already exists)
gh api --method PUT /repos/<org>/<repo>/environments/production
```

## 2. Jira

See [`docs/jira-setup.md`](docs/jira-setup.md) for the full field-creation
walkthrough (AI Usage / AI Time Saved / AI Tool) plus the manual
browser steps team-managed projects require (field-to-issue-type
attachment, Incident issue type, Done-transition validator).

## 3. Reporting database

The collector writes into one shared Postgres table
(`reporting.ai_sprint_metrics`, keyed by `sprint_label` + `project`) so all
projects can share a single Grafana. Two ways to get a database:

**Option A — reuse an existing RDS instance** (no new AWS spend):
```bash
# Connect as an admin user on the existing instance, then:
psql "$ADMIN_DB_URL" -c "CREATE ROLE reporting WITH LOGIN PASSWORD '<strong-password>'"
psql "$ADMIN_DB_URL" -c "GRANT reporting TO <admin-role>"   # needed to set OWNER below
psql "$ADMIN_DB_URL" -c "CREATE DATABASE reporting OWNER reporting"
psql "$ADMIN_DB_URL" -c "REVOKE reporting FROM <admin-role>"
psql "postgresql://reporting:<password>@<host>:5432/reporting?sslmode=require" -f infra/db/init.sql
```
The `reporting` role only ever gets access to its own `reporting` database —
no grants on the instance's other databases.

**Option B — provision a dedicated instance** (greenfield, own AWS spend):
```bash
export REPORTING_DB_PASSWORD="<strong-password>"
export REPORTING_SG_ID="sg-xxxxxxxx"           # must allow 5432 from wherever the collector runs
export REPORTING_DB_SUBNET_GROUP="<subnet-group-in-a-public-subnet>"
bash infra/rds/setup.sh
psql "$REPORTING_DB_URL" -f infra/db/init.sql
```

⚠️ **Network access**: whichever option you pick, the collector runs on
**GitHub-hosted Actions runners** with dynamic IPs. GitHub's published
Actions IP range (`actions` key in `https://api.github.com/meta`) has
thousands of CIDRs — too many for an AWS security group. In practice this
means either opening 5432 to `0.0.0.0/0` (the `reporting` role has no
access beyond its own database, so the blast radius is limited to that one
schema) or running the collect job on a **self-hosted runner** that's
already on an allowed IP (see "Adding a new project" below).

## 4. GitHub Actions secrets — **per-repo, not org-level**

⚠️ Org-level secrets (`gh secret set ... --org`) need `admin:org` scope,
which most accounts don't have. Set these as **repo secrets** instead —
each project repo gets its own full set, even though `REPORTING_DB_*` are
identical across projects:

```bash
gh auth switch --user seta-canhta

gh secret set JIRA_EMAIL            --body "<email>"                --repo <org>/<repo>
gh secret set JIRA_TOKEN            --body "<jira-api-token>"       --repo <org>/<repo>
gh secret set JIRA_AI_USAGE_FIELD   --body "customfield_XXXX"       --repo <org>/<repo>
gh secret set REPORTING_DB_URL      --body "$REPORTING_DB_URL"      --repo <org>/<repo>
gh secret set REPORTING_DB_HOST     --body "<db-host>"              --repo <org>/<repo>
gh secret set REPORTING_DB_PASSWORD --body "<reporting-role-password>" --repo <org>/<repo>
```

Note there's **no `METRICS_GH_TOKEN`** — the workflow uses the ambient
`secrets.GITHUB_TOKEN` (scoped to the project's own repo) for PRs,
deployments, and code-scanning alerts, with a `permissions:` block granting
`pull-requests: read`, `deployments: read`, `security-events: read`. This
only works because the collector only ever reads the *same* repo the
workflow runs in — see "Adding a new project" below for why the workflow
has to live in the project's own repo rather than here.

## 5. Grafana

The AI SDLC dashboards run as their **own standalone Grafana instance**
(`infra/docker/compose.yml` in this repo), separate from any
project-specific monitoring stack. It's shared across all projects — you
don't redeploy it per project, you just point a new project's collector at
the same `reporting` database and its data shows up automatically via the
dashboards' `$project` dropdown.

```bash
git clone https://github.com/Seta-International/ai-sdlc-metrics.git
cd ai-sdlc-metrics
cat > infra/docker/.env <<EOF
REPORTING_DB_HOST=<db-host>
REPORTING_DB_PASSWORD=<reporting-role-password>
GF_ADMIN_PASSWORD=<strong-password>
EOF
chmod 600 infra/docker/.env
docker compose -f infra/docker/compose.yml up -d
```

Verify: `http://<host>:3100` → log in → the `ReportingPostgres` datasource
should show "Database Connection OK" (Configuration → Data Sources).

Login is required (anonymous viewing is disabled). Grafana users are
managed separately from GitHub/Jira — create them via the admin API or UI,
e.g.:
```bash
curl -u admin:<admin-password> -X POST http://<host>:3100/api/admin/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"...","login":"...","password":"...","email":"...","OrgId":1}'
curl -u admin:<admin-password> -X PATCH http://<host>:3100/api/org/users/<userId> \
  -H 'Content-Type: application/json' -d '{"role":"Viewer"}'   # or "Editor"
```

⚠️ Both this compose file and a project's own monitoring compose file may
sit in a directory literally named `docker` — Compose derives its default
project name from that directory, so two *different* stacks can collide
and Compose will delete the "other" stack's containers as orphans on `up`.
Both `compose.yml` here and `agent-platform`'s `compose.monitoring.yml` pin
an explicit `name:` to prevent this — do the same for any new compose file
that might share a directory name with another stack on the same host.

## Adding a new project

1. **Workflow must live in the project's own repo**, not here — GitHub only
   fires `pull_request`/`deployment_status` triggers for events in the repo
   the workflow file lives in, and the collector only needs read access to
   that same repo (via the ambient `GITHUB_TOKEN`, no cross-repo PAT).
   Copy `agent-platform`'s `.github/workflows/ai-sprint-collect.yml` and
   `ai-label-check.yml`, changing `PROJECT_LABEL`, `JIRA_PROJECT`, `GH_REPO`.
2. If the new project is on a **different Jira Cloud site**: it needs its
   own `JIRA_EMAIL`/`JIRA_TOKEN`/`JIRA_AI_USAGE_FIELD` secrets and the full
   field-setup walkthrough in `docs/jira-setup.md` repeated on that site.
   If it's the **same site**, different project key: reuse
   `JIRA_EMAIL`/`JIRA_TOKEN`, but the 3 fields still need to be attached to
   the new project (team-managed projects manage field association
   per-project even on a shared site) — repeat the "Manual steps" section
   of `docs/jira-setup.md`.
3. `REPORTING_DB_URL`/`HOST`/`PASSWORD` are the same values as any other
   project already on the shared database — just copy them as repo
   secrets on the new repo.
4. Update `SPRINTS` in `collector/config.py` if the new project uses a
   different sprint calendar than `FUT`'s.
5. No Grafana changes — the dashboards' `$project` dropdown picks up the
   new project's rows automatically once it starts writing to the shared
   `reporting.ai_sprint_metrics` table.

## What lives where

- **`ai-sdlc-metrics` (this repo)**: `collector/` (generic, env-var driven),
  `infra/db/init.sql` (shared schema), `infra/grafana/` (shared dashboards,
  already parameterized by project), `infra/docker/compose.yml` (the one
  shared Grafana deployment), this file and `docs/jira-setup.md`.
- **Each project's own repo**: the two workflow files, the PR template
  block, repo secrets, repo settings (labels/branch protection/secret
  scanning/production environment), and any project-specific CodeQL config.
