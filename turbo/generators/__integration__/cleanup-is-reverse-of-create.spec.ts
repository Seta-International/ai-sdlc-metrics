import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply as moduleApply } from '../generators/module.gen'
import { apply as removeApply } from '../generators/remove.gen'
import { flush } from '../lib/flush'
import { createTree } from '../lib/tree'

describe('cleanup is reverse of create', () => {
  it('module create + module remove leaves the workspace identical', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-rt-'))
    try {
      // Pre-seed app.module.ts and app-router.ts so AST edits have something to edit/restore.
      mkdirSync(join(dir, 'apps/api/src/common/trpc'), { recursive: true })
      const appModule = `import { Module } from '@nestjs/common'\n@Module({ imports: [] })\nexport class AppModule {}\n`
      const appRouter = `import { router } from './trpc-init'\nexport const appRouter = router({})\nexport type AppRouter = typeof appRouter\n`
      writeFileSync(join(dir, 'apps/api/src/app.module.ts'), appModule)
      writeFileSync(join(dir, 'apps/api/src/common/trpc/app-router.ts'), appRouter)

      const before = snapshot(dir)
      const tree1 = createTree(dir)
      moduleApply(tree1, { name: 'billing' })
      flush(tree1, { dryRun: false })

      const tree2 = createTree(dir)
      removeApply(tree2, { kind: 'module', name: 'billing' })
      flush(tree2, { dryRun: false })

      const after = snapshot(dir)
      expect(after).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  function walk(sub: string): void {
    for (const ent of readdirSync(join(root, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${ent.name}` : ent.name
      if (ent.isDirectory()) walk(rel)
      else out[rel] = readFileSync(join(root, rel), 'utf8')
    }
  }
  walk('')
  return out
}
