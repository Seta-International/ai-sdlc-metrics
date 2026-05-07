import { describe, it, expect } from 'vitest'
import { createTree } from './tree'
import { compose, type GeneratorApply } from './compose'

const dummy: GeneratorApply<{ name: string }> = (tree, args) => {
  tree.write(`out/${args.name}.txt`, args.name)
}

describe('compose', () => {
  it('invokes the apply function with the same Tree', () => {
    const tree = createTree('/repo')
    compose(tree, dummy, { name: 'a' })
    compose(tree, dummy, { name: 'b' })
    expect(tree.changes().map((c) => c.path)).toEqual(['out/a.txt', 'out/b.txt'])
  })
})
