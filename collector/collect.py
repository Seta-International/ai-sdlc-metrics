#!/usr/bin/env python3
"""
Collect AI SDLC raw metric counts for one calendar month.

Usage:
  python -m collector.collect [--month 2026-06]
                              [--project Future] [--repo owner/repo]
                              [--jira-project FUT]
"""
import argparse
import sys
from datetime import datetime, timedelta
from collector.config import (
    GITHUB_TOKEN, GITHUB_REPO, GH_PROD_ENV,
    DEPLOY_COUNT_STRATEGY, JIRA_BASE, JIRA_PROJECT, JIRA_EMAIL, JIRA_TOKEN,
    JIRA_AI_USAGE_FIELD, REPORTING_DB_URL, PROJECT_LABEL,
    JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD,
)
from collector.github_client import GitHubClient
from collector.jira_client import JiraClient
from collector.windows import Window, resolve_window
from collector.metrics import (
    adoption_counts, ai_users_weekly_avg, delivery_counts, lead_time_hours,
    rework_counts, quality_counts, agent_counts, segmented_lead_time,
    pr_size_medians, review_metrics, ai_prs_with_tests, ai_time_saved_hours,
    ai_tasks_by_tool,
)
from collector.db import upsert_counts


def _merged_dt(pr: dict) -> datetime:
    return datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))


def set_review_counts(prs: list[dict], pr_reviews: dict[int, list]) -> list[dict]:
    """Adds review_count (approved reviews) to every PR from prefetched reviews."""
    for pr in prs:
        pr["review_count"] = sum(1 for r in pr_reviews.get(pr["number"], [])
                                 if r["state"] == "APPROVED")
    return prs


def build_counts(window: Window, prs: list[dict], all_prs: list[dict],
                 pr_files: dict[int, list[str]], deploy_times: list[datetime],
                 code_alerts: list[dict], secret_alerts: list[dict],
                 issues: list[dict], incidents: list[dict], field: str,
                 pr_commits: dict[int, list] | None = None,
                 pr_file_details: dict[int, list[dict]] | None = None,
                 pr_reviews: dict[int, list] | None = None,
                 tool_field: str | None = None,
                 time_saved_field: str | None = None) -> dict:
    """Pure assembly of all raw counts for one window. No IO."""
    return {
        **adoption_counts(prs, issues, field),
        **delivery_counts(deploy_times, incidents, window.weeks),
        **quality_counts(prs, code_alerts, secret_alerts),
        **agent_counts(prs, pr_commits or {}),
        **rework_counts(prs, all_prs, pr_files),
        **segmented_lead_time(prs, deploy_times),
        **pr_size_medians(prs, pr_file_details or {}),
        **review_metrics(prs, pr_reviews or {}),
        **ai_tasks_by_tool(issues, tool_field),
        "lead_time_h": lead_time_hours(prs, deploy_times),
        "ai_prs_with_tests": ai_prs_with_tests(prs, pr_files),
        "ai_time_saved_h": ai_time_saved_hours(issues, time_saved_field),
        "ai_users_weekly_avg": ai_users_weekly_avg(prs, window.since, window.until),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect AI SDLC raw metric counts")
    parser.add_argument("--month", default=None, help="Calendar month, e.g. 2026-06")
    parser.add_argument("--project", default=PROJECT_LABEL)
    parser.add_argument("--jira-project", default=JIRA_PROJECT)
    parser.add_argument("--repo", default=GITHUB_REPO)
    args = parser.parse_args()

    missing = [flag for flag, value in [("--project (or PROJECT_LABEL)", args.project),
                                        ("--repo (or GH_REPO)", args.repo),
                                        ("--jira-project (or JIRA_PROJECT)", args.jira_project)]
               if not value]
    if missing:
        print(f"ERROR: missing required project config: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    try:
        window = resolve_window(args.month)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"[{args.project}] {window.period_key}: "
          f"{window.since.date()} -> {window.until.date()} ({window.weeks:.1f} weeks)")

    gh = GitHubClient(GITHUB_TOKEN, args.repo)
    jira = JiraClient(JIRA_BASE, JIRA_EMAIL, JIRA_TOKEN, args.jira_project, JIRA_AI_USAGE_FIELD)

    # Fetch a 14-day lookback superset so rework can see pre-window merges.
    all_prs = gh.get_merged_prs(window.since - timedelta(days=14), window.until)
    prs = [p for p in all_prs if _merged_dt(p) >= window.since]
    pr_reviews = {p["number"]: gh.get_pr_reviews(p["number"]) for p in prs}
    prs = set_review_counts(prs, pr_reviews)
    pr_file_details = {p["number"]: gh.get_pr_files(p["number"]) for p in all_prs}
    pr_files = {n: [f["filename"] for f in d] for n, d in pr_file_details.items()}
    agent_numbers = [p["number"] for p in prs
                     if any(l["name"] == "ai-agent" for l in p.get("labels", []))]
    pr_commits = {n: gh.get_pr_commits(n) for n in agent_numbers}

    deploy_times = gh.get_production_deploy_times(
        DEPLOY_COUNT_STRATEGY, GH_PROD_ENV, window.since, window.until)
    code_alerts = gh.get_code_scanning_alerts(window.since, window.until)
    secret_alerts = gh.get_secret_scanning_alerts(window.since, window.until)
    extra_fields = tuple(f for f in (JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD) if f)
    issues = jira.get_closed_issues(window.since, window.until, extra_fields=extra_fields)
    incidents = jira.get_incidents(window.since, window.until)

    counts = build_counts(window, prs, all_prs, pr_files, deploy_times,
                          code_alerts, secret_alerts, issues, incidents,
                          JIRA_AI_USAGE_FIELD,
                          pr_commits=pr_commits, pr_file_details=pr_file_details,
                          pr_reviews=pr_reviews, tool_field=JIRA_AI_TOOL_FIELD,
                          time_saved_field=JIRA_AI_TIME_SAVED_FIELD)

    written = upsert_counts(REPORTING_DB_URL, args.project, window.period_type,
                            window.period_key, window.since.date(),
                            window.until.date(), counts)
    non_null = {k: v for k, v in counts.items() if v is not None}
    print(f"Upserted {written} metric rows: {non_null}")


if __name__ == "__main__":
    main()
