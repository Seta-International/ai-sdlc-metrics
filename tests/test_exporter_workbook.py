from datetime import date
from decimal import Decimal
import pytest
from exporter.template import DST
from exporter.workbook import (
    parse_sprint_range, sprint_in_range, months_overlapped, quarters_of,
    fill_workbook,
)

pytestmark = pytest.mark.skipif(not DST.exists(), reason="EN template not built yet")


def test_parse_sprint_range():
    assert parse_sprint_range("S1:S6") == (1, 6)
    assert parse_sprint_range("S3") == (3, 3)
    assert parse_sprint_range(None) is None
    with pytest.raises(ValueError):
        parse_sprint_range("junk")


def test_sprint_in_range():
    assert sprint_in_range("S4", (1, 6)) is True
    assert sprint_in_range("S7", (1, 6)) is False
    assert sprint_in_range("S7", None) is True


def _sprint_row(**kw):
    row = {"project": "Future", "period_key": "S1", "period_type": "sprint",
           "period_start": date(2026, 6, 29), "period_end": date(2026, 7, 13),
           "ai_prs": Decimal(3), "total_prs": Decimal(10), "ai_pr_pct": Decimal(30)}
    row.update(kw)
    return row


def test_months_overlapped_and_quarters():
    months = months_overlapped([_sprint_row()])
    assert months == ["2026-06", "2026-07"]
    assert quarters_of(months) == ["2026-Q2", "2026-Q3"]


def test_fill_workbook_writes_sheets():
    month_row = {"project": "Future", "period_key": "2026-06",
                 "period_start": date(2026, 6, 1), "ai_prs": Decimal(20),
                 "total_prs": Decimal(50), "deploys": Decimal(4),
                 "weeks": Decimal("4.3")}
    manual = {("Future", "2026-06"): {"total_engineers": "18"},
              ("Future", "2026-Q2"): {"g1_agents_md": "Yes",
                                      "evidence_a": "Live dashboard"}}
    wb = fill_workbook(DST, ["Future"], [_sprint_row()], [month_row], manual)

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

    sprint = wb["Sprint data"]
    assert sprint["A1"].value == "Project"
    assert sprint["A2"].value == "Future"
