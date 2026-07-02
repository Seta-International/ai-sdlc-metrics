import statistics
from datetime import datetime, timedelta
from typing import Optional
from collector.config import BOT_LOGINS

AI_LABELS = {"ai-assisted", "ai-agent"}


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def _has_label(pr: dict, name: str) -> bool:
    return any(l["name"] == name for l in pr.get("labels", []))


def _is_ai_pr(pr: dict) -> bool:
    return any(l["name"] in AI_LABELS for l in pr.get("labels", []))


def _usage(issue: dict, field: str) -> str:
    return (issue["fields"].get(field) or {}).get("value", "None") or "None"


def adoption_counts(prs: list[dict], issues: list[dict], field: str) -> dict:
    authors = {(p.get("user") or {}).get("login") for p in prs}
    return {
        "ai_prs": sum(1 for p in prs if _has_label(p, "ai-assisted")),
        "total_prs": len(prs),
        "agent_tasks": sum(1 for i in issues if _usage(i, field) == "Agent"),
        "ai_tasks": sum(1 for i in issues if _usage(i, field) != "None"),
        "total_tasks": len(issues),
        # Active engineer proxy: distinct humans who merged a PR this window.
        # Denominator for usage rate when manual total_engineers is absent.
        "engineers_active": len(authors - BOT_LOGINS - {None}),
    }


def ai_users_weekly_avg(prs: list[dict], issues: list[dict], field: str,
                        since: datetime, until: datetime) -> Optional[float]:
    """Mean per-ISO-week distinct AI users: authors of AI-labeled merged PRs
    plus assignees of AI-usage Jira issues. Proxy for license/survey data;
    the quarterly review cross-checks and can override via manual_inputs."""
    def week_of(dt: datetime):
        d = dt.date()
        return d - timedelta(days=d.weekday())

    weeks: dict = {}
    for p in prs:
        if _is_ai_pr(p) and p.get("merged_at"):
            login = (p.get("user") or {}).get("login")
            if login and login not in BOT_LOGINS:
                weeks.setdefault(week_of(_dt(p["merged_at"])), set()).add(f"gh:{login}")
    for i in issues:
        f = i["fields"]
        account = (f.get("assignee") or {}).get("accountId")
        if _usage(i, field) != "None" and f.get("resolutiondate") and account:
            weeks.setdefault(week_of(_dt(f["resolutiondate"])), set()).add(f"jira:{account}")

    if not weeks:
        return None
    n_weeks = max(1, round((until - since).days / 7))
    return round(sum(len(users) for users in weeks.values()) / n_weeks, 2)


def delivery_counts(deploy_times: list[datetime], incidents: list[dict],
                    weeks: float) -> dict:
    hours = []
    for i in incidents:
        c, r = i["fields"].get("created"), i["fields"].get("resolutiondate")
        if c and r:
            hours.append((_dt(r) - _dt(c)).total_seconds() / 3600)
    return {
        "deploys": len(deploy_times),
        "weeks": round(weeks, 2),
        "incidents": len(incidents),
        "mttr_h": round(statistics.mean(hours), 2) if hours else None,
    }


def lead_time_hours(prs: list[dict], deploy_times: list[datetime]) -> Optional[float]:
    """DORA lead time approximation: median hours PR merge -> first production
    deploy after it. Falls back to open->merge when the window has no deploys."""
    merged = sorted(_dt(p["merged_at"]) for p in prs if p.get("merged_at"))
    if deploy_times:
        spans = []
        for m in merged:
            nxt = next((d for d in deploy_times if d >= m), None)
            if nxt:
                spans.append((nxt - m).total_seconds() / 3600)
        if spans:
            return round(statistics.median(spans), 2)
    spans = [
        (_dt(p["merged_at"]) - _dt(p["created_at"])).total_seconds() / 3600
        for p in prs if p.get("merged_at") and p.get("created_at")
    ]
    return round(statistics.median(spans), 2) if spans else None


_FIX_PREFIXES = ("revert", "fix", "bugfix", "hotfix")
_INTEGRATION_BRANCHES = ("main", "master", "develop")


def _branch(pr: dict) -> str:
    return ((pr.get("head") or {}).get("ref") or "").lower()


def _is_integration_pr(pr: dict) -> bool:
    """Branch-integration PRs (e.g. develop -> main) aggregate every other
    PR's files, so they must not count as (or trigger) rework."""
    b = _branch(pr)
    return b in _INTEGRATION_BRANCHES or b.startswith("release/")


def _is_fix_pr(pr: dict) -> bool:
    t = pr["title"].lower()
    return t.startswith(_FIX_PREFIXES) or _branch(pr).startswith(_FIX_PREFIXES)


def rework_pr_count(window_prs: list[dict], all_prs: list[dict],
                    pr_files: dict[int, list[str]]) -> int:
    """PRs in the window that redo recent work (framework C1): reverts, plus
    fix/bugfix/hotfix PRs touching a file changed by a different non-fix PR
    merged in the prior 14 days. Plain file overlap between feature PRs is
    normal parallel work in a monorepo, not rework."""
    count = 0
    for p in window_prs:
        if _is_integration_pr(p):
            continue
        if p["title"].lower().startswith("revert"):
            count += 1
            continue
        if not _is_fix_pr(p):
            continue
        merged = _dt(p["merged_at"])
        touched = set(pr_files.get(p["number"], []))
        for q in all_prs:
            if (q["number"] == p["number"] or not q.get("merged_at")
                    or _is_integration_pr(q) or _is_fix_pr(q)):
                continue
            q_merged = _dt(q["merged_at"])
            if (merged - timedelta(days=14) <= q_merged < merged
                    and touched & set(pr_files.get(q["number"], []))):
                count += 1
                break
    return count


def quality_counts(prs: list[dict], code_alerts: list[dict],
                   secret_alerts: list[dict]) -> dict:
    ai_prs = [p for p in prs if _has_label(p, "ai-assisted")]
    return {
        "ai_prs_reviewed": sum(1 for p in ai_prs if p.get("review_count", 0) > 0),
        "security_alerts": len(code_alerts) + len(secret_alerts),
    }


def agent_counts(prs: list[dict], pr_commits: dict[int, list]) -> dict:
    agent_prs = [p for p in prs if _has_label(p, "ai-agent")]
    human_fixed = 0
    cycle: list[float] = []
    for p in agent_prs:
        commits = pr_commits.get(p["number"], [])
        has_human = any(
            (c.get("author") or {}).get("login") not in BOT_LOGINS
            and (c.get("author") or {}).get("type") != "Bot"
            for c in commits
        )
        if has_human:
            human_fixed += 1
        if p.get("merged_at") and p.get("created_at"):
            cycle.append((_dt(p["merged_at"]) - _dt(p["created_at"])).total_seconds() / 3600)
    return {
        "agent_prs_total": len(agent_prs),
        "agent_prs_merged": sum(1 for p in agent_prs if p.get("merged_at")),
        "agent_prs_human_fixed": human_fixed,
        "agent_prs_autonomous": len(agent_prs) - human_fixed,
        "agent_cycle_h": round(statistics.median(cycle), 2) if cycle else None,
    }
