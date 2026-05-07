import { type Dirent, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { PlopTypes } from '@turbo/gen'
import { kebab } from '../lib/naming'
import { removeModuleFromAppModule } from '../lib/ast/edit-app-module'
import { removeRouterFromAppRouter } from '../lib/ast/edit-app-router'
import type { GeneratorApply } from '../lib/compose'

export interface RemoveArgs {
  kind: 'module' | 'zone'
  name: string
  withZone?: boolean
}

function listFilesUnder(root: string, sub: string, out: string[] = []): string[] {
  const abs = join(root, sub)
  let entries: Dirent[] = []
  try {
    entries = readdirSync(abs, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const rel = `${sub}/${ent.name}`
    const absChild = join(root, rel)
    if (statSync(absChild).isDirectory()) listFilesUnder(root, rel, out)
    else out.push(rel)
  }
  return out
}

export const apply: GeneratorApply<RemoveArgs> = (tree, args) => {
  const root = tree.root()
  if (args.kind === 'module') {
    const moduleSub = `apps/api/src/modules/${kebab(args.name)}`
    for (const f of listFilesUnder(root, moduleSub)) tree.delete(f, { force: true })
    if (tree.exists('apps/api/src/app.module.ts')) removeModuleFromAppModule(tree, args.name)
    if (tree.exists('apps/api/src/common/trpc/app-router.ts'))
      removeRouterFromAppRouter(tree, args.name)
  }
  if (args.kind === 'zone' || (args.kind === 'module' && args.withZone)) {
    const zoneSub = `apps/web-${kebab(args.name)}`
    for (const f of listFilesUnder(root, zoneSub)) tree.delete(f, { force: true })
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('remove', {
    description: 'Remove a previously-generated module or zone',
    prompts: [
      {
        type: 'list',
        name: 'kind',
        message: 'What to remove?',
        choices: ['module', 'zone'],
      },
      { type: 'input', name: 'name', message: 'Name:' },
      {
        type: 'confirm',
        name: 'withZone',
        message: 'Also remove the matching web zone?',
        default: false,
      },
    ],
    actions: [{ type: 'invoke-apply', generator: 'remove' } as unknown as PlopTypes.ActionType],
  })
}
