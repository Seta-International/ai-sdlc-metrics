#!/usr/bin/env python3
"""
Quarterly governance auto-check: verifies repo facts (AGENTS.md, branch
protection, scanning), derives measured/trend flags from metric_counts, and
stores Yes/No suggestions in manual_inputs for the PM to confirm or override
at the quarterly review. Never overwrites human-entered values.

Usage:
  python -m collector.quarterly --project Future --quarter 2026-Q3
"""
import argparse
import re
import statistics
import sys
from collector.config import (
    GITHUB_TOKEN, GITHUB_REPO, PROJECT_LABEL, REPORTING_DB_URL,
)
from collector.db import fetch_month_values, get_manual_input, upsert_manual_input
from collector.github_client import GitHubClient

AUTO_CHECK = "auto-check"
_DORA_KEYS = ["lead_time_h", "mttr_h", "deploys", "weeks", "incidents"]


def quarter_months(quarter: str) -> list[str]:
    m = re.fullmatch(r"(\d{4})-Q([1-4])", quarter)
    if not m:
        raise ValueError(f"quarter must be YYYY-Q<1-4>, got {quarter!r}")
    year, q = int(m.group(1)), int(m.group(2))
    return [f"{year}-{month:02d}" for month in range(3 * q - 2, 3 * q + 1)]


def prev_quarter(quarter: str) -> str:
    year, q = int(quarter[:4]), int(quarter[-1])
    return f"{year - 1}-Q4" if q == 1 else f"{year}-Q{q - 1}"


def _quarter_dora(db_url: str, project: str, quarter: str) -> dict | None:
    vals = fetch_month_values(db_url, project, _DORA_KEYS, quarter_months(quarter))
    by_key: dict[str, list[float]] = {}
    for (_, mk), v in vals.items():
        by_key.setdefault(mk, []).append(v)
    if "lead_time_h" not in by_key or "mttr_h" not in by_key or "deploys" not in by_key:
        return None
    deploys, weeks = sum(by_key["deploys"]), sum(by_key.get("weeks", []))
    if not deploys or not weeks:
        return None
    return {
        "lead": statistics.median(by_key["lead_time_h"]),
        "mttr": statistics.median(by_key["mttr_h"]),
        "deploy_rate": deploys / weeks,
        "cfr": sum(by_key.get("incidents", [0])) / deploys,
    }


def dora_improving(db_url: str, project: str, quarter: str) -> str | None:
    cur = _quarter_dora(db_url, project, quarter)
    prev = _quarter_dora(db_url, project, prev_quarter(quarter))
    if cur is None or prev is None:
        return None
    improved = sum([
        cur["lead"] < prev["lead"],
        cur["mttr"] < prev["mttr"],
        cur["deploy_rate"] > prev["deploy_rate"],
        cur["cfr"] < prev["cfr"],
    ])
    return "Yes" if improved >= 3 else "No"


def _yn(flag: bool) -> str:
    return "Yes" if flag else "No"


def build_suggestions(gh: GitHubClient, db_url: str, project: str,
                      quarter: str) -> dict[str, str]:
    code_on, secret_on = gh.security_scanning_status()
    cycle_rows = fetch_month_values(db_url, project, ["agent_cycle_h"],
                                    quarter_months(quarter))
    suggestions = {
        "g1_agents_md": _yn(gh.file_exists("AGENTS.md")),
        "g3_required_review": _yn(gh.branch_requires_review(gh.default_branch())),
        "g6_security_controls": _yn(code_on and secret_on),
        "c3_scan_ci": _yn(code_on),
        "a2_dashboard": "Yes",
        "d4_cycle_measured": _yn(bool(cycle_rows)),
    }
    trend = dora_improving(db_url, project, quarter)
    if trend is not None:
        suggestions["b4_dora_improving"] = trend
    return suggestions


def store_suggestions(db_url: str, project: str, quarter: str,
                      suggestions: dict[str, str]) -> int:
    written = 0
    for field, value in suggestions.items():
        existing = get_manual_input(db_url, project, quarter, field)
        if existing and existing[1] != AUTO_CHECK:
            continue  # human answer wins
        upsert_manual_input(db_url, project, quarter, field, value, AUTO_CHECK)
        written += 1
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description="Quarterly governance auto-check")
    parser.add_argument("--project", default=PROJECT_LABEL)
    parser.add_argument("--quarter", required=True, help="e.g. 2026-Q3")
    parser.add_argument("--repo", default=GITHUB_REPO)
    args = parser.parse_args()

    try:
        quarter_months(args.quarter)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    gh = GitHubClient(GITHUB_TOKEN, args.repo)
    suggestions = build_suggestions(gh, REPORTING_DB_URL, args.project, args.quarter)
    written = store_suggestions(REPORTING_DB_URL, args.project, args.quarter, suggestions)
    print(f"[{args.project}] {args.quarter}: suggested {suggestions}; wrote {written} "
          f"(human-entered rows preserved).")


if __name__ == "__main__":
    main()
