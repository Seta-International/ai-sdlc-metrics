import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export type PendingChange =
  | { kind: 'create'; path: string; contents: string }
  | { kind: 'edit'; path: string; before: string; after: string }
  | { kind: 'delete'; path: string; before: string }

export interface Tree {
  /** Buffered + seed contents. */
  read(relPath: string): string
  /** Write or overwrite; classifies as create vs edit based on prior existence. */
  write(relPath: string, contents: string): void
  /** Delete an existing file. Throws if not present (unless force=true). */
  delete(relPath: string, opts?: { force?: boolean }): void
  /** True if the file is present in buffer + seed (and not pending-deleted). */
  exists(relPath: string): boolean
  /** Ordered list of pending changes for preview/flush. */
  changes(): PendingChange[]
  /** Capture/restore for compose() rollback. */
  snapshot(): TreeSnapshot
  restore(snap: TreeSnapshot): void
  /** Repo root (for ts-morph + git operations). */
  root(): string
}

export type TreeSnapshot = { ops: Op[] }

type Op = { type: 'write'; path: string; contents: string } | { type: 'delete'; path: string }

export function createTree(root: string, opts: { seed?: Record<string, string> } = {}): Tree {
  const seed = new Map(Object.entries(opts.seed ?? {}))
  const ops: Op[] = []
  const readCache = new Map<string, string>()

  function diskRead(rel: string): string | undefined {
    if (seed.has(rel)) return seed.get(rel)
    if (readCache.has(rel)) return readCache.get(rel)
    const abs = join(root, rel)
    if (!existsSync(abs)) return undefined
    const c = readFileSync(abs, 'utf8')
    readCache.set(rel, c)
    return c
  }

  function effective(rel: string): string | undefined {
    let val = diskRead(rel)
    for (const op of ops) {
      if (op.path !== rel) continue
      if (op.type === 'write') val = op.contents
      else val = undefined
    }
    return val
  }

  return {
    root: () => root,
    read(rel) {
      const v = effective(rel)
      if (v === undefined) throw new Error(`Tree.read: ${rel} does not exist`)
      return v
    },
    exists(rel) {
      return effective(rel) !== undefined
    },
    write(rel, contents) {
      ops.push({ type: 'write', path: rel, contents })
    },
    delete(rel, { force = false } = {}) {
      if (!force && !this.exists(rel)) {
        throw new Error(`Tree.delete: ${rel} does not exist`)
      }
      ops.push({ type: 'delete', path: rel })
    },
    snapshot() {
      return { ops: [...ops] }
    },
    restore(snap) {
      ops.length = 0
      ops.push(...snap.ops)
    },
    changes() {
      // Reduce ops to a per-path final action by replaying.
      const final = new Map<string, { contents?: string; deleted?: boolean }>()
      for (const op of ops) {
        const cur = final.get(op.path) ?? {}
        if (op.type === 'write') {
          cur.contents = op.contents
          cur.deleted = false
        } else {
          cur.deleted = true
          delete cur.contents
        }
        final.set(op.path, cur)
      }
      const changes: PendingChange[] = []
      for (const [path, state] of final) {
        const before = diskRead(path)
        if (state.deleted) {
          if (before !== undefined) changes.push({ kind: 'delete', path, before })
          // create-then-delete collapses to nothing
        } else if (state.contents !== undefined) {
          if (before === undefined) {
            changes.push({ kind: 'create', path, contents: state.contents })
          } else if (before !== state.contents) {
            changes.push({ kind: 'edit', path, before, after: state.contents })
          }
          // identical write is a no-op
        }
      }
      return changes
    },
  }
}
