import { SyntaxKind } from 'ts-morph'
import type { Tree } from '../tree'
import { camel } from '../naming'
import { withSourceFile } from './ts-morph'

const APP_ROUTER = 'apps/api/src/common/trpc/app-router.ts'

export function addRouterToAppRouter(tree: Tree, name: string): void {
  const id = `${camel(name)}Router`
  const importPath = `../../modules/${name}/interface/trpc/${name}.router`

  withSourceFile(tree, APP_ROUTER, (sf) => {
    if (!sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)) {
      sf.addImportDeclaration({ moduleSpecifier: importPath, namedImports: [id] })
    }

    const appRouterDecl = sf.getVariableDeclarationOrThrow('appRouter')
    const init = appRouterDecl.getInitializerOrThrow().asKindOrThrow(SyntaxKind.CallExpression)
    const arg = init.getArguments()[0]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    if (!arg) throw new Error('appRouter call argument is not an object literal')

    if (!arg.getProperty(camel(name))) {
      arg.addPropertyAssignment({ name: camel(name), initializer: id })
    }
  })
}

export function removeRouterFromAppRouter(tree: Tree, name: string): void {
  const importPath = `../../modules/${name}/interface/trpc/${name}.router`

  withSourceFile(tree, APP_ROUTER, (sf) => {
    sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)?.remove()
    const appRouterDecl = sf.getVariableDeclaration('appRouter')
    const init = appRouterDecl?.getInitializer()?.asKind(SyntaxKind.CallExpression)
    const arg = init?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
    arg?.getProperty(camel(name))?.remove()
  })
}
