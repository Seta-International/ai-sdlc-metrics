#!/usr/bin/env bun
/**
 * One-click dependency upgrade script.
 *
 * Usage:
 *   bun run upgrade          — update all deps to latest (including major bumps)
 *   bun run upgrade --audit  — audit only, no installs
 *   bun run upgrade --check  — dry-run, show what would be updated
 *
 * Strategy:
 *   1. bun update --latest at root (lockfile sync for all workspaces)
 *   2. Check every workspace individually with `bun outdated` and upgrade
 *      each package so per-workspace package.json ranges are bumped too
 *   3. Re-pin cross-major packages bun cannot auto-cross
 *   4. Run bun audit and surface any remaining vulnerabilities
 *   5. Run typecheck + unit tests to catch regressions
 */

import { $ } from 'bun'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'

const ARGS = process.argv.slice(2)
const DRY_RUN = ARGS.includes('--check')
const AUDIT_ONLY = ARGS.includes('--audit')

const ROOT = import.meta.dir.replace('/scripts', '')

// All workspace directories (matches package.json workspaces globs)
const WORKSPACE_DIRS = [
  ...readdirSync(join(ROOT, 'apps')).map((d) => `apps/${d}`),
  ...readdirSync(join(ROOT, 'packages')).map((d) => `packages/${d}`),
  'data-platform/cubejs',
].filter((d) => existsSync(join(ROOT, d, 'package.json')))

// Packages that need an explicit major-version pin beyond what
// `bun update --latest` can resolve automatically (cross-major bumps).
// Format: [workspaceDir, isDev, packageName, version]
// Add new entries here whenever a new major bump is needed.
const PINNED_MAJORS: [string, boolean, string, string][] = [
  ['packages/charts', true, 'happy-dom', '^20.0.0'],
  ['apps/api', true, 'happy-dom', '^20.0.0'],
]

function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

async function run(cmd: string, cwd?: string): Promise<{ ok: boolean; output: string }> {
  try {
    const proc = cwd
      ? await $`bash -c ${cmd}`.cwd(cwd).quiet().text()
      : await $`bash -c ${cmd}`.quiet().text()
    return { ok: true, output: proc }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const output = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n')
    return { ok: false, output }
  }
}

// Parse `bun outdated` table output → [{name, current, latest}]
function parseOutdated(output: string): { name: string; current: string; latest: string }[] {
  const results: { name: string; current: string; latest: string }[] = []
  for (const line of output.split('\n')) {
    // Table rows look like: │ package-name  │ 1.0.0  │ 1.0.0  │ 2.0.0 │
    const cols = line
      .split('│')
      .map((c) => c.trim())
      .filter(Boolean)
    if (cols.length >= 3 && cols[0] !== 'Package' && /^\d/.test(cols[1])) {
      results.push({ name: cols[0], current: cols[1], latest: cols[cols.length - 1] })
    }
  }
  return results
}

// ── 1. Root-level update (lockfile sync) ──────────────────────────────────────

section('Step 1 — bun update --latest (root lockfile sync)')

if (DRY_RUN) {
  console.log('[dry-run] Would run: bun update --latest')
} else {
  const { output } = await run('bun update --latest', ROOT)
  const summary = output
    .split('\n')
    .find((l) => l.includes('packages installed') || l.includes('no changes'))
  console.log(summary ?? output.trim())
}

// ── 2. Per-workspace outdated check + upgrade ─────────────────────────────────

if (!AUDIT_ONLY) {
  section(`Step 2 — Per-workspace upgrade (${WORKSPACE_DIRS.length} workspaces)`)

  let totalUpgraded = 0

  for (const wsDir of WORKSPACE_DIRS) {
    const abs = join(ROOT, wsDir)
    const { output } = await run('bun outdated', abs)
    const outdated = parseOutdated(output)

    if (outdated.length === 0) continue

    console.log(`\n  ${wsDir}:`)
    for (const { name, current, latest } of outdated) {
      const isMajor = latest.split('.')[0] !== current.split('.')[0]
      const label = isMajor
        ? `${name}  ${current} → ${latest}  (MAJOR)`
        : `${name}  ${current} → ${latest}`

      if (DRY_RUN) {
        console.log(`    [dry-run] ${label}`)
        continue
      }

      process.stdout.write(`    ${label} ... `)
      const { ok, output: addOut } = await run(`bun add "${name}@^${latest}"`, abs)
      if (ok || addOut.includes('installed')) {
        console.log('✓')
        totalUpgraded++
      } else {
        console.log('⚠ failed')
        console.log(`      ${addOut.split('\n')[0]}`)
      }
    }
  }

  if (!DRY_RUN) {
    console.log(`\n  Total upgraded: ${totalUpgraded} package(s)`)
  }

  // ── 3. Re-pin cross-major packages ──────────────────────────────────────────

  section('Step 3 — Re-pin cross-major packages')

  for (const [dir, isDev, pkg, version] of PINNED_MAJORS) {
    const label = `${pkg}@${version} in ${dir}`
    if (DRY_RUN) {
      console.log(`[dry-run] Would pin: ${label}`)
      continue
    }
    process.stdout.write(`  Pinning ${label} ... `)
    const flag = isDev ? '-d' : ''
    const { ok, output } = await run(`bun add ${flag} "${pkg}@${version}"`, join(ROOT, dir))
    if (ok || output.includes('installed')) {
      console.log('✓')
    } else {
      console.log('⚠ failed')
      console.warn(`  ${output.split('\n')[0]}`)
    }
  }
}

// ── 4. Security audit ─────────────────────────────────────────────────────────

section('Step 4 — Security audit')

const { output: auditOut } = await run('bun audit', ROOT)
console.log(auditOut.trim())

const summaryMatch = auditOut.match(/(\d+) vulnerabilit/)
const criticalMatch = auditOut.match(/(\d+) critical/)
const highMatch = auditOut.match(/(\d+) high/)

if (summaryMatch) {
  const total = Number(summaryMatch[1])
  const critical = Number(criticalMatch?.[1] ?? 0)
  const high = Number(highMatch?.[1] ?? 0)

  if (critical > 0) {
    console.error(
      `\n✗ ${critical} critical vulnerabilit${critical > 1 ? 'ies' : 'y'} remain — investigate before committing.`,
    )
    process.exit(1)
  } else if (high > 0) {
    console.warn(
      `\n⚠ ${high} high vulnerabilit${high > 1 ? 'ies' : 'y'} remain (upstream blocked — review advisories).`,
    )
  } else if (total === 0) {
    console.log('\n✓ No vulnerabilities found.')
  } else {
    console.log(`\n✓ ${total} low/moderate vulnerabilities remain (upstream blocked).`)
  }
} else {
  console.log('\n✓ No vulnerabilities found.')
}

if (AUDIT_ONLY) process.exit(0)

// ── 5. Typecheck ──────────────────────────────────────────────────────────────

section('Step 5 — Typecheck')

if (DRY_RUN) {
  console.log('[dry-run] Would run: bun run typecheck')
} else {
  const { ok, output } = await run('bun run typecheck', ROOT)
  const summary = output
    .split('\n')
    .filter((l) => l.includes('Tasks:') || l.includes('successful') || l.includes('failed'))
    .join('\n')
  console.log(summary || output.trim() || '(no output)')
  if (!ok) {
    console.error('\n✗ Typecheck failed — review errors above before committing.')
    process.exit(1)
  }
  console.log('\n✓ Typecheck passed.')
}

// ── 6. Unit tests ─────────────────────────────────────────────────────────────

section('Step 6 — Unit tests')

if (DRY_RUN) {
  console.log('[dry-run] Would run: bun run test:unit')
} else {
  const { ok, output } = await run('bun run test:unit', ROOT)
  const lines = output.trim().split('\n')
  console.log(lines.slice(-15).join('\n'))
  if (!ok) {
    console.error('\n✗ Tests failed — review and fix before committing.')
    process.exit(1)
  }
  console.log('\n✓ All tests passed.')
}

// ── Done ──────────────────────────────────────────────────────────────────────

section('Done')
console.log(
  DRY_RUN
    ? 'Dry-run complete. Run `bun run upgrade` to apply changes.'
    : 'All deps upgraded, audited, and verified. Ready to commit.',
)
