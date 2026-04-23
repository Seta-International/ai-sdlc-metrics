#!/usr/bin/env bash
# Pre-commit hook: rejects staged .tsx files that use raw HTML interactive
# elements instead of @future/ui components.
#
# Rules enforced:
#   1. <button  → use <Button> from @future/ui
#   2. <input   → use <Input> from @future/ui
#   3. <textarea → use <Textarea> from @future/ui
#   4. <select  → use <Select> from @future/ui
#   5. <progress → use <Progress> from @future/ui
#   6. <table   → use <DataTable> from @future/ui
#   7. Direct @tanstack/react-table imports → re-export from @future/ui
#   8. Direct lucide-react imports → use @future/ui/icons
#   9. Direct @tanstack/react-query imports → re-export from @future/api-client
#  10. Direct sonner imports → re-export from @future/ui
#  11. Bare icon chars (× ✕ ✗ ← → ↑ ↓ +) in JSX text/expression context
#      → use the matching Lucide icon from @future/ui
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
  [[ "$f" =~ ^packages/api-client/ ]] && continue
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

  # ── Rule 5: <progress> ───────────────────────────────────────────────────
  grep -nE '<progress[[:space:]>/]' "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: raw <progress> — use <Progress> from @future/ui\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 6: <table> ──────────────────────────────────────────────────────
  grep -nE '<table[[:space:]>/]' "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: raw <table> — use <DataTable> from @future/ui\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 7: direct @tanstack/react-table imports ─────────────────────────
  grep -nE "from '@tanstack/react-table'" "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: direct @tanstack/react-table import — re-export via @future/ui instead\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 8: direct lucide-react imports ─────────────────────────────────
  grep -nE "from 'lucide-react'" "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: direct lucide-react import — use @future/ui/icons instead\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 9: direct @tanstack/react-query imports ─────────────────────────
  grep -nE "from '@tanstack/react-query'" "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: direct @tanstack/react-query import — re-export via @future/api-client instead\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 10: direct sonner imports ───────────────────────────────────────
  grep -nE "from 'sonner'" "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        printf '%s:%s: direct sonner import — re-export via @future/ui instead\n' "$file" "$lineno"
      done >> "$tmp" || true

  # ── Rule 11: bare icon characters in JSX text/expression context ─────────
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
