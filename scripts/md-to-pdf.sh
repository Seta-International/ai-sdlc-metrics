#!/usr/bin/env bash
# md-to-pdf.sh — convert markdown files (with mermaid blocks) to PDF.
#
# Mermaid blocks are pre-rendered to SVG via @mermaid-js/mermaid-cli (mmdc) and
# inlined as data-URI images, then md-to-pdf prints the result with Puppeteer.
# Tool deps live in scripts/md-to-pdf/ and are isolated from the workspace.
#
# Usage:
#   sh scripts/md-to-pdf.sh <file.md> [<file.md> ...]
#   sh scripts/md-to-pdf.sh --out-dir docs/architecture/exports docs/architecture/*.md

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOL_DIR="$REPO_ROOT/scripts/md-to-pdf"

if [ ! -d "$TOOL_DIR/node_modules" ]; then
  echo "Installing md-to-pdf tool dependencies (one-time)…"
  (cd "$TOOL_DIR" && bun install)
fi

cd "$REPO_ROOT"
exec bun run "$TOOL_DIR/convert.mjs" "$@"
