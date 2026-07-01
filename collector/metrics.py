import statistics
from datetime import datetime
from typing import Optional
from collector.config import BOT_LOGINS

def calc_a2(prs: list[dict]) -> Optional[float]:
    if not prs:
        return None
    ai = sum(1 for p in prs if any(l["name"] == "ai-assisted" for l in p.get("labels", [])))
    return round(ai / len(prs), 4)

def calc_a3(issues: list[dict], field: str) -> Optional[float]:
    if not issues:
        return None
    agent = sum(1 for i in issues if (i["fields"].get(field) or {}).get("value") == "Agent")
    return round(agent / len(issues), 4)

def calc_a4(issues: list[dict], field: str) -> Optional[float]:
    if not issues:
        return None
    ai = sum(1 for i in issues if (i["fields"].get(field) or {}).get("value", "None") != "None")
    return round(ai / len(issues), 4)

def calc_b2(deployments: list[dict], sprint_weeks: float) -> Optional[float]:
    if not sprint_weeks:
        return None
    return round(len(deployments) / sprint_weeks, 2)

def calc_b3(incidents: list[dict], deployments: list[dict]) -> Optional[float]:
    """Change failure rate, approximated as incidents-per-deploy in the
    period (no per-incident deploy linkage is tracked)."""
    if not deployments:
        return None
    return round(len(incidents) / len(deployments), 4)

def calc_b4(incidents: list[dict]) -> Optional[float]:
    hours = []
    for i in incidents:
        c = i["fields"].get("created")
        r = i["fields"].get("resolutiondate")
        if c and r:
            created = datetime.fromisoformat(c.replace("Z", "+00:00"))
            resolved = datetime.fromisoformat(r.replace("Z", "+00:00"))
            hours.append((resolved - created).total_seconds() / 3600)
    return round(statistics.mean(hours), 2) if hours else None

def calc_c1(prs: list[dict]) -> Optional[float]:
    if not prs:
        return None
    return round(sum(1 for p in prs if p["title"].lower().startswith("revert")) / len(prs), 4)

def calc_c2(prs: list[dict]) -> Optional[float]:
    ai_prs = [p for p in prs if any(l["name"] == "ai-assisted" for l in p.get("labels", []))]
    if not ai_prs:
        return None
    # review_count injected by collect.py from reviews endpoint; default 0 if absent
    approved = sum(1 for p in ai_prs if p.get("review_count", 0) > 0)
    return round(approved / len(ai_prs), 4)

def calc_c4(alerts: list[dict]) -> int:
    return len(alerts)

def calc_d_metrics(prs: list[dict], pr_commits: dict[int, list]) -> dict:
    agent_prs = [p for p in prs if any(l["name"] == "ai-agent" for l in p.get("labels", []))]
    if not agent_prs:
        return {"d1": None, "d2": None, "d3": None, "d4": None}

    merged = [p for p in agent_prs if p.get("merged_at")]
    human_count = 0
    cycle_times: list[float] = []

    for p in agent_prs:
        commits = pr_commits.get(p["number"], [])
        has_human = any(
            (c.get("author") or {}).get("login") not in BOT_LOGINS
            and (c.get("author") or {}).get("type") != "Bot"
            for c in commits
        )
        if has_human:
            human_count += 1
        if p.get("merged_at") and p.get("created_at"):
            c_at = datetime.fromisoformat(p["created_at"].replace("Z", "+00:00"))
            m_at = datetime.fromisoformat(p["merged_at"].replace("Z", "+00:00"))
            cycle_times.append((m_at - c_at).total_seconds() / 3600)

    total = len(agent_prs)
    return {
        "d1": round(len(merged) / total, 4),
        "d2": round(human_count / total, 4),
        "d3": round((total - human_count) / total, 4),
        "d4": round(statistics.median(cycle_times), 2) if cycle_times else None,
    }
