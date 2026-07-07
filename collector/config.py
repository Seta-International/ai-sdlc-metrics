import os

GITHUB_TOKEN: str = os.environ["METRICS_GH_TOKEN"]
# Per-project identity — always set by the project's caller workflow (or CLI
# flags). Deliberately no project-specific defaults: this repo is shared by
# every project, so entrypoints fail fast when these are missing instead of
# silently collecting the wrong repo.
GITHUB_REPO: str = os.getenv("GH_REPO", "")
# Deploy environment(s) to count. Comma-separated to union several GitHub
# Environments (e.g. 'dev,uat') under the 'deployments' strategy.
GH_PROD_ENV: str = os.getenv("GH_PROD_ENV", "production")
# How production deploys are counted for this project — the GitHub Deployments
# API is the default contract; other strategies cover CI/CD that can't create
# deployment records: 'deployments' | 'releases' | 'tags:<pattern>' | 'workflow_runs:<file>'
DEPLOY_COUNT_STRATEGY: str = os.getenv("DEPLOY_COUNT_STRATEGY", "deployments")

JIRA_BASE: str = os.getenv("JIRA_BASE", "https://all-it.atlassian.net")
JIRA_PROJECT: str = os.getenv("JIRA_PROJECT", "")
JIRA_EMAIL: str = os.environ["JIRA_EMAIL"]
JIRA_TOKEN: str = os.environ["JIRA_TOKEN"]
JIRA_AI_USAGE_FIELD: str = os.environ["JIRA_AI_USAGE_FIELD"]
# Only required by update_ticket.py, so optional here to not break collect.py callers.
JIRA_AI_TOOL_FIELD: str | None = os.getenv("JIRA_AI_TOOL_FIELD")
JIRA_AI_TIME_SAVED_FIELD: str | None = os.getenv("JIRA_AI_TIME_SAVED_FIELD")

# Only required by collect.py (db upsert), so optional here to not force it on other entrypoints.
REPORTING_DB_URL: str | None = os.getenv("REPORTING_DB_URL")
PROJECT_LABEL: str = os.getenv("PROJECT_LABEL", "")

# Bot logins excluded from "human intervention" check (D2/D3)
BOT_LOGINS: frozenset[str] = frozenset({
    "github-actions[bot]",
    "dependabot[bot]",
    "renovate[bot]",
})
