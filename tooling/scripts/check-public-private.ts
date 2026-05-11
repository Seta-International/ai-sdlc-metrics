#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

type Pkg = { name: string; private: boolean; dir: string; deps: string[] }

const repoRoot = execSync('git rev-parse --show-toplevel').toString().trim()
const raw = execSync('pnpm -r list --json --depth -1', { cwd: repoRoot }).toString()
const list = JSON.parse(raw) as Array<{
  name?: string
  path: string
  private?: boolean
  dependencies?: Record<string, { version: string }>
  devDependencies?: Record<string, { version: string }>
}>

const packages: Pkg[] = list
  .filter((p) => p.name && p.path !== repoRoot)
  .map((p) => {
    const pj = JSON.parse(readFileSync(`${p.path}/package.json`, 'utf8')) as {
      private?: boolean
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const deps = [
      ...Object.keys(pj.dependencies ?? {}),
      ...Object.keys(pj.peerDependencies ?? {}),
    ].filter((d) => d.startsWith('@seta/'))
    return { name: p.name ?? '', private: pj.private !== false, dir: p.path, deps }
  })

const byName = new Map(packages.map((p) => [p.name, p]))
const violations: string[] = []

for (const pkg of packages) {
  if (pkg.private) continue
  for (const dep of pkg.deps) {
    const target = byName.get(dep)
    if (target?.private) {
      violations.push(`✗ public ${pkg.name} imports private ${dep}`)
    }
  }
}

if (violations.length) {
  console.error('Public/private boundary violations:')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

console.log(
  `✓ public/private boundary clean (${packages.filter((p) => !p.private).length} public, ${packages.filter((p) => p.private).length} private)`,
)
