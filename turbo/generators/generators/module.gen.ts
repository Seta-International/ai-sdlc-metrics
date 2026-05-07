import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import { addModuleToAppModule } from '../lib/ast/edit-app-module'
import { addRouterToAppRouter } from '../lib/ast/edit-app-router'
import { compose, type GeneratorApply } from '../lib/compose'
import * as entityGen from './entity.gen'
import * as commandGen from './command.gen'
import * as queryGen from './query.gen'
import * as zoneGen from './zone.gen'

export interface ModuleArgs {
  name: string
  withZone?: boolean
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATE_DIR = join(__dirname, '../templates/module')
const helpers = { pascal, camel, kebab, screamingSnake }

function render(file: string, ctx: Record<string, string>): string {
  return Handlebars.compile(readFileSync(join(TEMPLATE_DIR, file), 'utf8'), { noEscape: true })(
    ctx,
    { helpers },
  )
}

export const apply: GeneratorApply<ModuleArgs> = (tree, args) => {
  const ctx = { name: args.name }
  const dir = `apps/api/src/modules/${args.name}`

  // 1) entity (creates schema + entity + repository interface + drizzle impl)
  compose(tree, entityGen.apply, { module: args.name, name: args.name })

  // 2) module.ts, facade, router, integration spec
  tree.write(`${dir}/${kebab(args.name)}.module.ts`, render('module.ts.hbs', ctx))
  tree.write(
    `${dir}/application/facades/${kebab(args.name)}-query.facade.ts`,
    render('query-facade.ts.hbs', ctx),
  )
  tree.write(`${dir}/interface/trpc/${kebab(args.name)}.router.ts`, render('router.ts.hbs', ctx))
  tree.write(
    `${dir}/interface/trpc/${kebab(args.name)}.router.integration.spec.ts`,
    render('router.integration.spec.ts.hbs', ctx),
  )

  // 3) commands: create / update / delete
  for (const verb of ['create', 'update', 'delete'] as const) {
    compose(tree, commandGen.apply, { module: args.name, name: `${verb}-${args.name}` })
  }
  // 4) queries: get / list
  for (const verb of ['get', 'list'] as const) {
    compose(tree, queryGen.apply, { module: args.name, name: `${verb}-${args.name}` })
  }

  // 5) Wire into app.module.ts and app-router.ts (AST edits — only if those files exist in the Tree)
  if (tree.exists('apps/api/src/app.module.ts')) addModuleToAppModule(tree, args.name)
  if (tree.exists('apps/api/src/common/trpc/app-router.ts')) addRouterToAppRouter(tree, args.name)

  // 6) Optionally compose a Next.js zone for this module
  if (args.withZone) {
    compose(tree, zoneGen.apply, { name: args.name })
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('module', {
    description: 'Scaffold a new API DDD module with CRUD on a sample entity',
    prompts: [
      { type: 'input', name: 'name', message: 'Module name (kebab-case):' },
      { type: 'confirm', name: 'withZone', message: 'Also generate web zone?', default: true },
    ],
    actions: [{ type: 'invoke-apply', generator: 'module' } as unknown as PlopTypes.ActionType],
  })
}
