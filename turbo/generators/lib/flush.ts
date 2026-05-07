import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Tree } from './tree'

export function flush(tree: Tree, opts: { dryRun: boolean }): void {
  if (opts.dryRun) return
  const root = tree.root()
  for (const c of tree.changes()) {
    const abs = join(root, c.path)
    if (c.kind === 'delete') {
      rmSync(abs, { force: true })
    } else {
      mkdirSync(dirname(abs), { recursive: true })
      const contents = c.kind === 'create' ? c.contents : c.after
      writeFileSync(abs, contents, 'utf8')
    }
  }
}
