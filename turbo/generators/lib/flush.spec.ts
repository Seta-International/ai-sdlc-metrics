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
})
