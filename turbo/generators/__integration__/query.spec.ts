import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply } from '../generators/query.gen'

describe('query generator (integration)', () => {
  it('creates query + spec, registers handler in module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-query-'))
    try {
      mkdirSync(join(dir, 'apps/api/src/modules/billing'), { recursive: true })
      writeFileSync(
        join(dir, 'apps/api/src/modules/billing/billing.module.ts'),
        `import { Module } from '@nestjs/common'\n@Module({ providers: [], exports: [] })\nexport class BillingModule {}\n`,
      )
      const tree = createTree(dir)
      apply(tree, { module: 'billing', name: 'list-invoices' })
      flush(tree, { dryRun: false })
      expect(
        existsSync(
          join(dir, 'apps/api/src/modules/billing/application/queries/list-invoices.query.ts'),
        ),
      ).toBe(true)
      expect(
        existsSync(
          join(dir, 'apps/api/src/modules/billing/application/queries/list-invoices.query.spec.ts'),
        ),
      ).toBe(true)
      const moduleSrc = readFileSync(
        join(dir, 'apps/api/src/modules/billing/billing.module.ts'),
        'utf8',
      )
      expect(moduleSrc).toContain('ListInvoicesHandler')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
