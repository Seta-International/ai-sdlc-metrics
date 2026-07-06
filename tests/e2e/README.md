# End-to-end dashboard smoke test

`dashboard_selftest.py` logs into a running Grafana, walks every provisioned
dashboard, and reports any panel rendering **"No data"** or a query error. It
writes scroll-through screenshots (`selftest_<slug>_NN.png`) for visual review.

Unlike the `pytest` suite (unit tests, mocked, no external services), this needs
the **local stack up** and a headless browser.

```bash
# 1. bring up the local stack (Postgres + Grafana + exporter, seeded)
docker compose -f infra/docker/compose.local.yml up -d --build

# 2. regenerate dashboards if generate.py changed
python infra/grafana/generate.py

# 3. install the browser once, then run the smoke test
pip install playwright && python -m playwright install chromium
python tests/e2e/dashboard_selftest.py --out /tmp
```

Exits non-zero if any panel shows "No data", so it can gate a dashboard change.

**Known limit:** it catches the literal "No data" state. A panel that renders
*blank* without that text — a guarded timeseries (sample size below the floor)
or a misconfigured barchart — is not auto-flagged; check the screenshots. See
the module docstring for flags (`--from/--to`, `--allow`, `--uid`).
