import re
from typing import Optional

AI_USAGE_TIERS = {"None": 0, "Assisted": 1, "Agent": 2}

_CLAUDE_TRAILER_RE = re.compile(r"co-authored-by:\s*claude\b", re.I)
_COPILOT_TRAILER_RE = re.compile(r"co-authored-by:\s*(github\s*)?copilot", re.I)
_TIME_SAVED_RE = re.compile(
    r"ai time saved\s*\(hours\)\s*:\s*(?:~|≈|approx\.?|approximately|about)?\s*"
    r"([0-9]+(?:\.[0-9]+)?)",
    re.I,
)
# Matches the same label even when the number itself is unparseable (e.g. a
# vague "a lot" or "N/A") — used to warn instead of silently dropping it.
_TIME_SAVED_LABEL_RE = re.compile(r"ai time saved\s*\(hours\)\s*:", re.I)


def extract_issue_key(title: str, branch: str, project: str) -> Optional[str]:
    """Finds a `<PROJECT>-<n>` Jira key in the PR title, falling back to the
    branch name. Only matches keys under the configured project."""
    pattern = re.compile(rf"\b{re.escape(project)}-\d+\b")
    for text in (title, branch):
        if not text:
            continue
        m = pattern.search(text)
        if m:
            return m.group(0)
    return None


def detect_ai_tool(commit_messages: list[str]) -> Optional[str]:
    """Scans commits in order for a recognized Co-authored-by trailer.
    First commit with a recognized trailer wins."""
    for msg in commit_messages:
        if _CLAUDE_TRAILER_RE.search(msg):
            return "Claude Code"
        if _COPILOT_TRAILER_RE.search(msg):
            return "Copilot"
    return None


def detect_ai_usage(labels: list[str], commit_messages: list[str]) -> str:
    """Labels are authoritative; falls back to Co-authored-by trailers when
    neither ai-assisted nor ai-agent was applied."""
    if "ai-agent" in labels:
        return "Agent"
    if "ai-assisted" in labels:
        return "Assisted"
    if detect_ai_tool(commit_messages):
        return "Assisted"
    return "None"


def extract_time_saved(body: str) -> Optional[float]:
    """Parses 'AI time saved (hours): <n>' from a PR description. Tolerates a
    leading '~'/'approx'/'about' before the number (common informal phrasing)."""
    if not body:
        return None
    m = _TIME_SAVED_RE.search(body)
    return float(m.group(1)) if m else None


def time_saved_unparseable(body: str) -> bool:
    """True when the PR body has an 'AI time saved (hours):' line but the
    value after it isn't a number extract_time_saved can parse (e.g. 'a lot',
    'N/A', or other free text) — a silent drop worth flagging to the author
    instead of just disappearing."""
    if not body:
        return False
    return bool(_TIME_SAVED_LABEL_RE.search(body)) and extract_time_saved(body) is None


def higher_tier(a: str, b: str) -> str:
    return a if AI_USAGE_TIERS.get(a, 0) >= AI_USAGE_TIERS.get(b, 0) else b


def compute_field_updates(
    current_usage: str,
    current_tool: Optional[str],
    current_hours: float,
    detected_usage: str,
    detected_tool: Optional[str],
    detected_hours: Optional[float],
) -> dict:
    """Merge policy: AI Usage never downgrades (max tier wins), AI Tool is
    set once and never overwritten, AI Time Saved accumulates. Returns only
    the fields whose value actually changes."""
    updates: dict = {}

    new_usage = higher_tier(current_usage, detected_usage)
    if new_usage != current_usage:
        updates["usage"] = new_usage

    if detected_tool and not current_tool:
        updates["tool"] = detected_tool

    if detected_hours is not None:
        new_hours = (current_hours or 0) + detected_hours
        if new_hours != current_hours:
            updates["hours"] = new_hours

    return updates
