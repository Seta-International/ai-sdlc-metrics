# Setup Checklist

Run these steps once when onboarding a new environment or project.
Automated steps use `gh` CLI or AWS CLI. Manual steps are marked ⚠️.

## 1. GitHub (agent-platform repo)

```bash
gh auth switch --user seta-canhta

# Labels
gh label create "ai-assisted" --repo seta-international/agent-platform --color "0075ca" --description "PR had AI assistance"
gh label create "ai-agent"    --repo seta-international/agent-platform --color "e4e669" --description "PR created by agent"

# Branch protection
gh api --method PUT /repos/seta-international/agent-platform/branches/main/protection \
  --input - <<'EOF'
{"required_status_checks":null,"enforce_admins":false,"required_pull_request_reviews":{"dismiss_stale_reviews":true,"required_approving_review_count":1},"restrictions":null}
EOF

# Environment + scanning
gh api --method PUT /repos/seta-international/agent-platform/environments/production
gh api --method PATCH /repos/seta-international/agent-platform \
  --field "security_and_analysis[secret_scanning][status]=enabled" \
  --field "security_and_analysis[secret_scanning_push_protection][status]=enabled"
```

## 2. Jira (all-it.atlassian.net / FUT)

Via Jira REST API (see plan Task 2 for full call sequence):
- Create fields: AI Usage (select), AI Time Saved (number), AI Tool (select), Caused by deploy (URL)
- Create Incident issue type
- Add fields to FUT default screen

⚠️ **Manual:** Add "AI Usage required" validator on Done transition:
> FUT Project Settings → Workflows → [active workflow] → Done → Validators → Field Required → AI Usage → Add → Publish

## 3. AWS RDS

```bash
export REPORTING_DB_PASSWORD="<strong-password>"
export REPORTING_SG_ID="sg-xxxxxxxx"
export REPORTING_DB_SUBNET_GROUP="seta-rds-subnet"
bash infra/rds/setup.sh

# After RDS is ready:
export REPORTING_DB_URL="postgresql://reporting:$REPORTING_DB_PASSWORD@<ENDPOINT>:5432/reporting?sslmode=require"
psql "$REPORTING_DB_URL" -f infra/db/init.sql
```

## 4. GitHub Actions secrets (org-level)

⚠️ **Manual:** Create GitHub fine-grained PAT at https://github.com/settings/tokens
  - Scopes: Contents (read), Pull requests (read), Deployments (read), Code scanning alerts (read)
  - Scope: seta-international/agent-platform

⚠️ **Manual:** Create Jira API token at https://id.atlassian.com → Security → API tokens

```bash
gh auth switch --user seta-canhta

gh secret set METRICS_GH_TOKEN      --body "<PAT>"            --org Seta-International
gh secret set JIRA_EMAIL            --body "<email>"          --org Seta-International
gh secret set JIRA_TOKEN            --body "<jira-token>"     --org Seta-International
gh secret set JIRA_AI_USAGE_FIELD   --body "customfield_XXXX" --org Seta-International
gh secret set REPORTING_DB_URL      --body "$REPORTING_DB_URL" --org Seta-International
gh secret set REPORTING_DB_HOST     --body "<RDS-endpoint>"   --org Seta-International
gh secret set REPORTING_DB_PASSWORD --body "$REPORTING_DB_PASSWORD" --org Seta-International
```

## 5. Grafana VPS

SSH into 192.168.90.127 and set env vars before restarting:
```bash
export REPORTING_DB_HOST="seta-reporting.xxxx.rds.amazonaws.com"
export REPORTING_DB_PASSWORD="<password>"
docker compose -f infra/docker/compose.monitoring.yml restart grafana
```
Verify: http://192.168.90.127:3000 → Configuration → Data Sources → ReportingPostgres → Test

## Adding a new project

1. Add a caller workflow to the new project's repo (copy `.github/workflows/ai-sprint-collect.yml`, change `PROJECT_LABEL`, `JIRA_PROJECT`, `GH_REPO`)
2. If the new project is on a different Jira instance: add project-specific `JIRA_EMAIL_XXX` / `JIRA_TOKEN_XXX` secrets
3. Update `SPRINTS` in `collector/config.py` if the new project uses a different sprint calendar
4. Add sprint_label to `SPRINTS` for each new sprint before it starts
