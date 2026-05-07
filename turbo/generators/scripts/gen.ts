#!/usr/bin/env bun
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import * as commandGen from '../generators/command.gen'
import * as entityGen from '../generators/entity.gen'
import * as moduleGen from '../generators/module.gen'
import * as queryGen from '../generators/query.gen'
import * as removeGen from '../generators/remove.gen'
import * as zoneGen from '../generators/zone.gen'
import { flush } from '../lib/flush'
import { runTypecheck } from '../lib/postwrite'
import { renderPlan } from '../lib/preview'
import { createTree, type Tree } from '../lib/tree'
import {
  runAll,
  validateModuleDoesNotExist,
  validateModuleExists,
  validateName,
  validateNotReserved,
  validateZoneDoesNotExist,
} from '../lib/validate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApplyFn = (tree: Tree, args: any) => void
const APPLIES: Record<string, ApplyFn> = {
  command: commandGen.apply,
  entity: entityGen.apply,
  module: moduleGen.apply,
  query: queryGen.apply,
  remove: removeGen.apply,
  zone: zoneGen.apply,
}

const USAGE = `Usage: bun run gen <generator> [flags]

Generators:
  module    Scaffold a new API DDD module (CRUD on a sample entity)
              flags: --name <kebab> [--with-zone]
  zone      Scaffold a Next.js zone for an existing module
              flags: --name <kebab>
  command   Add a command handler to a module
              flags: --module <kebab> --name <verb-noun>
  query     Add a query handler to a module
              flags: --module <kebab> --name <verb-noun>
  entity    Add an entity (schema + repo + drizzle impl) to a module
              flags: --module <kebab> --name <kebab>
  remove    Remove a previously generated module or zone
              flags: --kind module|zone --name <kebab> [--with-zone]

Global flags:
  --dry-run    Print the file plan; write nothing.
  --help       Show this message.

Examples:
  bun run gen module --name billing --with-zone
  bun run gen module --name billing --with-zone --dry-run
  bun run gen command --module billing --name approve-invoice
  bun run gen remove --kind module --name billing --with-zone
`

function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  let cur = here
  while (cur !== '/' && !existsSync(join(cur, 'turbo.json'))) cur = dirname(cur)
  if (cur === '/') throw new Error('Could not find repo root (turbo.json)')
  return cur
}

function fail(msg: string): never {
  process.stderr.write(`\n${msg}\n\n`)
  process.exit(1)
}

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    name: { type: 'string' },
    module: { type: 'string' },
    kind: { type: 'string' },
    'with-zone': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help || positionals.length === 0) {
  process.stdout.write(USAGE)
  process.exit(values.help ? 0 : 1)
}

const generator = positionals[0] ?? ''
const apply = APPLIES[generator]
if (!apply) fail(`Unknown generator "${generator}". Run with --help to see the list.`)

const dryRun = values['dry-run'] === true
const args: Record<string, unknown> = {}
if (typeof values.name === 'string') args['name'] = values.name
if (typeof values.module === 'string') args['module'] = values.module
if (typeof values.kind === 'string') args['kind'] = values.kind
if (values['with-zone']) args['withZone'] = true

const tree = createTree(repoRoot())

if (typeof args['name'] === 'string') {
  const checks = [validateName(args['name']), validateNotReserved(args['name'])]
  if (generator === 'module') checks.push(validateModuleDoesNotExist(tree, args['name']))
  if (generator === 'zone') checks.push(validateZoneDoesNotExist(tree, args['name']))
  if (generator === 'remove' && args['kind'] === 'module') {
    checks.push(validateModuleExists(tree, args['name']))
  }
  const v = runAll(checks)
  if (!v.ok) fail('Validation failed:\n  - ' + v.reasons.join('\n  - '))
} else if (generator !== 'remove' || args['kind'] !== undefined) {
  // every generator except a `remove --help`-style invocation requires a name
  fail(`Missing --name flag for "${generator}".`)
}

apply(tree, args)

const changes = tree.changes()
process.stdout.write(renderPlan(changes, []))
flush(tree, { dryRun })

if (!dryRun) {
  // A new workspace package (zone, or module with --with-zone) needs `bun install`
  // before its package can resolve. Running typecheck here just emits noisy
  // "package not found" warnings; print a clear next-step hint instead.
  const newWorkspace = changes.find(
    (c) => c.kind === 'create' && /^apps\/web-([^/]+)\/package\.json$/.test(c.path),
  )
  // `remove` only deletes / edits AST — nothing was added to typecheck. The
  // existing CI runs the full typecheck; running it here on every remove is
  // noisy and slow.
  const isRemove = generator === 'remove'

  if (newWorkspace) {
    const zoneName = newWorkspace.path.match(/^apps\/web-([^/]+)\//)?.[1]
    process.stdout.write(
      `\nNext: \`bun install\` to register @future/web-${zoneName ?? '<name>'}, ` +
        `then \`bun run --filter @future/web-${zoneName ?? '<name>'} typecheck\`.\n`,
    )
  } else if (!isRemove) {
    try {
      runTypecheck(repoRoot(), {})
    } catch (err) {
      process.stderr.write(
        '\n⚠️  Post-write typecheck failed. To undo: `git restore .` and re-run with --dry-run to inspect.\n',
      )
      throw err
    }
  }
}

process.stdout.write(dryRun ? '\n(dry-run; no files written)\n' : '\napplied\n')
