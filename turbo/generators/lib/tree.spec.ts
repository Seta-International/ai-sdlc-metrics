import { describe, it, expect } from 'vitest'
import { createTree } from './tree'

describe('Tree', () => {
  it('records a CREATE for new files', () => {
    const tree = createTree('/repo')
    tree.write('apps/foo.ts', 'export const x = 1')
    expect(tree.changes()).toEqual([
      { kind: 'create', path: 'apps/foo.ts', contents: 'export const x = 1' },
    ])
  })

  it('records an EDIT when overwriting an existing file (provided via seed)', () => {
    const tree = createTree('/repo', { seed: { 'apps/foo.ts': 'old' } })
    tree.write('apps/foo.ts', 'new')
    expect(tree.changes()).toEqual([
      { kind: 'edit', path: 'apps/foo.ts', before: 'old', after: 'new' },
    ])
  })

  it('records a DELETE for existing files', () => {
    const tree = createTree('/repo', { seed: { 'apps/foo.ts': 'old' } })
    tree.delete('apps/foo.ts')
    expect(tree.changes()).toEqual([{ kind: 'delete', path: 'apps/foo.ts', before: 'old' }])
  })

  it('throws when deleting a non-existent file (unless force)', () => {
    const tree = createTree('/repo')
    expect(() => tree.delete('nope.ts')).toThrow(/does not exist/)
  })

  it('add → delete on the same file collapses to a no-op', () => {
    const tree = createTree('/repo')
    tree.write('apps/foo.ts', 'x')
    tree.delete('apps/foo.ts')
    expect(tree.changes()).toEqual([])
  })

  it('exists() reflects buffered + seed state', () => {
    const tree = createTree('/repo', { seed: { 'a.ts': 'a' } })
    expect(tree.exists('a.ts')).toBe(true)
    expect(tree.exists('b.ts')).toBe(false)
    tree.write('b.ts', 'b')
    expect(tree.exists('b.ts')).toBe(true)
    tree.delete('a.ts')
    expect(tree.exists('a.ts')).toBe(false)
  })

  it('read() returns buffered contents over seed', () => {
    const tree = createTree('/repo', { seed: { 'a.ts': 'old' } })
    tree.write('a.ts', 'new')
    expect(tree.read('a.ts')).toBe('new')
  })

  it('snapshot/restore is a true rollback', () => {
    const tree = createTree('/repo')
    tree.write('a.ts', '1')
    const snap = tree.snapshot()
    tree.write('b.ts', '2')
    tree.restore(snap)
    expect(tree.changes()).toEqual([{ kind: 'create', path: 'a.ts', contents: '1' }])
  })
})
