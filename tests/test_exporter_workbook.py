from datetime import date
from decimal import Decimal
import pytest
from exporter.template import build_workbook
from exporter.workbook import (
    parse_month_range, month_in_range, quarters_of, fill_workbook,
)


def test_parse_month_range():
    assert parse_month_range("2026-01:2026-06") == ("2026-01", "2026-06")
    assert parse_month_range("2026-03") == ("2026-03", "2026-03")
    assert parse_month_range(None) is None
    with pytest.raises(ValueError):
        parse_month_range("junk")


def test_parse_month_range_rejects_empty_range():
    with pytest.raises(ValueError):
        parse_month_range("2026-06:2026-01")   # lo > hi


def test_month_in_range():
    assert month_in_range("2026-04", ("2026-01", "2026-06")) is True
    assert month_in_range("2026-07", ("2026-01", "2026-06")) is False
    assert month_in_range("2026-07", None) is True


def test_quarters_of():
    assert quarters_of(["2026-01", "2026-04", "2026-07"]) == \
        ["2026-Q1", "2026-Q2", "2026-Q3"]


def test_fill_workbook_writes_sheets():
    month_row = {"project": "Future", "period_key": "2026-06",
                 "period_start": date(2026, 6, 1), "ai_prs": Decimal(20),
                 "total_prs": Decimal(50), "deploys": Decimal(4),
                 "weeks": Decimal("4.3"), "ai_pr_pct": Decimal(40)}
    manual = {("Future", "2026-06"): {"total_engineers": "18"},
              ("Future", "2026-Q2"): {"g1_agents_md": "Yes",
                                      "evidence_a": "Live dashboard"}}
    wb = fill_workbook(build_workbook(), ["Future"], [month_row], manual)

    proj = wb["2. Projects"]
    assert (proj["A3"].value, proj["B3"].value) == ("P01", "Future")

    monthly = wb["3. Monthly"]
    assert monthly["A4"].value == "P01"
    assert monthly["B4"].value.strftime("%Y-%m") == "2026-06"
    assert float(monthly["F4"].value) == 20.0   # ai_prs
    assert float(monthly["E4"].value) == 18.0   # manual total_engineers
    assert str(monthly["C4"].value).startswith("=")  # formula intact

    quarterly = wb["4. Quarterly"]
    assert quarterly["A4"].value == "P01"
    assert quarterly["B4"].value == "2026-Q2"
    assert quarterly["C4"].value == "Yes"        # g1_agents_md
    assert quarterly["AB4"].value == "Live dashboard"

    detail = wb["Monthly detail"]
    assert detail["A1"].value == "Project"
    assert detail["A2"].value == "Future"
