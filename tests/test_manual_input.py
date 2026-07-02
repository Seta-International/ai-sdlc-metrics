import pytest
from collector.manual_input import validate_and_store
from collector.db import get_manual_input


def test_monthly_numeric_fields(pg_url):
    n = validate_and_store(pg_url, "P-MI", "2026-06",
                           ["total_engineers=18", "cost_baseline=45.5"], "pm@seta")
    assert n == 2
    assert get_manual_input(pg_url, "P-MI", "2026-06", "total_engineers") == ("18", "pm@seta")


def test_ai_tool_cost_monthly_accepted(pg_url):
    n = validate_and_store(pg_url, "P-MI", "2026-07",
                           ["ai_tool_cost_monthly=1200"], "pm")
    assert n == 1
    assert get_manual_input(pg_url, "P-MI", "2026-07",
                            "ai_tool_cost_monthly") == ("1200", "pm")


def test_quarter_flag_and_text_fields(pg_url):
    n = validate_and_store(pg_url, "P-MI", "2026-Q3",
                           ["g2_ai_policy=Yes", "evidence_a=Broad adoption"], "pm@seta")
    assert n == 2
    assert get_manual_input(pg_url, "P-MI", "2026-Q3", "g2_ai_policy") == ("Yes", "pm@seta")


@pytest.mark.parametrize("period,pair", [
    ("2026-06", "unknown_field=1"),      # unknown field
    ("2026-06", "total_engineers=abc"),  # non-numeric
    ("2026-06", "g2_ai_policy=Yes"),     # quarterly field on a month
    ("2026-Q3", "g2_ai_policy=Maybe"),   # flag not Yes/No
    ("2026-13", "total_engineers=1"),    # bad period
    ("2026-Q5", "g2_ai_policy=Yes"),     # bad quarter
])
def test_rejects_bad_input(pg_url, period, pair):
    with pytest.raises(ValueError):
        validate_and_store(pg_url, "P-MI", period, [pair], "pm@seta")
