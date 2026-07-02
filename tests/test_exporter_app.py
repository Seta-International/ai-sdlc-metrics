import io
from datetime import date
from decimal import Decimal
import openpyxl
import pytest
from fastapi.testclient import TestClient


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
