import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PERMISSION_KEY_SET, ALL_PERMISSION_KEYS } from './permissions'

const MODULES_DIR = join(__dirname, '../../modules')
const META_PERMISSION_RE = /\.meta\(\s*\{\s*permission:\s*['"]([^'"]+)['"]/g

function findRouterFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) {
      out.push(...findRouterFiles(full))
    } else if (entry.endsWith('.router.ts') && !entry.includes('.spec.')) {
      out.push(full)
    }
  }
  return out
}

describe('permission registry — drift guard', () => {
  it('every route .meta({ permission }) string is registered', () => {
    const files = findRouterFiles(MODULES_DIR)
    expect(files.length).toBeGreaterThan(0)

    const offenders: Array<{ file: string; key: string }> = []

    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      const matches = source.matchAll(META_PERMISSION_RE)
      for (const m of matches) {
        const key = m[1]!
        if (!PERMISSION_KEY_SET.has(key)) {
          offenders.push({ file: file.replace(MODULES_DIR, 'modules'), key })
        }
      }
    }

    expect(
      offenders,
      `Found ${offenders.length} route permissions not in PERMISSIONS registry. ` +
        `Add them to apps/api/src/common/auth/permissions.ts:\n` +
        offenders.map((o) => `  - ${o.key}  (${o.file})`).join('\n'),
    ).toEqual([])
  })

  it('registry has unique values', () => {
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const k of ALL_PERMISSION_KEYS) {
      if (seen.has(k)) dupes.push(k)
      seen.add(k)
    }
    expect(dupes).toEqual([])
  })
})
