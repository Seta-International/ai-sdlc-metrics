#!/usr/bin/env python3
"""
Usage:
  python -m collector.update_ticket --pr 123

Best-effort enrichment: any failure (no Jira key found, ticket missing,
API error, missing field config) is logged and swallowed so it never
blocks the PR-merge pipeline that invokes it.
"""
import argparse
import sys
from collector.config import (
    GITHUB_TOKEN, GITHUB_REPO, JIRA_BASE, JIRA_PROJECT, JIRA_EMAIL, JIRA_TOKEN,
    JIRA_AI_USAGE_FIELD, JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD,
)
from collector.github_client import GitHubClient
from collector.jira_client import JiraClient
from collector.ticket_extract import (
    extract_issue_key, detect_ai_usage, detect_ai_tool, extract_time_saved,
    time_saved_unparseable, compute_field_updates,
)

def main() -> None:
    parser = argparse.ArgumentParser(description="Update a Jira ticket's AI fields from a merged PR")
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--repo", default=GITHUB_REPO)
    parser.add_argument("--jira-project", default=JIRA_PROJECT)
    args = parser.parse_args()

    missing = [name for name, val in {
        "JIRA_AI_USAGE_FIELD": JIRA_AI_USAGE_FIELD,
        "JIRA_AI_TOOL_FIELD": JIRA_AI_TOOL_FIELD,
        "JIRA_AI_TIME_SAVED_FIELD": JIRA_AI_TIME_SAVED_FIELD,
        "GH_REPO (--repo)": args.repo,
        "JIRA_PROJECT (--jira-project)": args.jira_project,
    }.items() if not val]
    if missing:
        print(f"WARNING: missing env vars {missing}, skipping ticket update.", file=sys.stderr)
        return

    try:
        gh = GitHubClient(GITHUB_TOKEN, args.repo)
        jira = JiraClient(JIRA_BASE, JIRA_EMAIL, JIRA_TOKEN, args.jira_project, JIRA_AI_USAGE_FIELD)

        pr = gh.get_pr(args.pr)
        branch = pr.get("head", {}).get("ref", "")
        body = pr.get("body") or ""
        labels = [l["name"] for l in pr.get("labels", [])]

        issue_key = extract_issue_key(pr["title"], branch, args.jira_project)
        if not issue_key:
            if {"ai-assisted", "ai-agent"} & set(labels) or time_saved_unparseable(body):
                print(f"WARNING: PR #{args.pr} is AI-labeled/claims time saved but has "
                      f"no Jira key in its title or branch - its AI usage/hours are "
                      f"NOT recorded anywhere. Link a ticket and re-run "
                      f"`python -m collector.update_ticket --pr {args.pr}` to fix.",
                      file=sys.stderr)
            else:
                print(f"No Jira key found for PR #{args.pr}, skipping.")
            return

        commits = gh.get_pr_commits(args.pr)
        messages = [c["commit"]["message"] for c in commits]

        detected_usage = detect_ai_usage(labels, messages)
        detected_tool = detect_ai_tool(messages)
        detected_hours = extract_time_saved(body)
        if detected_hours is None and time_saved_unparseable(body):
            print(f"WARNING: {issue_key} (PR #{args.pr}) has an 'AI time saved (hours):' "
                  f"line that isn't a plain number - it was NOT recorded. Fix the PR "
                  f"description's wording and re-run this command.", file=sys.stderr)

        fields = [JIRA_AI_USAGE_FIELD, JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD]
        current = jira.get_issue_fields(issue_key, fields)
        current_usage = (current.get(JIRA_AI_USAGE_FIELD) or {}).get("value", "None")
        current_tool = (current.get(JIRA_AI_TOOL_FIELD) or {}).get("value")
        current_hours = current.get(JIRA_AI_TIME_SAVED_FIELD) or 0

        updates = compute_field_updates(
            current_usage, current_tool, current_hours,
            detected_usage, detected_tool, detected_hours,
        )
        if not updates:
            print(f"{issue_key}: no changes.")
            return

        payload = {}
        if "usage" in updates:
            payload[JIRA_AI_USAGE_FIELD] = {"value": updates["usage"]}
        if "tool" in updates:
            payload[JIRA_AI_TOOL_FIELD] = {"value": updates["tool"]}
        if "hours" in updates:
            payload[JIRA_AI_TIME_SAVED_FIELD] = updates["hours"]

        jira.update_issue_fields(issue_key, payload)
        print(f"{issue_key}: updated {payload}")
    except Exception as e:
        print(f"WARNING: failed to update ticket for PR #{args.pr}: {e}", file=sys.stderr)

if __name__ == "__main__":
    main()
