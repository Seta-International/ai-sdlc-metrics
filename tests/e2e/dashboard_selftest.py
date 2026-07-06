#!/usr/bin/env python3
"""Playwright self-test for the generated Grafana dashboards.

Logs into a running Grafana, walks every dashboard (discovered via the API),
scrolls to force the scenes engine to render lazy panels, and reports any panel
that renders "No data" or a query error. Writes a full-page screenshot per
dashboard for eyeballing. Exits non-zero if any unexpected empty panel is found,
so it doubles as a smoke test after `generate.py` or a seed change.

Prereqs (local stack up — see infra/docker/compose.local.yml):
    pip install playwright && python -m playwright install chromium
    python tests/e2e/dashboard_selftest.py

Common flags:
    --base   http://localhost:3030      Grafana base URL
    --user/--password  admin/admin      login
    --from/--to  now-1y / now+30d       dashboard time range (wide enough to
                                         cover seed windows regardless of "now")
    --out    <dir>                       screenshot output dir (default: ./ )
    --allow  "Verdict,Some Panel"        panel titles allowed to be empty
    --uid    ai-sdlc-bod                 only test dashboards whose uid contains this

Detection is scoped to each panel element ([data-viz-panel-key]), so a single
empty panel never taints its neighbours.

Known limit: this flags panels that render the literal "No data" state. A panel
that renders *blank* without that text — a guarded timeseries (n below the
sample floor) or a misconfigured barchart — is NOT auto-flagged; eyeball the
scroll-through screenshots (selftest_<slug>_NN.png) for those.
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

# Per-panel scan: scoped to each panel so no shared-ancestor false positives.
SCAN_JS = r"""
() => [...document.querySelectorAll('[data-viz-panel-key]')].map(el => {
  const h = el.querySelector('[data-testid^="data-testid Panel header"]');
  const title = h ? (h.innerText || '').trim().split('\n')[0] : '(untitled)';
  const body = el.innerText || '';
  return {
    title,
    noData: /\bNo data\b/i.test(body),
    error:  /Panel plugin error|Query error|Datasource .* error/i.test(body),
  };
})
"""


def discover_dashboards(base, user, password, uid_filter):
    """List dashboards via the Grafana search API (preemptive basic auth)."""
    import base64
    cred = base64.b64encode(f"{user}:{password}".encode()).decode()
    req = urllib.request.Request(f"{base}/api/search?type=dash-db",
                                 headers={"Authorization": f"Basic {cred}"})
    with urllib.request.urlopen(req, timeout=15) as r:
        items = json.load(r)
    out = [(d["title"], d["url"], d.get("uid", "")) for d in items]
    if uid_filter:
        out = [d for d in out if uid_filter in d[2] or uid_filter in d[1]]
    return sorted(out)


def scan_dashboard(page, base, url, frm, to, out_dir):
    """Load one dashboard, scroll to render all panels, return per-panel state."""
    q = urllib.parse.urlencode({"from": frm, "to": to, "kiosk": ""})
    page.goto(f"{base}{url}?{q}", wait_until="networkidle")
    time.sleep(4.0)
    seen = {}  # title -> {noData, error}; last observation wins after full scroll
    slug = url.rstrip("/").split("/")[-1] or "dash"
    # Scroll to the bottom in viewport-sized steps. The scenes engine only paints
    # panels near the viewport, so full_page shots come out blank — instead grab a
    # numbered viewport shot at each step, which paints (and thus captures) what's
    # in view. Scanning happens at each step too, for the same reason.
    last_h, shot = -1, 0
    for _ in range(40):
        for panel in page.evaluate(SCAN_JS):
            seen[panel["title"]] = {"noData": panel["noData"], "error": panel["error"]}
        page.screenshot(path=f"{out_dir}/selftest_{slug}_{shot:02d}.png")
        shot += 1
        page.mouse.wheel(0, 950)
        time.sleep(0.5)
        h = page.evaluate("() => window.scrollY")
        if h == last_h:
            break
        last_h = h
    return seen


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="http://localhost:3030")
    ap.add_argument("--user", default="admin")
    ap.add_argument("--password", default="admin")
    ap.add_argument("--from", dest="frm", default="now-1y")
    ap.add_argument("--to", default="now+30d")
    ap.add_argument("--out", default=".")
    ap.add_argument("--allow", default="", help="comma-separated panel titles allowed empty")
    ap.add_argument("--uid", default="", help="only dashboards whose uid/url contains this")
    args = ap.parse_args()
    allow = {t.strip() for t in args.allow.split(",") if t.strip()}

    dashboards = discover_dashboards(args.base, args.user, args.password, args.uid)
    if not dashboards:
        print("No dashboards found — is Grafana up and provisioned?", file=sys.stderr)
        return 2

    results, failures = {}, 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1680, "height": 1400})
        page = ctx.new_page()
        page.goto(f"{args.base}/login", wait_until="networkidle")
        page.fill('input[name="user"]', args.user)
        page.fill('input[name="password"]', args.password)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        time.sleep(1.5)

        for title, url, _uid in dashboards:
            seen = scan_dashboard(page, args.base, url, args.frm, args.to, args.out)
            nodata = sorted(t for t, s in seen.items() if s["noData"] and t not in allow)
            errors = sorted(t for t, s in seen.items() if s["error"])
            results[title] = {"panels": len(seen), "no_data": nodata, "errors": errors}
            failures += len(nodata) + len(errors)
        browser.close()

    print(json.dumps(results, indent=2))
    print(f"\n=== SELF-TEST: {failures} problem panel(s) ===")
    for title, r in results.items():
        ok = not r["no_data"] and not r["errors"]
        print(f"  {'✅' if ok else '❌'} {title}: {r['panels']} panels"
              + (f" | NO DATA: {r['no_data']}" if r["no_data"] else "")
              + (f" | ERRORS: {r['errors']}" if r["errors"] else ""))
    print(f"\nScreenshots written to {args.out}/selftest_*.png")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
