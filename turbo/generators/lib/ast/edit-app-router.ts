import { SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph'
import type { Tree } from '../tree'
import { camel } from '../naming'
import { withSourceFile } from './ts-morph'

const APP_ROUTER = 'apps/api/src/common/trpc/app-router.ts'

// Locate the object literal passed to `router({...})` that produces `appRouter`.
// Two supported shapes:
//   1) `export const appRouter = router({ ... })`            — direct
//   2) `export const appRouter = buildAppRouter()` where      — wrapped
//      `function buildAppRouter() { ...; return router({ ... }) }`
//
// In the wrapped shape we must pick the call inside the *return* statement;
// helper bindings like `const x = router({...})` earlier in the function body
// are never the appRouter map.
function findAppRouterMap(sf: SourceFile): ObjectLiteralExpression | undefined {
  const decl = sf.getVariableDeclaration('appRouter')
  if (!decl) return undefined
  const init = decl.getInitializer()?.asKind(SyntaxKind.CallExpression)
  if (!init) return undefined

  // Direct shape: `appRouter = router({...})`
  const direct = init.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
  if (direct) return direct

  // Wrapped shape: `appRouter = buildAppRouter()` — find the function and its return.
  const fnName = init.getExpression().getText()
  const fn = sf.getFunction(fnName)
  if (!fn) return undefined
  const ret = fn.getBody()?.getDescendantsOfKind(SyntaxKind.ReturnStatement).pop()
  const retCall = ret?.getExpression()?.asKind(SyntaxKind.CallExpression)
  return retCall?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
}

export function addRouterToAppRouter(tree: Tree, name: string): void {
  const id = `${camel(name)}Router`
  const importPath = `../../modules/${name}/interface/trpc/${name}.router`

  withSourceFile(tree, APP_ROUTER, (sf) => {
    if (!sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)) {
      sf.addImportDeclaration({ moduleSpecifier: importPath, namedImports: [id] })
    }
    const map = findAppRouterMap(sf)
    if (!map) {
      throw new Error(
        'addRouterToAppRouter: could not locate the router({...}) call that produces appRouter',
      )
    }
    if (!map.getProperty(camel(name))) {
      map.addPropertyAssignment({ name: camel(name), initializer: id })
    }
  })
}

export function removeRouterFromAppRouter(tree: Tree, name: string): void {
  const importPath = `../../modules/${name}/interface/trpc/${name}.router`

  withSourceFile(tree, APP_ROUTER, (sf) => {
    sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)?.remove()
    findAppRouterMap(sf)?.getProperty(camel(name))?.remove()
  })
}
