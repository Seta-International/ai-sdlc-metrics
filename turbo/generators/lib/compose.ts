import type { Tree } from './tree'

export type GeneratorApply<TArgs> = (tree: Tree, args: TArgs) => void

export function compose<TArgs>(tree: Tree, fn: GeneratorApply<TArgs>, args: TArgs): void {
  fn(tree, args)
}
