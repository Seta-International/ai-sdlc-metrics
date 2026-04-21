#!/usr/bin/env bash
# Pre-commit hook: rejects staged files containing Tailwind arbitrary color
# or spacing values. Invoked by lefthook with staged file paths as arguments.

set -euo pipefail

files=()
for f in "$@"; do
  [[ "$f" =~ \.(tsx?|jsx?)$ ]] && files+=("$f")
done

[ "${#files[@]}" -eq 0 ] && exit 0

# Collect all violations into a temp file to avoid subshell variable scoping issues
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for file in "${files[@]}"; do
  [ -f "$file" ] || continue

  # Arbitrary hex colors: [#abc] [#aabbcc] etc.
  grep -nEo '\[#[0-9a-fA-F]{3,8}\]' "$file" 2>/dev/null \
    | sed "s|^\([0-9]*\):\(.*\)|${file}:\1: arbitrary hex color: \2|" >> "$tmp" || true

  # Arbitrary rgb/rgba colors
  grep -nEo '\[rgba?\(' "$file" 2>/dev/null \
    | sed "s|^\([0-9]*\):\(.*\)|${file}:\1: arbitrary rgba/rgb color: \2|" >> "$tmp" || true

  # Arbitrary px values — exclude responsive breakpoint modifiers like max-[500px]: or min-[768px]:
  grep -nE '\[[0-9]+(\.[0-9]+)?px\]' "$file" 2>/dev/null \
    | grep -v '\[[0-9][0-9.]*px\]:' \
    | while IFS=: read -r lineno rest; do
        match=$(printf '%s' "$rest" | grep -Eo '\[[0-9]+(\.[0-9]+)?px\]' | head -1)
        printf '%s:%s: arbitrary px value: %s\n' "$file" "$lineno" "$match"
      done >> "$tmp" || true
done

if [ -s "$tmp" ]; then
  cat "$tmp" >&2
  echo "" >&2
  echo "Design system violation: replace arbitrary values with named tokens." >&2
  echo "See: docs/superpowers/specs/2026-04-16-design-system-enforcement-design.md" >&2
  exit 1
fi
