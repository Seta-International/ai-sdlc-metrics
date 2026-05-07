import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PlopTypes } from '@turbo/gen'
import Handlebars from 'handlebars'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import type { GeneratorApply } from '../lib/compose'

export interface EntityArgs {
  module: string
  name: string
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATE_DIR = join(__dirname, '../templates/entity')

function snakeHelper(input: string): string {
  return kebab(input).replace(/-/g, '_')
}

const helpers = {
  pascal,
  camel,
  kebab,
  screamingSnake,
  snake: snakeHelper,
}

function render(template: string, ctx: Record<string, string>): string {
  const compiled = Handlebars.compile(readFileSync(join(TEMPLATE_DIR, template), 'utf8'), {
    noEscape: true,
  })
  return compiled(ctx, { helpers })
}

export const apply: GeneratorApply<EntityArgs> = (tree, args) => {
  const ctx = { module: args.module, name: args.name }
  const moduleDir = `apps/api/src/modules/${args.module}`

  tree.write(
    `${moduleDir}/domain/entities/${kebab(args.name)}.entity.ts`,
    render('entity.ts.hbs', ctx),
  )
  tree.write(
    `${moduleDir}/domain/repositories/${kebab(args.name)}.repository.ts`,
    render('repository.ts.hbs', ctx),
  )
  tree.write(
    `${moduleDir}/infrastructure/repositories/drizzle-${kebab(args.name)}.repository.ts`,
    render('drizzle-repository.ts.hbs', ctx),
  )

  // Append pgTable to schema (create file if absent).
  const schemaPath = `${moduleDir}/infrastructure/schema/${kebab(args.module)}.schema.ts`
  const fragment = render('schema-fragment.ts.hbs', ctx)
  if (tree.exists(schemaPath)) {
    tree.write(schemaPath, tree.read(schemaPath) + '\n' + fragment)
  } else {
    const header = `import { pgSchema, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { uuidv7 } from 'uuidv7'

export const ${camel(args.module)}Schema = pgSchema('${kebab(args.module)}')

`
    tree.write(schemaPath, header + fragment)
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('entity', {
    description: 'Add a new entity (domain + repository + Drizzle impl + schema) to a module',
    prompts: [
      { type: 'input', name: 'module', message: 'Module name (kebab-case):' },
      { type: 'input', name: 'name', message: 'Entity name (PascalCase or kebab):' },
    ],
    actions: [{ type: 'invoke-apply', generator: 'entity' } as unknown as PlopTypes.ActionType],
  })
}
