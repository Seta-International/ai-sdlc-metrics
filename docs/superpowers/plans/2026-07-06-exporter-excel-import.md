# Exporter Excel Round-Trip Import Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a PM download the English workbook, fill the yellow manual cells, and upload it back to import those values into `reporting.manual_inputs` — closing the capture gap that leaves `total_engineers` and the quarterly governance flags empty (which is why usage% and the A–E gates break).

**Architecture:** A pure parser module (`exporter/importer.py`) reverses `exporter/workbook.py`'s `fill_workbook` — it reads ONLY the designated manual cells (Monthly E/O/P/S, all Quarterly flag columns) plus the `2. Projects` id→name map, and ignores every auto-collected cell. The FastAPI app (`exporter/app.py`) adds three routes: a GET upload form, a POST preview (parse → diff vs current DB → render an HTML table with a confirm button carrying the parsed changes as embedded JSON), and a POST commit (write the confirmed changes via `collector.db.upsert_manual_input`). The collector keeps owning all auto cells.

**Tech Stack:** FastAPI 0.115, openpyxl 3.1.5, psycopg2, python-multipart (new dep), pytest + FastAPI TestClient.

## Global Constraints

- Reuse manual-cell definitions from `exporter/workbook.py` verbatim — DO NOT redefine them: `SHEET3_MANUAL_COLS = {"E":"total_engineers","O":"cost_baseline","P":"cost_actual","S":"coverage_ai"}`, `SHEET4_FIELDS` (the 31-item list, order = sheet columns C, D, …). Import them.
- Import ONLY manual cells. Never read the auto metric columns (`SHEET3_METRIC_COLS`) — the collector owns those; importing them would clobber live data.
- Sheet names in the generated workbook: `"2. Projects"` (A=id from row 3, B=name), `"3. Monthly"` (data rows 4+, A=ProjectID, B=month as an Excel date, manual cols E/O/P/S), `"4. Quarterly"` (data rows 4+, A=ProjectID, B=quarter string like `"2026-Q3"`, fields at columns `3+j` for `SHEET4_FIELDS[j]`).
- ProjectID→name comes from the uploaded `"2. Projects"` sheet, NOT a fixed table (ids are assigned at export time by sorted project order).
- Monthly `period_key` = the Monthly col-B datetime formatted `"%Y-%m"`. Quarterly `period_key` = the Quarterly col-B string as-is.
- Values are stored as TEXT in `manual_inputs`. Numeric manual values format without spurious decimals: an integral float → int string (`18.0`→`"18"`); non-integral → `str(value)` (`0.55`→`"0.55"`). Yes/No and free-text (evidence, improvement_action) stored verbatim.
- Blank/None cells are skipped (not written as empty strings).
- Write path is `collector.db.upsert_manual_input(db_url, project, period_key, field, value, entered_by)` — already exists; `entered_by="excel-import"`.
- Optional shared-secret guard: if env `IMPORT_TOKEN` is set, POST `/import/preview` and `/import/commit` require a matching `token` form field (else HTTP 401). If `IMPORT_TOKEN` is unset, the routes are open (local/dev). GET `/import` is always open.
- Existing `/export.xlsx` and `/health` routes and all current exporter tests must keep working unchanged.

## File Structure

- `exporter/importer.py` — NEW. Pure functions: `parse_manual_inputs(wb) -> list[dict]`, `format_value(v) -> str`, `diff_changes(parsed, current) -> list[dict]`, `usage_warnings(parsed, auto_ai_users) -> list[str]`. No HTTP, no DB.
- `exporter/data.py` — MODIFY. Add `fetch_auto_ai_users(db_url, projects) -> dict[(project, month_key)] -> float` for the data-quality warning (reads `metrics_wide`). Reuse existing `fetch_manual` for current values.
- `exporter/app.py` — MODIFY. Add `GET /import`, `POST /import/preview`, `POST /import/commit`, and a `_check_token` helper.
- `requirements.txt` — MODIFY. Add `python-multipart==0.0.20`.
- `tests/test_importer.py` — NEW. Pure-function tests (parse, format, diff, warnings).
- `tests/test_exporter_import.py` — NEW. TestClient tests for the three routes (db writes monkeypatched).

---

## Task 1: `parse_manual_inputs` — reverse the workbook into manual changes

**Files:**
- Create: `exporter/importer.py`
- Test: `tests/test_importer.py`

**Interfaces:**
- Consumes: `exporter.workbook.SHEET3_MANUAL_COLS`, `SHEET4_FIELDS`; an openpyxl `Workbook`.
- Produces: `parse_manual_inputs(wb) -> list[dict]`, each dict `{"project": str, "period_key": str, "field": str, "value": str}`; and `format_value(v) -> str`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_importer.py`:

```python
import openpyxl
from exporter.importer import parse_manual_inputs, format_value


def _wb_with(projects_rows, monthly_rows=(), quarterly_rows=()):
    """Build a minimal workbook shaped like the exporter output."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    p = wb.create_sheet("2. Projects")
    for i, (pid, name) in enumerate(projects_rows):
        p[f"A{3+i}"], p[f"B{3+i}"] = pid, name
    m = wb.create_sheet("3. Monthly")
    for i, cells in enumerate(monthly_rows):
        r = 4 + i
        for col, val in cells.items():
            m[f"{col}{r}"] = val
    q = wb.create_sheet("4. Quarterly")
    for i, cells in enumerate(quarterly_rows):
        r = 4 + i
        for col, val in cells.items():
            q[f"{col}{r}"] = val
    return wb


def test_format_value_integral_float_has_no_decimal():
    assert format_value(18.0) == "18"
    assert format_value(0.55) == "0.55"
    assert format_value("Yes") == "Yes"
    assert format_value(3) == "3"


def test_parse_reads_only_manual_monthly_cells():
    from datetime import datetime
    wb = _wb_with(
        projects_rows=[("P01", "Future")],
        monthly_rows=[{"A": "P01", "B": datetime(2026, 6, 1),
                       "E": 18, "O": 45, "P": 30, "S": 0.55,
                       "F": 999, "G": 999}],  # F/G are AUTO cols — must be ignored
    )
    got = parse_manual_inputs(wb)
    assert {"project": "Future", "period_key": "2026-06",
            "field": "total_engineers", "value": "18"} in got
    assert {"project": "Future", "period_key": "2026-06",
            "field": "coverage_ai", "value": "0.55"} in got
    # auto cols never appear as fields
    assert not any(c["field"] in ("ai_prs", "total_prs") for c in got)
    assert len(got) == 4  # E,O,P,S only


def test_parse_reads_quarterly_flags_and_skips_blanks():
    wb = _wb_with(
        projects_rows=[("P01", "Future")],
        quarterly_rows=[{"A": "P01", "B": "2026-Q3", "C": "Yes", "D": "No",
                         # column AF (index for evidence) left blank -> skipped
                         }],
    )
    got = parse_manual_inputs(wb)
    assert {"project": "Future", "period_key": "2026-Q3",
            "field": "g1_agents_md", "value": "Yes"} in got
    assert {"project": "Future", "period_key": "2026-Q3",
            "field": "g2_ai_policy", "value": "No"} in got
    # only the two filled flags, nothing for blank columns
    assert len(got) == 2
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_importer.py -v`
Expected: FAIL — `No module named 'exporter.importer'`.

- [ ] **Step 3: Implement `exporter/importer.py`**

```python
"""Reverse of exporter.workbook.fill_workbook: read ONLY the manual cells a PM
fills (Monthly E/O/P/S + all Quarterly flag columns) back out of an uploaded
workbook. Auto-collected columns are never read — the collector owns those."""
from openpyxl.utils import get_column_letter
from exporter.workbook import SHEET3_MANUAL_COLS, SHEET4_FIELDS

_MONTHLY_DATA_START = 4
_QUARTERLY_DATA_START = 4


def format_value(v) -> str:
    """Text form for manual_inputs: integral floats lose the decimal."""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def _project_map(wb) -> dict:
    """ProjectID -> name from the '2. Projects' sheet (rows 3+)."""
    ws = wb["2. Projects"]
    out = {}
    for r in range(3, ws.max_row + 1):
        pid, name = ws[f"A{r}"].value, ws[f"B{r}"].value
        if pid and name:
            out[str(pid)] = str(name)
    return out


def parse_manual_inputs(wb) -> list[dict]:
    ids = _project_map(wb)
    changes: list[dict] = []

    ws = wb["3. Monthly"]
    for r in range(_MONTHLY_DATA_START, ws.max_row + 1):
        pid = ws[f"A{r}"].value
        month = ws[f"B{r}"].value
        if not pid or pid not in ids or month is None:
            continue
        period_key = month.strftime("%Y-%m") if hasattr(month, "strftime") else str(month)
        for col, field in SHEET3_MANUAL_COLS.items():
            val = ws[f"{col}{r}"].value
            if val is None or val == "":
                continue
            changes.append({"project": ids[pid], "period_key": period_key,
                            "field": field, "value": format_value(val)})

    ws = wb["4. Quarterly"]
    for r in range(_QUARTERLY_DATA_START, ws.max_row + 1):
        pid = ws[f"A{r}"].value
        quarter = ws[f"B{r}"].value
        if not pid or pid not in ids or not quarter:
            continue
        for j, field in enumerate(SHEET4_FIELDS):
            val = ws.cell(row=r, column=3 + j).value
            if val is None or val == "":
                continue
            changes.append({"project": ids[pid], "period_key": str(quarter),
                            "field": field, "value": format_value(val)})
    return changes
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_importer.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add exporter/importer.py tests/test_importer.py
git commit -m "feat: exporter importer — parse manual cells back out of the workbook"
```

---

## Task 2: `diff_changes` — preview old→new against current DB values

**Files:**
- Modify: `exporter/importer.py`
- Test: `tests/test_importer.py`

**Interfaces:**
- Consumes: `parse_manual_inputs` output; `current: dict[(project, period_key)] -> dict[field] -> value` (the shape `exporter.data.fetch_manual` already returns).
- Produces: `diff_changes(parsed, current) -> list[dict]` each `{"project","period_key","field","old","new","status"}` where status ∈ `{"new","changed","unchanged"}`, sorted by (project, period_key, field).

- [ ] **Step 1: Write the failing test**

Add to `tests/test_importer.py`:

```python
from exporter.importer import diff_changes


def test_diff_classifies_new_changed_unchanged():
    parsed = [
        {"project": "Future", "period_key": "2026-06", "field": "total_engineers", "value": "19"},
        {"project": "Future", "period_key": "2026-06", "field": "cost_actual", "value": "30"},
        {"project": "Future", "period_key": "2026-Q3", "field": "g1_agents_md", "value": "Yes"},
    ]
    current = {("Future", "2026-06"): {"total_engineers": "18", "cost_actual": "30"}}
    got = diff_changes(parsed, current)
    by_field = {(c["period_key"], c["field"]): c for c in got}
    assert by_field[("2026-06", "total_engineers")]["status"] == "changed"
    assert by_field[("2026-06", "total_engineers")]["old"] == "18"
    assert by_field[("2026-06", "cost_actual")]["status"] == "unchanged"
    assert by_field[("2026-Q3", "g1_agents_md")]["status"] == "new"
    assert by_field[("2026-Q3", "g1_agents_md")]["old"] is None
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_importer.py::test_diff_classifies_new_changed_unchanged -v`
Expected: FAIL — `cannot import name 'diff_changes'`.

- [ ] **Step 3: Implement `diff_changes`**

Add to `exporter/importer.py`:

```python
def diff_changes(parsed: list[dict], current: dict) -> list[dict]:
    out = []
    for c in parsed:
        old = current.get((c["project"], c["period_key"]), {}).get(c["field"])
        if old is None:
            status = "new"
        elif str(old) == c["value"]:
            status = "unchanged"
        else:
            status = "changed"
        out.append({"project": c["project"], "period_key": c["period_key"],
                    "field": c["field"], "old": old, "new": c["value"],
                    "status": status})
    return sorted(out, key=lambda x: (x["project"], x["period_key"], x["field"]))
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_importer.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add exporter/importer.py tests/test_importer.py
git commit -m "feat: importer diff_changes — classify new/changed/unchanged vs DB"
```

---

## Task 3: `usage_warnings` + `fetch_auto_ai_users` — data-quality guard at input time

Flags an imported `total_engineers` that would push usage over 100% (auto `ai_users_weekly_avg` for that project/month exceeds the entered team size) — the P5 guard applied at capture time.

**Files:**
- Modify: `exporter/importer.py`, `exporter/data.py`
- Test: `tests/test_importer.py`

**Interfaces:**
- Produces: `usage_warnings(parsed, auto_ai_users) -> list[str]` where `auto_ai_users: dict[(project, month_key)] -> float`. `exporter.data.fetch_auto_ai_users(db_url, projects) -> dict`.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_importer.py`:

```python
from exporter.importer import usage_warnings


def test_usage_warning_when_team_size_below_ai_users():
    parsed = [
        {"project": "Future", "period_key": "2026-06", "field": "total_engineers", "value": "5"},
        {"project": "Future", "period_key": "2026-07", "field": "total_engineers", "value": "20"},
    ]
    auto = {("Future", "2026-06"): 8.0, ("Future", "2026-07"): 10.0}
    warns = usage_warnings(parsed, auto)
    assert len(warns) == 1
    assert "2026-06" in warns[0] and "Future" in warns[0]
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_importer.py::test_usage_warning_when_team_size_below_ai_users -v`
Expected: FAIL — `cannot import name 'usage_warnings'`.

- [ ] **Step 3: Implement both functions**

Add to `exporter/importer.py`:

```python
def usage_warnings(parsed: list[dict], auto_ai_users: dict) -> list[str]:
    warns = []
    for c in parsed:
        if c["field"] != "total_engineers":
            continue
        ai_users = auto_ai_users.get((c["project"], c["period_key"]))
        try:
            team = float(c["value"])
        except ValueError:
            warns.append(f"{c['project']} {c['period_key']}: total_engineers "
                         f"{c['value']!r} is not a number")
            continue
        if ai_users is not None and team > 0 and ai_users > team:
            warns.append(f"{c['project']} {c['period_key']}: team_size {team:g} < "
                         f"AI users {ai_users:g} — usage would exceed 100%")
    return warns
```

Add to `exporter/data.py`:

```python
def fetch_auto_ai_users(db_url: str, projects: list[str]) -> dict:
    with psycopg2.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT project, period_key, ai_users_weekly_avg
            FROM reporting.metrics_wide
            WHERE project = ANY(%s) AND period_type = 'month'
              AND ai_users_weekly_avg IS NOT NULL
        """, (projects,))
        return {(p, k): float(v) for p, k, v in cur.fetchall()}
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_importer.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add exporter/importer.py exporter/data.py tests/test_importer.py
git commit -m "feat: importer usage_warnings + fetch_auto_ai_users data-quality guard"
```

---

## Task 4: GET /import form + token guard + python-multipart dep

**Files:**
- Modify: `exporter/app.py`, `requirements.txt`
- Test: `tests/test_exporter_import.py`

**Interfaces:**
- Produces: `GET /import` returns an HTML upload form (200, `text/html`); `_check_token(token: str | None) -> None` raises `HTTPException(401)` when `IMPORT_TOKEN` is set and mismatched, else returns None.

- [ ] **Step 1: Write the failing test**

Create `tests/test_exporter_import.py`:

```python
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("REPORTING_DB_URL", "postgresql://unused")
    monkeypatch.delenv("IMPORT_TOKEN", raising=False)
    import exporter.app as app_module
    return TestClient(app_module.app), app_module


def test_import_form_renders(client):
    c, _ = client
    r = c.get("/import")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    assert "<form" in r.text and 'type="file"' in r.text
```

(The token-guard test lives in Task 5, where a route that calls `_check_token` exists.)

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_exporter_import.py -v`
Expected: FAIL — 404 on `/import` (route missing).

- [ ] **Step 3: Add the dependency and the route**

In `requirements.txt`, add a line:

```
python-multipart==0.0.20
```

Install it: `pip install python-multipart==0.0.20`

In `exporter/app.py`, add imports at the top (extend the existing `fastapi` import):

```python
from fastapi import FastAPI, Form, HTTPException, Response, UploadFile
from fastapi.responses import HTMLResponse
```

Add the token helper and the form route (after the existing `export` function):

```python
def _check_token(token: str | None) -> None:
    expected = os.environ.get("IMPORT_TOKEN")
    if expected and token != expected:
        raise HTTPException(401, "invalid or missing import token")


_IMPORT_FORM = """
<!doctype html><meta charset="utf-8"><title>Import maturity workbook</title>
<h2>Import filled maturity workbook</h2>
<p>Download the workbook from <code>/export.xlsx</code>, fill the yellow manual
cells (Monthly: team size, costs, coverage; Quarterly: governance checklist),
then upload it here. Only manual cells are imported; auto-collected numbers are
ignored.</p>
<form action="/import/preview" method="post" enctype="multipart/form-data">
  <input type="file" name="file" accept=".xlsx" required><br><br>
  <label>Import token (if required): <input type="text" name="token"></label><br><br>
  <button type="submit">Preview changes</button>
</form>
"""


@app.get("/import", response_class=HTMLResponse)
def import_form() -> str:
    return _IMPORT_FORM
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_exporter_import.py -v`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add exporter/app.py requirements.txt tests/test_exporter_import.py
git commit -m "feat: GET /import upload form + optional IMPORT_TOKEN guard"
```

---

## Task 5: POST /import/preview — parse, diff, render confirm page

**Files:**
- Modify: `exporter/app.py`
- Test: `tests/test_exporter_import.py`

**Interfaces:**
- Consumes: `exporter.importer.parse_manual_inputs/diff_changes/usage_warnings`, `exporter.data.fetch_manual/fetch_auto_ai_users`.
- Produces: `POST /import/preview` (multipart `file`, optional `token`) → HTML: a diff table + any warnings + a form posting `changes` (JSON of the parsed list) to `/import/commit`. Returns 400 if the file is not a valid workbook.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_exporter_import.py`:

```python
import io
import json
import openpyxl
from datetime import datetime


def _filled_workbook():
    wb = openpyxl.Workbook(); wb.remove(wb.active)
    p = wb.create_sheet("2. Projects"); p["A3"], p["B3"] = "P01", "Future"
    m = wb.create_sheet("3. Monthly")
    m["A4"], m["B4"], m["E4"], m["P4"] = "P01", datetime(2026, 6, 1), 19, 30
    wb.create_sheet("4. Quarterly")
    buf = io.BytesIO(); wb.save(buf); return buf.getvalue()


def test_preview_shows_diff_and_embeds_changes(client, monkeypatch):
    c, app_module = client
    monkeypatch.setattr(app_module, "fetch_manual",
                        lambda db, ps: {("Future", "2026-06"): {"total_engineers": "18"}})
    monkeypatch.setattr(app_module, "fetch_auto_ai_users", lambda db, ps: {})
    r = c.post("/import/preview", files={"file": ("wb.xlsx", _filled_workbook())})
    assert r.status_code == 200
    assert "changed" in r.text          # total_engineers 18 -> 19
    assert "total_engineers" in r.text
    # the confirm form embeds the parsed changes as JSON
    assert "/import/commit" in r.text and "total_engineers" in r.text


def test_preview_rejects_non_workbook(client):
    c, _ = client
    r = c.post("/import/preview", files={"file": ("x.xlsx", b"not a zip")})
    assert r.status_code == 400


def test_token_guard_rejects_when_set(client, monkeypatch):
    c, _ = client
    monkeypatch.setenv("IMPORT_TOKEN", "secret")
    # preview with no token -> 401 (guard runs before the file is read)
    r = c.post("/import/preview", files={"file": ("wb.xlsx", _filled_workbook())})
    assert r.status_code == 401
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_exporter_import.py -k "preview or token" -v`
Expected: FAIL — 404/405 (route missing).

- [ ] **Step 3: Implement the preview route**

In `exporter/app.py`, add imports:

```python
import io, json, html
import openpyxl
from exporter.data import fetch_manual, fetch_period_rows, fetch_projects, fetch_auto_ai_users
from exporter.importer import parse_manual_inputs, diff_changes, usage_warnings
```

(extend the existing `exporter.data` import line rather than duplicating it.)

Add the route:

```python
def _load_workbook(raw: bytes):
    try:
        return openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    except Exception:
        raise HTTPException(400, "uploaded file is not a valid .xlsx workbook")


@app.post("/import/preview", response_class=HTMLResponse)
def import_preview(file: UploadFile, token: str | None = Form(default=None)) -> str:
    _check_token(token)
    wb = _load_workbook(file.file.read())
    parsed = parse_manual_inputs(wb)
    if not parsed:
        return "<p>No manual values found in the workbook. Nothing to import.</p>"
    db_url = os.environ["REPORTING_DB_URL"]
    projects = sorted({c["project"] for c in parsed})
    current = fetch_manual(db_url, projects)
    diff = diff_changes(parsed, current)
    warns = usage_warnings(parsed, fetch_auto_ai_users(db_url, projects))

    rows = "".join(
        f"<tr class={d['status']}><td>{html.escape(d['project'])}</td>"
        f"<td>{html.escape(d['period_key'])}</td><td>{html.escape(d['field'])}</td>"
        f"<td>{html.escape(str(d['old']))}</td><td>{html.escape(str(d['new']))}</td>"
        f"<td>{d['status']}</td></tr>"
        for d in diff)
    warn_html = ("<ul style='color:#b00'>" +
                 "".join(f"<li>{html.escape(w)}</li>" for w in warns) + "</ul>"
                 if warns else "")
    payload = html.escape(json.dumps(parsed))
    return f"""<!doctype html><meta charset="utf-8"><title>Preview import</title>
<h2>Preview — {len(diff)} manual value(s)</h2>{warn_html}
<table border=1 cellpadding=4><tr><th>Project</th><th>Period</th><th>Field</th>
<th>Old</th><th>New</th><th>Status</th></tr>{rows}</table>
<form action="/import/commit" method="post">
  <input type="hidden" name="changes" value="{payload}">
  <input type="hidden" name="token" value="{html.escape(token or '')}">
  <button type="submit">Confirm &amp; import</button>
</form>"""
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_exporter_import.py -k preview -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add exporter/app.py tests/test_exporter_import.py
git commit -m "feat: POST /import/preview — parse, diff vs DB, render confirm page"
```

---

## Task 6: POST /import/commit — write confirmed changes

**Files:**
- Modify: `exporter/app.py`
- Test: `tests/test_exporter_import.py`

**Interfaces:**
- Consumes: `collector.db.upsert_manual_input`.
- Produces: `POST /import/commit` (form `changes` JSON, optional `token`) → writes each change with `entered_by="excel-import"`, returns an HTML success summary (count written). Returns 400 on malformed `changes` JSON.

- [ ] **Step 1: Write the failing test**

Add to `tests/test_exporter_import.py`:

```python
def test_commit_writes_each_change(client, monkeypatch):
    c, app_module = client
    written = []
    monkeypatch.setattr(app_module, "upsert_manual_input",
                        lambda db, project, period, field, value, by: written.append(
                            (project, period, field, value, by)))
    changes = json.dumps([
        {"project": "Future", "period_key": "2026-06", "field": "total_engineers", "value": "19"},
        {"project": "Future", "period_key": "2026-Q3", "field": "g1_agents_md", "value": "Yes"},
    ])
    r = c.post("/import/commit", data={"changes": changes})
    assert r.status_code == 200
    assert len(written) == 2
    assert ("Future", "2026-06", "total_engineers", "19", "excel-import") in written
    assert "2" in r.text  # summary count


def test_commit_rejects_bad_json(client):
    c, _ = client
    r = c.post("/import/commit", data={"changes": "not json"})
    assert r.status_code == 400
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_exporter_import.py -k commit -v`
Expected: the write test FAILs (route missing); the earlier `test_token_guard_rejects_when_set` still passes.

- [ ] **Step 3: Implement the commit route**

In `exporter/app.py`, add the import:

```python
from collector.db import upsert_manual_input
```

Add the route:

```python
@app.post("/import/commit", response_class=HTMLResponse)
def import_commit(changes: str = Form(...), token: str | None = Form(default=None)) -> str:
    _check_token(token)
    try:
        rows = json.loads(changes)
    except json.JSONDecodeError:
        raise HTTPException(400, "malformed changes payload")
    db_url = os.environ["REPORTING_DB_URL"]
    for c in rows:
        upsert_manual_input(db_url, c["project"], c["period_key"],
                            c["field"], c["value"], "excel-import")
    return (f"<!doctype html><meta charset='utf-8'><title>Imported</title>"
            f"<h2>Imported {len(rows)} manual value(s).</h2>"
            f"<p><a href='/import'>Import another</a></p>")
```

Note: `_check_token` runs before the JSON parse, so with `IMPORT_TOKEN` set and no token the route 401s regardless of payload (that's what `test_token_guard_rejects_when_set` from Task 4 asserts — keep it passing).

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_exporter_import.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add exporter/app.py tests/test_exporter_import.py
git commit -m "feat: POST /import/commit — write confirmed manual values (excel-import)"
```

---

## Task 7: full suite + local end-to-end round-trip

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `pytest -q`
Expected: all pass (Plan 1's DB tests + the new importer/app tests).

- [ ] **Step 2: Local end-to-end against the running stack**

Bring the local stack up (Plan 1 seed already loads Future/TeacherZone):
```bash
docker compose -f infra/docker/compose.local.yml up -d --build
sleep 10
```
Download, tweak, re-upload — confirm the value lands:
```bash
# download the Future workbook the exporter serves
curl -s "http://localhost:3031/export.xlsx?project=Future" -o /tmp/future.xlsx
# (open in Excel/LibreOffice, set Monthly col E for a month to a new team size, save)
# then:
curl -s -F "file=@/tmp/future.xlsx" http://localhost:3031/import/preview | grep -i "total_engineers" || echo "no diff (edit the file first)"
```
Expected: `/import` form loads at `http://localhost:3031/import`; a preview of an edited workbook shows the changed `total_engineers` row; confirming writes it (verify with `docker exec ai-sdlc-metrics-local-db psql -U reporting -d reporting -c "SELECT * FROM reporting.manual_inputs WHERE entered_by='excel-import';"`).

- [ ] **Step 3: Tear down**

```bash
docker compose -f infra/docker/compose.local.yml down
```

- [ ] **Step 4: Commit any tuning**

```bash
git add -A && git commit -m "chore: exporter import local round-trip verification" || echo "nothing to commit"
```

---

## Self-Review

- **Spec coverage:** download→fill→upload→diff-preview→confirm→write ✓ (Tasks 4–6); import only manual cells ✓ (Task 1, uses `SHEET3_MANUAL_COLS`/`SHEET4_FIELDS` only); data-quality >100% guard at input ✓ (Task 3); writes to `manual_inputs` via existing helper ✓ (Task 6); optional auth ✓ (Task 4). Views recompute automatically once `manual_inputs` is written (Plan 1) — no extra step.
- **Placeholder scan:** none — every step has full code.
- **Type consistency:** `parse_manual_inputs` returns `list[dict]` with keys project/period_key/field/value; `diff_changes` consumes that + `fetch_manual`'s `dict[(project,period_key)]->dict`; `import_commit` reads the same dict keys from JSON. `fetch_auto_ai_users` returns `dict[(project,month)]->float`, consumed by `usage_warnings`.
- **Deferred to Plan 3:** nothing here depends on the dashboards; the exporter continues to serve `/export.xlsx` unchanged.
