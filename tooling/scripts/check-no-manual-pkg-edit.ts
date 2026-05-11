#!/usr/bin/env tsx
import { execSync } from 'node:child_process'

const META_KEYS = new Set([
  'description',
  'keywords',
  'homepage',
  'repository',
  'bugs',
  'publishConfig',
  'files',
  'version',
  'scripts',
  'private',
  'type',
  'main',
  'types',
  'exports',
  'engines',
  'name',
])

const base = process.env.BASE_REF || 'origin/main'
let changed: string[]
try {
  changed = execSync(`git diff --name-only ${base}...HEAD`)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
} catch {
  console.log('(no base ref reachable — skipping check)')
  process.exit(0)
}

const pkgJsons = changed.filter((f) => f.endsWith('package.json'))
const lockChanged = changed.includes('pnpm-lock.yaml')

if (pkgJsons.length === 0) {
  console.log('✓ no package.json changes')
  process.exit(0)
}

if (lockChanged) {
  console.log(`✓ ${pkgJsons.length} package.json file(s) changed, lockfile updated`)
  process.exit(0)
}

// package.json changed but lockfile didn't — only allow if every diff is metadata-only.
const offenders: string[] = []
for (const f of pkgJsons) {
  const diff = execSync(`git diff ${base}...HEAD -- ${f}`).toString()
  // Heuristic: every changed key prefix on a +/- line must be in META_KEYS.
  const changedKeys = new Set<string>()
  for (const line of diff.split('\n')) {
    if (!/^[+-]\s*"/.test(line)) continue
    const m = line.match(/^[+-]\s*"([^"]+)"\s*:/)
    const key = m?.[1]?.split('.')[0]
    if (key) changedKeys.add(key)
  }
  const nonMeta = [...changedKeys].filter((k) => !META_KEYS.has(k))
  if (nonMeta.length > 0) offenders.push(`${f}: changed non-metadata keys [${nonMeta.join(', ')}]`)
}

if (offenders.length) {
  console.error('✗ package.json edited without lockfile update:')
  for (const o of offenders) console.error(`  ${o}`)
  console.error('  Run `pnpm install` or use `pnpm <add|remove|pkg set>` instead.')
  process.exit(1)
}

console.log(`✓ ${pkgJsons.length} package.json file(s) changed, metadata-only`)
