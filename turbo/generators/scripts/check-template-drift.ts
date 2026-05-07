import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
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

function normalizePreferencesToTemplate(contents: string): string {
  return contents
    .replace(/SavedView/g, '{{pascal name}}')
    .replace(/savedView/g, '{{camel name}}')
    .replace(/saved_view/g, '{{snake name}}')
    .replace(/SAVED_VIEW/g, '{{screamingSnake name}}')
    .replace(/preferences/g, '{{kebab module}}')
}

const refModule = walk(join(repoRoot, 'apps/api/src/modules/preferences'))
const tplModule = walk(join(repoRoot, 'turbo/generators/templates/module'))
let drift = 0
for (const [path, refContents] of Object.entries(refModule)) {
  const tplPath = path
    .replace(/saved-view/g, '{{kebab name}}')
    .replace(/preferences/g, '{{kebab module}}')
  const tplKey = `${tplPath}.hbs`
  const tplContents = tplModule[tplKey]
  if (tplContents === undefined) {
    console.error(`Reference file has no template counterpart: ${path}`)
    drift++
    continue
  }
  const expected = normalizePreferencesToTemplate(refContents)
  if (expected.trim() !== tplContents.trim()) {
    console.error(`Template drift in ${tplKey} — re-sync via sync-templates.ts`)
    drift++
  }
}
process.exit(drift > 0 ? 1 : 0)
