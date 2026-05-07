import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from './tree'
import { flush } from './flush'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'flush-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('flush', () => {
  it('writes CREATE files (mkdir -p as needed)', () => {
    const tree = createTree(dir)
    tree.write('nested/dir/foo.ts', 'export const x = 1')
    flush(tree, { dryRun: false })
    expect(readFileSync(join(dir, 'nested/dir/foo.ts'), 'utf8')).toBe('export const x = 1')
  })

  it('overwrites EDIT files', () => {
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'sub/x.ts'), 'old')
    const tree = createTree(dir)
    tree.write('sub/x.ts', 'new')
    flush(tree, { dryRun: false })
    expect(readFileSync(join(dir, 'sub/x.ts'), 'utf8')).toBe('new')
  })

  it('removes DELETE files', () => {
    writeFileSync(join(dir, 'x.ts'), 'gone')
    const tree = createTree(dir)
    tree.delete('x.ts')
    flush(tree, { dryRun: false })
    expect(existsSync(join(dir, 'x.ts'))).toBe(false)
  })

  it('dryRun=true writes nothing', () => {
    const tree = createTree(dir)
    tree.write('a.ts', 'x')
    flush(tree, { dryRun: true })
    expect(existsSync(join(dir, 'a.ts'))).toBe(false)
  })

  it('removes empty parent directories after DELETE', () => {
    mkdirSync(join(dir, 'apps/web-x/src/app/_components'), { recursive: true })
    writeFileSync(join(dir, 'apps/web-x/src/app/_components/list.tsx'), 'x')
    writeFileSync(join(dir, 'apps/web-x/src/app/page.tsx'), 'x')
    const tree = createTree(dir)
    tree.delete('apps/web-x/src/app/_components/list.tsx')
    tree.delete('apps/web-x/src/app/page.tsx')
    flush(tree, { dryRun: false })
    expect(existsSync(join(dir, 'apps/web-x/src/app/_components'))).toBe(false)
    expect(existsSync(join(dir, 'apps/web-x/src/app'))).toBe(false)
    expect(existsSync(join(dir, 'apps/web-x/src'))).toBe(false)
    expect(existsSync(join(dir, 'apps/web-x'))).toBe(false)
  })

  it('does NOT remove a directory that still has unrelated files', () => {
    mkdirSync(join(dir, 'apps/web-x'), { recursive: true })
    writeFileSync(join(dir, 'apps/web-x/keep.ts'), 'keep')
    writeFileSync(join(dir, 'apps/web-x/gone.ts'), 'gone')
    const tree = createTree(dir)
    tree.delete('apps/web-x/gone.ts')
    flush(tree, { dryRun: false })
    expect(existsSync(join(dir, 'apps/web-x/keep.ts'))).toBe(true)
    expect(existsSync(join(dir, 'apps/web-x'))).toBe(true)
  })

  it('does not prune anything outside apps/* or packages/*', () => {
    // Synthetic top-level paths are not workspace packages, so pruning is a
    // no-op. The deleted file goes away but the empty parent dirs stay.
    mkdirSync(join(dir, 'a/b'), { recursive: true })
    writeFileSync(join(dir, 'a/b/x.ts'), 'x')
    const tree = createTree(dir)
    tree.delete('a/b/x.ts')
    flush(tree, { dryRun: false })
    expect(existsSync(join(dir, 'a/b/x.ts'))).toBe(false)
    // Pruning is gated to workspace scopes for safety — empty `a/` is left.
    expect(existsSync(join(dir, 'a/b'))).toBe(true)
    expect(existsSync(join(dir, 'a'))).toBe(true)
  })

  it('stops at the workspace package boundary — never deletes apps/ or packages/', () => {
    mkdirSync(join(dir, 'apps/web-x/src'), { recursive: true })
    writeFileSync(join(dir, 'apps/web-x/src/page.tsx'), 'x')
    const tree = createTree(dir)
    tree.delete('apps/web-x/src/page.tsx')
    flush(tree, { dryRun: false })
    expect(existsSync(join(dir, 'apps/web-x'))).toBe(false)
    expect(existsSync(join(dir, 'apps'))).toBe(true)
  })

  // Reproduces the "smoketest catastrophe" — deleting every file under
  // apps/api/src/modules/smoke/ must NOT prune apps/api/, apps/api/src/,
  // or apps/api/src/modules/. Sibling files (package.json, Dockerfile,
  // other modules, node_modules) must all survive.
  it('preserves siblings when pruning a removed-module subtree', () => {
    mkdirSync(join(dir, 'apps/api/node_modules/x'), { recursive: true })
    mkdirSync(join(dir, 'apps/api/scripts'), { recursive: true })
    mkdirSync(join(dir, 'apps/api/src/modules/kernel'), { recursive: true })
    mkdirSync(join(dir, 'apps/api/src/modules/smoke/application/commands'), { recursive: true })
    mkdirSync(join(dir, 'apps/api/src/modules/smoke/application/queries'), { recursive: true })
    mkdirSync(join(dir, 'apps/api/src/modules/smoke/domain/entities'), { recursive: true })
    mkdirSync(join(dir, 'apps/api/src/modules/smoke/infrastructure/repositories'), {
      recursive: true,
    })
    mkdirSync(join(dir, 'apps/api/src/modules/smoke/interface/trpc'), { recursive: true })

    writeFileSync(join(dir, 'apps/api/package.json'), '{}')
    writeFileSync(join(dir, 'apps/api/Dockerfile'), 'x')
    writeFileSync(join(dir, 'apps/api/scripts/seed.ts'), 'x')
    writeFileSync(join(dir, 'apps/api/src/app.module.ts'), 'x')
    writeFileSync(join(dir, 'apps/api/node_modules/x/index.js'), 'x')
    writeFileSync(join(dir, 'apps/api/src/modules/kernel/kernel.module.ts'), 'x')

    const smokeFiles = [
      'apps/api/src/modules/smoke/smoke.module.ts',
      'apps/api/src/modules/smoke/application/commands/create-smoke.command.ts',
      'apps/api/src/modules/smoke/application/queries/list-smoke.query.ts',
      'apps/api/src/modules/smoke/domain/entities/smoke.entity.ts',
      'apps/api/src/modules/smoke/infrastructure/repositories/drizzle-smoke.repository.ts',
      'apps/api/src/modules/smoke/interface/trpc/smoke.router.ts',
    ]
    for (const f of smokeFiles) writeFileSync(join(dir, f), 'x')

    const tree = createTree(dir)
    for (const f of smokeFiles) tree.delete(f)
    flush(tree, { dryRun: false })

    expect(existsSync(join(dir, 'apps/api/src/modules/smoke'))).toBe(false)
    expect(existsSync(join(dir, 'apps/api/package.json'))).toBe(true)
    expect(existsSync(join(dir, 'apps/api/Dockerfile'))).toBe(true)
    expect(existsSync(join(dir, 'apps/api/scripts/seed.ts'))).toBe(true)
    expect(existsSync(join(dir, 'apps/api/src/app.module.ts'))).toBe(true)
    expect(existsSync(join(dir, 'apps/api/src/modules/kernel/kernel.module.ts'))).toBe(true)
    expect(existsSync(join(dir, 'apps/api/node_modules/x/index.js'))).toBe(true)
  })
})
