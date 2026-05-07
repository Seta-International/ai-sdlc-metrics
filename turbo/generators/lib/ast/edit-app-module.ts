import { SyntaxKind } from 'ts-morph'
import type { Tree } from '../tree'
import { pascal } from '../naming'
import { withSourceFile } from './ts-morph'

const APP_MODULE = 'apps/api/src/app.module.ts'

export function addModuleToAppModule(tree: Tree, name: string): void {
  const className = `${pascal(name)}Module`
  const importPath = `./modules/${name}/${name}.module`

  withSourceFile(tree, APP_MODULE, (sf) => {
    if (!sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)) {
      sf.addImportDeclaration({ moduleSpecifier: importPath, namedImports: [className] })
    }

    const decorator = sf.getClassOrThrow('AppModule').getDecoratorOrThrow('Module')
    const arg = decorator.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
    if (!arg) throw new Error('AppModule @Module() arg not an object literal')

    const importsProp = arg
      .getPropertyOrThrow('imports')
      .asKindOrThrow(SyntaxKind.PropertyAssignment)
    const arr = importsProp.getInitializerOrThrow().asKindOrThrow(SyntaxKind.ArrayLiteralExpression)

    const already = arr.getElements().some((el) => el.getText().trim() === className)
    if (!already) arr.addElement(className)
  })
}

export function removeModuleFromAppModule(tree: Tree, name: string): void {
  const className = `${pascal(name)}Module`
  const importPath = `./modules/${name}/${name}.module`

  withSourceFile(tree, APP_MODULE, (sf) => {
    sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === importPath)?.remove()

    const decorator = sf.getClassOrThrow('AppModule').getDecoratorOrThrow('Module')
    const arg = decorator.getArguments()[0]?.asKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    if (!arg) return
    const importsProp = arg.getProperty('imports')?.asKind(SyntaxKind.PropertyAssignment)
    const arr = importsProp?.getInitializer()?.asKind(SyntaxKind.ArrayLiteralExpression)
    if (!arr) return
    const elements = arr.getElements()
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      if (el && el.getText().trim() === className) arr.removeElement(i)
    }
  })
}
