import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type FileMap = Record<string, string>

const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../..')

function walk(root: string, sub = '', out: FileMap = {}): FileMap {
  for (const ent of readdirSync(join(root, sub), { withFileTypes: true })) {
    const rel = sub ? `${sub}/${ent.name}` : ent.name
    if (ent.isDirectory()) walk(root, rel, out)
    else out[rel] = readFileSync(join(root, rel), 'utf8')
  }
  return out
}

function normalize(contents: string): string {
  return contents
    .replace(/SavedView/g, '{{pascal name}}')
    .replace(/savedView/g, '{{camel name}}')
    .replace(/saved_view/g, '{{snake name}}')
    .replace(/SAVED_VIEW/g, '{{screamingSnake name}}')
    .replace(/preferences/g, '{{kebab module}}')
}

const refModule = walk(join(repoRoot, 'apps/api/src/modules/preferences'))
const tplRoot = join(repoRoot, 'turbo/generators/templates/module')
for (const [path, contents] of Object.entries(refModule)) {
  const tplPath = path
    .replace(/saved-view/g, '{{kebab name}}')
    .replace(/preferences/g, '{{kebab module}}')
  const dest = join(tplRoot, `${tplPath}.hbs`)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, normalize(contents))
  console.log(`wrote ${dest}`)
}
