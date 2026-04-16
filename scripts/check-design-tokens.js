#!/usr/bin/env node
// Pre-commit hook: rejects staged files containing Tailwind arbitrary color
// or spacing values. Invoked by lefthook with staged file paths as arguments.

import { readFileSync } from 'node:fs'

const PATTERNS = [
  { regex: /\[#[0-9a-fA-F]{3,8}\]/g, desc: 'arbitrary hex color' },
  { regex: /\[rgba?\(/g, desc: 'arbitrary rgba/rgb color' },
  // Matches arbitrary px values used inside utility classes.
  // Excludes responsive-breakpoint variants like max-[500px]: and min-[768px]:
  // (those are valid Tailwind responsive modifiers, not hardcoded values).
  { regex: /\[\d+(?:\.\d+)?px\](?!:)/g, desc: 'arbitrary px value' },
]

const files = process.argv.slice(2).filter((f) => /\.(tsx?|jsx?)$/.test(f))
let hasViolations = false

for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf-8')
  } catch {
    continue
  }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const { regex, desc } of PATTERNS) {
      regex.lastIndex = 0
      for (const match of lines[i].matchAll(regex)) {
        console.error(`${file}:${i + 1}: ${desc}: ${match[0]}`)
        hasViolations = true
      }
    }
  }
}

if (hasViolations) {
  console.error('\nDesign system violation: replace arbitrary values with named tokens.')
  console.error('See: docs/superpowers/specs/2026-04-16-design-system-enforcement-design.md')
  process.exit(1)
}
