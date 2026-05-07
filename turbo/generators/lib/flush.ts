import { writeFileSync, mkdirSync, rmSync, rmdirSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { Tree } from './tree'

export function flush(tree: Tree, opts: { dryRun: boolean }): void {
  if (opts.dryRun) return
  const root = tree.root()
  const deletedFiles: string[] = []
  for (const c of tree.changes()) {
    const abs = join(root, c.path)
    if (c.kind === 'delete') {
      rmSync(abs, { force: true })
      deletedFiles.push(c.path)
    } else {
      mkdirSync(dirname(abs), { recursive: true })
      const contents = c.kind === 'create' ? c.contents : c.after
      writeFileSync(abs, contents, 'utf8')
    }
  }
  pruneEmptyDirs(root, deletedFiles)
}

// Removes empty directories left behind by deletes — but only inside scopes
// the deletion clearly owned. A scope is the longest path prefix shared by all
// sibling deletes within the same workspace package (`apps/<x>`, `packages/<y>`,
// etc.). Pruning never walks above any scope, so untouched workspaces and the
// repo root are always safe.
//
// Concretely: `gen remove --kind module --name smoke` whose deletes all live
// under `apps/api/src/modules/smoke/` will prune the smoke subtree. It will
// not wander into `apps/api/src/modules/` (siblings) or higher.
function pruneEmptyDirs(root: string, deletedFiles: string[]): void {
  if (deletedFiles.length === 0) return

  // Scope = workspace package root (first two path segments — `apps/<x>` or
  // `packages/<x>`). Anything that isn't already inside such a workspace gets
  // no scope at all, which means no pruning. That keeps synthetic / top-level
  // paths (`a/b/x.ts`) safe by default.
  const scopes = new Set<string>()
  for (const p of deletedFiles) {
    const norm = p.replace(/\\/g, '/').replace(/^\/+/, '')
    const segs = norm.split('/')
    if (segs.length < 3) continue
    const top = segs[0]!
    if (top !== 'apps' && top !== 'packages') continue
    scopes.add(join(root, segs[0]!, segs[1]!))
  }
  if (scopes.size === 0) return

  const dirs = new Set<string>(deletedFiles.map((p) => join(root, dirname(p))))
  const sorted = [...dirs].sort((a, b) => b.length - a.length)
  for (const start of sorted) {
    let cur = start
    while (true) {
      if (![...scopes].some((s) => isInside(cur, s))) break
      const rel = relative(root, cur)
      if (cur === root || rel.length === 0 || rel.startsWith('..')) break

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

function isInside(child: string, ancestor: string): boolean {
  if (child === ancestor) return true
  const rel = relative(ancestor, child)
  return rel.length > 0 && !rel.startsWith('..') && rel !== '.'
}
