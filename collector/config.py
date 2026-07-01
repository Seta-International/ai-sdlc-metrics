import os
from datetime import date

# Sprint calendar is per-project config, not hardcoded here — this repo is
# shared across every project's collector runs. Each project sets its own
# SPRINT_ANCHOR (first sprint's start date, ISO) and SPRINT_LENGTH_DAYS as
# env vars on its own workflow. Sprint N's start = anchor + (N-1)*length.
# Only required by collect.py, so optional here to not force it on other
# entrypoints (e.g. update_ticket.py) that share this config module.
SPRINT_ANCHOR: date | None = date.fromisoformat(os.environ["SPRINT_ANCHOR"]) if os.getenv("SPRINT_ANCHOR") else None
SPRINT_LENGTH_DAYS: int = int(os.getenv("SPRINT_LENGTH_DAYS", "14"))

GITHUB_TOKEN: str = os.environ["METRICS_GH_TOKEN"]
GITHUB_REPO: str = os.getenv("GH_REPO", "seta-international/agent-platform")
GH_PROD_ENV: str = os.getenv("GH_PROD_ENV", "production")

JIRA_BASE: str = os.getenv("JIRA_BASE", "https://all-it.atlassian.net")
JIRA_PROJECT: str = os.getenv("JIRA_PROJECT", "FUT")
JIRA_EMAIL: str = os.environ["JIRA_EMAIL"]
JIRA_TOKEN: str = os.environ["JIRA_TOKEN"]
JIRA_AI_USAGE_FIELD: str = os.environ["JIRA_AI_USAGE_FIELD"]
# Only required by update_ticket.py, so optional here to not break collect.py callers.
JIRA_AI_TOOL_FIELD: str | None = os.getenv("JIRA_AI_TOOL_FIELD")
JIRA_AI_TIME_SAVED_FIELD: str | None = os.getenv("JIRA_AI_TIME_SAVED_FIELD")

# Only required by collect.py (db upsert); optional here for the same reason as SPRINT_ANCHOR above.
REPORTING_DB_URL: str | None = os.getenv("REPORTING_DB_URL")
PROJECT_LABEL: str = os.getenv("PROJECT_LABEL", "Future")

# Bot logins excluded from "human intervention" check (D2/D3)
BOT_LOGINS: frozenset[str] = frozenset({
    "github-actions[bot]",
    "dependabot[bot]",
    "renovate[bot]",
})
