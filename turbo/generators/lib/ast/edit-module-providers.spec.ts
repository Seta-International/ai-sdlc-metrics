import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { addProviderToModule, removeProviderFromModule } from './edit-module-providers'

const FIXTURE = `import { Module } from '@nestjs/common'
import { BillingQueryFacade } from './application/facades/billing-query.facade'

@Module({
  providers: [BillingQueryFacade],
  exports: [BillingQueryFacade],
})
export class BillingModule {}
`

describe('addProviderToModule', () => {
  it('adds import + appends to providers[]', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': FIXTURE },
    })
    addProviderToModule(tree, 'billing', {
      className: 'CreateBillingHandler',
      importPath: './application/commands/create-billing.command',
    })
    const out = tree.read('apps/api/src/modules/billing/billing.module.ts')
    expect(out).toContain(
      "import { CreateBillingHandler } from './application/commands/create-billing.command'",
    )
    expect(out).toMatch(/providers:\s*\[[^\]]*CreateBillingHandler/)
  })
})

describe('removeProviderFromModule', () => {
  it('removes import + entry', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/modules/billing/billing.module.ts': FIXTURE },
    })
    addProviderToModule(tree, 'billing', {
      className: 'CreateBillingHandler',
      importPath: './application/commands/create-billing.command',
    })
    removeProviderFromModule(tree, 'billing', {
      className: 'CreateBillingHandler',
      importPath: './application/commands/create-billing.command',
    })
    const out = tree.read('apps/api/src/modules/billing/billing.module.ts')
    expect(out).not.toContain('CreateBillingHandler')
  })
})
