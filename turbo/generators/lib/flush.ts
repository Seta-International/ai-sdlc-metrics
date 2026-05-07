import { writeFileSync, mkdirSync, rmSync, rmdirSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Tree } from './tree'

export function flush(tree: Tree, opts: { dryRun: boolean }): void {
  if (opts.dryRun) return
  const root = tree.root()
  const deletedDirs = new Set<string>()
  for (const c of tree.changes()) {
    const abs = join(root, c.path)
    if (c.kind === 'delete') {
      rmSync(abs, { force: true })
      deletedDirs.add(dirname(abs))
    } else {
      mkdirSync(dirname(abs), { recursive: true })
      const contents = c.kind === 'create' ? c.contents : c.after
      writeFileSync(abs, contents, 'utf8')
    }
  }
  pruneEmptyDirs(root, deletedDirs)
}

function pruneEmptyDirs(root: string, dirs: Set<string>): void {
  // Walk up from each deleted file's parent, removing empty directories.
  // Stops at the tree root so we never blow away the workspace itself.
  const sorted = [...dirs].sort((a, b) => b.length - a.length)
  for (const start of sorted) {
    let cur = start
    while (
      cur !== root &&
      relative(root, cur).length > 0 &&
      !relative(root, cur).startsWith('..')
    ) {
      let entries: string[]
      try {
        entries = readdirSync(cur)
      } catch {
        break
      }
      if (entries.length > 0) break
      try {
        rmdirSync(cur)
      } catch {
        break
      }
      cur = dirname(cur)
    }
  }
}
