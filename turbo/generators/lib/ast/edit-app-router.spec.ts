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

// The live apps/api/src/common/trpc/app-router.ts wraps the router({...}) call
// in a buildAppRouter() function and assigns its return value to appRouter.
// The AST helper must descend into that function body to find the right call.
const WRAPPED_FIXTURE = `import { router } from './trpc-init'
import { peopleRouter } from '../../modules/people/interface/trpc/people.router'

function buildAppRouter() {
  const identityWithAdmin = router({
    foo: 'bar' as unknown,
  })
  return router({
    people: peopleRouter,
    identity: identityWithAdmin,
  })
}

export const appRouter = buildAppRouter()
export type AppRouter = typeof appRouter
`

describe('addRouterToAppRouter (buildAppRouter wrapper)', () => {
  it('descends into buildAppRouter() and edits the returned router({...}) call', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/common/trpc/app-router.ts': WRAPPED_FIXTURE },
    })
    addRouterToAppRouter(tree, 'billing')
    const out = tree.read('apps/api/src/common/trpc/app-router.ts')
    expect(out).toContain(
      "import { billingRouter } from '../../modules/billing/interface/trpc/billing.router'",
    )
    // billingRouter must appear in the *returned* router({...}), alongside `people`,
    // not in the helper `identityWithAdmin = router({...})` above it.
    const returnBlock = out.split('return router(')[1] ?? ''
    expect(returnBlock).toMatch(/billing:\s*billingRouter/)
    const helperBlock = (out.split('identityWithAdmin = router(')[1] ?? '').split('return')[0] ?? ''
    expect(helperBlock).not.toContain('billing:')
  })

  it('removes the property from the returned router({...}) only', () => {
    const tree = createTree('/repo', {
      seed: { 'apps/api/src/common/trpc/app-router.ts': WRAPPED_FIXTURE },
    })
    addRouterToAppRouter(tree, 'billing')
    removeRouterFromAppRouter(tree, 'billing')
    const out = tree.read('apps/api/src/common/trpc/app-router.ts')
    expect(out).not.toContain('billingRouter')
  })
})
