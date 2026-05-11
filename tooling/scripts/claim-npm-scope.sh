#!/usr/bin/env bash
# Run once, manually, after `npm login --scope=@seta`.

set -euo pipefail

WORK="$(mktemp -d)"
trap "rm -rf $WORK" EXIT

cd "$WORK"
npm init -y --scope=@seta
npm pkg set name=@seta/placeholder version=0.0.0 license=Apache-2.0
npm pkg set description="Reserved scope; see github.com/Seta-International/seta-os"
npm publish --access public
npm deprecate @seta/placeholder@0.0.0 "Reserved scope; see github.com/Seta-International/seta-os"

echo "✓ @seta scope claimed."
