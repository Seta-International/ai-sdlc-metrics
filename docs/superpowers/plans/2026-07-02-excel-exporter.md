# Excel Exporter & English Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An English maturity-workbook template built from the Vietnamese original, and a FastAPI exporter that fills it from Postgres (sheets 2/3/4 + an appended "Sprint data" sheet, charts re-created) and serves it from Grafana "Download Excel" links, filtered by project and sprint range.

**Architecture:** Plan 4 of 4 (spec §8, goal 5). `exporter/build_template.py` produces `docs/SETA_AI_SDLC_Maturity_EN.xlsx` once (translation map + sample-data clearing + chart re-creation); the FastAPI app (`exporter/app.py`) loads that template, fills it via pure functions in `exporter/workbook.py` with data from `exporter/data.py` (reads `metrics_wide`/`metrics_ratios` views + `manual_inputs`), and re-adds charts (`exporter/charts.py` — openpyxl drops chart objects on save, so both the builder and every export re-create them). Deployed as a container next to Grafana in both compose stacks; dashboard links pass the project/sprint context.

**Tech Stack:** Python 3.12, openpyxl, FastAPI + uvicorn, psycopg2, pytest + httpx TestClient.

## Global Constraints

- All template text, sheet content, API messages in English. The Vietnamese workbook stays as reference; **track both** in git.
- Chart facts (from the original): sheet `8. Dashboard-Project` has a **RadarChart** (cats `A7:A11`, values `B7:B11`, title "Maturity — 5 dimensions", anchor `D6`) and a **LineChart** (4 series, headers `B20:E20`, cats `A21:A32`, data `B21:E32`, title "Trend (usage / AI-PR % / CFR / rework)", anchor `D20`); sheet `9. Dashboard-Portfolio` has a **BarChart** (cats `A6:A17`, values `G6:G17`, title "Overall level by project", anchor `I5`).
- Sheet layouts (from the original — the exporter writes exactly these):
  - `2. Projects`: header row 2 (`A` ProjectID, `B` Project name, `C` Main tool, `D` Tech lead, `E` Client/Area), data from row 3.
  - `3. Monthly`: header row 3, data rows 4–60; column `C` holds a quarter formula (leave untouched); value columns `A,B,D–X`.
  - `4. Quarterly`: header row 3, data rows 4–53; column `AH` holds a key formula (leave untouched); value columns `A,B,C–AG`.
- Sheet 3 column→data map: `D`=ai_users_weekly_avg, `E`=manual total_engineers, `F`=ai_prs, `G`=total_prs, `H`=agent_tasks, `I`=total_tasks, `J`=lead_time_h, `K`=deploys, `L`=weeks, `M`=incidents, `N`=mttr_h, `O`=manual cost_baseline, `P`=manual cost_actual, `Q`=rework_prs, `R`=ai_prs_reviewed, `S`=manual coverage_ai, `T`=security_alerts, `U`=agent_prs_merged, `V`=agent_prs_human_fixed, `W`=agent_prs_autonomous, `X`=agent_cycle_h.
- Sheet 4 column order `C`→`AA` (manual-input fields, Plan 2 canon): `g1_agents_md, g2_ai_policy, g3_required_review, g4_eval_suite, g5_shared_library, g6_security_controls, g7_traceability, g8_model_governance, a2_dashboard, a4_near_universal, b4_dora_improving, b5_cost_multi_wf, b6_business_outcomes, b7_top_quartile, b8_client_reporting, c3_scan_ci, c4_ai_vs_nonai, c5_evals, c6_sast_pii_required, c7_defect_zero, c8_evals_in_ci, c9_prompt_leak_pii, d3_defined_class, d4_cycle_measured, d5_multi_agent`; then `AB`–`AF` = `evidence_a`–`evidence_e`, `AG` = `improvement_action`.
- Run tests with `python -m pytest`.

---

### Task 1: Track the source workbook + build the English template

**Files:**
- Track: `docs/SETA_AI_SDLC_Maturity.xlsx` (currently untracked)
- Create: `exporter/__init__.py` (empty), `exporter/charts.py`, `exporter/build_template.py`
- Create: `tests/test_build_template.py`
- Produce + track: `docs/SETA_AI_SDLC_Maturity_EN.xlsx`

**Interfaces:**
- Produces: `charts.add_charts(wb) -> None` (re-creates the 3 charts; used again by Task 3) and the committed EN template every later task loads.

- [ ] **Step 1: Create `exporter/charts.py`**

```python
"""Re-create the workbook's charts. openpyxl drops existing chart objects on
save, so the template builder AND every export fill must call add_charts()."""
from openpyxl.chart import BarChart, LineChart, RadarChart, Reference


def add_charts(wb) -> None:
    proj = wb["8. Dashboard-Project"]
    radar = RadarChart()
    radar.title = "Maturity — 5 dimensions"
    radar.add_data(Reference(proj, min_col=2, min_row=7, max_row=11), titles_from_data=False)
    radar.set_categories(Reference(proj, min_col=1, min_row=7, max_row=11))
    proj.add_chart(radar, "D6")

    line = LineChart()
    line.title = "Trend (usage / AI-PR % / CFR / rework)"
    line.add_data(Reference(proj, min_col=2, max_col=5, min_row=20, max_row=32),
                  titles_from_data=True)
    line.set_categories(Reference(proj, min_col=1, min_row=21, max_row=32))
    proj.add_chart(line, "D20")

    port = wb["9. Dashboard-Portfolio"]
    bar = BarChart()
    bar.title = "Overall level by project"
    bar.add_data(Reference(port, min_col=7, min_row=6, max_row=17), titles_from_data=False)
    bar.set_categories(Reference(port, min_col=1, min_row=6, max_row=17))
    port.add_chart(bar, "I5")
```

- [ ] **Step 2: Create `exporter/build_template.py`**

```python
#!/usr/bin/env python3
"""
Build the English maturity template from the Vietnamese workbook.

  python -m exporter.build_template            # writes docs/SETA_AI_SDLC_Maturity_EN.xlsx
  python -m exporter.build_template --report   # list untranslated Vietnamese cells

Procedure: extend TRANSLATIONS until --report prints nothing, then commit the
EN file. Formulas and numbers are never touched; strings absent from the map
are left as-is (English/neutral strings need no entry).
"""
import argparse
import re
from pathlib import Path
import openpyxl
from exporter.charts import add_charts

SRC = Path("docs/SETA_AI_SDLC_Maturity.xlsx")
DST = Path("docs/SETA_AI_SDLC_Maturity_EN.xlsx")

_VN = re.compile("[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡ"
                 "ùúụủũưừứựửữỳýỵỷỹđ]", re.IGNORECASE)

SHEET_RENAMES = {"1. Cách đo & HD": "1. Guide"}

# Seed map — known headers. Extend until --report is empty (translate every
# remaining cell of sheets 1, 6, 7, 8, 9, 10 the same way).
TRANSLATIONS = {
    # 2. Projects
    "DANH MỤC DỰ ÁN": "PROJECT DIRECTORY",
    "Tên dự án": "Project name", "Tool chính": "Main tool", "Client / Mảng": "Client / Area",
    # 3. Monthly
    "NHẬP SỐ THEO THÁNG — chỉ gõ số thô (ô vàng). Metric % xem ở «5. Metrics».":
        "MONTHLY RAW INPUT — enter raw numbers only (yellow cells). Percentages are in «5. Metrics».",
    "Tháng (đầu tháng)": "Month (first day)", "Quý": "Quarter",
    "KS dùng AI/tuần": "Engineers using AI/week", "Tổng KS": "Total engineers",
    "PR gắn AI": "AI-labeled PRs", "Tổng PR": "Total PRs",
    "Task giao agent": "Tasks assigned to agents", "Tổng task": "Total tasks",
    "Số deploy": "Deploy count", "Số tuần": "Weeks", "Deploy lỗi": "Failed deploys",
    "Cost baseline/đv": "Cost baseline/unit", "Cost actual/đv": "Cost actual/unit",
    "PR rework ≤14d": "PR rework ≤14d", "PR-AI có review": "AI PRs reviewed",
    "Vulns/secrets chặn": "Vulns/secrets blocked",
    "Agent xong đạt": "Agent tasks done OK", "Agent cần sửa": "Agent tasks needing fixes",
    "Agent end-to-end": "Agent end-to-end", "Agent cycle (h)": "Agent cycle (h)",
    # 4. Quarterly
    "CHẤM ĐIỂM THEO QUÝ — chỉ tick flag PHÁN ĐOÁN (ô cam). Flag 'đã-có-số' tự suy.":
        "QUARTERLY SCORING — tick JUDGMENT flags only (orange cells). 'Measured' flags are derived.",
    "E. GOVERNANCE — checklist 8 mục": "E. GOVERNANCE — 8-item checklist",
    "G3 Review bắt buộc": "G3 Required review",
    "b4 DORA cải thiện": "b4 DORA improving", "b5 cost đạt nhiều WF": "b5 cost target, many workflows",
    "b8 báo cáo client": "b8 client reporting", "c3 scan cơ bản CI": "c3 basic CI scanning",
    "c4 so AI vs non-AI": "c4 AI vs non-AI compared", "c5 evals có": "c5 evals exist",
    "c6 SAST/PII bắt buộc": "c6 SAST/PII required", "c7 defect ~0": "c7 defects ~0",
    "d3 defined class": "d3 defined task class", "d4 cycle time đo": "d4 cycle time measured",
    # 10. Thresholds
    "NGƯỠNG QUY ĐỔI LEVEL (chỉnh được)": "LEVEL THRESHOLDS (adjustable)",
    "Tham số": "Parameter", "Giá trị": "Value", "Ý nghĩa": "Meaning",
    # ... EXTEND per --report until empty ...
}

# Sample data to clear (values only; formula columns C / AH stay).
_CLEAR = [("2. Projects", 3, 20, "ABCDE"),
          ("3. Monthly", 4, 60, "AB" + "DEFGHIJKLMNOPQRSTUVWX"),
          ("4. Quarterly", 4, 53, [c for c in
           ["A", "B"] + [chr(x) for x in range(ord("C"), ord("Z") + 1)]
           + ["AA", "AB", "AC", "AD", "AE", "AF", "AG"]])]


def _translate_cell(cell) -> None:
    v = cell.value
    if isinstance(v, str) and not v.startswith("="):
        if v in TRANSLATIONS:
            cell.value = TRANSLATIONS[v]
    elif isinstance(v, str) and v.startswith("="):
        for old, new in SHEET_RENAMES.items():
            if old in v:
                cell.value = v.replace(old, new)


def build() -> None:
    wb = openpyxl.load_workbook(SRC)
    for old, new in SHEET_RENAMES.items():
        wb[old].title = new
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                _translate_cell(cell)
    for sheet, r0, r1, cols in _CLEAR:
        ws = wb[sheet]
        for r in range(r0, r1 + 1):
            for col in cols:
                ws[f"{col}{r}"].value = None
    add_charts(wb)
    wb.save(DST)
    print(f"wrote {DST}")


def report() -> None:
    wb = openpyxl.load_workbook(DST)
    remaining = 0
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for cell in row:
                v = cell.value
                if isinstance(v, str) and not v.startswith("=") and _VN.search(v):
                    print(f"{ws.title}!{cell.coordinate}: {v[:80]}")
                    remaining += 1
    print(f"{remaining} untranslated cell(s)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true")
    args = parser.parse_args()
    report() if args.report else build()
```

- [ ] **Step 3: Write the failing test**

Create `tests/test_build_template.py`:

```python
from pathlib import Path
import openpyxl
import pytest
from exporter.build_template import DST, _VN

pytestmark = pytest.mark.skipif(not DST.exists(), reason="EN template not built yet")


def test_template_fully_english():
    wb = openpyxl.load_workbook(DST)
    offenders = [
        f"{ws.title}!{c.coordinate}"
        for ws in wb.worksheets for row in ws.iter_rows() for c in row
        if isinstance(c.value, str) and not c.value.startswith("=") and _VN.search(c.value)
    ]
    assert offenders == []


def test_template_structure():
    wb = openpyxl.load_workbook(DST)
    assert "1. Guide" in wb.sheetnames and "3. Monthly" in wb.sheetnames
    m = wb["3. Monthly"]
    assert m["A4"].value is None            # sample data cleared
    assert str(m["C4"].value).startswith("=")  # quarter formula kept
    q = wb["4. Quarterly"]
    assert q["A4"].value is None
    assert str(q["AH4"].value).startswith("=")


def test_template_has_charts():
    wb = openpyxl.load_workbook(DST)
    assert len(wb["8. Dashboard-Project"]._charts) == 2
    assert len(wb["9. Dashboard-Portfolio"]._charts) == 1
```

- [ ] **Step 4: Build, iterate translations, verify**

```bash
git add -f docs/SETA_AI_SDLC_Maturity.xlsx   # track the source workbook
python -m exporter.build_template
python -m exporter.build_template --report
```

Extend `TRANSLATIONS` (sheets 1, 6, 7, 8, 9 hold most remaining text) and re-run both commands until the report prints `0 untranslated cell(s)`. Then:

Run: `python -m pytest tests/test_build_template.py -v`
Expected: 3 PASS

- [ ] **Step 5: Open the EN file and eyeball it**

`open docs/SETA_AI_SDLC_Maturity_EN.xlsx` — check formulas still compute (sheets 5–9 show no `#REF!`), charts render, colors intact.

- [ ] **Step 6: Commit**

```bash
git add exporter tests/test_build_template.py docs/SETA_AI_SDLC_Maturity_EN.xlsx
git commit -m "feat: English maturity workbook template and builder"
```

---

### Task 2: Exporter data layer

**Files:**
- Create: `exporter/data.py`
- Create: `tests/test_exporter_data.py`

**Interfaces:**
- Consumes: `reporting.metrics_ratios`, `reporting.manual_inputs`.
- Produces: `fetch_projects(db_url) -> list[str]`; `fetch_period_rows(db_url, projects: list[str], period_type: str) -> list[dict]` (one dict per view row, keys = column names, ordered by project then period_start); `fetch_manual(db_url, projects: list[str]) -> dict[tuple[str, str], dict[str, str]]` (`(project, period_key) -> {field: value}`).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_exporter_data.py`:

```python
from datetime import date
from collector.db import upsert_counts, upsert_manual_input
from exporter.data import fetch_projects, fetch_period_rows, fetch_manual


def _seed(pg_url):
    upsert_counts(pg_url, "P-Exp", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13),
                  {"ai_prs": 3, "total_prs": 10})
    upsert_counts(pg_url, "P-Exp", "month", "2026-06", date(2026, 6, 1), date(2026, 6, 30),
                  {"deploys": 4, "weeks": 4.3})
    upsert_manual_input(pg_url, "P-Exp", "2026-06", "total_engineers", "18", "pm")


def test_fetch_projects(pg_url):
    _seed(pg_url)
    assert "P-Exp" in fetch_projects(pg_url)


def test_fetch_period_rows(pg_url):
    _seed(pg_url)
    rows = fetch_period_rows(pg_url, ["P-Exp"], "sprint")
    assert rows[0]["period_key"] == "S1"
    assert float(rows[0]["ai_pr_pct"]) == 30.0
    assert rows[0]["lead_time_h"] is None


def test_fetch_manual(pg_url):
    _seed(pg_url)
    manual = fetch_manual(pg_url, ["P-Exp"])
    assert manual[("P-Exp", "2026-06")]["total_engineers"] == "18"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_exporter_data.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `exporter/data.py`**

```python
import psycopg2
import psycopg2.extras


def fetch_projects(db_url: str) -> list[str]:
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute("SELECT DISTINCT project FROM reporting.metrics_wide ORDER BY project")
        return [r[0] for r in cur.fetchall()]


def fetch_period_rows(db_url: str, projects: list[str], period_type: str) -> list[dict]:
    with psycopg2.connect(db_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT * FROM reporting.metrics_ratios
                WHERE project = ANY(%s) AND period_type = %s
                ORDER BY project, period_start
            """, (projects, period_type))
            return [dict(r) for r in cur.fetchall()]


def fetch_manual(db_url: str, projects: list[str]) -> dict[tuple[str, str], dict[str, str]]:
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT project, period_key, field, value FROM reporting.manual_inputs
            WHERE project = ANY(%s)
        """, (projects,))
        out: dict[tuple[str, str], dict[str, str]] = {}
        for project, period_key, field, value in cur.fetchall():
            out.setdefault((project, period_key), {})[field] = value
        return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_exporter_data.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add exporter/data.py tests/test_exporter_data.py
git commit -m "feat: exporter data layer over metric views"
```

---

### Task 3: Workbook filling

**Files:**
- Create: `exporter/workbook.py`
- Create: `tests/test_exporter_workbook.py`

**Interfaces:**
- Consumes: EN template (Task 1), `add_charts` (Task 1), row/manual shapes from Task 2.
- Produces:
  - `parse_sprint_range(spec: str | None) -> tuple[int, int] | None` (`"S1:S6"` → `(1, 6)`, `"S3"` → `(3, 3)`, `None`/`""` → `None`; bad input → `ValueError`)
  - `sprint_in_range(period_key: str, rng: tuple[int, int] | None) -> bool`
  - `months_overlapped(sprint_rows: list[dict]) -> list[str]` (sorted `YYYY-MM` covered by the rows' `period_start`..`period_end`)
  - `quarters_of(months: list[str]) -> list[str]` (sorted `YYYY-Q<n>`)
  - `fill_workbook(template_path, projects: list[str], sprint_rows: list[dict], month_rows: list[dict], manual: dict) -> openpyxl.Workbook`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_exporter_workbook.py`:

```python
from datetime import date
from decimal import Decimal
import pytest
from exporter.build_template import DST
from exporter.workbook import (
    parse_sprint_range, sprint_in_range, months_overlapped, quarters_of,
    fill_workbook,
)

pytestmark = pytest.mark.skipif(not DST.exists(), reason="EN template not built yet")


def test_parse_sprint_range():
    assert parse_sprint_range("S1:S6") == (1, 6)
    assert parse_sprint_range("S3") == (3, 3)
    assert parse_sprint_range(None) is None
    with pytest.raises(ValueError):
        parse_sprint_range("junk")


def test_sprint_in_range():
    assert sprint_in_range("S4", (1, 6)) is True
    assert sprint_in_range("S7", (1, 6)) is False
    assert sprint_in_range("S7", None) is True


def _sprint_row(**kw):
    row = {"project": "Future", "period_key": "S1", "period_type": "sprint",
           "period_start": date(2026, 6, 29), "period_end": date(2026, 7, 13),
           "ai_prs": Decimal(3), "total_prs": Decimal(10), "ai_pr_pct": Decimal(30)}
    row.update(kw)
    return row


def test_months_overlapped_and_quarters():
    months = months_overlapped([_sprint_row()])
    assert months == ["2026-06", "2026-07"]
    assert quarters_of(months) == ["2026-Q2", "2026-Q3"]


def test_fill_workbook_writes_sheets():
    month_row = {"project": "Future", "period_key": "2026-06",
                 "period_start": date(2026, 6, 1), "ai_prs": Decimal(20),
                 "total_prs": Decimal(50), "deploys": Decimal(4),
                 "weeks": Decimal("4.3")}
    manual = {("Future", "2026-06"): {"total_engineers": "18"},
              ("Future", "2026-Q2"): {"g1_agents_md": "Yes",
                                      "evidence_a": "Live dashboard"}}
    wb = fill_workbook(DST, ["Future"], [_sprint_row()], [month_row], manual)

    proj = wb["2. Projects"]
    assert (proj["A3"].value, proj["B3"].value) == ("P01", "Future")

    monthly = wb["3. Monthly"]
    assert monthly["A4"].value == "P01"
    assert monthly["B4"].value.strftime("%Y-%m") == "2026-06"
    assert float(monthly["F4"].value) == 20.0   # ai_prs
    assert float(monthly["E4"].value) == 18.0   # manual total_engineers
    assert str(monthly["C4"].value).startswith("=")  # formula intact

    quarterly = wb["4. Quarterly"]
    assert quarterly["A4"].value == "P01"
    assert quarterly["B4"].value == "2026-Q2"
    assert quarterly["C4"].value == "Yes"        # g1_agents_md
    assert quarterly["AB4"].value == "Live dashboard"

    sprint = wb["Sprint data"]
    assert sprint["A1"].value == "Project"
    assert sprint["A2"].value == "Future"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_exporter_workbook.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement `exporter/workbook.py`**

```python
"""Pure workbook filling: template + fetched rows -> openpyxl Workbook."""
import re
from datetime import datetime
from pathlib import Path
import openpyxl
from exporter.charts import add_charts

SHEET3_METRIC_COLS = {
    "D": "ai_users_weekly_avg", "F": "ai_prs", "G": "total_prs",
    "H": "agent_tasks", "I": "total_tasks", "J": "lead_time_h", "K": "deploys",
    "L": "weeks", "M": "incidents", "N": "mttr_h", "Q": "rework_prs",
    "R": "ai_prs_reviewed", "T": "security_alerts", "U": "agent_prs_merged",
    "V": "agent_prs_human_fixed", "W": "agent_prs_autonomous", "X": "agent_cycle_h",
}
SHEET3_MANUAL_COLS = {"E": "total_engineers", "O": "cost_baseline",
                      "P": "cost_actual", "S": "coverage_ai"}
SHEET4_FIELDS = [
    "g1_agents_md", "g2_ai_policy", "g3_required_review", "g4_eval_suite",
    "g5_shared_library", "g6_security_controls", "g7_traceability",
    "g8_model_governance", "a2_dashboard", "a4_near_universal",
    "b4_dora_improving", "b5_cost_multi_wf", "b6_business_outcomes",
    "b7_top_quartile", "b8_client_reporting", "c3_scan_ci", "c4_ai_vs_nonai",
    "c5_evals", "c6_sast_pii_required", "c7_defect_zero", "c8_evals_in_ci",
    "c9_prompt_leak_pii", "d3_defined_class", "d4_cycle_measured",
    "d5_multi_agent", "evidence_a", "evidence_b", "evidence_c", "evidence_d",
    "evidence_e", "improvement_action",
]
SPRINT_SHEET_COLS = [
    "period_key", "period_start", "ai_users_weekly_avg", "ai_prs", "total_prs",
    "ai_pr_pct", "agent_tasks", "ai_tasks", "total_tasks", "agent_task_pct",
    "lead_time_h", "deploys", "weeks", "deploys_per_week", "incidents",
    "cfr_pct", "mttr_h", "rework_prs", "rework_pct", "ai_prs_reviewed",
    "ai_pr_review_pct", "security_alerts", "agent_prs_total",
    "agent_prs_merged", "agent_prs_human_fixed", "agent_prs_autonomous",
    "agent_completion_pct", "human_intervention_pct", "autonomy_pct",
    "agent_cycle_h", "sprint_committed", "sprint_completed", "predictability_pct",
]


def parse_sprint_range(spec: str | None) -> tuple[int, int] | None:
    if not spec:
        return None
    m = re.fullmatch(r"S(\d+)(?::S(\d+))?", spec)
    if not m:
        raise ValueError(f"sprints must look like 'S3' or 'S1:S6', got {spec!r}")
    lo = int(m.group(1))
    hi = int(m.group(2)) if m.group(2) else lo
    if lo > hi:
        raise ValueError(f"empty sprint range {spec!r}")
    return lo, hi


def sprint_in_range(period_key: str, rng: tuple[int, int] | None) -> bool:
    if rng is None:
        return True
    index = int(period_key[1:])
    return rng[0] <= index <= rng[1]


def _month_iter(start, end):
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        yield f"{y}-{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def months_overlapped(sprint_rows: list[dict]) -> list[str]:
    months: set[str] = set()
    for row in sprint_rows:
        months.update(_month_iter(row["period_start"], row["period_end"]))
    return sorted(months)


def quarters_of(months: list[str]) -> list[str]:
    quarters = {f"{m[:4]}-Q{(int(m[5:7]) + 2) // 3}" for m in months}
    return sorted(quarters)


def _num(value):
    return float(value) if value is not None else None


def fill_workbook(template_path: Path, projects: list[str],
                  sprint_rows: list[dict], month_rows: list[dict],
                  manual: dict) -> openpyxl.Workbook:
    wb = openpyxl.load_workbook(template_path)
    ids = {name: f"P{i + 1:02d}" for i, name in enumerate(sorted(projects))}

    ws = wb["2. Projects"]
    for i, name in enumerate(sorted(projects)):
        ws[f"A{3 + i}"], ws[f"B{3 + i}"] = ids[name], name

    ws = wb["3. Monthly"]
    for i, row in enumerate(sorted(month_rows,
                                   key=lambda r: (r["project"], r["period_key"]))):
        r = 4 + i
        ws[f"A{r}"] = ids[row["project"]]
        ws[f"B{r}"] = datetime.strptime(row["period_key"], "%Y-%m")
        for col, key in SHEET3_METRIC_COLS.items():
            ws[f"{col}{r}"] = _num(row.get(key))
        month_manual = manual.get((row["project"], row["period_key"]), {})
        for col, field in SHEET3_MANUAL_COLS.items():
            if field in month_manual:
                ws[f"{col}{r}"] = float(month_manual[field])

    ws = wb["4. Quarterly"]
    quarter_keys = sorted({(p, q) for (p, q) in manual if re.fullmatch(r"\d{4}-Q[1-4]", q)
                           and p in projects})
    for i, (project, quarter) in enumerate(quarter_keys):
        r = 4 + i
        ws[f"A{r}"], ws[f"B{r}"] = ids[project], quarter
        entries = manual[(project, quarter)]
        for j, field in enumerate(SHEET4_FIELDS):
            if field in entries:
                ws.cell(row=r, column=3 + j, value=entries[field])

    ws = wb.create_sheet("Sprint data")
    header = ["Project"] + [c.replace("_", " ").title() for c in SPRINT_SHEET_COLS]
    for j, title in enumerate(header, start=1):
        ws.cell(row=1, column=j, value=title)
    for i, row in enumerate(sorted(sprint_rows,
                                   key=lambda r: (r["project"], r["period_start"])), start=2):
        ws.cell(row=i, column=1, value=row["project"])
        for j, key in enumerate(SPRINT_SHEET_COLS, start=2):
            v = row.get(key)
            if key == "period_key":
                ws.cell(row=i, column=j, value=v)
            elif key == "period_start":
                ws.cell(row=i, column=j, value=str(v))
            else:
                ws.cell(row=i, column=j, value=_num(v))

    add_charts(wb)
    return wb
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_exporter_workbook.py -v`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add exporter/workbook.py tests/test_exporter_workbook.py
git commit -m "feat: workbook filling for monthly, quarterly, and sprint data"
```

---

### Task 4: FastAPI app

**Files:**
- Create: `exporter/app.py`
- Create: `tests/test_exporter_app.py`
- Modify: `requirements.txt` (add `fastapi`, `uvicorn`, `openpyxl`), `requirements-dev.txt` (add `httpx`)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `GET /health` → `{"status": "ok"}`; `GET /export.xlsx?project=<name|all>&sprints=<S1:S6|S3|empty>` → xlsx attachment. 404 unknown project, 422 bad sprint spec. Env config: `REPORTING_DB_URL` (required), `TEMPLATE_PATH` (default `docs/SETA_AI_SDLC_Maturity_EN.xlsx`).

- [ ] **Step 1: Write the failing tests**

Create `tests/test_exporter_app.py`:

```python
import io
from datetime import date
from decimal import Decimal
import openpyxl
import pytest
from fastapi.testclient import TestClient
from exporter.build_template import DST

pytestmark = pytest.mark.skipif(not DST.exists(), reason="EN template not built yet")


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("REPORTING_DB_URL", "postgresql://unused")
    import exporter.app as app_module
    monkeypatch.setattr(app_module, "fetch_projects", lambda db: ["Future"])
    monkeypatch.setattr(app_module, "fetch_period_rows", lambda db, ps, pt: [{
        "project": "Future", "period_key": "S1" if pt == "sprint" else "2026-06",
        "period_type": pt, "period_start": date(2026, 6, 29),
        "period_end": date(2026, 7, 13), "ai_prs": Decimal(3),
        "total_prs": Decimal(10), "ai_pr_pct": Decimal(30),
    }])
    monkeypatch.setattr(app_module, "fetch_manual", lambda db, ps: {})
    return TestClient(app_module.app)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_export_returns_workbook(client):
    r = client.get("/export.xlsx", params={"project": "Future", "sprints": "S1:S3"})
    assert r.status_code == 200
    assert "spreadsheetml" in r.headers["content-type"]
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    assert wb["2. Projects"]["B3"].value == "Future"
    assert "Sprint data" in wb.sheetnames


def test_export_unknown_project_404(client):
    assert client.get("/export.xlsx", params={"project": "Nope"}).status_code == 404


def test_export_bad_sprints_422(client):
    assert client.get("/export.xlsx", params={"sprints": "banana"}).status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest tests/test_exporter_app.py -v`
Expected: FAIL (module missing; `pip install fastapi uvicorn httpx` first if needed)

- [ ] **Step 3: Implement `exporter/app.py`**

```python
"""AI SDLC maturity workbook exporter — serves the filled English template.

  uvicorn exporter.app:app --host 0.0.0.0 --port 8000
"""
import io
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Response
from exporter.data import fetch_manual, fetch_period_rows, fetch_projects
from exporter.workbook import (
    fill_workbook, months_overlapped, parse_sprint_range, sprint_in_range,
)

app = FastAPI(title="AI SDLC Maturity Exporter")

TEMPLATE_PATH = Path(os.getenv("TEMPLATE_PATH", "docs/SETA_AI_SDLC_Maturity_EN.xlsx"))
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/export.xlsx")
def export(project: str = "all", sprints: str | None = None) -> Response:
    db_url = os.environ["REPORTING_DB_URL"]
    try:
        rng = parse_sprint_range(sprints)
    except ValueError as e:
        raise HTTPException(422, str(e))

    known = fetch_projects(db_url)
    projects = known if project == "all" else [project]
    if project != "all" and project not in known:
        raise HTTPException(404, f"unknown project {project!r}")

    sprint_rows = [r for r in fetch_period_rows(db_url, projects, "sprint")
                   if sprint_in_range(r["period_key"], rng)]
    months = set(months_overlapped(sprint_rows))
    month_rows = [r for r in fetch_period_rows(db_url, projects, "month")
                  if not months or r["period_key"] in months]
    manual = fetch_manual(db_url, projects)

    wb = fill_workbook(TEMPLATE_PATH, projects, sprint_rows, month_rows, manual)
    buf = io.BytesIO()
    wb.save(buf)
    name = f"ai-sdlc-maturity_{project}_{sprints or 'all'}.xlsx"
    return Response(buf.getvalue(), media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
```

- [ ] **Step 4: Update requirements and run tests**

Append to `requirements.txt`: `fastapi`, `uvicorn`, `openpyxl`. Append to `requirements-dev.txt`: `httpx`.

Run: `pip install -r requirements.txt -r requirements-dev.txt && python -m pytest tests/test_exporter_app.py -v`
Expected: 4 PASS. Then `python -m pytest` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add exporter/app.py tests/test_exporter_app.py requirements.txt requirements-dev.txt
git commit -m "feat: FastAPI workbook export endpoint"
```

---

### Task 5: Docker packaging + Grafana download links

**Files:**
- Create: `infra/docker/exporter.Dockerfile`
- Modify: `infra/docker/compose.yml`, `infra/docker/compose.local.yml` (add `exporter` service)
- Modify: `infra/grafana/generate.py` (dashboard links), `infra/grafana/projects.json` (`exporter_url`)
- Modify: `tests/test_dashboards.py` (assert links)

- [ ] **Step 1: Create `infra/docker/exporter.Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY collector ./collector
COPY exporter ./exporter
COPY docs/SETA_AI_SDLC_Maturity_EN.xlsx ./docs/SETA_AI_SDLC_Maturity_EN.xlsx
EXPOSE 8000
CMD ["uvicorn", "exporter.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Add the service to both compose files**

In `infra/docker/compose.yml` under `services:` add (build context is the repo root):

```yaml
  exporter:
    build:
      context: ../..
      dockerfile: infra/docker/exporter.Dockerfile
    container_name: ai-sdlc-metrics-exporter
    restart: unless-stopped
    environment:
      REPORTING_DB_URL: postgresql://reporting:${REPORTING_DB_PASSWORD}@${REPORTING_DB_HOST}:5432/reporting?sslmode=require
    ports:
      - "3031:8000"
```

In `infra/docker/compose.local.yml` add the same service but with:

```yaml
    environment:
      REPORTING_DB_URL: postgresql://reporting:reporting@postgres:5432/reporting
    depends_on:
      - postgres
```

- [ ] **Step 3: Add download links to the dashboard generator**

In `infra/grafana/projects.json` add a top-level key:

```json
  "exporter_url": "http://localhost:3031"
```

In `infra/grafana/generate.py`:
- `_dashboard(...)` gains a `links: list[dict]` parameter appended into the returned dict as `"links": links`.
- In `main()`, read `exporter = config.get("exporter_url", "http://localhost:3031")` and pass it into the builders; change builder signatures to `build_project_dashboard(project: str, exporter_url: str)` and `build_bod_dashboard(projects: list[str], exporter_url: str)`.
- Project dashboards pass:

```python
    links = [
        {"type": "link", "title": "Download Excel (all sprints)", "icon": "doc",
         "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project={project}"},
        {"type": "link", "title": "Download Excel (selected sprint)", "icon": "doc",
         "targetBlank": True,
         "url": f"{exporter_url}/export.xlsx?project={project}&sprints=${{sprint}}"},
    ]
```

- BOD dashboard passes:

```python
    links = [{"type": "link", "title": "Download Excel (all projects)", "icon": "doc",
              "targetBlank": True, "url": f"{exporter_url}/export.xlsx?project=all"}]
```

Append to `tests/test_dashboards.py`:

```python
def test_dashboards_have_download_links(tmp_path):
    out = _generate(tmp_path)
    proj = json.loads((out / "Future" / "project.json").read_text())
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    assert any("export.xlsx?project=Future" in l["url"] for l in proj["links"])
    assert any("project=all" in l["url"] for l in bod["links"])
```

- [ ] **Step 4: Regenerate and test**

```bash
python3 infra/grafana/generate.py
python -m pytest tests/test_dashboards.py -v
```
Expected: all PASS (including the new links test).

- [ ] **Step 5: Commit**

```bash
git add infra/docker infra/grafana tests/test_dashboards.py
git commit -m "feat: exporter container and Grafana download links"
```

---

### Task 6: Live verification (local stack, then production)

- [ ] **Step 1: Local end-to-end**

```bash
python3 infra/grafana/generate.py
docker compose -f infra/docker/compose.local.yml up -d --build
curl -sf http://localhost:3031/health
curl -sf -o /tmp/export-test.xlsx "http://localhost:3031/export.xlsx?project=Future&sprints=S1:S3"
python3 - << 'EOF'
import openpyxl
wb = openpyxl.load_workbook("/tmp/export-test.xlsx")
m = wb["3. Monthly"]
print("projects:", wb["2. Projects"]["B3"].value)
print("monthly row:", m["A4"].value, m["B4"].value, m["F4"].value)
print("sprint rows:", wb["Sprint data"].max_row - 1)
EOF
```

Expected: health ok; workbook opens; Future's seeded months/sprints present; open the file in Excel — charts on sheets 8/9 exist, formulas compute levels from the filled data.

- [ ] **Step 2: Grafana link click-through**

Open `http://localhost:3030` (admin/admin) → Future dashboard → "Download Excel (selected sprint)" downloads the file with the sprint filter applied.

- [ ] **Step 3: Production deploy**

On the Grafana host: `docker compose -f infra/docker/compose.yml up -d --build exporter`, set `exporter_url` in `projects.json` to the public URL (reverse-proxied path on ai-metrics.seta-international.com or the :3031 port), re-run `generate.py`, restart Grafana. Verify the BOD dashboard link downloads a workbook with real Future data.

- [ ] **Step 4: Commit any final config**

```bash
git status && git add -p && git commit -m "chore: production exporter URL config"
```

---

## After this plan

The full spec is delivered for Future. Remaining follow-ups tracked outside these plans:
- TeacherZone onboarding (Plan 2 Task 8) once repo/Jira/sprint config is provided.
- First real monthly manual input + quarterly review at the next boundaries (Aug 3 monthly; Oct 1 quarterly).
