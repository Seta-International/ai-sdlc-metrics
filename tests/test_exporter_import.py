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
