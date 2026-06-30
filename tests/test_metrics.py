import pytest
import statistics
from collector.metrics import (
    calc_a2, calc_a3, calc_a4, calc_b2, calc_b3, calc_b4,
    calc_c1, calc_c2, calc_c4, calc_d_metrics,
)

FIELD = "customfield_10200"

def pr(labels=(), title="feat: x", merged="2026-07-01T10:00:00Z", created="2026-07-01T08:00:00Z", number=1):
    return {"number": number, "title": title, "merged_at": merged, "created_at": created,
            "labels": [{"name": l} for l in labels]}

def issue(usage_value):
    return {"fields": {FIELD: {"value": usage_value} if usage_value else None}}

# A2
def test_calc_a2_empty():        assert calc_a2([]) is None
def test_calc_a2_none_ai():      assert calc_a2([pr(), pr()]) == 0.0
def test_calc_a2_half_ai():      assert calc_a2([pr(["ai-assisted"]), pr()]) == 0.5

# A3
def test_calc_a3_empty():        assert calc_a3([], FIELD) is None
def test_calc_a3_agent_issues(): assert calc_a3([issue("Tác tử"), issue("Không")], FIELD) == 0.5

# A4
def test_calc_a4_all_none():     assert calc_a4([issue("Không"), issue(None)], FIELD) == 0.0
def test_calc_a4_mixed():        assert calc_a4([issue("Có hỗ trợ"), issue("Không")], FIELD) == 0.5

# B2
def test_calc_b2_zero_weeks():   assert calc_b2([{}, {}], 0) is None
def test_calc_b2_two_deploys():  assert calc_b2([{}, {}], 2.0) == 1.0

# B3
def test_calc_b3_no_deploys():   assert calc_b3([], []) is None
def test_calc_b3_no_incidents(): assert calc_b3([], [{}]) == 0.0
def test_calc_b3_with_incident():
    incidents = [{"fields": {"customfield_caused_by_deploy": "http://x"}}]
    assert calc_b3(incidents, [{}]) == 1.0

# B4
def test_calc_b4_no_incidents(): assert calc_b4([]) is None
def test_calc_b4_two_hours():
    inc = [{"fields": {"created": "2026-07-01T10:00:00+00:00", "resolutiondate": "2026-07-01T12:00:00+00:00"}}]
    assert calc_b4(inc) == 2.0

# C1
def test_calc_c1_no_reverts():   assert calc_c1([pr(), pr()]) == 0.0
def test_calc_c1_one_revert():   assert calc_c1([pr(title="Revert feat: x"), pr()]) == 0.5

# C4
def test_calc_c4_count():        assert calc_c4([{}, {}, {}]) == 3

# D metrics
def test_calc_d_metrics_no_agent_prs():
    result = calc_d_metrics([pr()], {})
    assert result == {"d1": None, "d2": None, "d3": None, "d4": None}

def test_calc_d_metrics_autonomous_agent_pr():
    agent_pr = pr(labels=["ai-agent", "ai-assisted"], number=42,
                  merged="2026-07-01T10:00:00Z", created="2026-07-01T08:00:00Z")
    # No human commits
    commits = [{"author": {"login": "github-actions[bot]", "type": "Bot"}}]
    result = calc_d_metrics([agent_pr], {42: commits})
    assert result["d1"] == 1.0
    assert result["d2"] == 0.0
    assert result["d3"] == 1.0
    assert result["d4"] == 2.0  # 2 hours

def test_calc_d_metrics_human_intervened():
    agent_pr = pr(labels=["ai-agent", "ai-assisted"], number=43,
                  merged="2026-07-01T10:00:00Z", created="2026-07-01T08:00:00Z")
    commits = [{"author": {"login": "canh", "type": "User"}}]
    result = calc_d_metrics([agent_pr], {43: commits})
    assert result["d2"] == 1.0
    assert result["d3"] == 0.0
