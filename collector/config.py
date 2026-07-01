import os
from datetime import date

# Add a new entry for each sprint: label → sprint start date (Monday).
# Future's sprints are 2 weeks long, starting Monday.
SPRINTS: dict[str, date] = {
    "S1": date(2026, 6, 29),
    # "S2": date(2026, 7, 13),
}

GITHUB_TOKEN: str = os.environ["METRICS_GH_TOKEN"]
GITHUB_REPO: str = os.getenv("GH_REPO", "seta-international/agent-platform")
GH_PROD_ENV: str = os.getenv("GH_PROD_ENV", "production")

JIRA_BASE: str = os.getenv("JIRA_BASE", "https://all-it.atlassian.net")
JIRA_PROJECT: str = os.getenv("JIRA_PROJECT", "FUT")
JIRA_EMAIL: str = os.environ["JIRA_EMAIL"]
JIRA_TOKEN: str = os.environ["JIRA_TOKEN"]
JIRA_AI_USAGE_FIELD: str = os.environ["JIRA_AI_USAGE_FIELD"]

REPORTING_DB_URL: str = os.environ["REPORTING_DB_URL"]
PROJECT_LABEL: str = os.getenv("PROJECT_LABEL", "Future")

# Bot logins excluded from "human intervention" check (D2/D3)
BOT_LOGINS: frozenset[str] = frozenset({
    "github-actions[bot]",
    "dependabot[bot]",
    "renovate[bot]",
})
