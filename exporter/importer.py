"""Reverse of exporter.workbook.fill_workbook: read ONLY the manual cells a PM
fills (Monthly E/O/P/S + all Quarterly flag columns) back out of an uploaded
workbook. Auto-collected columns are never read — the collector owns those."""
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


def diff_changes(parsed: list[dict], current: dict) -> list[dict]:
    """Classify each parsed manual value as new/changed/unchanged vs `current`
    (the dict[(project, period_key)] -> dict[field] -> value shape returned
    by exporter.data.fetch_manual)."""
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


def usage_warnings(parsed: list[dict], auto_ai_users: dict) -> list[str]:
    """Flag imported total_engineers values that would push AI usage over 100%
    for that project/month, or aren't numeric (the P5 guard at capture time)."""
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
