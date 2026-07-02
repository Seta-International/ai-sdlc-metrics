"""The rendered maturity template must match the sheet specs."""
from datetime import date

import pytest

from exporter.sheets import SHEETS
from exporter.template import build_workbook
from exporter.workbook import (
    SHEET3_MANUAL_COLS, SHEET3_METRIC_COLS, fill_workbook,
)


@pytest.fixture(scope="module")
def generated():
    return build_workbook()


def test_sheet_names_and_order(generated):
    assert generated.sheetnames == [s["name"] for s in SHEETS]


def test_formula_columns_fill_down(generated):
    ws = generated["5. Metrics"]
    assert ws["E4"].value == "=IFERROR('3. Monthly'!F4/'3. Monthly'!G4,\"\")"
    assert ws["E203"].value == "=IFERROR('3. Monthly'!F203/'3. Monthly'!G203,\"\")"
    levels = generated["6. Levels"]
    assert levels["S53"].value == \
        '=IF($A53="","",MIN(R53,P53,ROUND(AVERAGE(N53,O53,P53,Q53,R53),0)))'


def test_validations_and_freeze(generated):
    ws = generated["4. Quarterly"]
    dvs = {(dv.type, dv.formula1, str(dv.sqref))
           for dv in ws.data_validations.dataValidation}
    assert ("list", '"Yes,No"', "C4:AA53") in dvs
    assert generated["3. Monthly"].freeze_panes == "D4"


def test_charts_present(generated):
    assert len(generated["8. Dashboard-Project"]._charts) == 2
    assert len(generated["9. Dashboard-Portfolio"]._charts) == 1


def test_fill_columns_have_headers(generated):
    ws = generated["3. Monthly"]
    for col in {**SHEET3_METRIC_COLS, **SHEET3_MANUAL_COLS}:
        assert isinstance(ws[f"{col}3"].value, str) and ws[f"{col}3"].value, col


def test_fill_workbook_runs_on_generated_template():
    wb = fill_workbook(build_workbook(), ["Future"], [], [
        {"project": "Future", "period_key": "2026-06",
         "period_start": date(2026, 6, 1), "ai_prs": 20, "total_prs": 50},
    ], {})
    assert wb["2. Projects"]["B3"].value == "Future"
    assert float(wb["3. Monthly"]["F4"].value) == 20.0
