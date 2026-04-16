#!/bin/sh

set -eu

ROOT_DIR=$(pwd)

if [ "$#" -lt 1 ]; then
  echo "Usage: sh scripts/deps-workspaces.sh <outdated|update|update:interactive|update:latest> [extra args]" >&2
  exit 1
fi

MODE=$1
shift

case "$MODE" in
  outdated)
    BUN_ARGS="outdated"
    ;;
  update)
    BUN_ARGS="update"
    ;;
  update:interactive)
    BUN_ARGS="update -i"
    ;;
  update:latest)
    BUN_ARGS="update --latest"
    ;;
  *)
    echo "Usage: sh scripts/deps-workspaces.sh <outdated|update|update:interactive|update:latest> [extra args]" >&2
    exit 1
    ;;
esac

found_workspace=0
failures=""

run_workspace() {
  workspace_dir=$1
  shift
  workspace_label=${workspace_dir#"$ROOT_DIR"/}

  echo
  echo "==> $workspace_label"

  # shellcheck disable=SC2086
  if (cd "$workspace_dir" && bun $BUN_ARGS "$@"); then
    return 0
  fi

  exit_code=$?

  if [ "$exit_code" -eq 130 ] || [ "$exit_code" -eq 143 ]; then
    exit "$exit_code"
  fi

  failures="$failures
- $workspace_label (exit $exit_code)"
  return 0
}

for base_dir in apps packages; do
  for workspace_dir in "$ROOT_DIR"/"$base_dir"/*; do
    if [ ! -d "$workspace_dir" ] || [ ! -f "$workspace_dir/package.json" ]; then
      continue
    fi

    found_workspace=1
    run_workspace "$workspace_dir" "$@"
  done
done

if [ "$found_workspace" -eq 0 ]; then
  echo "No workspaces with package.json found under apps/ or packages/." >&2
  exit 1
fi

if [ -n "$failures" ]; then
  echo >&2
  echo "Dependency command failed in:" >&2
  printf '%s\n' "$failures" >&2
  exit 1
fi