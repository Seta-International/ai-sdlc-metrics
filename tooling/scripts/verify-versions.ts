#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

type Pkg = { name?: string; path: string }
const list = JSON.parse(execSync('pnpm -r list --json --depth -1').toString()) as Pkg[]

const seen = new Map<string, string>()
for (const pkg of list) {
  if (!pkg.path) continue
  let pj: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
  try {
    pj = JSON.parse(readFileSync(`${pkg.path}/package.json`, 'utf8'))
  } catch {
    continue
  }
  for (const [name, range] of Object.entries({ ...pj.dependencies, ...pj.devDependencies })) {
    if (range.startsWith('workspace:')) continue
    seen.set(name, range)
  }
}

const drifted: Array<{ name: string; pinned: string; latest: string }> = []
for (const [name, pinned] of seen) {
  let latest = ''
  try {
    latest = execSync(`npm view ${name} version`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    continue
  }
  const cleaned = pinned.replace(/^[\^~]/, '')
  if (cleaned !== latest) drifted.push({ name, pinned, latest })
}

if (drifted.length === 0) {
  console.log(`✓ all ${seen.size} pinned packages are at latest`)
  process.exit(0)
}
console.log('Drifted pins (pinned → latest):')
for (const d of drifted) console.log(`  ${d.name}: ${d.pinned} → ${d.latest}`)
