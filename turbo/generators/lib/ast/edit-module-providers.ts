import { SyntaxKind } from 'ts-morph'
import type { Tree } from '../tree'
import { pascal } from '../naming'
import { withSourceFile } from './ts-morph'

export interface ProviderRef {
  className: string
  importPath: string
}

function moduleFile(name: string): string {
  return `apps/api/src/modules/${name}/${name}.module.ts`
}

export function addProviderToModule(tree: Tree, moduleName: string, provider: ProviderRef): void {
  withSourceFile(tree, moduleFile(moduleName), (sf) => {
    if (!sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === provider.importPath)) {
      sf.addImportDeclaration({
        moduleSpecifier: provider.importPath,
        namedImports: [provider.className],
      })
    }
    const klass = sf.getClassOrThrow(`${pascal(moduleName)}Module`)
    const decorator = klass.getDecoratorOrThrow('Module')
    const arg = decorator.getArguments()[0]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    if (!arg) throw new Error('Module decorator arg not an object literal')
    const providersProp = arg
      .getPropertyOrThrow('providers')
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
    const arr = providersProp
      .getInitializerOrThrow()
      .asKindOrThrow(SyntaxKind.ArrayLiteralExpression)
    if (!arr.getElements().some((el) => el.getText().trim() === provider.className)) {
      arr.addElement(provider.className)
    }
  })
}

export function removeProviderFromModule(
  tree: Tree,
  moduleName: string,
  provider: ProviderRef,
): void {
  withSourceFile(tree, moduleFile(moduleName), (sf) => {
    sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === provider.importPath)?.remove()
    const klass = sf.getClass(`${pascal(moduleName)}Module`)
    const decorator = klass?.getDecorator('Module')
    const arg = decorator?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
    const providersProp = arg?.getProperty('providers')?.asKind(SyntaxKind.PropertyAssignment)
    const arr = providersProp?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression)
    if (!arr) return
    const elements = arr.getElements()
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      if (el && el.getText().trim() === provider.className) arr.removeElement(i)
    }
  })
}
