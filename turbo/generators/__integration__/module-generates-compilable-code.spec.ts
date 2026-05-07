import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply as moduleApply } from '../generators/module.gen'
import { flush } from '../lib/flush'
import { createTree } from '../lib/tree'

describe('module generator', () => {
  it('produces ≥18 files for a CRUD module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-mod-'))
    try {
      const tree = createTree(dir)
      moduleApply(tree, { name: 'billing' })
      flush(tree, { dryRun: false })
      const moduleDir = join(dir, 'apps/api/src/modules/billing')
      const files = walk(moduleDir)
      expect(files.length).toBeGreaterThanOrEqual(18)
      const expectedPresent = [
        'billing.module.ts',
        'application/commands/create-billing.command.ts',
        'application/commands/create-billing.command.spec.ts',
        'application/queries/list-billing.query.ts',
        'domain/entities/billing.entity.ts',
        'infrastructure/repositories/drizzle-billing.repository.ts',
        'infrastructure/schema/billing.schema.ts',
        'interface/trpc/billing.router.ts',
      ]
      for (const p of expectedPresent) {
        expect(files).toContain(p)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('with --with-zone, also creates apps/web-<name>', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-mod-zone-'))
    try {
      const tree = createTree(dir)
      moduleApply(tree, { name: 'billing', withZone: true })
      flush(tree, { dryRun: false })
      expect(existsSync(join(dir, 'apps/web-billing/package.json'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

function walk(root: string, prefix = ''): string[] {
  const out: string[] = []
  for (const ent of readdirSync(root, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name
    if (ent.isDirectory()) out.push(...walk(join(root, ent.name), rel))
    else out.push(rel)
  }
  return out
}
