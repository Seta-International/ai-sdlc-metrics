# Value-Story Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure dashboards around five value stories (ROI, AI-vs-non-AI cause & effect, delivery health, gated maturity ladder, adoption breadth) and collect the segmented/tool/time-saved metrics they need, with per-project presentation config in `projects.json`.

**Architecture:** New pure calculators in `collector/metrics.py` reuse API payloads the collector already fetches (PR files gain line counts, reviews run for all PRs, two extra Jira fields). Config-free ratios go in `infra/db/views.sql`; config-dependent math ($ savings, maturity CASE) is embedded as literals by `infra/grafana/generate.py`, which becomes a pure renderer over a `defaults`+`overrides` merge of `projects.json`.

**Tech Stack:** Python 3.12, pytest + responses (HTTP mocks), testcontainers Postgres (`test_db.py`/`test_views.py`), Grafana provisioned JSON, GitHub reusable workflows.

**Spec:** `docs/superpowers/specs/2026-07-02-value-story-dashboards-design.md`

## Global Constraints

- Calculators are pure functions returning `None` when there is no data (never 0) — pairs with the NULL-preserving upsert in `collector/db.py`.
- New env config stays **optional** (`JIRA_AI_TOOL_FIELD`, `JIRA_AI_TIME_SAVED_FIELD` already exist as optional in `collector/config.py:37-38` — do not make them required).
- Dashboards are generated only — never hand-edit `infra/grafana/dashboards/*.json`.
- Commits: conventional prefix, e.g. `feat: FUT-XXX segmented lead time` (Jira key when one applies; plumbing/infra commits may omit it).
- `docs/superpowers/` is gitignored — commit plan/spec updates with `git add -f`.
- Run tests from repo root: `pytest tests/test_metrics.py -v` (DB tests need Docker).
- Maturity defaults (from spec): adopted_breadth_pct 50, adopted_ai_pr_pct 30, agentic_pr_pct 10, autonomous_share_pct 50, gate_review_pct 80, gate_test_pct 50. Blended rate default 25 USD/h. Threshold defaults: lead_time_h [72, 168], predictability_pct [80, 60].

---

### Task 1: GitHub client — PR file details and reviews for all PRs

**Files:**
- Modify: `collector/github_client.py:116-119` (`get_pr_files`), add `get_pr_reviews` after `get_pr_commits` (line 100)
- Modify: `collector/collect.py:32-42` (`enrich_prs_with_review_count`) and `collect.py:99-103` (fetch loop)
- Test: `tests/test_github_client.py:119-124`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GitHubClient.get_pr_files(pr_number: int) -> list[dict]` — items `{"filename": str, "additions": int, "deletions": int}` (was `list[str]`). `GitHubClient.get_pr_reviews(pr_number: int) -> list[dict]` — raw review objects (keys used later: `state`, `submitted_at`). `collect.py` module keeps a green suite by mapping details → filename lists inline.

- [ ] **Step 1: Update the failing test**

Replace `test_get_pr_files_returns_paths` (line 119). Mirror the `responses.add` registration style and `_client()` helper already used at the top of `tests/test_github_client.py` (read lines 1–30 for the repo slug in the mock URLs — reuse it verbatim):

```python
@responses.activate
def test_get_pr_files_returns_details():
    responses.add(
        responses.GET, f"{API}/pulls/7/files",
        json=[{"filename": "a.py", "additions": 10, "deletions": 2, "changes": 12},
              {"filename": "b/c.ts", "additions": 1, "deletions": 0, "changes": 1}],
    )
    assert _client().get_pr_files(7) == [
        {"filename": "a.py", "additions": 10, "deletions": 2},
        {"filename": "b/c.ts", "additions": 1, "deletions": 0},
    ]


@responses.activate
def test_get_pr_reviews_returns_reviews():
    responses.add(
        responses.GET, f"{API}/pulls/7/reviews",
        json=[{"state": "APPROVED", "submitted_at": "2026-07-01T10:00:00Z"},
              {"state": "CHANGES_REQUESTED", "submitted_at": "2026-07-01T09:00:00Z"}],
    )
    reviews = _client().get_pr_reviews(7)
    assert [r["state"] for r in reviews] == ["APPROVED", "CHANGES_REQUESTED"]
```

(`API` = whatever base-URL constant/f-string the existing tests use for `https://api.github.com/repos/<owner>/<repo>` — copy the existing test's URL construction exactly.)

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_github_client.py -v -k "pr_files or pr_reviews"`
Expected: FAIL — `get_pr_files` returns strings; `get_pr_reviews` doesn't exist.

- [ ] **Step 3: Implement**

In `collector/github_client.py` replace `get_pr_files` and add `get_pr_reviews`:

```python
    def get_pr_files(self, pr_number: int) -> list[dict]:
        """Changed files on a PR: filename plus line counts (for PR-size metrics)."""
        files = self._paginate(f"/repos/{self._repo}/pulls/{pr_number}/files", {})
        return [{"filename": f["filename"],
                 "additions": f.get("additions", 0),
                 "deletions": f.get("deletions", 0)} for f in files]

    def get_pr_reviews(self, pr_number: int) -> list[dict]:
        """Submitted reviews on a PR (state, submitted_at)."""
        return self._paginate(f"/repos/{self._repo}/pulls/{pr_number}/reviews", {})
```

- [ ] **Step 4: Keep collect.py green (filename mapping + reviews for all PRs)**

In `collector/collect.py`, replace `enrich_prs_with_review_count` (lines 32–42) with:

```python
def set_review_counts(prs: list[dict], pr_reviews: dict[int, list]) -> list[dict]:
    """Adds review_count (approved reviews) to every PR from prefetched reviews."""
    for pr in prs:
        pr["review_count"] = sum(1 for r in pr_reviews.get(pr["number"], [])
                                 if r["state"] == "APPROVED")
    return prs
```

and in `main()` replace lines 99–103 with:

```python
    pr_reviews = {p["number"]: gh.get_pr_reviews(p["number"]) for p in prs}
    prs = set_review_counts(prs, pr_reviews)
    pr_file_details = {p["number"]: gh.get_pr_files(p["number"]) for p in all_prs}
    pr_files = {n: [f["filename"] for f in d] for n, d in pr_file_details.items()}
    agent_numbers = [p["number"] for p in prs
                     if any(l["name"] == "ai-agent" for l in p.get("labels", []))]
    pr_commits = {n: gh.get_pr_commits(n) for n in agent_numbers}
```

(`pr_file_details` and `pr_reviews` are consumed by Task 8; until then only `pr_files` feeds `build_counts` — unchanged shape.)

- [ ] **Step 5: Run full suite**

Run: `pytest tests/test_github_client.py tests/test_collect.py tests/test_metrics.py -v`
Expected: PASS (collect tests untouched — `build_counts` signature unchanged so far).

- [ ] **Step 6: Commit**

```bash
git add collector/github_client.py collector/collect.py tests/test_github_client.py
git commit -m "feat: PR file line counts and reviews for all merged PRs"
```

---

### Task 2: Jira client — extra fields on the closed-issues search

**Files:**
- Modify: `collector/jira_client.py:35-42` (`get_closed_issues`)
- Test: `tests/test_jira_client.py` (after `test_closed_issues_request_assignee_and_resolutiondate`, line 83)

**Interfaces:**
- Produces: `JiraClient.get_closed_issues(since, until, extra_fields: tuple[str, ...] = ()) -> list[dict]` — extra field ids appended to the JQL `fields` param. Existing callers keep working (default empty).

- [ ] **Step 1: Write the failing test**

Mirror the request-inspection style of `test_closed_issues_request_assignee_and_resolutiondate` (read lines 70–92 for the `_jc()` helper and how it asserts on `responses.calls[0].request`):

```python
@responses.activate
def test_closed_issues_requests_extra_fields():
    responses.add(responses.GET, f"{BASE}/rest/api/3/search/jql",
                  json={"issues": [], "isLast": True})
    _jc().get_closed_issues(_SINCE, _UNTIL,
                            extra_fields=("customfield_10301", "customfield_10302"))
    fields = responses.calls[0].request.params["fields"]
    assert "customfield_10301" in fields and "customfield_10302" in fields
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_jira_client.py -v -k extra_fields`
Expected: FAIL — unexpected keyword `extra_fields`.

- [ ] **Step 3: Implement**

```python
    def get_closed_issues(self, since: datetime, until: datetime,
                          extra_fields: tuple[str, ...] = ()) -> list[dict]:
        """All issues transitioned to Done in [since, until]."""
        jql = (
            f'project = {self._project} AND status changed to Done '
            f'AFTER "{since.strftime("%Y-%m-%d")}" '
            f'BEFORE "{until.strftime("%Y-%m-%d")}"'
        )
        fields = [self._ai_usage_field, "assignee", "resolutiondate", *extra_fields]
        return self._jql_all(jql, fields)
```

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_jira_client.py -v` — Expected: PASS.

```bash
git add collector/jira_client.py tests/test_jira_client.py
git commit -m "feat: optional extra fields on closed-issues search"
```

---

### Task 3: Metrics — segmented lead time and PR size medians

**Files:**
- Modify: `collector/metrics.py` (add after `lead_time_hours`, line 97)
- Test: `tests/test_metrics.py`

**Interfaces:**
- Consumes: `lead_time_hours(prs, deploy_times)` (metrics.py:81), `_is_ai_pr` (metrics.py:17), the `pr()` test helper (test_metrics.py:11).
- Produces: `segmented_lead_time(prs: list[dict], deploy_times: list[datetime]) -> dict` with keys `lead_time_ai_h`, `lead_time_nonai_h` (float | None). `pr_size_medians(prs: list[dict], pr_file_details: dict[int, list[dict]]) -> dict` with keys `pr_size_ai`, `pr_size_nonai` (float | None) — `pr_file_details` items are the Task 1 dicts.

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_metrics.py` (extend the import at the top with `segmented_lead_time, pr_size_medians`):

```python
# segmented_lead_time
def test_segmented_lead_time_splits_by_ai_label():
    prs = [pr(["ai-assisted"], created="2026-07-01T08:00:00Z", merged="2026-07-01T10:00:00Z"),
           pr(number=2, created="2026-07-01T08:00:00Z", merged="2026-07-01T18:00:00Z")]
    s = segmented_lead_time(prs, [])   # no deploys -> open->merge fallback
    assert s == {"lead_time_ai_h": 2.0, "lead_time_nonai_h": 10.0}


def test_segmented_lead_time_none_for_empty_segment():
    s = segmented_lead_time([pr(["ai-assisted"], created="2026-07-01T08:00:00Z",
                                merged="2026-07-01T10:00:00Z")], [])
    assert s["lead_time_ai_h"] == 2.0 and s["lead_time_nonai_h"] is None


# pr_size_medians
def test_pr_size_medians_by_segment():
    prs = [pr(["ai-assisted"], number=1), pr(["ai-agent"], number=2), pr(number=3)]
    details = {1: [{"filename": "a.py", "additions": 100, "deletions": 20}],
               2: [{"filename": "b.py", "additions": 10, "deletions": 0}],
               3: [{"filename": "c.py", "additions": 40, "deletions": 10}]}
    s = pr_size_medians(prs, details)
    assert s == {"pr_size_ai": 65.0, "pr_size_nonai": 50.0}  # median(120,10)=65


def test_pr_size_medians_none_without_details():
    assert pr_size_medians([pr()], {}) == {"pr_size_ai": None, "pr_size_nonai": None}
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_metrics.py -v -k "segmented or pr_size"`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement in `collector/metrics.py`**

```python
def segmented_lead_time(prs: list[dict], deploy_times: list[datetime]) -> dict:
    """Lead time split by AI usage — the within-team AI-vs-non-AI comparison."""
    return {
        "lead_time_ai_h": lead_time_hours([p for p in prs if _is_ai_pr(p)], deploy_times),
        "lead_time_nonai_h": lead_time_hours([p for p in prs if not _is_ai_pr(p)], deploy_times),
    }


def pr_size_medians(prs: list[dict], pr_file_details: dict[int, list[dict]]) -> dict:
    """Median lines changed (additions + deletions) per merged PR, per AI segment."""
    def _median(subset: list[dict]):
        sizes = [sum(f["additions"] + f["deletions"] for f in pr_file_details[p["number"]])
                 for p in subset if pr_file_details.get(p["number"])]
        return round(statistics.median(sizes), 1) if sizes else None
    return {"pr_size_ai": _median([p for p in prs if _is_ai_pr(p)]),
            "pr_size_nonai": _median([p for p in prs if not _is_ai_pr(p)])}
```

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_metrics.py -v` — Expected: PASS.

```bash
git add collector/metrics.py tests/test_metrics.py
git commit -m "feat: segmented lead time and PR size medians (AI vs non-AI)"
```

---

### Task 4: Metrics — rework attribution to AI culprits

**Files:**
- Modify: `collector/metrics.py:120-146` (`rework_pr_count` → `rework_counts`)
- Test: `tests/test_metrics.py` (rework tests, currently lines ~96-131)

**Interfaces:**
- Consumes: `_is_integration_pr`, `_is_fix_pr`, `_is_ai_pr`, `_dt`.
- Produces: `rework_counts(window_prs, all_prs, pr_files: dict[int, list[str]]) -> dict` with keys `rework_prs` (int) and `rework_from_ai_prs` (int — culprit PR was AI-labeled; reverts stay unattributed). Replaces `rework_pr_count`; Task 8 updates the `collect.py` import.

- [ ] **Step 1: Update existing tests + add attribution tests**

In `tests/test_metrics.py`, change the import from `rework_pr_count` to `rework_counts` and update every existing rework assertion from `== n` to `== {"rework_prs": n, "rework_from_ai_prs": m}`:

```python
def test_rework_fix_overlapping_recent_feature():
    p_old = pr(number=1, merged="2026-06-25T10:00:00Z")
    p_fix = pr(number=2, title="fix: app crash", branch="fix/app-crash",
               merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py", "README.md"]}
    assert rework_counts([p_fix], [p_old, p_fix], files) == \
        {"rework_prs": 1, "rework_from_ai_prs": 0}


def test_rework_attributes_ai_culprit():
    p_old = pr(["ai-assisted"], number=1, merged="2026-06-25T10:00:00Z")
    p_fix = pr(number=2, title="fix: app crash", branch="fix/app-crash",
               merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py"]}
    assert rework_counts([p_fix], [p_old, p_fix], files) == \
        {"rework_prs": 1, "rework_from_ai_prs": 1}


def test_rework_reverts_counted_but_unattributed():
    p = pr(number=3, title="Revert \"feat: x\"", branch="revert-3-feat-x",
           merged="2026-07-02T10:00:00Z")
    assert rework_counts([p], [p], {3: []}) == \
        {"rework_prs": 1, "rework_from_ai_prs": 0}
```

(Apply the same `== {"rework_prs": N, "rework_from_ai_prs": 0}` rewrite to `test_rework_ignores_feature_next_to_feature`, `test_rework_ignores_fix_of_old_code`, `test_rework_ignores_integration_prs_on_both_sides` — all expect `{"rework_prs": 0, "rework_from_ai_prs": 0}`.)

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_metrics.py -v -k rework`
Expected: FAIL with ImportError (`rework_counts`).

- [ ] **Step 3: Implement**

Replace `rework_pr_count` with (same body, plus attribution — keep the docstring's framework note):

```python
def rework_counts(window_prs: list[dict], all_prs: list[dict],
                  pr_files: dict[int, list[str]]) -> dict:
    """PRs in the window that redo recent work (framework C1): reverts, plus
    fix/bugfix/hotfix PRs touching a file changed by a different non-fix PR
    merged in the prior 14 days. rework_from_ai_prs = subset whose matched
    culprit PR was AI-labeled (reverts have no file match — unattributed)."""
    count = from_ai = 0
    for p in window_prs:
        if _is_integration_pr(p):
            continue
        if p["title"].lower().startswith("revert"):
            count += 1
            continue
        if not _is_fix_pr(p):
            continue
        merged = _dt(p["merged_at"])
        touched = set(pr_files.get(p["number"], []))
        for q in all_prs:
            if (q["number"] == p["number"] or not q.get("merged_at")
                    or _is_integration_pr(q) or _is_fix_pr(q)):
                continue
            q_merged = _dt(q["merged_at"])
            if (merged - timedelta(days=14) <= q_merged < merged
                    and touched & set(pr_files.get(q["number"], []))):
                count += 1
                if _is_ai_pr(q):
                    from_ai += 1
                break
    return {"rework_prs": count, "rework_from_ai_prs": from_ai}
```

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_metrics.py -v` — Expected: PASS (collect.py still imports `rework_pr_count` — Task 8 fixes that; `pytest tests/test_collect.py` will fail on import until then, so run only `test_metrics.py` here **or** add a temporary alias `rework_pr_count = rework_counts` — do NOT: instead update the `collect.py` import line 21–24 to `rework_counts` now and change `build_counts` line 58 from `"rework_prs": rework_pr_count(prs, all_prs, pr_files),` to `**rework_counts(prs, all_prs, pr_files),` so the whole suite stays green).

Run: `pytest -v --ignore=tests/test_db.py --ignore=tests/test_views.py` — Expected: PASS.

```bash
git add collector/metrics.py collector/collect.py tests/test_metrics.py
git commit -m "feat: attribute rework to AI-labeled culprit PRs"
```

---

### Task 5: Metrics — review timing and review rounds per segment

**Files:**
- Modify: `collector/metrics.py`
- Test: `tests/test_metrics.py`

**Interfaces:**
- Consumes: `pr_reviews: dict[int, list[dict]]` from Task 1 (review objects with `state`, `submitted_at`).
- Produces: `review_metrics(prs: list[dict], pr_reviews: dict[int, list]) -> dict` with keys `first_review_ai_h`, `first_review_nonai_h` (median hours PR created → first submitted review; None when no reviews) and `review_rounds_ai`, `review_rounds_nonai` (mean CHANGES_REQUESTED reviews per PR; None when the segment is empty).

- [ ] **Step 1: Write the failing tests**

```python
# review_metrics
def _rev(state, at):
    return {"state": state, "submitted_at": at}


def test_review_metrics_by_segment():
    prs = [pr(["ai-assisted"], number=1, created="2026-07-01T08:00:00Z"),
           pr(number=2, created="2026-07-01T08:00:00Z")]
    reviews = {1: [_rev("CHANGES_REQUESTED", "2026-07-01T10:00:00Z"),
                   _rev("APPROVED", "2026-07-01T12:00:00Z")],
               2: [_rev("APPROVED", "2026-07-01T09:00:00Z")]}
    m = review_metrics(prs, reviews)
    assert m == {"first_review_ai_h": 2.0, "first_review_nonai_h": 1.0,
                 "review_rounds_ai": 1.0, "review_rounds_nonai": 0.0}


def test_review_metrics_none_without_reviews_or_segment():
    m = review_metrics([pr(["ai-assisted"], number=1)], {})
    assert m["first_review_ai_h"] is None and m["first_review_nonai_h"] is None
    assert m["review_rounds_ai"] == 0.0 and m["review_rounds_nonai"] is None
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_metrics.py -v -k review_metrics` — Expected: FAIL (ImportError).

- [ ] **Step 3: Implement**

```python
def review_metrics(prs: list[dict], pr_reviews: dict[int, list]) -> dict:
    """Verification burden per AI segment: hours to first review (median) and
    CHANGES_REQUESTED rounds per PR (mean)."""
    def _first_review_h(subset: list[dict]):
        spans = []
        for p in subset:
            submitted = sorted(_dt(r["submitted_at"]) for r in pr_reviews.get(p["number"], [])
                               if r.get("submitted_at"))
            if submitted and p.get("created_at"):
                spans.append((submitted[0] - _dt(p["created_at"])).total_seconds() / 3600)
        return round(statistics.median(spans), 2) if spans else None

    def _rounds(subset: list[dict]):
        if not subset:
            return None
        per_pr = [sum(1 for r in pr_reviews.get(p["number"], [])
                      if r["state"] == "CHANGES_REQUESTED") for p in subset]
        return round(statistics.mean(per_pr), 2)

    ai = [p for p in prs if _is_ai_pr(p)]
    nonai = [p for p in prs if not _is_ai_pr(p)]
    return {"first_review_ai_h": _first_review_h(ai),
            "first_review_nonai_h": _first_review_h(nonai),
            "review_rounds_ai": _rounds(ai),
            "review_rounds_nonai": _rounds(nonai)}
```

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_metrics.py -v` — Expected: PASS.

```bash
git add collector/metrics.py tests/test_metrics.py
git commit -m "feat: first-review timing and review rounds per AI segment"
```

---

### Task 6: Metrics — AI PRs with tests (verification-depth signal)

**Files:**
- Modify: `collector/metrics.py` (also add `import fnmatch` at top)
- Test: `tests/test_metrics.py`

**Interfaces:**
- Consumes: `pr_files: dict[int, list[str]]` (filename lists).
- Produces: `ai_prs_with_tests(prs, pr_files) -> Optional[int]` — count of AI-labeled PRs touching ≥1 test file; None when there are no AI PRs. Feeds the maturity gate ratio `ai_pr_test_pct` (Task 9).

- [ ] **Step 1: Write the failing tests**

```python
# ai_prs_with_tests
def test_ai_prs_with_tests_heuristic():
    prs = [pr(["ai-assisted"], number=1), pr(["ai-agent"], number=2),
           pr(["ai-assisted"], number=3), pr(number=4)]
    files = {1: ["src/app.py", "tests/test_app.py"],       # tests/ dir
             2: ["src/Button.tsx", "src/Button.spec.tsx"], # *.spec.*
             3: ["src/app.py"],                             # no tests
             4: ["tests/test_x.py"]}                        # non-AI: ignored
    assert ai_prs_with_tests(prs, files) == 2


def test_ai_prs_with_tests_none_without_ai_prs():
    assert ai_prs_with_tests([pr()], {1: ["tests/test_app.py"]}) is None
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_metrics.py -v -k with_tests` — Expected: FAIL (ImportError).

- [ ] **Step 3: Implement**

```python
_TEST_DIRS = {"tests", "test", "__tests__", "spec", "specs"}
_TEST_FILE_PATTERNS = ("test_*.py", "*_test.py", "*_test.go", "*.test.*", "*.spec.*")


def _is_test_file(path: str) -> bool:
    parts = path.lower().split("/")
    if any(d in _TEST_DIRS for d in parts[:-1]):
        return True
    return any(fnmatch.fnmatch(parts[-1], pat) for pat in _TEST_FILE_PATTERNS)


def ai_prs_with_tests(prs: list[dict], pr_files: dict[int, list[str]]) -> Optional[int]:
    """AI-labeled PRs whose diff touches at least one test file."""
    ai = [p for p in prs if _is_ai_pr(p)]
    if not ai:
        return None
    return sum(1 for p in ai
               if any(_is_test_file(f) for f in pr_files.get(p["number"], [])))
```

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_metrics.py -v` — Expected: PASS.

```bash
git add collector/metrics.py tests/test_metrics.py
git commit -m "feat: count AI PRs that include test changes"
```

---

### Task 7: Metrics — time saved and tasks by AI tool (Jira)

**Files:**
- Modify: `collector/metrics.py` (also add `import re` at top)
- Test: `tests/test_metrics.py`

**Interfaces:**
- Consumes: Jira issue dicts (the `issue()` test helper); tool field values may be a Jira option dict `{"value": "Claude Code"}`, a list of them (multi-select), or a plain string; time-saved is a number field.
- Produces: `ai_time_saved_hours(issues, field: str | None) -> Optional[float]` and `ai_tasks_by_tool(issues, field: str | None) -> dict[str, int]` with keys like `ai_tasks_tool_claude_code` (empty dict when field unset/no data).

- [ ] **Step 1: Write the failing tests**

```python
# ai_time_saved_hours / ai_tasks_by_tool
TOOL_FIELD, SAVED_FIELD = "customfield_10301", "customfield_10302"


def jissue(extra_fields):
    base = issue("Assisted")
    base["fields"].update(extra_fields)
    return base


def test_ai_time_saved_sums_hours():
    issues = [jissue({SAVED_FIELD: 2.5}), jissue({SAVED_FIELD: 4}),
              jissue({SAVED_FIELD: None})]
    assert ai_time_saved_hours(issues, SAVED_FIELD) == 6.5


def test_ai_time_saved_none_when_unset_or_empty():
    assert ai_time_saved_hours([jissue({})], SAVED_FIELD) is None
    assert ai_time_saved_hours([jissue({SAVED_FIELD: 3})], None) is None


def test_ai_tasks_by_tool_normalizes_slugs():
    issues = [jissue({TOOL_FIELD: {"value": "Claude Code"}}),
              jissue({TOOL_FIELD: {"value": "Claude Code"}}),
              jissue({TOOL_FIELD: [{"value": "GitHub Copilot"}, {"value": "Cursor"}]}),
              jissue({TOOL_FIELD: None})]
    assert ai_tasks_by_tool(issues, TOOL_FIELD) == {
        "ai_tasks_tool_claude_code": 2,
        "ai_tasks_tool_github_copilot": 1,
        "ai_tasks_tool_cursor": 1,
    }


def test_ai_tasks_by_tool_empty_when_field_unset():
    assert ai_tasks_by_tool([jissue({TOOL_FIELD: {"value": "Cursor"}})], None) == {}
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_metrics.py -v -k "time_saved or by_tool"` — Expected: FAIL (ImportError).

- [ ] **Step 3: Implement**

```python
def ai_time_saved_hours(issues: list[dict], field: Optional[str]) -> Optional[float]:
    """Sum of the per-ticket AI time-saved field (hours) — the ROI numerator."""
    if not field:
        return None
    vals = []
    for i in issues:
        v = i["fields"].get(field)
        if v is not None:
            try:
                vals.append(float(v))
            except (TypeError, ValueError):
                pass
    return round(sum(vals), 2) if vals else None


def _tool_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def ai_tasks_by_tool(issues: list[dict], field: Optional[str]) -> dict[str, int]:
    """Done tasks per AI tool: dynamic metric keys ai_tasks_tool_<slug>."""
    if not field:
        return {}
    counts: dict[str, int] = {}
    for i in issues:
        raw = i["fields"].get(field)
        options = raw if isinstance(raw, list) else [raw] if raw else []
        for opt in options:
            name = opt.get("value") if isinstance(opt, dict) else opt
            if name:
                key = f"ai_tasks_tool_{_tool_slug(str(name))}"
                counts[key] = counts.get(key, 0) + 1
    return counts
```

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_metrics.py -v` — Expected: PASS.

```bash
git add collector/metrics.py tests/test_metrics.py
git commit -m "feat: aggregate AI time saved and tasks per tool from Jira"
```

---

### Task 8: collect.py — assemble the new counts

**Files:**
- Modify: `collector/collect.py` (imports, `build_counts`, `main`)
- Test: `tests/test_collect.py`

**Interfaces:**
- Consumes: every calculator from Tasks 3–7; `pr_file_details`/`pr_reviews` from Task 1; `get_closed_issues(..., extra_fields=...)` from Task 2; `JIRA_AI_TOOL_FIELD`, `JIRA_AI_TIME_SAVED_FIELD` from `collector/config.py:37-38`.
- Produces: `build_counts(window, prs, all_prs, pr_files, deploy_times, code_alerts, secret_alerts, issues, incidents, field, sprint_issue_counts, pr_commits=None, pr_file_details=None, pr_reviews=None, tool_field=None, time_saved_field=None) -> dict` — existing positional args unchanged (test back-compat), new ones keyword-only with safe defaults.

- [ ] **Step 1: Extend the failing test**

Add to `tests/test_collect.py`:

```python
def test_build_counts_includes_segmented_and_jira_metrics():
    prs = [pr(1, ["ai-assisted"]), pr(2)]
    issues = [{"fields": {FIELD: {"value": "Assisted"},
                          "assignee": {"accountId": "a"},
                          "resolutiondate": "2026-07-01T12:00:00Z",
                          "customfield_10301": {"value": "Claude Code"},
                          "customfield_10302": 3.0}}]
    counts = build_counts(
        window=W, prs=prs, all_prs=prs, pr_files={1: ["tests/test_a.py"], 2: ["b.py"]},
        deploy_times=[], code_alerts=[], secret_alerts=[],
        issues=issues, incidents=[], field=FIELD, sprint_issue_counts=None,
        pr_file_details={1: [{"filename": "tests/test_a.py", "additions": 5, "deletions": 1}],
                         2: [{"filename": "b.py", "additions": 30, "deletions": 0}]},
        pr_reviews={1: [{"state": "APPROVED", "submitted_at": "2026-07-01T09:00:00Z"}]},
        tool_field="customfield_10301", time_saved_field="customfield_10302",
    )
    assert counts["lead_time_ai_h"] == 2.0 and counts["lead_time_nonai_h"] == 2.0
    assert counts["rework_from_ai_prs"] == 0
    assert counts["ai_prs_with_tests"] == 1
    assert counts["pr_size_ai"] == 6.0 and counts["pr_size_nonai"] == 30.0
    assert counts["first_review_ai_h"] == 1.0 and counts["review_rounds_ai"] == 0.0
    assert counts["ai_time_saved_h"] == 3.0
    assert counts["ai_tasks_tool_claude_code"] == 1


def test_build_counts_backward_compatible_without_new_args():
    counts = build_counts(
        window=W, prs=[], all_prs=[], pr_files={}, deploy_times=[],
        code_alerts=[], secret_alerts=[], issues=[], incidents=[],
        field=FIELD, sprint_issue_counts=None,
    )
    assert counts["ai_time_saved_h"] is None
    assert "ai_tasks_tool_claude_code" not in counts
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_collect.py -v` — Expected: new tests FAIL (unexpected keyword args).

- [ ] **Step 3: Implement**

Update the `collector.metrics` import in `collect.py` to:

```python
from collector.metrics import (
    adoption_counts, ai_users_weekly_avg, delivery_counts, lead_time_hours,
    rework_counts, quality_counts, agent_counts, segmented_lead_time,
    pr_size_medians, review_metrics, ai_prs_with_tests, ai_time_saved_hours,
    ai_tasks_by_tool,
)
```

extend the config import with `JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD`, and replace `build_counts`:

```python
def build_counts(window: Window, prs: list[dict], all_prs: list[dict],
                 pr_files: dict[int, list[str]], deploy_times: list[datetime],
                 code_alerts: list[dict], secret_alerts: list[dict],
                 issues: list[dict], incidents: list[dict], field: str,
                 sprint_issue_counts: tuple[int, int] | None,
                 pr_commits: dict[int, list] | None = None,
                 pr_file_details: dict[int, list[dict]] | None = None,
                 pr_reviews: dict[int, list] | None = None,
                 tool_field: str | None = None,
                 time_saved_field: str | None = None) -> dict:
    """Pure assembly of all raw counts for one window. No IO."""
    counts = {
        **adoption_counts(prs, issues, field),
        **delivery_counts(deploy_times, incidents, window.weeks),
        **quality_counts(prs, code_alerts, secret_alerts),
        **agent_counts(prs, pr_commits or {}),
        **rework_counts(prs, all_prs, pr_files),
        **segmented_lead_time(prs, deploy_times),
        **pr_size_medians(prs, pr_file_details or {}),
        **review_metrics(prs, pr_reviews or {}),
        **ai_tasks_by_tool(issues, tool_field),
        "lead_time_h": lead_time_hours(prs, deploy_times),
        "ai_prs_with_tests": ai_prs_with_tests(prs, pr_files),
        "ai_time_saved_h": ai_time_saved_hours(issues, time_saved_field),
        "ai_users_weekly_avg": ai_users_weekly_avg(prs, issues, field, window.since, window.until),
    }
    if sprint_issue_counts is not None:
        counts["sprint_committed"], counts["sprint_completed"] = sprint_issue_counts
    return counts
```

In `main()`: build `extra_fields = tuple(f for f in (JIRA_AI_TOOL_FIELD, JIRA_AI_TIME_SAVED_FIELD) if f)`, pass it to `jira.get_closed_issues(window.since, window.until, extra_fields=extra_fields)`, and pass `pr_file_details=pr_file_details, pr_reviews=pr_reviews, tool_field=JIRA_AI_TOOL_FIELD, time_saved_field=JIRA_AI_TIME_SAVED_FIELD` to `build_counts`.

- [ ] **Step 4: Run the full non-Docker suite and commit**

Run: `pytest -v --ignore=tests/test_db.py --ignore=tests/test_views.py` — Expected: PASS.

```bash
git add collector/collect.py tests/test_collect.py
git commit -m "feat: collect segmented, tool, and time-saved metrics"
```

---

### Task 9: Views — new wide columns and config-free ratios

**Files:**
- Modify: `infra/db/views.sql`
- Test: `tests/test_views.py` (needs Docker)

**Interfaces:**
- Produces (in `reporting.metrics_wide`): `lead_time_ai_h`, `lead_time_nonai_h`, `rework_from_ai_prs`, `ai_time_saved_h`, `ai_prs_with_tests`, `pr_size_ai`, `pr_size_nonai`, `first_review_ai_h`, `first_review_nonai_h`, `review_rounds_ai`, `review_rounds_nonai`.
- Produces (in `reporting.metrics_ratios`): `agent_pr_pct`, `throughput_per_engineer`, `lead_time_ai_delta_pct`, `ai_pr_test_pct`, `rework_from_ai_pct`. (Breadth = existing `usage_rate_pct`; autonomous share = existing `autonomy_pct`; CFR = existing `cfr_pct`.)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_views.py`:

```python
def test_new_story_ratios(pg_url):
    upsert_counts(pg_url, "P-Story", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13), {
        "total_prs": 10, "ai_prs": 4, "agent_prs_total": 2, "total_tasks": 24,
        "engineers_active": 6, "lead_time_ai_h": 12.0, "lead_time_nonai_h": 24.0,
        "rework_prs": 4, "rework_from_ai_prs": 1,
        "ai_prs_with_tests": 3, "ai_time_saved_h": 40.0,
        "pr_size_ai": 120.0, "first_review_ai_h": 2.0, "review_rounds_ai": 0.5,
    })
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT agent_pr_pct, throughput_per_engineer, lead_time_ai_delta_pct,
                   ai_pr_test_pct, rework_from_ai_pct, ai_time_saved_h, pr_size_ai
            FROM reporting.metrics_ratios
            WHERE project = 'P-Story' AND period_key = 'S1'
        """)
        row = cur.fetchone()
    assert [round(float(v), 2) for v in row] == \
        [20.0, 4.0, 50.0, 75.0, 25.0, 40.0, 120.0]


def test_new_ratios_null_safe(pg_url):
    upsert_counts(pg_url, "P-Story2", "sprint", "S1", date(2026, 6, 29), date(2026, 7, 13),
                  {"total_prs": 5})
    with psycopg2.connect(pg_url) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT throughput_per_engineer, lead_time_ai_delta_pct, ai_pr_test_pct
            FROM reporting.metrics_ratios WHERE project = 'P-Story2'
        """)
        assert cur.fetchone() == (None, None, None)
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_views.py -v` (Docker required)
Expected: new tests FAIL — columns don't exist.

- [ ] **Step 3: Implement**

In `views.sql` `metrics_wide`, add after the `sprint_completed` line (keep the alignment style):

```sql
  max(value) FILTER (WHERE metric_key = 'lead_time_ai_h')       AS lead_time_ai_h,
  max(value) FILTER (WHERE metric_key = 'lead_time_nonai_h')    AS lead_time_nonai_h,
  max(value) FILTER (WHERE metric_key = 'rework_from_ai_prs')   AS rework_from_ai_prs,
  max(value) FILTER (WHERE metric_key = 'ai_time_saved_h')      AS ai_time_saved_h,
  max(value) FILTER (WHERE metric_key = 'ai_prs_with_tests')    AS ai_prs_with_tests,
  max(value) FILTER (WHERE metric_key = 'pr_size_ai')           AS pr_size_ai,
  max(value) FILTER (WHERE metric_key = 'pr_size_nonai')        AS pr_size_nonai,
  max(value) FILTER (WHERE metric_key = 'first_review_ai_h')    AS first_review_ai_h,
  max(value) FILTER (WHERE metric_key = 'first_review_nonai_h') AS first_review_nonai_h,
  max(value) FILTER (WHERE metric_key = 'review_rounds_ai')     AS review_rounds_ai,
  max(value) FILTER (WHERE metric_key = 'review_rounds_nonai')  AS review_rounds_nonai
```

In `metrics_ratios`, add after `predictability_pct`:

```sql
  100.0 * agent_prs_total      / NULLIF(total_prs, 0)          AS agent_pr_pct,
  total_tasks::numeric         / NULLIF(engineers_active, 0)   AS throughput_per_engineer,
  100.0 * (lead_time_nonai_h - lead_time_ai_h)
                               / NULLIF(lead_time_nonai_h, 0)  AS lead_time_ai_delta_pct,
  100.0 * ai_prs_with_tests    / NULLIF(ai_prs, 0)             AS ai_pr_test_pct,
  100.0 * rework_from_ai_prs   / NULLIF(rework_prs, 0)         AS rework_from_ai_pct
```

(Check how `tests/conftest.py` applies `views.sql` to the testcontainer — it already runs the file, so no fixture change.)

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_views.py tests/test_db.py -v` — Expected: PASS.

```bash
git add infra/db/views.sql tests/test_views.py
git commit -m "feat: story ratios — segmentation, throughput, test coverage"
```

---

### Task 10: Manual input — ai_tool_cost_monthly

**Files:**
- Modify: `collector/manual_input.py:15`
- Test: `tests/test_manual_input.py`

**Interfaces:**
- Produces: canon monthly field `ai_tool_cost_monthly` (numeric USD — seats + API/token spend) accepted by `validate_and_store`.

- [ ] **Step 1: Write the failing test**

Add (mirror the existing validate test style in `tests/test_manual_input.py` — read its helpers first; if it calls `validate_and_store` with a fake db url via monkeypatched `upsert_manual_input`, follow that pattern):

```python
def test_ai_tool_cost_monthly_accepted(monkeypatch):
    stored = []
    monkeypatch.setattr("collector.manual_input.upsert_manual_input",
                        lambda *a, **k: stored.append(a))
    n = validate_and_store("db://x", "Future", "2026-07",
                           ["ai_tool_cost_monthly=1200"], "pm")
    assert n == 1
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_manual_input.py -v -k tool_cost` — Expected: FAIL (`unknown monthly field`).

- [ ] **Step 3: Implement**

```python
MONTHLY_NUMERIC_FIELDS = {"total_engineers", "cost_baseline", "cost_actual",
                          "coverage_ai", "ai_tool_cost_monthly"}
```

- [ ] **Step 4: Run and commit**

Run: `pytest tests/test_manual_input.py -v` — Expected: PASS.

```bash
git add collector/manual_input.py tests/test_manual_input.py
git commit -m "feat: ai_tool_cost_monthly manual input (seats + API spend)"
```

---

### Task 11: projects.json schema + config merge in generate.py

**Files:**
- Modify: `infra/grafana/projects.json`
- Modify: `infra/grafana/generate.py` (add config loader before the `# project` section, line ~161)
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Produces: `projects.json` with `defaults` + per-project `overrides` (schema below). `load_config() -> tuple[str, list[dict]]` in generate.py returning `(exporter_url, cfgs)` where each cfg is the deep merge of defaults + that project's overrides plus `name`/`pm_login`/`pm_email`. `_merge(base: dict, override: dict) -> dict` (nested dicts merge, scalars/lists replace). `_cfg_th(cfg) -> dict` — the TH dict with `lead` and `predictability` rebuilt from `cfg["thresholds"]`. `_maturity_case(cfg) -> str` — SQL CASE returning stage 0–4 from ratios columns with the cfg's maturity thresholds and verification gate.
- Note: `infra/grafana/setup_access.py` reads `projects` entries' `pm_login`/`pm_email` at top level — those stay top level, so it keeps working (`pytest tests/test_setup_access.py` verifies).

- [ ] **Step 1: New projects.json**

```json
{
  "exporter_url": "https://ai-metrics.seta-international.com",
  "defaults": {
    "blended_hourly_rate": 25,
    "has_production": true,
    "sections": ["steering", "roi", "cause_effect", "dora", "maturity", "adoption"],
    "thresholds": {"lead_time_h": [72, 168], "predictability_pct": [80, 60]},
    "maturity": {"adopted_breadth_pct": 50, "adopted_ai_pr_pct": 30,
                 "agentic_pr_pct": 10, "autonomous_share_pct": 50,
                 "gate_review_pct": 80, "gate_test_pct": 50}
  },
  "projects": [
    {"name": "Future", "pm_login": "pm-future",
     "pm_email": "pm-future@seta-international.vn",
     "overrides": {"has_production": false}},
    {"name": "TeacherZone", "pm_login": "pm-teacherzone",
     "pm_email": "pm-teacherzone@seta-international.vn"}
  ],
  "bod_viewers": [
    {"login": "bod-viewer", "email": "bod@seta-international.vn"}
  ]
}
```

- [ ] **Step 2: Write the failing tests**

Add to `tests/test_dashboards.py` (the `_generate(tmp_path)` helper runs generate.py and returns the out dir — reuse it):

```python
def test_future_has_no_production_panels(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    titles = [p.get("title", "") for p in future["panels"]]
    assert "Change Failure Rate" not in titles
    assert "Deploys / Week" not in titles
    assert any("Merge Lead Time" in t for t in titles)


def test_teacherzone_keeps_production_panels(tmp_path):
    out = _generate(tmp_path)
    tz = json.loads((out / "TeacherZone" / "project.json").read_text())
    titles = [p.get("title", "") for p in tz["panels"]]
    assert "Change Failure Rate" in titles


def test_config_literals_embedded_in_sql(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    assert "ai_time_saved_h * 25" in sql          # blended rate literal
    assert ">= 80" in sql and ">= 50" in sql      # maturity gate thresholds
```

- [ ] **Step 3: Run to verify failure**

Run: `pytest tests/test_dashboards.py -v` — Expected: new tests FAIL (old flat layout).

- [ ] **Step 4: Implement the config layer in generate.py**

Add after the `TH` block:

```python
DEFAULTS = {
    "blended_hourly_rate": 25,
    "has_production": True,
    "sections": ["steering", "roi", "cause_effect", "dora", "maturity", "adoption"],
    "thresholds": {"lead_time_h": [72, 168], "predictability_pct": [80, 60]},
    "maturity": {"adopted_breadth_pct": 50, "adopted_ai_pr_pct": 30,
                 "agentic_pr_pct": 10, "autonomous_share_pct": 50,
                 "gate_review_pct": 80, "gate_test_pct": 50},
}


def _merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


def load_config() -> tuple[str, list[dict]]:
    raw = json.loads((HERE / "projects.json").read_text())
    defaults = _merge(DEFAULTS, raw.get("defaults", {}))
    cfgs = []
    for p in raw["projects"]:
        cfg = _merge(defaults, p.get("overrides", {}))
        cfg.update({k: p[k] for k in ("name", "pm_login", "pm_email") if k in p})
        cfgs.append(cfg)
    return raw.get("exporter_url", "http://localhost:3031"), cfgs


def _cfg_th(cfg: dict) -> dict:
    t = cfg["thresholds"]
    lead_w, lead_c = t["lead_time_h"]
    pred_g, pred_w = t["predictability_pct"]
    th = dict(TH)
    th["lead"] = _th(GOOD, (lead_w, WARN), (lead_c, CRIT))
    th["predictability"] = _th(SERIOUS, (pred_w, WARN), (pred_g, GOOD))
    return th


def _maturity_case(cfg: dict) -> str:
    m = cfg["maturity"]
    assisted = "(COALESCE(ai_tasks, 0) > 0 OR COALESCE(ai_prs, 0) > 0)"
    adopted = (f"(COALESCE(usage_rate_pct, 0) >= {m['adopted_breadth_pct']} "
               f"AND COALESCE(ai_pr_pct, 0) >= {m['adopted_ai_pr_pct']})")
    gate = (f"(COALESCE(ai_pr_review_pct, 0) >= {m['gate_review_pct']} "
            f"AND COALESCE(ai_pr_test_pct, 0) >= {m['gate_test_pct']})")
    agentic = f"(COALESCE(agent_pr_pct, 0) >= {m['agentic_pr_pct']} AND {gate})"
    autonomous = f"(COALESCE(autonomy_pct, 0) >= {m['autonomous_share_pct']} AND {gate})"
    return ("CASE "
            f"WHEN {assisted} AND {adopted} AND {agentic} AND {autonomous} THEN 4 "
            f"WHEN {assisted} AND {adopted} AND {agentic} THEN 3 "
            f"WHEN {assisted} AND {adopted} THEN 2 "
            f"WHEN {assisted} THEN 1 ELSE 0 END")
```

Then change `main()` to use `load_config()` and pass each cfg to `build_project_dashboard(cfg, exporter)` / names list to the BOD builder. **This step compiles but tests still fail until Task 12's layout lands — Tasks 11+12 commit together if you prefer; otherwise commit after Step 5 of Task 12.** Recommended: proceed straight into Task 12 and commit both when green.

---

### Task 12: Project dashboard — steering + five story sections

**Files:**
- Modify: `infra/grafana/generate.py` (`build_project_dashboard`, lines 183-340)
- Test: `tests/test_dashboards.py` (Task 11's tests + below)

**Interfaces:**
- Consumes: `load_config`, `_cfg_th`, `_maturity_case` (Task 11); ratios columns (Task 9); manual field `ai_tool_cost_monthly` (Task 10).
- Produces: `build_project_dashboard(cfg: dict, exporter_url: str) -> dict`. Sections rendered only when listed in `cfg["sections"]`; Monthly Record always appended.

- [ ] **Step 1: Add remaining tests**

```python
def test_sections_config_controls_rows(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    rows = [p["title"] for p in future["panels"] if p["type"] == "row"]
    assert rows[0].startswith("Sprint Steering")
    assert any("paying off" in r for r in rows)
    assert any("Monthly Record" in r for r in rows)


def test_tool_breakdown_reads_metric_counts(tmp_path):
    out = _generate(tmp_path)
    future = json.loads((out / "Future" / "project.json").read_text())
    sql = json.dumps(future)
    assert "ai_tasks_tool_" in sql and "metric_counts" in sql
```

- [ ] **Step 2: Rewrite `build_project_dashboard`**

Replace the whole function body. Signature `def build_project_dashboard(cfg: dict, exporter_url: str) -> dict:`; start with `project = cfg["name"]`, `th = _cfg_th(cfg)`, `rate = cfg["blended_hourly_rate"]`, `has_prod = cfg["has_production"]`, and keep `p`, `trend` as today. Section builders (reuse `_stat`, `_spark`, `TH` module constants stay for non-configurable thresholds):

```python
    steering = [
        _stat(project, "Sprint Predictability", "predictability_pct", "percent",
              th["predictability"],
              desc="Completed ÷ committed issues in the Jira sprint."),
        _stat(project, "Lead Time" if has_prod else "Merge Lead Time (no prod env)",
              "lead_time_h", "h", th["lead"]),
        _stat(project, "Incidents", "incidents", th=TH["incidents"], w=4),
        _stat(project, "MTTR", "mttr_h", "h", TH["mttr"], w=4),
        _stat(project, "Rework %", "rework_pct", "percent", TH["rework"], w=4),
    ]

    monthly_roi_sql = (
        f"SELECT w.period_start AS time, w.ai_time_saved_h * {rate} AS \"Savings $\", "
        "t.value::numeric AS \"Tool cost $\" "
        f"FROM {WIDE} w LEFT JOIN {MANUAL} t ON t.project = w.project "
        "AND t.period_key = w.period_key AND t.field = 'ai_tool_cost_monthly' "
        f"WHERE w.{p} AND w.period_type = 'month' ORDER BY w.period_start")
    net_sql = (
        f"SELECT (w.ai_time_saved_h * {rate}) - COALESCE(t.value::numeric, 0) "
        f"FROM {WIDE} w LEFT JOIN {MANUAL} t ON t.project = w.project "
        "AND t.period_key = w.period_key AND t.field = 'ai_tool_cost_monthly' "
        f"WHERE w.{p} AND w.period_type = 'month' AND w.ai_time_saved_h IS NOT NULL "
        "ORDER BY w.period_key DESC LIMIT 1")
    tools_sql = (
        "SELECT replace(metric_key, 'ai_tasks_tool_', '') AS \"Tool\", "
        "value AS \"Tasks\" FROM reporting.metric_counts "
        f"WHERE {p} AND period_type = 'sprint' AND period_key = '$sprint' "
        "AND metric_key LIKE 'ai_tasks_tool_%' ORDER BY value DESC")
    roi = [
        {"kind": "stat", "title": "AI Net $ (latest month)", "sql": net_sql,
         "unit": "currencyUSD", "w": 6, "graph": "none",
         "th": _th(CRIT, (0, GOOD)),
         "desc": f"Hours saved × ${rate}/h blended rate − monthly AI tool cost "
                 "(seats + API). Green when net-positive."},
        _stat(project, "AI Hours Saved", "ai_time_saved_h", "h", w=6,
              desc="Sum of per-ticket 'AI Time Saved' on issues done this sprint."),
        _stat(project, "Throughput / Engineer", "throughput_per_engineer", w=4,
              desc="Tasks done ÷ active engineers — ROI supporting evidence."),
        {"kind": "timeseries", "title": "Savings vs Tool Cost by Month",
         "sql": monthly_roi_sql, "format": "time_series", "unit": "currencyUSD",
         "w": 8, "h": 4},
        {"kind": "barchart", "title": "AI Tasks by Tool ($sprint)", "sql": tools_sql,
         "unit": "none", "w": 8, "h": 6, "color": ACCENT,
         "desc": "Which tool's licenses produce. From the Jira AI Tool field."},
    ]

    cause_effect = [
        {"kind": "timeseries", "title": "Lead Time — AI vs non-AI",
         "sql": ("SELECT period_start AS time, lead_time_ai_h AS \"AI PRs\", "
                 f"lead_time_nonai_h AS \"Non-AI PRs\" {trend}"),
         "format": "time_series", "unit": "h", "w": 8, "h": 8,
         "overrides": [
             {"matcher": {"id": "byName", "options": "AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": ACCENT}}]},
             {"matcher": {"id": "byName", "options": "Non-AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": DEEMPH}}]}],
         "desc": ("Neutral comparison — AI being slower on some work is a "
                  "legitimate finding (verification overhead), not an error.")},
        {"kind": "timeseries", "title": "Hours to First Review — AI vs non-AI",
         "sql": ("SELECT period_start AS time, first_review_ai_h AS \"AI PRs\", "
                 f"first_review_nonai_h AS \"Non-AI PRs\" {trend}"),
         "format": "time_series", "unit": "h", "w": 8, "h": 8,
         "overrides": [
             {"matcher": {"id": "byName", "options": "AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": ACCENT}}]},
             {"matcher": {"id": "byName", "options": "Non-AI PRs"},
              "properties": [{"id": "color", "value": {"mode": "fixed", "fixedColor": DEEMPH}}]}]},
        _stat(project, "PR Size (AI)", "pr_size_ai", w=4, h=4,
              desc="Median lines changed per AI PR."),
        _stat(project, "PR Size (non-AI)", "pr_size_nonai", w=4, h=4),
        _stat(project, "Review Rounds (AI)", "review_rounds_ai", w=4, h=4,
              desc="Mean CHANGES_REQUESTED per AI PR — verification burden."),
        _stat(project, "Rework from AI %", "rework_from_ai_pct", "percent", w=4, h=4,
              desc="Share of rework whose culprit PR was AI-labeled."),
        _stat(project, "AI PR Test %", "ai_pr_test_pct", "percent", w=4, h=4,
              desc="AI PRs touching test files. Maturity gate input."),
        _stat(project, "AI PR Review %", "ai_pr_review_pct", "percent",
              TH["review"], w=4, h=4),
    ]

    dora = [
        _stat(project, "Lead Time" if has_prod else "Merge Lead Time (no prod env)",
              "lead_time_h", "h", th["lead"],
              desc="Median hours from PR merge to next production deploy."
                   if has_prod else "Median PR open→merge; no production env yet."),
        _stat(project, "MTTR", "mttr_h", "h", TH["mttr"]),
    ]
    if has_prod:
        dora[1:1] = [
            _stat(project, "Deploys / Week", "deploys_per_week", "none", TH["deploy_freq"]),
            _stat(project, "Change Failure Rate", "cfr_pct", "percent", TH["cfr"],
                  desc="Incidents per deploy (proxy). Target ≤15%."),
        ]
    dora.append(_stat(project, "Sprint Predictability", "predictability_pct",
                      "percent", th["predictability"]))
```

Keep the existing `agent` list (lines 237-262) as the core of `maturity` and prepend the stage stat:

```python
    maturity = [
        {"kind": "stat", "title": "Maturity Stage (1-4)",
         "sql": _spark(project, _maturity_case(cfg)),
         "format": "time_series", "unit": "none", "w": 4, "h": 8,
         "th": _th("text", (2, BLUE_SOFT), (3, BLUE_MID), (4, ACCENT)),
         "desc": ("1 Assisted · 2 Adopted · 3 Agentic · 4 Autonomous. "
                  "Stages 3-4 gated on AI-PR review % and test % — "
                  "high agent volume with weak verification caps at 2.")},
        *agent,   # the existing Agent PRs by Sprint bars + autonomy stats
    ]
```

Keep the existing `adoption` list and the `trends` "AI Share of Work" panel (fold trends into `adoption`); keep `monthly` as-is but add these two columns to `monthly_sql` after "Deploys": `"round(w.ai_time_saved_h * {rate}, 0) AS \"AI $ Saved\", tc.value::numeric AS \"Tool Cost $\", "` with the matching `LEFT JOIN {MANUAL} tc ... AND tc.field = 'ai_tool_cost_monthly'`. Assemble:

```python
    story_sections = {
        "steering": ("Sprint Steering ($sprint)", steering),
        "roi": ("Is AI paying off?", roi),
        "cause_effect": ("Is AI work faster — and as good?", cause_effect),
        "dora": ("Delivery Health — DORA", dora),
        "maturity": ("Maturity Ladder", maturity),
        "adoption": ("Adoption Breadth", adoption),
    }
    sections = [story_sections[key] for key in cfg["sections"] if key in story_sections]
    sections.append(("Monthly Record", monthly))
```

Links and the `_dashboard(...)` return stay unchanged (use `project` variable).

- [ ] **Step 3: Run and regenerate**

Run: `pytest tests/test_dashboards.py -v` — Expected: PASS (including Task 11 tests).
Run: `python infra/grafana/generate.py` — regenerates `infra/grafana/dashboards/`.

- [ ] **Step 4: Commit (Tasks 11+12 together)**

```bash
git add infra/grafana/projects.json infra/grafana/generate.py \
        infra/grafana/dashboards tests/test_dashboards.py
git commit -m "feat: per-project config layer + story-first project dashboards"
```

---

### Task 13: BOD dashboard — story rows

**Files:**
- Modify: `infra/grafana/generate.py` (`build_bod_dashboard`, lines ~360-469, and its call in `main()`)
- Test: `tests/test_dashboards.py`

**Interfaces:**
- Consumes: `load_config` cfgs (per-project rates + maturity thresholds), `_maturity_case`.
- Produces: `build_bod_dashboard(cfgs: list[dict], exporter_url: str) -> dict` (signature change from `projects: list[str]` — update `main()`; derive `projects = [c["name"] for c in cfgs]` inside for `_project_colors`).

- [ ] **Step 1: Write the failing tests**

```python
def test_bod_has_roi_and_stage(tmp_path):
    out = _generate(tmp_path)
    bod = json.loads((out / "BOD" / "portfolio.json").read_text())
    titles = [p.get("title", "") for p in bod["panels"]]
    assert any("AI Net $" in t for t in titles)
    body = json.dumps(bod)
    assert "\"Stage\"" in body                 # scorecard stage column
    assert "ai_tasks_tool_" in body            # portfolio tool mix
```

- [ ] **Step 2: Run to verify failure**

Run: `pytest tests/test_dashboards.py -v -k bod` — Expected: FAIL.

- [ ] **Step 3: Implement**

In `build_bod_dashboard(cfgs, exporter_url)`:

1. `projects = [c["name"] for c in cfgs]` and a per-project rate CASE:

```python
    rate_case = ("CASE w.project " +
                 " ".join(f"WHEN '{c['name']}' THEN {c['blended_hourly_rate']}"
                          for c in cfgs) + " ELSE 0 END")
    latest_month = (f"FROM (SELECT DISTINCT ON (project) * FROM {WIDE} "
                    "WHERE period_type = 'month' AND ai_time_saved_h IS NOT NULL "
                    "ORDER BY project, period_key DESC) w "
                    f"LEFT JOIN {MANUAL} t ON t.project = w.project "
                    "AND t.period_key = w.period_key AND t.field = 'ai_tool_cost_monthly'")
```

2. Add to the `pulse` list:

```python
        {"kind": "stat", "title": "AI Net $ (portfolio, latest month)",
         "sql": (f"SELECT sum(w.ai_time_saved_h * {rate_case}) "
                 f"- sum(COALESCE(t.value::numeric, 0)) {latest_month}"),
         "unit": "currencyUSD", "th": _th(CRIT, (0, GOOD)), "w": 5, "graph": "none",
         "desc": "Hours saved × per-project blended rate − tool costs."},
```

3. Add a `Stage` column to `scorecard_sql` (before `ORDER BY project`): build a combined CASE

```python
    stage_case = ("CASE project " +
                  " ".join(f"WHEN '{c['name']}' THEN ({_maturity_case(c)})"
                           for c in cfgs) + " END")
```

and insert `f"{stage_case} AS \"Stage\", "` into the SELECT list, with a `_score_col("Stage", _th("text", (2, BLUE_SOFT), (3, BLUE_MID), (4, ACCENT)))` override.

4. Add to the `value` row (rename the section title to `"Where to Invest / Train"`):

```python
        {"kind": "barchart", "title": "AI Tasks by Tool (portfolio, all sprints)",
         "sql": ("SELECT replace(metric_key, 'ai_tasks_tool_', '') AS \"Tool\", "
                 "sum(value) AS \"Tasks\" FROM reporting.metric_counts "
                 "WHERE period_type = 'sprint' AND metric_key LIKE 'ai_tasks_tool_%' "
                 "GROUP BY 1 ORDER BY 2 DESC"),
         "unit": "none", "w": 12, "h": 8, "color": PALETTE[2],
         "desc": "Portfolio tool mix — informs license decisions."},
```

5. Rename sections to the story titles: `("Is AI paying off? — Portfolio", pulse)`, `("Project Scorecard — Latest Sprint", scorecard)`, `("Delivery Health & Direction", direction)`, `("Where to Invest / Train", value)`.

6. Update `main()`: `exporter, cfgs = load_config()`; project loop over `cfgs` (`build_project_dashboard(cfg, exporter)`, path uses `cfg["name"]`); `bod = build_bod_dashboard(cfgs, exporter)`.

- [ ] **Step 4: Run, regenerate, commit**

Run: `pytest tests/test_dashboards.py tests/test_setup_access.py -v` — Expected: PASS.
Run: `python infra/grafana/generate.py`

```bash
git add infra/grafana/generate.py infra/grafana/dashboards tests/test_dashboards.py
git commit -m "feat: BOD story rows — portfolio ROI, maturity stage, tool mix"
```

---

### Task 14: Workflow plumbing — optional Jira field secrets

**Files:**
- Modify: `.github/workflows/collect.yml`
- Modify: `templates/ai-metrics-caller.yml`

**Interfaces:**
- Produces: optional workflow secrets `jira-ai-tool-field`, `jira-ai-time-saved-field` mapped to `JIRA_AI_TOOL_FIELD` / `JIRA_AI_TIME_SAVED_FIELD`. Existing callers (no new secrets) keep working — collect skips those metrics.

- [ ] **Step 1: Edit collect.yml**

Under `on.workflow_call.secrets` add:

```yaml
      jira-ai-tool-field:       {required: false, description: 'customfield id of the AI Tool field — enables ai_tasks_tool_* metrics'}
      jira-ai-time-saved-field: {required: false, description: 'customfield id of the AI Time Saved field — enables ai_time_saved_h'}
```

Under the collect step `env:` add:

```yaml
          JIRA_AI_TOOL_FIELD: ${{ secrets.jira-ai-tool-field }}
          JIRA_AI_TIME_SAVED_FIELD: ${{ secrets.jira-ai-time-saved-field }}
```

- [ ] **Step 2: Update the caller template**

In `templates/ai-metrics-caller.yml`, add the same two secret pass-throughs to the `collect-sprint` and `collect-month` jobs' `secrets:` blocks:

```yaml
      jira-ai-tool-field: ${{ secrets.JIRA_AI_TOOL_FIELD }}
      jira-ai-time-saved-field: ${{ secrets.JIRA_AI_TIME_SAVED_FIELD }}
```

and extend the onboarding comment at the top: the two secrets are optional; setting them turns on the ROI (time saved) and tool-mix metrics.

- [ ] **Step 3: Validate YAML and commit**

Run: `python -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/collect.yml','templates/ai-metrics-caller.yml']]; print('ok')"`
Expected: `ok`

```bash
git add .github/workflows/collect.yml templates/ai-metrics-caller.yml
git commit -m "feat: optional AI tool / time-saved field secrets in collect workflow"
```

---

### Task 15: Full verification + pilot rollout on Future (agent-platform)

**Files:**
- Modify: `/Users/canh/Projects/Seta/agent-platform/.github/workflows/ai-sdlc-metrics.yml` (separate repo — separate commit/PR there)
- No new code in this repo; ops checklist.

- [ ] **Step 1: Full suite locally**

Run: `pytest -v` (Docker running for test_db/test_views)
Expected: all PASS.

- [ ] **Step 2: Apply views to the reporting DB**

```bash
source <(grep '^export' privates/jira.md)   # not needed for psql; just habit-check env
psql "$REPORTING_DB_URL" -f infra/db/views.sql
```

(Views drop+create — Grafana reads them live; run during a quiet moment.)

- [ ] **Step 3: Push this repo; redeploy Grafana provisioning**

Push `main`; re-provision dashboards the same way previous dashboard changes were rolled out (dashboards dir is provisioned into the Grafana container per `infra/docker/compose.yml`).

- [ ] **Step 4: Update the agent-platform caller**

In `agent-platform/.github/workflows/ai-sdlc-metrics.yml`, add to both collect jobs' `secrets:` blocks:

```yaml
      jira-ai-tool-field: ${{ secrets.JIRA_AI_TOOL_FIELD }}
      jira-ai-time-saved-field: ${{ secrets.JIRA_AI_TIME_SAVED_FIELD }}
```

Add the two repo secrets in agent-platform Settings → Secrets (field IDs: look them up per `docs/jira-setup.md`, e.g. `curl -s -u "$JIRA_EMAIL:$JIRA_TOKEN" "$JIRA_BASE/rest/api/3/field" | jq -r '.[] | select(.name | test("AI (Tool|Time)")) | "\(.id) \(.name)"'`). Commit in that repo: `chore: FUT enable AI tool + time-saved metric collection`.

- [ ] **Step 5: Backfill Future history**

For each past sprint (S1..current, check with `SELECT DISTINCT period_key FROM reporting.metric_counts WHERE project='Future'`):

```bash
gh workflow run "AI SDLC — Metrics Collection (Future)" -R Seta-International/agent-platform \
  -f sprint=S1
# repeat for S2, S3, ... ; then re-run the monthly window(s) via the schedule inputs if needed
```

Idempotent: the NULL-preserving upsert fills new keys without clobbering existing rows.

- [ ] **Step 6: Verify the stories with real data**

- Future dashboard: Sprint Steering row first; "Is AI paying off?" shows AI Hours Saved + tool mix (after next collect run); no Change Failure Rate / Deploys panels; lead time titled "Merge Lead Time (no prod env)"; Maturity Stage renders 0–4.
- BOD: AI Net $ stat, Stage column in scorecard, tool-mix barchart.
- Enter the first `ai_tool_cost_monthly` via the manual-input workflow_dispatch (`manual_period=2026-07`, `manual_fields=ai_tool_cost_monthly=<usd>`).
- Tune `projects.json` thresholds if the gates read wrong; regenerate + push.
- Then onboard TeacherZone the same way (its caller only needs the two secrets).

---

## Self-review notes

- Spec coverage: collector metrics (T1–T8), views (T9), manual input (T10), config model (T11), project dashboard stories incl. has_production + gated maturity (T12), BOD stories (T13), workflow plumbing (T14), backfill + pilot (T15). Exporter: `fetch_period_rows` does `SELECT * FROM metrics_ratios` — new columns flow through untouched; `test_exporter_*` run in T15 Step 1 confirms tolerance. Deferred items intentionally unplanned.
- Type consistency: `pr_files` stays `dict[int, list[str]]` everywhere; `pr_file_details` is the dict-shaped map; `rework_counts` replaces `rework_pr_count` in metrics, collect, and tests atomically (T4).
