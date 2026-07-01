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
    compute_field_updates,
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
    }.items() if not val]
    if missing:
        print(f"WARNING: missing env vars {missing}, skipping ticket update.", file=sys.stderr)
        return

    try:
        gh = GitHubClient(GITHUB_TOKEN, args.repo)
        jira = JiraClient(JIRA_BASE, JIRA_EMAIL, JIRA_TOKEN, args.jira_project, JIRA_AI_USAGE_FIELD)

        pr = gh.get_pr(args.pr)
        branch = pr.get("head", {}).get("ref", "")
        issue_key = extract_issue_key(pr["title"], branch, args.jira_project)
        if not issue_key:
            print(f"No Jira key found for PR #{args.pr}, skipping.")
            return

        commits = gh.get_pr_commits(args.pr)
        messages = [c["commit"]["message"] for c in commits]
        labels = [l["name"] for l in pr.get("labels", [])]

        detected_usage = detect_ai_usage(labels, messages)
        detected_tool = detect_ai_tool(messages)
        detected_hours = extract_time_saved(pr.get("body") or "")

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
