from collector.ticket_extract import (
    extract_issue_key, detect_ai_tool, detect_ai_usage, extract_time_saved,
    time_saved_unparseable, higher_tier, compute_field_updates,
)

CLAUDE_TRAILER = "feat: add thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>"
COPILOT_TRAILER = "feat: add thing\n\nCo-authored-by: Copilot <198982749+Copilot@users.noreply.github.com>"

# extract_issue_key
def test_extract_issue_key_from_title():
    assert extract_issue_key("feat(planner): FUT-123 add group viewer", "", "FUT") == "FUT-123"

def test_extract_issue_key_falls_back_to_branch():
    assert extract_issue_key("no key here", "feat/FUT-123-group-viewer", "FUT") == "FUT-123"

def test_extract_issue_key_no_match():
    assert extract_issue_key("chore(deps): bump requests", "dependabot/pip/requests", "FUT") is None

def test_extract_issue_key_ignores_other_project():
    assert extract_issue_key("feat: OTHER-5 unrelated", "", "FUT") is None

# detect_ai_tool
def test_detect_ai_tool_claude():
    assert detect_ai_tool([CLAUDE_TRAILER]) == "Claude Code"

def test_detect_ai_tool_copilot():
    assert detect_ai_tool([COPILOT_TRAILER]) == "Copilot"

def test_detect_ai_tool_none():
    assert detect_ai_tool(["fix: typo"]) is None

def test_detect_ai_tool_first_commit_wins():
    assert detect_ai_tool([CLAUDE_TRAILER, COPILOT_TRAILER]) == "Claude Code"
    assert detect_ai_tool([COPILOT_TRAILER, CLAUDE_TRAILER]) == "Copilot"

# detect_ai_usage
def test_detect_ai_usage_agent_label():
    assert detect_ai_usage(["ai-assisted", "ai-agent"], []) == "Agent"

def test_detect_ai_usage_assisted_label():
    assert detect_ai_usage(["ai-assisted"], []) == "Assisted"

def test_detect_ai_usage_no_label_no_trailer():
    assert detect_ai_usage([], ["fix: typo"]) == "None"

def test_detect_ai_usage_no_label_but_trailer():
    assert detect_ai_usage([], [CLAUDE_TRAILER]) == "Assisted"

# extract_time_saved
def test_extract_time_saved_match():
    assert extract_time_saved("## AI usage\n- AI time saved (hours): 3.5\n") == 3.5

def test_extract_time_saved_case_insensitive():
    assert extract_time_saved("ai TIME SAVED (Hours): 2") == 2.0

def test_extract_time_saved_no_match():
    assert extract_time_saved("nothing here") is None

def test_extract_time_saved_empty_body():
    assert extract_time_saved("") is None

def test_extract_time_saved_tolerates_approx_prefix():
    assert extract_time_saved("AI time saved (hours): ~40") == 40.0
    assert extract_time_saved("AI time saved (hours): approx 5") == 5.0
    assert extract_time_saved("AI time saved (hours): about 2.5") == 2.5

def test_time_saved_unparseable_flags_vague_text():
    assert time_saved_unparseable("AI time saved (hours): a lot") is True

def test_time_saved_unparseable_false_when_parseable():
    assert time_saved_unparseable("AI time saved (hours): 3") is False

def test_time_saved_unparseable_false_when_absent():
    assert time_saved_unparseable("no mention here") is False
    assert time_saved_unparseable("") is False

# higher_tier
def test_higher_tier_upgrades():
    assert higher_tier("None", "Assisted") == "Assisted"
    assert higher_tier("Assisted", "Agent") == "Agent"

def test_higher_tier_never_downgrades():
    assert higher_tier("Agent", "None") == "Agent"
    assert higher_tier("Agent", "Assisted") == "Agent"

# compute_field_updates
def test_compute_field_updates_upgrades_usage():
    updates = compute_field_updates("None", None, 0, "Agent", None, None)
    assert updates == {"usage": "Agent"}

def test_compute_field_updates_no_downgrade():
    updates = compute_field_updates("Agent", None, 0, "None", None, None)
    assert "usage" not in updates

def test_compute_field_updates_sets_tool_once():
    updates = compute_field_updates("None", None, 0, "Assisted", "Claude Code", None)
    assert updates["tool"] == "Claude Code"

def test_compute_field_updates_does_not_overwrite_existing_tool():
    updates = compute_field_updates("Assisted", "Copilot", 0, "Assisted", "Claude Code", None)
    assert "tool" not in updates

def test_compute_field_updates_accumulates_hours():
    updates = compute_field_updates("None", None, 2.0, "None", None, 3.0)
    assert updates["hours"] == 5.0

def test_compute_field_updates_no_hours_detected():
    updates = compute_field_updates("None", None, 2.0, "None", None, None)
    assert "hours" not in updates

def test_compute_field_updates_no_changes_is_empty():
    updates = compute_field_updates("Agent", "Claude Code", 5.0, "Assisted", "Copilot", None)
    assert updates == {}
