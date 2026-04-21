#!/usr/bin/env bash
# Pre-commit hook: detects DDD boundary violations in staged TypeScript files.
#
# Rules enforced:
#   1. No cross-module domain/ or infrastructure/ imports.
#      Files inside modules/<A>/ must never import from modules/<B>/domain/ or
#      modules/<B>/infrastructure/. Only modules/<B>/application/facades/ is allowed
#      as a cross-module import path.
#   2. No .js extensions on relative imports.
#      Write './foo', not './foo.js'. This repo is NodeNext+CJS — extensions are wrong.
#
# Invoked by lefthook with staged file paths as arguments.

set -euo pipefail

# All known domain module names. Update when a new module is added.
MODULES="admin agents documents finance goals hiring identity insights kernel notifications people performance planner preferences projects time"

files=()
for f in "$@"; do
  [[ "$f" =~ \.(tsx?|jsx?)$ ]] && files+=("$f")
done

[ "${#files[@]}" -eq 0 ] && exit 0

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

for file in "${files[@]}"; do
  [ -f "$file" ] || continue

  # ── Rule 1: cross-module domain/infrastructure imports ────────────────────
  # Only applies to files inside apps/api/src/modules/<module>/
  if echo "$file" | grep -qE "apps/api/src/modules/[^/]+/"; then
    current_module=$(echo "$file" | sed 's|.*modules/\([^/]*\)/.*|\1|')

    for mod in $MODULES; do
      # Skip same-module — within-module domain/ imports are legal
      [ "$mod" = "$current_module" ] && continue

      # Match import paths containing /<mod>/domain/ or /<mod>/infrastructure/
      # Within-module paths never include the module name, so no false positives.
      grep -nE "from '[^']*'" "$file" 2>/dev/null \
        | grep -E "/${mod}/(domain|infrastructure)/" \
        | while IFS=: read -r lineno rest; do
            import=$(printf '%s' "$rest" | grep -Eo "from '[^']*'" | sed "s/from '//;s/'.*//")
            layer=$(printf '%s' "$import" | grep -Eo "(domain|infrastructure)")
            printf '%s:%s: DDD violation: cross-module %s/%s import — use %sQueryFacade instead: %s\n' \
              "$file" "$lineno" "$mod" "$layer" "$mod" "$import"
          done >> "$tmp" || true
    done
  fi

  # ── Rule 2: .js extensions on relative imports ────────────────────────────
  grep -nE "from '\./[^']*\.js'" "$file" 2>/dev/null \
    | while IFS=: read -r lineno rest; do
        import=$(printf '%s' "$rest" | grep -Eo "from '\./[^']*\.js'" | sed "s/from '//;s/'.*//")
        printf '%s:%s: .js extension on relative import — write %s not %s\n' \
          "$file" "$lineno" "${import%.js}" "$import"
      done >> "$tmp" || true
done

if [ -s "$tmp" ]; then
  cat "$tmp" >&2
  echo "" >&2
  echo "DDD violation: fix boundary breaches before committing." >&2
  echo "Rules: AGENTS.md § DDD Module Boundaries" >&2
  exit 1
fi
