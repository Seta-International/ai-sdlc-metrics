#!/usr/bin/env tsx
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'

type Kind = 'platform-agent' | 'platform' | 'channel' | 'product' | 'app'

const KINDS: Record<Kind, { dir: string; public: boolean }> = {
  'platform-agent': { dir: 'platform/agent', public: false },
  platform: { dir: 'platform', public: false },
  channel: { dir: 'modules/channels', public: false },
  product: { dir: 'modules/products', public: false },
  app: { dir: 'apps', public: false },
}

const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '')

function sh(cmd: string, cwd = REPO_ROOT) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'inherit'] })
    .toString()
    .trim()
}

function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a?.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        flags[key] = next
        i++
      } else {
        flags[key] = 'true'
      }
    }
  }
  return flags
}

async function prompt(rl: ReturnType<typeof createInterface>, q: string, fallback?: string) {
  const v = (await rl.question(`${q} `)).trim()
  return v || fallback || ''
}

function refuse(msg: string): never {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

function computeName(kind: Kind, shortName: string): string {
  if (kind === 'platform-agent') {
    return shortName.startsWith('agent-') ? `@seta/${shortName}` : `@seta/agent-${shortName}`
  }
  if (kind === 'app') return `@seta/${shortName}`
  if (shortName.startsWith('agent-'))
    refuse(`'agent-' prefix is reserved for platform-agent kind (got ${kind})`)
  return `@seta/${shortName}`
}

function writeTsconfig(pkgDir: string) {
  const depth = relative(pkgDir, REPO_ROOT).split('/').filter(Boolean).length
  const tsconfigPath = `${'../'.repeat(depth)}platform/tsconfig/node.json`
  writeFileSync(
    join(pkgDir, 'tsconfig.json'),
    `${JSON.stringify({ extends: tsconfigPath, include: ['src/**/*'] }, null, 2)}\n`,
  )
}

function writeVitestConfig(pkgDir: string, name: string) {
  writeFileSync(
    join(pkgDir, 'vitest.config.ts'),
    `import { defineConfig } from 'vitest/config'\n\nexport default defineConfig({\n  test: { name: '${name}' },\n})\n`,
  )
}

function writeIndex(pkgDir: string) {
  mkdirSync(join(pkgDir, 'src'), { recursive: true })
  writeFileSync(join(pkgDir, 'src', 'index.ts'), 'export {}\n')
  writeFileSync(
    join(pkgDir, 'src', 'index.test.ts'),
    `import { expect, test } from 'vitest'\n\ntest('placeholder', () => {\n  expect(true).toBe(true)\n})\n`,
  )
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  let kind = flags.kind as Kind | undefined
  let shortName = flags.name
  let description = flags.desc

  if (!kind || !shortName || !description) {
    const rl = createInterface({ input: stdin, output: stdout })
    if (!kind) {
      const options = Object.keys(KINDS).join(' | ')
      kind = (await prompt(rl, `kind (${options}):`)) as Kind
    }
    if (!shortName) shortName = await prompt(rl, 'short name (no @seta/ prefix):')
    if (!description) description = await prompt(rl, 'one-line description:')
    rl.close()
  }

  if (!kind || !KINDS[kind]) refuse(`unknown kind: ${kind}`)
  if (!shortName) refuse('short name required')
  if (!description) refuse('description required')

  const fullName = computeName(kind, shortName)
  const baseDirName = shortName.replace(/^agent-/, '')
  const dirName = kind === 'platform-agent' ? baseDirName : shortName
  const pkgDir = join(REPO_ROOT, KINDS[kind].dir, dirName)

  if (existsSync(pkgDir)) refuse(`package dir already exists: ${pkgDir}`)
  mkdirSync(pkgDir, { recursive: true })

  console.log(`→ scaffolding ${fullName} at ${relative(REPO_ROOT, pkgDir)}`)

  // pnpm 11 has not implemented `pnpm pkg` — falls back to `npm pkg`.
  sh('pnpm init', pkgDir)
  sh(`npm pkg set name=${fullName}`, pkgDir)
  sh(`npm pkg set version=0.1.0`, pkgDir)
  sh(`npm pkg set private=true --json`, pkgDir)
  sh(`npm pkg set type=module`, pkgDir)
  sh(`npm pkg set description=${JSON.stringify(description)}`, pkgDir)
  sh(`npm pkg set main=./dist/index.js`, pkgDir)
  sh(`npm pkg set types=./dist/index.d.ts`, pkgDir)
  sh(`npm pkg set files[0]=dist`, pkgDir)
  sh(`npm pkg set scripts.build="tsup src/index.ts --format esm --dts --sourcemap"`, pkgDir)
  sh(`npm pkg set scripts.dev="tsup src/index.ts --format esm --dts --watch"`, pkgDir)
  sh(`npm pkg set scripts.test:unit="vitest run"`, pkgDir)
  sh(`npm pkg set scripts.typecheck="tsc --noEmit -p tsconfig.json"`, pkgDir)
  sh(`npm pkg set license=Apache-2.0`, pkgDir)
  sh(`npm pkg delete scripts.test`, pkgDir)
  sh(`npm pkg delete author`, pkgDir)
  sh(`npm pkg delete keywords`, pkgDir)

  writeTsconfig(pkgDir)
  writeVitestConfig(pkgDir, fullName)
  writeIndex(pkgDir)

  // Reinstall to pick up the new workspace package + link transitively.
  sh('pnpm install --silent')

  console.log(`✓ ${fullName} created at ${relative(REPO_ROOT, pkgDir)}`)
  console.log(`  next: pnpm --filter ${fullName} add <deps>`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
