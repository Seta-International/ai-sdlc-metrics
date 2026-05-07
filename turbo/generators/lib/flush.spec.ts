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

  it('stops at the tree root — never removes the workspace root itself', () => {
    mkdirSync(join(dir, 'a/b'), { recursive: true })
    writeFileSync(join(dir, 'a/b/x.ts'), 'x')
    const tree = createTree(dir)
    tree.delete('a/b/x.ts')
    flush(tree, { dryRun: false })
    expect(existsSync(join(dir, 'a/b'))).toBe(false)
    expect(existsSync(join(dir, 'a'))).toBe(false)
    expect(existsSync(dir)).toBe(true)
  })
})
