import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "infra" / "grafana"))
from setup_access import plan_permissions  # noqa: E402

CONFIG = {
    "projects": [{"name": "Future", "pm_login": "pm-future", "pm_email": "x@y"}],
    "bod_viewers": [{"login": "bod-viewer", "email": "b@y"}],
}


def test_plan_permissions_isolates_pms_but_bod_sees_all():
    plans = plan_permissions(
        CONFIG,
        folder_uids={"Future": "uid-fut", "BOD": "uid-bod"},
        user_ids={"pm-future": 11, "bod-viewer": 22},
    )
    assert plans["uid-fut"] == [{"userId": 11, "permission": 1},
                                {"userId": 22, "permission": 1}]
    assert plans["uid-bod"] == [{"userId": 22, "permission": 1}]


def test_plan_permissions_skips_missing_folder():
    plans = plan_permissions(CONFIG, folder_uids={"BOD": "uid-bod"},
                             user_ids={"pm-future": 11, "bod-viewer": 22})
    assert list(plans) == ["uid-bod"]
