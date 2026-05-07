import { describe, it, expect } from 'vitest'
import { createTree } from '../tree'
import { addRouterToAppRouter, removeRouterFromAppRouter } from './edit-app-router'

const FIXTURE = `import { router } from './trpc-init'
import { preferencesRouter } from '../../modules/preferences/interface/trpc/preferences.router'

export const appRouter = router({
  preferences: preferencesRouter,
})

export type AppRouter = typeof appRouter
`

describe('addRouterToAppRouter', () => {
  it('adds the import + property on appRouter', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/common/trpc/app-router.ts': FIXTURE },
    })
    addRouterToAppRouter(tree, 'billing')
    const out = tree.read('apps/api/src/common/trpc/app-router.ts')
    expect(out).toContain(
      "import { billingRouter } from '../../modules/billing/interface/trpc/billing.router'",
    )
    expect(out).toMatch(/billing:\s*billingRouter/)
  })
})

describe('removeRouterFromAppRouter', () => {
  it('removes import + property', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/common/trpc/app-router.ts': FIXTURE },
    })
    addRouterToAppRouter(tree, 'billing')
    removeRouterFromAppRouter(tree, 'billing')
    const out = tree.read('apps/api/src/common/trpc/app-router.ts')
    expect(out).not.toContain('billingRouter')
  })
})
