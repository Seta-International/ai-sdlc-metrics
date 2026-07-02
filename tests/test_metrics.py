from datetime import datetime, timezone
import pytest
from collector.metrics import (
    adoption_counts, ai_users_weekly_avg, delivery_counts, lead_time_hours,
    rework_pr_count, quality_counts, agent_counts,
)

FIELD = "customfield_10200"


def pr(labels=(), title="feat: x", merged="2026-07-01T10:00:00Z",
       created="2026-07-01T08:00:00Z", number=1, login="alice", reviews=0,
       branch="feat/x"):
    return {
        "number": number, "title": title, "merged_at": merged, "created_at": created,
        "user": {"login": login}, "labels": [{"name": l} for l in labels],
        "review_count": reviews, "head": {"ref": branch},
    }


def issue(usage, assignee="acc-1", resolved="2026-07-01T12:00:00Z"):
    return {"fields": {
        FIELD: {"value": usage} if usage else None,
        "assignee": {"accountId": assignee} if assignee else None,
        "resolutiondate": resolved,
    }}


def dt(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


# adoption_counts
def test_adoption_counts():
    prs = [pr(["ai-assisted"]), pr(), pr(["ai-agent"], number=2)]
    issues = [issue("Agent"), issue("Assisted"), issue("None"), issue(None)]
    c = adoption_counts(prs, issues, FIELD)
    assert c == {"ai_prs": 1, "total_prs": 3, "agent_tasks": 1, "ai_tasks": 2,
                 "total_tasks": 4, "engineers_active": 1}


def test_engineers_active_distinct_humans_only():
    prs = [pr(login="alice"), pr(login="alice", number=2), pr(login="bob", number=3),
           pr(login="dependabot[bot]", number=4)]
    c = adoption_counts(prs, [], FIELD)
    assert c["engineers_active"] == 2  # alice counted once, bot excluded


# ai_users_weekly_avg
def test_ai_users_two_weeks_average():
    since, until = dt("2026-07-06"), dt("2026-07-20")  # exactly 2 ISO weeks
    prs = [pr(["ai-assisted"], merged="2026-07-07T10:00:00Z", login="alice"),
           pr(["ai-agent"], merged="2026-07-08T10:00:00Z", login="bob", number=2)]
    issues = [issue("Assisted", assignee="acc-9", resolved="2026-07-15T10:00:00Z")]
    # week 1: {alice, bob} = 2, week 2: {acc-9} = 1 -> avg 1.5
    assert ai_users_weekly_avg(prs, issues, FIELD, since, until) == 1.5


def test_ai_users_excludes_bots_and_non_ai():
    since, until = dt("2026-07-06"), dt("2026-07-13")
    prs = [pr(["ai-assisted"], merged="2026-07-07T10:00:00Z", login="dependabot[bot]"),
           pr(merged="2026-07-07T11:00:00Z", login="carol", number=2)]
    assert ai_users_weekly_avg(prs, [issue("None")], FIELD, since, until) is None


# delivery_counts
def test_delivery_counts_with_mttr():
    incidents = [{"fields": {"created": "2026-07-01T00:00:00Z",
                             "resolutiondate": "2026-07-01T06:00:00Z"}}]
    c = delivery_counts([dt("2026-07-02"), dt("2026-07-09")], incidents, 2.0)
    assert c == {"deploys": 2, "weeks": 2.0, "incidents": 1, "mttr_h": 6.0}


def test_delivery_counts_no_incidents_mttr_none():
    assert delivery_counts([], [], 2.0)["mttr_h"] is None


# lead_time_hours
def test_lead_time_merge_to_next_deploy():
    prs = [pr(merged="2026-07-01T10:00:00Z"), pr(merged="2026-07-03T10:00:00Z", number=2)]
    deploys = [dt("2026-07-01T12:00:00"), dt("2026-07-04T10:00:00")]
    # PR1 -> 2h to first deploy, PR2 -> 24h -> median 13h
    assert lead_time_hours(prs, deploys) == 13.0


def test_lead_time_fallback_open_to_merge_when_no_deploys():
    prs = [pr(created="2026-07-01T08:00:00Z", merged="2026-07-01T18:00:00Z")]
    assert lead_time_hours(prs, []) == 10.0


def test_lead_time_none_without_prs():
    assert lead_time_hours([], []) is None


# rework_pr_count
def test_rework_fix_overlapping_recent_feature():
    p_old = pr(number=1, merged="2026-06-25T10:00:00Z")
    p_fix = pr(number=2, title="fix: app crash", branch="fix/app-crash",
               merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py", "README.md"]}
    assert rework_pr_count([p_fix], [p_old, p_fix], files) == 1


def test_rework_ignores_feature_next_to_feature():
    p_old = pr(number=1, merged="2026-06-25T10:00:00Z")
    p_new = pr(number=2, title="feat: y", branch="feat/y",
               merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py", "README.md"]}
    assert rework_pr_count([p_new], [p_old, p_new], files) == 0


def test_rework_ignores_fix_of_old_code():
    p_old = pr(number=1, merged="2026-06-01T10:00:00Z")
    p_fix = pr(number=2, title="fix: z", branch="bugfix/z",
               merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py"]}
    assert rework_pr_count([p_fix], [p_old, p_fix], files) == 0


def test_rework_ignores_integration_prs_on_both_sides():
    p_dev = pr(number=1, branch="develop", merged="2026-06-30T10:00:00Z")
    p_fix = pr(number=2, title="fix: q", branch="fix/q",
               merged="2026-07-02T10:00:00Z")
    files = {1: ["src/app.py"], 2: ["src/app.py"]}
    # overlap only with the develop->main integration PR: not rework,
    # and the integration PR itself is never counted
    assert rework_pr_count([p_fix, p_dev], [p_dev, p_fix], files) == 0


def test_rework_counts_reverts():
    p = pr(number=3, title="Revert \"feat: x\"", branch="revert-3-feat-x",
           merged="2026-07-02T10:00:00Z")
    assert rework_pr_count([p], [p], {3: []}) == 1


# quality_counts
def test_quality_counts():
    prs = [pr(["ai-assisted"], reviews=1), pr(["ai-assisted"], number=2, reviews=0), pr(number=3)]
    c = quality_counts(prs, [{"a": 1}], [{"b": 2}, {"c": 3}])
    assert c == {"ai_prs_reviewed": 1, "security_alerts": 3}


# agent_counts
def test_agent_counts():
    a1 = pr(["ai-agent"], number=1, created="2026-07-01T08:00:00Z", merged="2026-07-01T12:00:00Z")
    a2 = pr(["ai-agent"], number=2, created="2026-07-02T08:00:00Z", merged="2026-07-02T16:00:00Z")
    commits = {1: [{"author": {"login": "alice", "type": "User"}}],
               2: [{"author": {"login": "github-actions[bot]", "type": "Bot"}}]}
    c = agent_counts([a1, a2, pr(number=3)], commits)
    assert c == {"agent_prs_total": 2, "agent_prs_merged": 2,
                 "agent_prs_human_fixed": 1, "agent_prs_autonomous": 1,
                 "agent_cycle_h": 6.0}


def test_agent_counts_no_agent_prs():
    c = agent_counts([pr()], {})
    assert c["agent_prs_total"] == 0 and c["agent_cycle_h"] is None
