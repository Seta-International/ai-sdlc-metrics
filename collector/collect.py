#!/usr/bin/env python3
"""
Usage:
  python collect.py [--sprint S1] [--project Future] [--repo owner/repo]
                    [--a1 0.8] [--b5 0.1] [--c3 0.65]
"""
import argparse
import re
import sys
from datetime import datetime, timedelta, timezone
from collector.config import (
    SPRINT_ANCHOR, SPRINT_LENGTH_DAYS, GITHUB_TOKEN, GITHUB_REPO, GH_PROD_ENV,
    JIRA_BASE, JIRA_PROJECT, JIRA_EMAIL, JIRA_TOKEN, JIRA_AI_USAGE_FIELD,
    REPORTING_DB_URL, PROJECT_LABEL,
)
from collector.github_client import GitHubClient
from collector.jira_client import JiraClient
from collector.metrics import (
    calc_a2, calc_a3, calc_a4, calc_b2, calc_b3, calc_b4,
    calc_c1, calc_c2, calc_c4, calc_d_metrics,
)
from collector.db import upsert_metrics

def resolve_sprint(label: str | None) -> tuple[str, datetime, datetime]:
    """Sprint N starts at SPRINT_ANCHOR + (N-1)*SPRINT_LENGTH_DAYS. With no
    label, resolves to whichever sprint contains today."""
    today = datetime.now(timezone.utc).date()
    if label:
        m = re.fullmatch(r"S(\d+)", label)
        if not m:
            print(f"ERROR: sprint label must look like 'S<n>' (e.g. S3), got {label!r}", file=sys.stderr)
            sys.exit(1)
        index = int(m.group(1))
        if index < 1:
            print(f"ERROR: sprint index must be >= 1, got {index}", file=sys.stderr)
            sys.exit(1)
    else:
        if today < SPRINT_ANCHOR:
            print(f"ERROR: SPRINT_ANCHOR ({SPRINT_ANCHOR}) is in the future", file=sys.stderr)
            sys.exit(1)
        index = (today - SPRINT_ANCHOR).days // SPRINT_LENGTH_DAYS + 1
    start = SPRINT_ANCHOR + timedelta(days=(index - 1) * SPRINT_LENGTH_DAYS)
    since = datetime(start.year, start.month, start.day, tzinfo=timezone.utc)
    until = datetime.now(timezone.utc)
    return f"S{index}", since, until

def enrich_prs_with_review_count(gh: GitHubClient, prs: list[dict]) -> list[dict]:
    """Adds review_count to ai-assisted PRs (needed for C2)."""
    for pr in prs:
        if any(l["name"] == "ai-assisted" for l in pr.get("labels", [])):
            r = gh._s.get(
                f"https://api.github.com/repos/{gh._repo}/pulls/{pr['number']}/reviews",
                params={"per_page": 100},
            )
            if r.ok:
                pr["review_count"] = sum(1 for rev in r.json() if rev["state"] == "APPROVED")
    return prs

def main() -> None:
    parser = argparse.ArgumentParser(description="Collect AI SDLC metrics")
    parser.add_argument("--sprint", default=None)
    parser.add_argument("--project", default=PROJECT_LABEL)
    parser.add_argument("--jira-project", default=JIRA_PROJECT)
    parser.add_argument("--repo", default=GITHUB_REPO)
    parser.add_argument("--a1", type=float, default=None, help="Manual: seat adoption rate 0-1")
    parser.add_argument("--b5", type=float, default=None, help="Manual: cost improvement 0-1")
    parser.add_argument("--c3", type=float, default=None, help="Manual: AI code coverage 0-1")
    args = parser.parse_args()

    sprint_label, since, until = resolve_sprint(args.sprint)
    sprint_weeks = (until - since).total_seconds() / (7 * 86400)
    print(f"[{args.project}] {sprint_label}: {since.date()} -> {until.date()} ({sprint_weeks:.1f} weeks)")

    gh = GitHubClient(GITHUB_TOKEN, args.repo)
    jira = JiraClient(JIRA_BASE, JIRA_EMAIL, JIRA_TOKEN, args.jira_project, JIRA_AI_USAGE_FIELD)

    prs = gh.get_merged_prs(since, until)
    prs = enrich_prs_with_review_count(gh, prs)
    deploys = gh.get_deployments(GH_PROD_ENV, since, until)
    alerts = gh.get_code_scanning_alerts(since, until)
    issues = jira.get_closed_issues(since, until)
    incidents = jira.get_incidents(since, until)

    agent_pr_numbers = [p["number"] for p in prs if any(l["name"] == "ai-agent" for l in p.get("labels", []))]
    pr_commits = {n: gh.get_pr_commits(n) for n in agent_pr_numbers}
    d = calc_d_metrics(prs, pr_commits)

    metrics = {
        "a2": calc_a2(prs),
        "a3": calc_a3(issues, JIRA_AI_USAGE_FIELD),
        "a4": calc_a4(issues, JIRA_AI_USAGE_FIELD),
        "b2": calc_b2(deploys, sprint_weeks),
        "b3": calc_b3(incidents, deploys),
        "b4": calc_b4(incidents),
        "c1": calc_c1(prs),
        "c2": calc_c2(prs),
        "c4": calc_c4(alerts),
        "d1": d["d1"], "d2": d["d2"], "d3": d["d3"], "d4": d["d4"],
        "a1": args.a1, "b5": args.b5, "c3": args.c3,
    }

    upsert_metrics(REPORTING_DB_URL, sprint_label, args.project, metrics)
    non_null = {k: v for k, v in metrics.items() if v is not None}
    print(f"Upserted: {non_null}")

if __name__ == "__main__":
    main()
