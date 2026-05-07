import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'
import type { PlopTypes } from '@turbo/gen'
import { camel, kebab, pascal, screamingSnake } from '../lib/naming'
import type { GeneratorApply } from '../lib/compose'

export interface ZoneArgs {
  name: string
  port?: number
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const TEMPLATE_DIR = join(__dirname, '../templates/zone')
const helpers = { pascal, camel, kebab, screamingSnake }

function render(rel: string, ctx: Record<string, string | number>): string {
  return Handlebars.compile(readFileSync(join(TEMPLATE_DIR, rel), 'utf8'), { noEscape: true })(
    ctx,
    { helpers },
  )
}

export function pickFreePort(repoRoot: string): number {
  const appsDir = join(repoRoot, 'apps')
  if (!existsSync(appsDir)) return 3001
  let max = 3000
  for (const ent of readdirSync(appsDir, { withFileTypes: true })) {
    if (!ent.isDirectory() || !ent.name.startsWith('web-')) continue
    const pkgPath = join(appsDir, ent.name, 'package.json')
    if (!existsSync(pkgPath)) continue
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const dev: string = pkg.scripts?.dev ?? ''
    const m = dev.match(/--port\s+(\d+)/)
    if (m && m[1]) max = Math.max(max, parseInt(m[1], 10))
  }
  return max + 1
}

export const apply: GeneratorApply<ZoneArgs> = (tree, args) => {
  const port = args.port ?? pickFreePort(tree.root())
  const ctx = { name: args.name, port }
  const zoneDir = `apps/web-${kebab(args.name)}`

  const files: Array<[string, string]> = [
    ['package.json.hbs', 'package.json'],
    ['tsconfig.json.hbs', 'tsconfig.json'],
    ['next.config.ts.hbs', 'next.config.ts'],
    ['src/navigation.ts.hbs', 'src/navigation.ts'],
    ['src/app/layout.tsx.hbs', 'src/app/layout.tsx'],
    ['src/app/page.tsx.hbs', 'src/app/page.tsx'],
    ['src/app/[id]/page.tsx.hbs', 'src/app/[id]/page.tsx'],
    [
      'src/app/_components/{{kebab name}}-list.tsx.hbs',
      `src/app/_components/${kebab(args.name)}-list.tsx`,
    ],
  ]

  for (const [tpl, dest] of files) {
    tree.write(`${zoneDir}/${dest}`, render(tpl, ctx))
  }
}

export function register(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('zone', {
    description: 'Scaffold a new Next.js zone (apps/web-<name>)',
    prompts: [{ type: 'input', name: 'name', message: 'Zone name (kebab):' }],
    actions: [{ type: 'invoke-apply', generator: 'zone' } as unknown as PlopTypes.ActionType],
  })
}
