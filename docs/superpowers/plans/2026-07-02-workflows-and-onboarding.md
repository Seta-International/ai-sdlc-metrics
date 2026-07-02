# Reusable Workflows, Manual Input & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all metric-pipeline automation into this repo as reusable GitHub workflows plus manual-input and quarterly auto-check entrypoints, shrink project repos to thin caller workflows, and onboard TeacherZone alongside Future.

**Architecture:** Plan 2 of 4 (spec: `docs/superpowers/specs/2026-07-02-maturity-data-capture-design.md` §6.1, §6.2, §7, and the quarterly rows of §4). Three reusable workflows (`workflow_call`) live in this repo — collect, manual-input, quarterly-check — backed by two new CLI entrypoints (`collector/manual_input.py`, `collector/quarterly.py`). A `record-deployment` composite action gives non-Actions CI/CD a one-step way to create the deployment records the collector counts. Project repos keep one caller workflow copied from `templates/ai-metrics-caller.yml`.

**Tech Stack:** Python 3.12, GitHub Actions reusable workflows + composite actions, psycopg2, pytest + responses + testcontainers.

## Global Constraints

- All code, comments, workflow names, and form labels in English.
- Clean refactor: the old Future caller (`ai-sprint-collect.yml` with `--a1/--b5/--c3`) is replaced, not patched.
- Manual-input **field name canon** (consumed by the Plan 4 exporter — do not rename):
  - Monthly (numeric): `total_engineers`, `cost_baseline`, `cost_actual`, `coverage_ai`
  - Quarterly flags (`Yes`/`No`): `g1_agents_md`, `g2_ai_policy`, `g3_required_review`, `g4_eval_suite`, `g5_shared_library`, `g6_security_controls`, `g7_traceability`, `g8_model_governance`, `a2_dashboard`, `a4_near_universal`, `b4_dora_improving`, `b5_cost_multi_wf`, `b6_business_outcomes`, `b7_top_quartile`, `b8_client_reporting`, `c3_scan_ci`, `c4_ai_vs_nonai`, `c5_evals`, `c6_sast_pii_required`, `c7_defect_zero`, `c8_evals_in_ci`, `c9_prompt_leak_pii`, `d3_defined_class`, `d4_cycle_measured`, `d5_multi_agent`
  - Quarterly text: `evidence_a`, `evidence_b`, `evidence_c`, `evidence_d`, `evidence_e`, `improvement_action`
- Period keys: months `YYYY-MM`, quarters `YYYY-Q<1-4>`.
- The quarterly auto-check writes suggestions with `entered_by='auto-check'` and must never overwrite a row entered by a human.
- Run tests with `python -m pytest` from the repo root. Validate YAML with the command given in Task 5.

## Execution inputs (provide before Task 8)

| Input | Future | TeacherZone |
|---|---|---|
| GitHub repo | `seta-international/agent-platform` | **ASK USER** |
| Jira project key | `FUT` | **ASK USER** |
| Jira board id (predictability; optional) | **ASK USER** | **ASK USER** |
| Sprint anchor / length | `2026-06-29` / 14 | **ASK USER** |
| `GH_PROD_ENV` / deploy strategy | `dev,uat` / `deployments` | **ASK USER** |

---

### Task 1: DB read helpers for manual inputs and month values

**Files:**
- Modify: `collector/db.py` (append two functions)
- Modify: `tests/test_db.py` (append tests)

**Interfaces:**
- Consumes: schema + `upsert_counts`/`upsert_manual_input` from Plan 1.
- Produces: `get_manual_input(db_url: str, project: str, period_key: str, field: str) -> tuple[str, str | None] | None` (returns `(value, entered_by)` or `None`); `fetch_month_values(db_url: str, project: str, metric_keys: list[str], period_keys: list[str]) -> dict[tuple[str, str], float]` (keyed by `(period_key, metric_key)`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_db.py`:

```python
from collector.db import get_manual_input, fetch_month_values


def test_get_manual_input_roundtrip(pg_url):
    upsert_manual_input(pg_url, "P-Get", "2026-Q3", "g1_agents_md", "Yes", "auto-check")
    assert get_manual_input(pg_url, "P-Get", "2026-Q3", "g1_agents_md") == ("Yes", "auto-check")
    assert get_manual_input(pg_url, "P-Get", "2026-Q3", "missing") is None


def test_fetch_month_values(pg_url):
    upsert_counts(pg_url, "P-Fetch", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"deploys": 4, "weeks": 4.3})
    upsert_counts(pg_url, "P-Fetch", "month", "2026-07", date(2026, 7, 1), date(2026, 7, 31),
                  {"deploys": 6})
    vals = fetch_month_values(pg_url, "P-Fetch", ["deploys", "weeks"], ["2026-06", "2026-07"])
    assert vals == {("2026-06", "deploys"): 4.0, ("2026-06", "weeks"): 4.3,
                    ("2026-07", "deploys"): 6.0}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_db.py -v -k "get_manual or fetch_month"`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement in `collector/db.py`**

Append:

```python
def get_manual_input(db_url: str, project: str, period_key: str,
                     field: str) -> tuple[str, str | None] | None:
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT value, entered_by FROM reporting.manual_inputs
                WHERE project = %s AND period_key = %s AND field = %s
            """, (project, period_key, field))
            row = cur.fetchone()
    return (row[0], row[1]) if row else None


def fetch_month_values(db_url: str, project: str, metric_keys: list[str],
                       period_keys: list[str]) -> dict[tuple[str, str], float]:
    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT period_key, metric_key, value FROM reporting.metric_counts
                WHERE project = %s AND period_type = 'month'
                  AND metric_key = ANY(%s) AND period_key = ANY(%s)
            """, (project, metric_keys, period_keys))
            return {(pk, mk): float(v) for pk, mk, v in cur.fetchall()}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_db.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/db.py tests/test_db.py
git commit -m "feat: manual-input read + month-value fetch helpers"
```

---

### Task 2: Manual-input CLI

**Files:**
- Create: `collector/manual_input.py`
- Create: `tests/test_manual_input.py`

**Interfaces:**
- Consumes: `upsert_manual_input` (Plan 1).
- Produces: CLI `python -m collector.manual_input --project P --period 2026-06 --entered-by who --set field=value [--set ...]`; importable `validate_and_store(db_url, project, period, pairs: list[str], entered_by) -> int` (fields written) raising `ValueError` on unknown field / bad value / bad period.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_manual_input.py`:

```python
import pytest
from collector.manual_input import validate_and_store
from collector.db import get_manual_input


def test_monthly_numeric_fields(pg_url):
    n = validate_and_store(pg_url, "P-MI", "2026-06",
                           ["total_engineers=18", "cost_baseline=45.5"], "pm@seta")
    assert n == 2
    assert get_manual_input(pg_url, "P-MI", "2026-06", "total_engineers") == ("18", "pm@seta")


def test_quarter_flag_and_text_fields(pg_url):
    n = validate_and_store(pg_url, "P-MI", "2026-Q3",
                           ["g2_ai_policy=Yes", "evidence_a=Broad adoption"], "pm@seta")
    assert n == 2
    assert get_manual_input(pg_url, "P-MI", "2026-Q3", "g2_ai_policy") == ("Yes", "pm@seta")


@pytest.mark.parametrize("period,pair", [
    ("2026-06", "unknown_field=1"),      # unknown field
    ("2026-06", "total_engineers=abc"),  # non-numeric
    ("2026-06", "g2_ai_policy=Yes"),     # quarterly field on a month
    ("2026-Q3", "g2_ai_policy=Maybe"),   # flag not Yes/No
    ("2026-13", "total_engineers=1"),    # bad period
    ("2026-Q5", "g2_ai_policy=Yes"),     # bad quarter
])
def test_rejects_bad_input(pg_url, period, pair):
    with pytest.raises(ValueError):
        validate_and_store(pg_url, "P-MI", period, [pair], "pm@seta")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_manual_input.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `collector/manual_input.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_manual_input.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/manual_input.py tests/test_manual_input.py
git commit -m "feat: manual-input CLI with field validation"
```

---

### Task 3: GitHub governance checks

**Files:**
- Modify: `collector/github_client.py` (append methods)
- Modify: `tests/test_github_client.py` (append tests)

**Interfaces:**
- Consumes: existing `GitHubClient`.
- Produces: `file_exists(path: str) -> bool`; `default_branch() -> str`; `branch_requires_review(branch: str) -> bool`; `security_scanning_status() -> tuple[bool, bool]` (`(code_scanning_on, secret_scanning_on)`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_github_client.py`:

```python
@responses.activate
def test_file_exists_true_and_false():
    responses.get("https://api.github.com/repos/org/repo/contents/AGENTS.md", json={"name": "AGENTS.md"})
    responses.get("https://api.github.com/repos/org/repo/contents/NOPE.md", status=404)
    c = _client()
    assert c.file_exists("AGENTS.md") is True
    assert c.file_exists("NOPE.md") is False


@responses.activate
def test_default_branch():
    responses.get("https://api.github.com/repos/org/repo", json={"default_branch": "main"})
    assert _client().default_branch() == "main"


@responses.activate
def test_branch_requires_review():
    responses.get(
        "https://api.github.com/repos/org/repo/branches/main/protection",
        json={"required_pull_request_reviews": {"required_approving_review_count": 1}},
    )
    assert _client().branch_requires_review("main") is True


@responses.activate
def test_branch_requires_review_unprotected():
    responses.get("https://api.github.com/repos/org/repo/branches/main/protection", status=404)
    assert _client().branch_requires_review("main") is False


@responses.activate
def test_security_scanning_status():
    responses.get("https://api.github.com/repos/org/repo/code-scanning/alerts", json=[])
    responses.get(
        "https://api.github.com/repos/org/repo",
        json={"security_and_analysis": {"secret_scanning": {"status": "enabled"}}},
    )
    assert _client().security_scanning_status() == (True, True)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_github_client.py -v -k "file_exists or default_branch or requires_review or scanning_status"`
Expected: FAIL with AttributeError

- [ ] **Step 3: Implement in `collector/github_client.py`**

Append to the class:

```python
    def file_exists(self, path: str) -> bool:
        r = self._s.get(f"{self._BASE}/repos/{self._repo}/contents/{path}")
        return r.status_code == 200

    def default_branch(self) -> str:
        r = self._s.get(f"{self._BASE}/repos/{self._repo}")
        r.raise_for_status()
        return r.json()["default_branch"]

    def branch_requires_review(self, branch: str) -> bool:
        r = self._s.get(f"{self._BASE}/repos/{self._repo}/branches/{branch}/protection")
        if r.status_code != 200:
            return False
        return bool(r.json().get("required_pull_request_reviews"))

    def security_scanning_status(self) -> tuple[bool, bool]:
        """(code_scanning_enabled, secret_scanning_enabled)."""
        code = self._s.get(
            f"{self._BASE}/repos/{self._repo}/code-scanning/alerts",
            params={"per_page": 1},
        ).status_code == 200
        r = self._s.get(f"{self._BASE}/repos/{self._repo}")
        r.raise_for_status()
        secret = (
            (r.json().get("security_and_analysis") or {})
            .get("secret_scanning", {}).get("status") == "enabled"
        )
        return code, secret
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_github_client.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/github_client.py tests/test_github_client.py
git commit -m "feat: governance auto-checks in GitHub client"
```

---

### Task 4: Quarterly auto-check CLI

**Files:**
- Create: `collector/quarterly.py`
- Create: `tests/test_quarterly.py`

**Interfaces:**
- Consumes: Task 1 helpers, Task 3 checks, `upsert_manual_input`, `fetch_month_values`.
- Produces: `quarter_months(quarter: str) -> list[str]`; `prev_quarter(quarter: str) -> str`; `dora_improving(db_url, project, quarter) -> str | None` (`'Yes'`/`'No'`/`None` when insufficient data); `build_suggestions(gh, db_url, project, quarter) -> dict[str, str]`; `store_suggestions(db_url, project, quarter, suggestions) -> int` (skips human-entered rows); CLI `python -m collector.quarterly --project P --quarter 2026-Q3 [--repo owner/repo]`.

Suggested fields and their sources:

| Field | Source |
|---|---|
| `g1_agents_md` | `file_exists("AGENTS.md")` |
| `g3_required_review` | `branch_requires_review(default_branch())` |
| `g6_security_controls` | both values of `security_scanning_status()` true |
| `c3_scan_ci` | code scanning enabled |
| `a2_dashboard` | constant `Yes` (Grafana exists) |
| `d4_cycle_measured` | any `agent_cycle_h` month row in the quarter |
| `b4_dora_improving` | `dora_improving(...)`: quarter vs previous quarter on 4 DORA values from month rows — lead time down, MTTR down, deploys/week up, incidents-per-deploy down; `Yes` if ≥3 of 4 improved; `None` (skip) when either quarter lacks data |

- [ ] **Step 1: Write the failing tests**

Create `tests/test_quarterly.py`:

```python
from datetime import date
import responses
from collector.db import upsert_counts, upsert_manual_input, get_manual_input
from collector.quarterly import (
    quarter_months, prev_quarter, dora_improving, store_suggestions,
)


def test_quarter_months():
    assert quarter_months("2026-Q3") == ["2026-07", "2026-08", "2026-09"]
    assert quarter_months("2026-Q1") == ["2026-01", "2026-02", "2026-03"]


def test_prev_quarter():
    assert prev_quarter("2026-Q3") == "2026-Q2"
    assert prev_quarter("2026-Q1") == "2025-Q4"


def _seed_month(pg_url, project, month, lead, mttr, deploys, weeks, incidents):
    upsert_counts(pg_url, project, "month", month, date(2026, 1, 1), date(2026, 1, 31), {
        "lead_time_h": lead, "mttr_h": mttr, "deploys": deploys,
        "weeks": weeks, "incidents": incidents,
    })


def test_dora_improving_yes(pg_url):
    _seed_month(pg_url, "P-Dora", "2026-04", 40, 6, 4, 4.3, 2)
    _seed_month(pg_url, "P-Dora", "2026-07", 30, 4, 8, 4.3, 1)
    assert dora_improving(pg_url, "P-Dora", "2026-Q3") == "Yes"


def test_dora_improving_insufficient_data(pg_url):
    assert dora_improving(pg_url, "P-NoData", "2026-Q3") is None


def test_store_suggestions_never_overwrites_human(pg_url):
    upsert_manual_input(pg_url, "P-Sug", "2026-Q3", "g1_agents_md", "No", "pm@seta")
    n = store_suggestions(pg_url, "P-Sug", "2026-Q3",
                          {"g1_agents_md": "Yes", "a2_dashboard": "Yes"})
    assert n == 1  # only a2_dashboard written
    assert get_manual_input(pg_url, "P-Sug", "2026-Q3", "g1_agents_md") == ("No", "pm@seta")
    assert get_manual_input(pg_url, "P-Sug", "2026-Q3", "a2_dashboard") == ("Yes", "auto-check")


def test_store_suggestions_updates_own_previous_run(pg_url):
    store_suggestions(pg_url, "P-Rerun", "2026-Q3", {"c3_scan_ci": "No"})
    n = store_suggestions(pg_url, "P-Rerun", "2026-Q3", {"c3_scan_ci": "Yes"})
    assert n == 1
    assert get_manual_input(pg_url, "P-Rerun", "2026-Q3", "c3_scan_ci") == ("Yes", "auto-check")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_quarterly.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `collector/quarterly.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_quarterly.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add collector/quarterly.py tests/test_quarterly.py
git commit -m "feat: quarterly governance auto-check with human-override protection"
```

---

### Task 5: Reusable workflows

**Files:**
- Create: `.github/workflows/collect.yml`
- Create: `.github/workflows/manual-input.yml`
- Create: `.github/workflows/quarterly-check.yml`

All three are `workflow_call`-only — schedules and dispatch forms live in the caller (project repo). `GITHUB_TOKEN` is implicitly available to called workflows, so PR/deployment reads use the caller's token.

- [ ] **Step 1: Create `.github/workflows/collect.yml`**

```yaml
name: Collect metrics (reusable)

on:
  workflow_call:
    inputs:
      project:            {required: true,  type: string}
      gh-repo:            {required: true,  type: string}
      jira-project:       {required: true,  type: string}
      sprint-anchor:      {required: true,  type: string, description: 'First sprint start, ISO date'}
      sprint-length-days: {required: false, type: string, default: '14'}
      prod-env:           {required: false, type: string, default: 'production'}
      deploy-strategy:    {required: false, type: string, default: 'deployments'}
      jira-board-id:      {required: false, type: string, default: ''}
      sprint:             {required: false, type: string, default: '', description: 'Explicit sprint label, e.g. S3'}
      mode:               {required: false, type: string, default: 'sprint', description: 'sprint | previous-month'}
    secrets:
      jira-email:          {required: true}
      jira-token:          {required: true}
      jira-ai-usage-field: {required: true}
      reporting-db-url:    {required: true}

jobs:
  collect:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      deployments: read
      security-events: read
    steps:
      - name: Checkout ai-sdlc-metrics
        uses: actions/checkout@v7
        with:
          repository: Seta-International/ai-sdlc-metrics

      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: requirements.txt

      - run: pip install -r requirements.txt

      - name: Collect and upsert raw counts
        env:
          METRICS_GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          JIRA_EMAIL: ${{ secrets.jira-email }}
          JIRA_TOKEN: ${{ secrets.jira-token }}
          JIRA_AI_USAGE_FIELD: ${{ secrets.jira-ai-usage-field }}
          REPORTING_DB_URL: ${{ secrets.reporting-db-url }}
          GH_REPO: ${{ inputs.gh-repo }}
          JIRA_PROJECT: ${{ inputs.jira-project }}
          PROJECT_LABEL: ${{ inputs.project }}
          SPRINT_ANCHOR: ${{ inputs.sprint-anchor }}
          SPRINT_LENGTH_DAYS: ${{ inputs.sprint-length-days }}
          GH_PROD_ENV: ${{ inputs.prod-env }}
          DEPLOY_COUNT_STRATEGY: ${{ inputs.deploy-strategy }}
          JIRA_BOARD_ID: ${{ inputs.jira-board-id }}
        run: |
          set -euo pipefail
          ARGS=""
          if [ "${{ inputs.mode }}" = "previous-month" ]; then
            MONTH=$(date -u -d "$(date -u +%Y-%m-01) - 1 day" +%Y-%m)
            ARGS="--month $MONTH"
          elif [ -n "${{ inputs.sprint }}" ]; then
            ARGS="--sprint ${{ inputs.sprint }}"
          fi
          python -m collector.collect --project "${{ inputs.project }}" \
            --repo "${{ inputs.gh-repo }}" --jira-project "${{ inputs.jira-project }}" $ARGS
```

- [ ] **Step 2: Create `.github/workflows/manual-input.yml`**

```yaml
name: Manual metric input (reusable)

on:
  workflow_call:
    inputs:
      project: {required: true, type: string}
      period:  {required: true, type: string, description: 'YYYY-MM or YYYY-Q<n>'}
      fields:  {required: true, type: string, description: 'Space-separated field=value pairs'}
      entered-by: {required: true, type: string}
    secrets:
      reporting-db-url: {required: true}

jobs:
  store:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout ai-sdlc-metrics
        uses: actions/checkout@v7
        with:
          repository: Seta-International/ai-sdlc-metrics

      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: requirements.txt

      - run: pip install -r requirements.txt

      - name: Validate and store
        env:
          REPORTING_DB_URL: ${{ secrets.reporting-db-url }}
          FIELDS: ${{ inputs.fields }}
          # Entrypoint imports shared config; GitHub/Jira creds are not needed here.
          METRICS_GH_TOKEN: unused
          JIRA_EMAIL: unused
          JIRA_TOKEN: unused
          JIRA_AI_USAGE_FIELD: unused
        run: |
          set -euo pipefail
          # Pairs are ';'-separated so values (e.g. evidence text) may contain spaces.
          SETS=()
          IFS=';' read -ra PAIRS <<< "$FIELDS"
          for pair in "${PAIRS[@]}"; do
            [ -n "${pair// /}" ] && SETS+=(--set "$pair")
          done
          python -m collector.manual_input --project "${{ inputs.project }}" \
            --period "${{ inputs.period }}" --entered-by "${{ inputs.entered-by }}" "${SETS[@]}"
```

- [ ] **Step 3: Create `.github/workflows/quarterly-check.yml`**

```yaml
name: Quarterly governance auto-check (reusable)

on:
  workflow_call:
    inputs:
      project: {required: true, type: string}
      gh-repo: {required: true, type: string}
      quarter: {required: false, type: string, default: '', description: 'e.g. 2026-Q3; blank = current quarter'}
    secrets:
      reporting-db-url: {required: true}

jobs:
  check:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: read
    steps:
      - name: Checkout ai-sdlc-metrics
        uses: actions/checkout@v7
        with:
          repository: Seta-International/ai-sdlc-metrics

      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
          cache: pip
          cache-dependency-path: requirements.txt

      - run: pip install -r requirements.txt

      - name: Run auto-check
        env:
          METRICS_GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPORTING_DB_URL: ${{ secrets.reporting-db-url }}
          JIRA_EMAIL: unused
          JIRA_TOKEN: unused
          JIRA_AI_USAGE_FIELD: unused
        run: |
          set -euo pipefail
          QUARTER="${{ inputs.quarter }}"
          if [ -z "$QUARTER" ]; then
            QUARTER=$(date -u +%Y)-Q$(( ($(date -u +%-m) + 2) / 3 ))
          fi
          python -m collector.quarterly --project "${{ inputs.project }}" \
            --repo "${{ inputs.gh-repo }}" --quarter "$QUARTER"
```

- [ ] **Step 4: Validate YAML**

Run:
```bash
python3 -c "
import yaml, glob
for f in glob.glob('.github/workflows/*.yml'):
    yaml.safe_load(open(f)); print('OK', f)
"
```
Expected: `OK` for all three files. If `actionlint` is installed, also run `actionlint`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows
git commit -m "feat: reusable collect, manual-input, and quarterly-check workflows"
```

---

### Task 6: `record-deployment` action + caller template

**Files:**
- Create: `actions/record-deployment/action.yml`
- Create: `templates/ai-metrics-caller.yml`
- Create: `templates/README.md`

- [ ] **Step 1: Create `actions/record-deployment/action.yml`**

For projects whose CI/CD does not use GitHub Environments — one step creates the deployment record the collector counts:

```yaml
name: Record deployment
description: >
  Create a GitHub Deployment + success status so the AI SDLC metrics collector
  can count production deploys regardless of how the deploy itself ran.
inputs:
  environment:
    description: Environment name (must match the project's GH_PROD_ENV config)
    required: true
  ref:
    description: Git ref that was deployed
    required: false
    default: ${{ github.sha }}
  token:
    description: Token with deployments:write
    required: false
    default: ${{ github.token }}
runs:
  using: composite
  steps:
    - name: Create deployment record
      shell: bash
      env:
        GH_TOKEN: ${{ inputs.token }}
        ENVIRONMENT: ${{ inputs.environment }}
        REF: ${{ inputs.ref }}
      run: |
        set -euo pipefail
        DEPLOYMENT_ID=$(curl -sf -X POST \
          -H "Authorization: Bearer $GH_TOKEN" \
          -H "Accept: application/vnd.github+json" \
          "https://api.github.com/repos/${{ github.repository }}/deployments" \
          -d "{\"ref\":\"$REF\",\"environment\":\"$ENVIRONMENT\",\"auto_merge\":false,\"required_contexts\":[]}" \
          | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
        curl -sf -X POST \
          -H "Authorization: Bearer $GH_TOKEN" \
          -H "Accept: application/vnd.github+json" \
          "https://api.github.com/repos/${{ github.repository }}/deployments/$DEPLOYMENT_ID/statuses" \
          -d "{\"state\":\"success\",\"environment\":\"$ENVIRONMENT\"}" > /dev/null
        echo "Recorded deployment $DEPLOYMENT_ID to $ENVIRONMENT"
```

- [ ] **Step 2: Create `templates/ai-metrics-caller.yml`**

The complete thin caller a project repo copies to `.github/workflows/ai-metrics.yml`. `<...>` markers are the only edits needed:

```yaml
name: AI SDLC Metrics — <PROJECT_NAME>

# Thin caller: all logic lives in Seta-International/ai-sdlc-metrics.
# Onboarding: fill the <PLACEHOLDERS>, add the three repo secrets
# (JIRA_EMAIL, JIRA_TOKEN + JIRA_AI_USAGE_FIELD, REPORTING_DB_URL), done.

on:
  schedule:
    - cron: '0 * * * *'    # hourly: current sprint
    - cron: '30 0 1 * *'   # monthly: previous calendar month
    - cron: '45 1 1 1,4,7,10 *'  # quarterly: governance auto-check
  pull_request:
    types: [closed]
  deployment_status:
  workflow_dispatch:
    inputs:
      sprint:
        description: 'Re-collect a specific sprint (e.g. S3); blank = current'
        required: false
      manual_period:
        description: 'Manual input period (YYYY-MM or YYYY-Q<n>)'
        required: false
      manual_fields:
        description: 'Manual input pairs separated by ";", e.g. total_engineers=18; cost_actual=30'
        required: false

jobs:
  collect-sprint:
    if: >
      github.event_name != 'workflow_dispatch' && github.event.schedule != '30 0 1 * *' &&
      github.event.schedule != '45 1 1 1,4,7,10 *' &&
      (github.event_name != 'pull_request' || github.event.pull_request.merged == true)
      || (github.event_name == 'workflow_dispatch' && inputs.manual_period == '')
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/collect.yml@main
    with:
      project: <PROJECT_NAME>
      gh-repo: ${{ github.repository }}
      jira-project: <JIRA_KEY>
      sprint-anchor: '<YYYY-MM-DD>'
      sprint-length-days: '14'
      prod-env: '<ENV_NAMES>'          # e.g. 'dev,uat' or 'production'
      deploy-strategy: 'deployments'   # or releases | tags:<pat> | workflow_runs:<file>
      jira-board-id: '<BOARD_ID_OR_EMPTY>'
      sprint: ${{ inputs.sprint || '' }}
      mode: sprint
    secrets:
      jira-email: ${{ secrets.JIRA_EMAIL }}
      jira-token: ${{ secrets.JIRA_TOKEN }}
      jira-ai-usage-field: ${{ secrets.JIRA_AI_USAGE_FIELD }}
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}

  collect-month:
    if: github.event_name == 'schedule' && github.event.schedule == '30 0 1 * *'
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/collect.yml@main
    with:
      project: <PROJECT_NAME>
      gh-repo: ${{ github.repository }}
      jira-project: <JIRA_KEY>
      sprint-anchor: '<YYYY-MM-DD>'
      prod-env: '<ENV_NAMES>'
      deploy-strategy: 'deployments'
      jira-board-id: '<BOARD_ID_OR_EMPTY>'
      mode: previous-month
    secrets:
      jira-email: ${{ secrets.JIRA_EMAIL }}
      jira-token: ${{ secrets.JIRA_TOKEN }}
      jira-ai-usage-field: ${{ secrets.JIRA_AI_USAGE_FIELD }}
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}

  quarterly-check:
    if: github.event_name == 'schedule' && github.event.schedule == '45 1 1 1,4,7,10 *'
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/quarterly-check.yml@main
    with:
      project: <PROJECT_NAME>
      gh-repo: ${{ github.repository }}
    secrets:
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}

  manual-input:
    if: github.event_name == 'workflow_dispatch' && inputs.manual_period != ''
    uses: Seta-International/ai-sdlc-metrics/.github/workflows/manual-input.yml@main
    with:
      project: <PROJECT_NAME>
      period: ${{ inputs.manual_period }}
      fields: ${{ inputs.manual_fields }}
      entered-by: ${{ github.actor }}
    secrets:
      reporting-db-url: ${{ secrets.REPORTING_DB_URL }}
```

- [ ] **Step 3: Create `templates/README.md`**

```markdown
# Onboarding a project to AI SDLC metrics

1. Copy `ai-metrics-caller.yml` to `<your-repo>/.github/workflows/ai-metrics.yml`
   and fill the `<PLACEHOLDERS>` (project name, Jira key, sprint anchor,
   deploy environments/strategy, optional Jira board id).
2. Add repo secrets: `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD`,
   `REPORTING_DB_URL`.
3. Adopt the labeling conventions: `ai-assisted` / `ai-agent` PR labels and the
   Jira AI-usage field (`None | Assisted | Agent`).
4. Make deploys countable (pick one):
   - GitHub Actions with `environment:` on the deploy job — nothing to do;
   - other CI/CD: call the `record-deployment` action
     (`uses: Seta-International/ai-sdlc-metrics/actions/record-deployment@main`)
     or POST to the Deployments API (see below);
   - can't touch the pipeline: set `deploy-strategy` to `releases`,
     `tags:<pattern>`, or `workflow_runs:<file>.yml`.
5. In `Seta-International/ai-sdlc-metrics` → Settings → Actions, ensure
   "Accessible from repositories in the organization" is enabled so
   `workflow_call` works across repos.

Raw API call for non-Actions CI/CD:

    curl -sf -X POST -H "Authorization: Bearer $TOKEN" \
      https://api.github.com/repos/<owner>/<repo>/deployments \
      -d '{"ref":"<sha>","environment":"production","auto_merge":false,"required_contexts":[]}'

Monthly manual input (first business day): run the "AI SDLC Metrics" workflow
with `manual_period` = last month (e.g. `2026-06`) and `manual_fields` =
`total_engineers=18; cost_baseline=45; cost_actual=30; coverage_ai=0.55`.

Quarterly review (first week of quarter): the auto-check has pre-filled what it
can; enter judgment flags and evidence the same way with `manual_period` =
`2026-Q3` and fields like `g2_ai_policy=Yes; evidence_a=Broad adoption, live dashboard`.
```

- [ ] **Step 4: Validate YAML**

```bash
python3 -c "
import yaml
for f in ['actions/record-deployment/action.yml', 'templates/ai-metrics-caller.yml']:
    yaml.safe_load(open(f)); print('OK', f)
"
```
Expected: `OK` for both.

- [ ] **Step 5: Commit**

```bash
git add actions templates
git commit -m "feat: record-deployment action and thin caller template"
```

---

### Task 7: Replace the Future caller (in `agent-platform`)

**Files (different repo — `/Users/canh/Projects/Seta/agent-platform`):**
- Delete: `.github/workflows/ai-sprint-collect.yml`
- Create: `.github/workflows/ai-metrics.yml`

- [ ] **Step 1: Create the caller from the template**

Copy `templates/ai-metrics-caller.yml` to `/Users/canh/Projects/Seta/agent-platform/.github/workflows/ai-metrics.yml` with the placeholders filled:

- `<PROJECT_NAME>` → `Future`
- `<JIRA_KEY>` → `FUT`
- `<YYYY-MM-DD>` → `2026-06-29`
- `<ENV_NAMES>` → `dev,uat` (no production environment yet — spec §6.1 known issue)
- `<BOARD_ID_OR_EMPTY>` → the FUT board id if provided, else empty

- [ ] **Step 2: Delete the old caller**

```bash
cd /Users/canh/Projects/Seta/agent-platform
git rm .github/workflows/ai-sprint-collect.yml
```

- [ ] **Step 3: Verify secrets exist**

The repo already has `JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD`, `REPORTING_DB_URL` (used by the old caller). Confirm in repo Settings → Secrets, or:

```bash
gh secret list --repo seta-international/agent-platform
```

- [ ] **Step 4: Enable cross-repo workflow access**

In `Seta-International/ai-sdlc-metrics` → Settings → Actions → General → Access: allow workflows from other repositories in the organization. (One-time org/repo setting; required for `workflow_call` across repos.)

- [ ] **Step 5: Commit (in agent-platform), push, and verify a run**

```bash
git add .github/workflows/ai-metrics.yml
git commit -m "chore: FUT-373 thin AI-metrics caller using reusable workflows"
git push
gh workflow run "AI SDLC Metrics — Future" --repo seta-international/agent-platform
gh run watch --repo seta-international/agent-platform
```

Expected: the dispatched run completes green and `metric_counts` gains fresh rows for the current sprint.

---

### Task 8: Onboard TeacherZone

**Blocked on the execution inputs table above (repo, Jira key, anchor, environments).**

- [ ] **Step 1: Create the caller in the TeacherZone repo** — copy `templates/ai-metrics-caller.yml`, fill placeholders with the provided values.
- [ ] **Step 2: Add the four secrets** to the TeacherZone repo (`JIRA_EMAIL`, `JIRA_TOKEN`, `JIRA_AI_USAGE_FIELD` for its Jira project's field id, `REPORTING_DB_URL`).
- [ ] **Step 3: Apply conventions** — create `ai-assisted`/`ai-agent` labels; confirm the Jira AI-usage field exists on the TeacherZone project (same `None|Assisted|Agent` options; see `docs/jira-setup.md`).
- [ ] **Step 4: Make deploys countable** — pick the mechanism per `templates/README.md` step 4 based on TeacherZone's CI/CD.
- [ ] **Step 5: Dispatch a run and verify** — `gh workflow run` as in Task 7, then check `metric_counts` for `project='TeacherZone'` rows.
- [ ] **Step 6: Commit** in the TeacherZone repo.

---

## Not in this plan (later plans)

- Plan 3: Grafana rebuild — English per-project + BOD dashboards on `metric_counts`, folders, PM viewer accounts.
- Plan 4: English workbook template + FastAPI exporter + Grafana download links.
