#!/usr/bin/env bash
# Pre-commit hook: rejects staged .tsx files that use raw HTML interactive
# elements instead of @future/ui components.
#
# Rules enforced:
#   1. <button  → use <Button> from @future/ui
#   2. <input   → use <Input> from @future/ui
#   3. <textarea → use <Textarea> from @future/ui
#   4. <select  → use <Select> from @future/ui
#   5. Bare icon chars (× ✕ ✗ ← → ↑ ↓ +) in JSX text/expression context
#      → use the matching Lucide icon from lucide-react
#
# Exclusions:
#   - packages/ui/**  (primitive source — intentionally uses raw HTML)
#   - apps/api/**     (NestJS, no JSX)
#   - *.spec.tsx / *.stories.tsx (test/storybook setup may use raw elements)
#
# Invoked by lefthook with staged file paths as arguments.

set -euo pipefail

files=()
for f in "$@"; do
  # Only .tsx files
  [[ "$f" =~ \.tsx$ ]] || continue
  # Skip primitive source and backend
  [[ "$f" =~ ^packages/ui/ ]] && continue
  [[ "$f" =~ ^apps/api/ ]] && continue
  # Skip test and storybook files
  [[ "$f" =~ \.(spec|stories)\.tsx$ ]] && continue
  files+=("$f")
done

[ "${#files[@]}" -eq 0 ] && exit 0

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for file in "${files[@]}"; do
  [ -f "$file" ] || continue

  # ── Rule 1: <button ──────────────────────────────────────────────────────
  grep -nE '<button[[:space:]>/]' "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: raw <button> — use <Button> from @future/ui\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 2: <input ───────────────────────────────────────────────────────
  grep -nE '<input[[:space:]>/]' "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: raw <input> — use <Input> from @future/ui\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 3: <textarea ────────────────────────────────────────────────────
  grep -nE '<textarea[[:space:]>/]' "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: raw <textarea> — use <Textarea> from @future/ui\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 4: <select ──────────────────────────────────────────────────────
  grep -nE '<select[[:space:]>/]' "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: raw <select> — use <Select> from @future/ui\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 5: bare icon characters in JSX text/expression context ──────────
  # Matches lines that look like JSX output (contain > or {) and have one of
  # the forbidden chars. Skips comment lines (//) and import/string literals.
  grep -nE '[>{}][^<{}/]*[×✕✗←→↑↓][^<]*[<{}]' "$file" 2>/dev/null \
    | grep -v '^\s*//' \
    | grep -v "^[^:]*:[0-9]*:.*import" \
    | while IFS=: read -r lineno rest; do
        char=$(printf '%s' "$rest" | grep -Eo '[×✕✗←→↑↓]' | head -1)
        printf '%s:%s: bare icon char "%s" — use the matching Lucide icon from lucide-react\n' \
          "$file" "$lineno" "$char"
      done >> "$tmp" || true

  # Bare + in JSX is too common (arithmetic, strings) — skip it per design.
done

if [ -s "$tmp" ]; then
  cat "$tmp" >&2
  echo "" >&2
  echo "UI component violation: use @future/ui components instead of raw HTML elements." >&2
  echo "See AGENTS.md §UI/UX Consistency for the full replacement table." >&2
  exit 1
fi
