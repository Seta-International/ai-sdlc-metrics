"""AI SDLC maturity workbook exporter — serves the filled English template.

  uvicorn exporter.app:app --host 0.0.0.0 --port 8000
"""
import io
import os
from fastapi import FastAPI, HTTPException, Response
from exporter.data import fetch_manual, fetch_period_rows, fetch_projects
from exporter.template import build_workbook
from exporter.workbook import (
    fill_workbook, months_overlapped, parse_sprint_range, sprint_in_range,
)

app = FastAPI(title="AI SDLC Maturity Exporter")

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

    wb = fill_workbook(build_workbook(), projects, sprint_rows, month_rows, manual)
    buf = io.BytesIO()
    wb.save(buf)
    name = f"ai-sdlc-maturity_{project}_{sprints or 'all'}.xlsx"
    return Response(buf.getvalue(), media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
