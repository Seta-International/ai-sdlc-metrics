import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PlopTypes } from '@turbo/gen'
import * as commandGen from './generators/command.gen'
import * as entityGen from './generators/entity.gen'
import * as moduleGen from './generators/module.gen'
import * as queryGen from './generators/query.gen'
import { flush } from './lib/flush'
import { renderPlan } from './lib/preview'
import { createTree, type Tree } from './lib/tree'
import {
  runAll,
  validateModuleDoesNotExist,
  validateName,
  validateNotReserved,
} from './lib/validate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApplyMap = Record<string, (tree: Tree, args: any) => void>
const applyByGenerator: ApplyMap = {
  command: commandGen.apply,
  entity: entityGen.apply,
  module: moduleGen.apply,
  query: queryGen.apply,
}

function repoRoot(): string {
  // turbo/generators/config.ts → repo root is two dirs up
  const here = dirname(fileURLToPath(import.meta.url))
  let cur = here
  while (cur !== '/' && !existsSync(join(cur, 'turbo.json'))) cur = dirname(cur)
  return cur
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setActionType('invoke-apply', (answers, config) => {
    const { generator: name } = config as unknown as { generator: string }
    const apply = applyByGenerator[name]
    if (!apply) throw new Error(`No apply() for generator "${name}"`)

    const tree = createTree(repoRoot())

    if (typeof answers['name'] === 'string') {
      const checks = [validateName(answers['name']), validateNotReserved(answers['name'])]
      if (name === 'module') checks.push(validateModuleDoesNotExist(tree, answers['name']))
      const v = runAll(checks)
      if (!v.ok) throw new Error('Validation failed:\n  - ' + v.reasons.join('\n  - '))
    }

    apply(tree, answers)

    const dryRun = process.env['TURBO_GEN_DRY_RUN'] === '1'
    process.stdout.write(renderPlan(tree.changes(), []))
    flush(tree, { dryRun })
    return dryRun ? '(dry-run; no files written)' : 'applied'
  })

  entityGen.register(plop)
  commandGen.register(plop)
  queryGen.register(plop)
  moduleGen.register(plop)
}
