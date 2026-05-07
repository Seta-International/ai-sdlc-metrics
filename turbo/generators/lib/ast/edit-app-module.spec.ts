import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { addModuleToAppModule, removeModuleFromAppModule } from './edit-app-module'

const FIXTURE = `import { Module } from '@nestjs/common'
import { PreferencesModule } from './modules/preferences/preferences.module'

@Module({
  imports: [
    PreferencesModule,
  ],
})
export class AppModule {}
`

describe('addModuleToAppModule', () => {
  it('adds the import line and registers in imports[]', () => {
    const tree = createTree('/repo', { seed: { 'apps/api/src/app.module.ts': FIXTURE } })
    addModuleToAppModule(tree, 'billing')
    const out = tree.read('apps/api/src/app.module.ts')
    expect(out).toContain("import { BillingModule } from './modules/billing/billing.module'")
    expect(out).toMatch(/imports:\s*\[[^\]]*BillingModule/)
  })

  it('is idempotent when called twice', () => {
    const tree = createTree('/repo', { seed: { 'apps/api/src/app.module.ts': FIXTURE } })
    addModuleToAppModule(tree, 'billing')
    const after1 = tree.read('apps/api/src/app.module.ts')
    addModuleToAppModule(tree, 'billing')
    expect(tree.read('apps/api/src/app.module.ts')).toBe(after1)
  })
})

describe('removeModuleFromAppModule', () => {
  it('removes import + array entry', () => {
    const tree = createTree('/repo', { seed: { 'apps/api/src/app.module.ts': FIXTURE } })
    addModuleToAppModule(tree, 'billing')
    removeModuleFromAppModule(tree, 'billing')
    const out = tree.read('apps/api/src/app.module.ts')
    expect(out).not.toContain('BillingModule')
  })
})
