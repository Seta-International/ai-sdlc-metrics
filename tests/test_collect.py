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
