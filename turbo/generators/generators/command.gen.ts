import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import { addProviderToModule } from '../lib/ast/edit-module-providers'
import type { GeneratorApply } from '../lib/compose'

export interface CommandArgs {
  module: string
  name: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATE_DIR = join(__dirname, '../templates/command')
const helpers = { pascal, camel, kebab, screamingSnake }

function render(file: string, ctx: Record<string, string>): string {
  return Handlebars.compile(readFileSync(join(TEMPLATE_DIR, file), 'utf8'), { noEscape: true })(
    ctx,
    { helpers },
  )
}

export const apply: GeneratorApply<CommandArgs> = (tree, args) => {
  const ctx = { module: args.module, name: args.name }
  const dir = `apps/api/src/modules/${args.module}/application/commands`
  tree.write(`${dir}/${kebab(args.name)}.command.ts`, render('command.ts.hbs', ctx))
  tree.write(`${dir}/${kebab(args.name)}.command.spec.ts`, render('command.spec.ts.hbs', ctx))

  if (tree.exists(`apps/api/src/modules/${args.module}/${args.module}.module.ts`)) {
    addProviderToModule(tree, args.module, {
      className: `${pascal(args.name)}Handler`,
      importPath: `./application/commands/${kebab(args.name)}.command`,
    })
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('command', {
    description: 'Add a new CQRS command to a module',
    prompts: [
      { type: 'input', name: 'module', message: 'Module name:' },
      { type: 'input', name: 'name', message: 'Command name (kebab, e.g. approve-invoice):' },
    ],
    actions: [{ type: 'invoke-apply', generator: 'command' } as unknown as PlopTypes.ActionType],
  })
}
