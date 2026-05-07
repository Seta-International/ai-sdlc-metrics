#!/usr/bin/env bash
# Verify a backlog markdown file is atlassian-pushable per
# docs/superpowers/specs/2026-05-07-sdlc-backlog-design.md §14.1 + §5.1.
#
# Usage: verify-backlog.sh <file.md>
# Exits non-zero on any check failure; prints a summary on success.

set -euo pipefail

f="${1:?usage: verify-backlog.sh <file.md>}"
[[ -f "$f" ]] || { echo "FAIL: $f does not exist"; exit 1; }

echo "=== Verifying $f ==="

# 1. Ticket-recognition contract — at least one Epic, recognized markers only.
epics=$(grep -cE '^## \[EPIC\] ' "$f" || true)
stories=$(grep -cE '^### \[STORY\] ' "$f" || true)
tasks=$(grep -cE '^### \[TASK\] ' "$f" || true)
echo "Epics: $epics  Stories: $stories  Tasks: $tasks"

if [[ "$epics" -lt 1 && "$f" != *portfolio-overview* ]]; then
  echo "FAIL: no Epic blocks found"; exit 1
fi

# 2. Required field presence (skip portfolio overview which has no tickets).
if [[ "$f" != *portfolio-overview* ]]; then
  required=(ID Status Epic Sprint Release Priority "Story Point" Rank "Jira Key" "Confluence Link")
  # Epic blocks have a slightly looser set — Epic field absent on Epic itself.
  for header in "## \[EPIC\] " "### \[STORY\] " "### \[TASK\] "; do
    blocks=$(grep -cE "^$header" "$f" || true)
    [[ "$blocks" -eq 0 ]] && continue
    for field in "${required[@]}"; do
      if [[ "$header" == "## \[EPIC\] " && "$field" == "Epic" ]]; then continue; fi
      count=$(grep -cE "^$field:" "$f" || true)
      if [[ "$count" -lt "$blocks" ]]; then
        echo "FAIL: '$field' field count ($count) < ticket count for $header ($blocks)"
        exit 1
      fi
    done
  done
fi

# 3. ID uniqueness within file.
dup_ids=$(grep -E '^ID:' "$f" | awk '{print $2}' | sort | uniq -d || true)
if [[ -n "$dup_ids" ]]; then
  echo "FAIL: duplicate IDs in $f:"; echo "$dup_ids"; exit 1
fi

# 4. Epic references on Story/Task tickets — every 'Epic:' value must match an
#    Epic ID declared via '## [EPIC] <ID> ...' OR an 'ID:' on an Epic block.
epic_ids=$(grep -oE '^## \[EPIC\] [A-Z]+-[0-9]+' "$f" | awk '{print $3}' | sort -u || true)
referenced=$(grep -E '^Epic:' "$f" | awk '{print $2}' | sort -u || true)
for ref in $referenced; do
  if ! echo "$epic_ids" | grep -qx "$ref"; then
    echo "WARN: Epic reference '$ref' not declared in this file (may be a cross-file reference; check portfolio overview)."
  fi
done

# 5. Markdown formatting.
if command -v bunx >/dev/null 2>&1; then
  bunx prettier --check "$f" >/dev/null || { echo "FAIL: prettier formatting"; exit 1; }
fi

echo "OK: $f passes atlassian-readiness checks"
