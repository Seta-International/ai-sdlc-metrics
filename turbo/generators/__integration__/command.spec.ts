import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply } from '../generators/command.gen'

describe('command generator (integration)', () => {
  it('creates command + spec, registers handler in module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-cmd-'))
    try {
      mkdirSync(join(dir, 'apps/api/src/modules/billing'), { recursive: true })
      writeFileSync(
        join(dir, 'apps/api/src/modules/billing/billing.module.ts'),
        `import { Module } from '@nestjs/common'\n@Module({ providers: [], exports: [] })\nexport class BillingModule {}\n`,
      )
      const tree = createTree(dir)
      apply(tree, { module: 'billing', name: 'create-invoice' })
      flush(tree, { dryRun: false })
      expect(
        existsSync(
          join(dir, 'apps/api/src/modules/billing/application/commands/create-invoice.command.ts'),
        ),
      ).toBe(true)
      expect(
        existsSync(
          join(
            dir,
            'apps/api/src/modules/billing/application/commands/create-invoice.command.spec.ts',
          ),
        ),
      ).toBe(true)
      const moduleSrc = readFileSync(
        join(dir, 'apps/api/src/modules/billing/billing.module.ts'),
        'utf8',
      )
      expect(moduleSrc).toContain('CreateInvoiceHandler')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
