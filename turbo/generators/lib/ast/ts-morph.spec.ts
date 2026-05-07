import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { withSourceFile } from './ts-morph'

describe('withSourceFile', () => {
  it('parses Tree contents, applies mutation, writes back to Tree', () => {
    const seed = { 'foo.ts': 'export const x = 1\n' }
    const tree = createTree('/virtual', { seed })
    withSourceFile(tree, 'foo.ts', (sf) => {
      sf.addStatements('export const y = 2\n')
    })
    expect(tree.read('foo.ts')).toContain('export const y = 2')
  })

  it('throws when file does not exist', () => {
    const tree = createTree('/virtual')
    expect(() => withSourceFile(tree, 'nope.ts', () => {})).toThrow(/does not exist/)
  })
})
