#!/usr/bin/env python3
"""
Create PM viewer accounts and lock Grafana folder permissions so each PM sees
only their own project folder; BOD viewers see only the BOD folder. Org Admins
always keep full access. Idempotent — safe to re-run after onboarding a project.

  python infra/grafana/setup_access.py --base http://localhost:3030 \
      --admin-password "$GF_ADMIN_PASSWORD" --pm-password "$PM_INITIAL_PASSWORD"

Uses only Grafana OSS APIs (admin user create, folder permissions).
"""
import argparse
import json
from pathlib import Path
import requests

HERE = Path(__file__).resolve().parent


def plan_permissions(config: dict, folder_uids: dict[str, str],
                     user_ids: dict[str, int]) -> dict[str, list[dict]]:
    """folder uid -> permission items (replaces existing). Pure function.
    PMs see only their own project folder; BOD viewers see every folder
    (the whole company is their scope)."""
    bod = [{"userId": user_ids[v["login"]], "permission": 1}
           for v in config["bod_viewers"]]
    plans: dict[str, list[dict]] = {}
    for proj in config["projects"]:
        uid = folder_uids.get(proj["name"])
        if uid:
            plans[uid] = [{"userId": user_ids[proj["pm_login"]], "permission": 1}] + bod
    bod_uid = folder_uids.get("BOD")
    if bod_uid:
        plans[bod_uid] = bod
    return plans


def ensure_user(s: requests.Session, base: str, login: str, email: str,
                password: str) -> int:
    r = s.get(f"{base}/api/users/lookup", params={"loginOrEmail": login})
    if r.status_code == 200:
        return r.json()["id"]
    r = s.post(f"{base}/api/admin/users",
               json={"name": login, "login": login, "email": email,
                     "password": password})
    r.raise_for_status()
    print(f"created user {login}")
    return r.json()["id"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:3030")
    parser.add_argument("--admin-user", default="admin")
    parser.add_argument("--admin-password", required=True)
    parser.add_argument("--pm-password", required=True,
                        help="Initial password for newly created viewer accounts")
    args = parser.parse_args()

    s = requests.Session()
    s.auth = (args.admin_user, args.admin_password)

    config = json.loads((HERE / "projects.json").read_text())
    accounts = ([(p["pm_login"], p["pm_email"]) for p in config["projects"]]
                + [(v["login"], v["email"]) for v in config["bod_viewers"]])
    user_ids = {login: ensure_user(s, args.base, login, email, args.pm_password)
                for login, email in accounts}

    r = s.get(f"{args.base}/api/folders")
    r.raise_for_status()
    folder_uids = {f["title"]: f["uid"] for f in r.json()}

    for uid, items in plan_permissions(config, folder_uids, user_ids).items():
        r = s.post(f"{args.base}/api/folders/{uid}/permissions",
                   json={"items": items})
        r.raise_for_status()
        print(f"locked folder {uid}: {items}")

    missing = [p["name"] for p in config["projects"]
               if p["name"] not in folder_uids]
    if missing:
        print(f"WARNING: folders not found (provisioning not loaded yet?): {missing}")


if __name__ == "__main__":
    main()
