#!/usr/bin/env python3
"""
Store manual metric inputs (monthly numbers, quarterly flags and evidence).

Usage:
  python -m collector.manual_input --project Future --period 2026-06 \
      --entered-by pm@seta --set total_engineers=18 --set cost_actual=30
"""
import argparse
import re
import sys
from collector.config import REPORTING_DB_URL, PROJECT_LABEL
from collector.db import upsert_manual_input

MONTHLY_NUMERIC_FIELDS = {"total_engineers", "cost_baseline", "cost_actual", "coverage_ai"}
QUARTER_FLAG_FIELDS = {
    "g1_agents_md", "g2_ai_policy", "g3_required_review", "g4_eval_suite",
    "g5_shared_library", "g6_security_controls", "g7_traceability",
    "g8_model_governance", "a2_dashboard", "a4_near_universal",
    "b4_dora_improving", "b5_cost_multi_wf", "b6_business_outcomes",
    "b7_top_quartile", "b8_client_reporting", "c3_scan_ci", "c4_ai_vs_nonai",
    "c5_evals", "c6_sast_pii_required", "c7_defect_zero", "c8_evals_in_ci",
    "c9_prompt_leak_pii", "d3_defined_class", "d4_cycle_measured", "d5_multi_agent",
}
QUARTER_TEXT_FIELDS = {
    "evidence_a", "evidence_b", "evidence_c", "evidence_d", "evidence_e",
    "improvement_action",
}


def _period_type(period: str) -> str:
    if re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", period):
        return "month"
    if re.fullmatch(r"\d{4}-Q[1-4]", period):
        return "quarter"
    raise ValueError(f"period must be YYYY-MM or YYYY-Q<1-4>, got {period!r}")


def validate_and_store(db_url: str, project: str, period: str,
                       pairs: list[str], entered_by: str) -> int:
    ptype = _period_type(period)
    parsed: list[tuple[str, str]] = []
    for pair in pairs:
        field, _, value = pair.partition("=")
        field, value = field.strip(), value.strip()
        if not value:
            raise ValueError(f"expected field=value, got {pair!r}")
        if ptype == "month":
            if field not in MONTHLY_NUMERIC_FIELDS:
                raise ValueError(f"unknown monthly field {field!r}")
            try:
                float(value)
            except ValueError:
                raise ValueError(f"{field} must be numeric, got {value!r}")
        else:
            if field in QUARTER_FLAG_FIELDS:
                if value not in ("Yes", "No"):
                    raise ValueError(f"{field} must be Yes or No, got {value!r}")
            elif field not in QUARTER_TEXT_FIELDS:
                raise ValueError(f"unknown quarterly field {field!r}")
        parsed.append((field, value))
    for field, value in parsed:
        upsert_manual_input(db_url, project, period, field, value, entered_by)
    return len(parsed)


def main() -> None:
    parser = argparse.ArgumentParser(description="Store manual metric inputs")
    parser.add_argument("--project", default=PROJECT_LABEL)
    parser.add_argument("--period", required=True, help="YYYY-MM or YYYY-Q<n>")
    parser.add_argument("--entered-by", required=True)
    parser.add_argument("--set", dest="pairs", action="append", default=[],
                        metavar="FIELD=VALUE", help="repeatable")
    args = parser.parse_args()
    if not args.pairs:
        print("Nothing to store (no --set given).")
        return
    try:
        n = validate_and_store(REPORTING_DB_URL, args.project, args.period,
                               args.pairs, args.entered_by)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    print(f"Stored {n} field(s) for {args.project} {args.period}.")


if __name__ == "__main__":
    main()
