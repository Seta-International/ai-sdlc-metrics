from datetime import datetime, timezone
from collector.collect import build_counts
from collector.windows import Window

FIELD = "customfield_10200"
W = Window("sprint", "S1",
           datetime(2026, 6, 29, tzinfo=timezone.utc),
           datetime(2026, 7, 13, tzinfo=timezone.utc))


def pr(number=1, labels=(), merged="2026-07-01T10:00:00Z", created="2026-07-01T08:00:00Z"):
    return {"number": number, "title": "feat: x", "merged_at": merged,
            "created_at": created, "user": {"login": "alice"},
            "labels": [{"name": l} for l in labels], "review_count": 1}


def test_build_counts_produces_canonical_keys():
    prs = [pr(1, ["ai-assisted"])]
    counts = build_counts(
        window=W, prs=prs, all_prs=prs, pr_files={1: ["a.py"]},
        deploy_times=[datetime(2026, 7, 2, tzinfo=timezone.utc)],
        code_alerts=[], secret_alerts=[],
        issues=[], incidents=[], field=FIELD, sprint_issue_counts=(10, 8),
    )
    assert counts["ai_prs"] == 1
    assert counts["total_prs"] == 1
    assert counts["engineers_active"] == 1
    assert counts["deploys"] == 1
    assert counts["weeks"] == 2.0
    assert counts["sprint_committed"] == 10
    assert counts["sprint_completed"] == 8
    assert counts["lead_time_h"] is not None
    assert counts["rework_prs"] == 0


def test_build_counts_without_sprint_predictability():
    counts = build_counts(
        window=W, prs=[], all_prs=[], pr_files={}, deploy_times=[],
        code_alerts=[], secret_alerts=[], issues=[], incidents=[],
        field=FIELD, sprint_issue_counts=None,
    )
    assert "sprint_committed" not in counts
    assert counts["total_prs"] == 0


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
