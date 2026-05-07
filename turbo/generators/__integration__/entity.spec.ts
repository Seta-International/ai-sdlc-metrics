import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apply as entityApply } from '../generators/entity.gen'
import { flush } from '../lib/flush'
import { createTree } from '../lib/tree'

describe('entity generator (integration)', () => {
  it('produces 4 files when schema does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-entity-'))
    try {
      const tree = createTree(dir)
      entityApply(tree, { module: 'billing', name: 'invoice' })
      flush(tree, { dryRun: false })
      const expected = [
        'apps/api/src/modules/billing/domain/entities/invoice.entity.ts',
        'apps/api/src/modules/billing/domain/repositories/invoice.repository.ts',
        'apps/api/src/modules/billing/infrastructure/repositories/drizzle-invoice.repository.ts',
        'apps/api/src/modules/billing/infrastructure/schema/billing.schema.ts',
      ]
      for (const p of expected) {
        expect(existsSync(join(dir, p))).toBe(true)
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('appends to schema when it already exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-entity-'))
    try {
      const schemaPath = 'apps/api/src/modules/billing/infrastructure/schema/billing.schema.ts'
      mkdirSync(join(dir, 'apps/api/src/modules/billing/infrastructure/schema'), {
        recursive: true,
      })
      writeFileSync(join(dir, schemaPath), '// existing\n')
      const tree = createTree(dir)
      entityApply(tree, { module: 'billing', name: 'invoice' })
      flush(tree, { dryRun: false })
      const out = readFileSync(join(dir, schemaPath), 'utf8')
      expect(out).toMatch(/existing/)
      expect(out).toMatch(/invoice/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
