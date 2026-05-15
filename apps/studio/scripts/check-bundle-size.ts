import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = join(import.meta.dirname, '..', 'dist', 'assets')
const MAIN_MAX = 250 * 1024
const CHUNK_WARN = 100 * 1024

function gzippedSize(file: string): number {
  return gzipSync(readFileSync(file)).byteLength
}

function listJs(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile())
}

function main(): void {
  const files = listJs(DIST)
  if (files.length === 0) {
    console.error(`bundle-size: no JS files at ${DIST}`)
    process.exit(1)
  }
  const violations: string[] = []
  const warnings: string[] = []
  let mainSeen = false
  for (const file of files) {
    const size = gzippedSize(file)
    const base = file.split('/').pop() ?? file
    const isMain = base.startsWith('index') || base.startsWith('main')
    const label = isMain ? 'main' : 'chunk'
    console.log(`${label.padEnd(5)} ${base.padEnd(40)} ${(size / 1024).toFixed(1)} kB gz`)
    if (isMain) {
      mainSeen = true
      if (size > MAIN_MAX) {
        violations.push(
          `${base}: ${(size / 1024).toFixed(1)} kB gz > ${(MAIN_MAX / 1024).toFixed(0)} kB`,
        )
      }
    } else if (size > CHUNK_WARN) {
      warnings.push(
        `${base}: ${(size / 1024).toFixed(1)} kB gz (chunk warn ${CHUNK_WARN / 1024} kB)`,
      )
    }
  }
  if (!mainSeen) violations.push('bundle-size: no main bundle found')
  if (warnings.length > 0) {
    console.warn('\nWARN (oversized async chunks — code-split follow-up):')
    for (const w of warnings) console.warn(`  ${w}`)
  }
  if (violations.length > 0) {
    console.error('\nFAIL:')
    for (const v of violations) console.error(`  ${v}`)
    process.exit(1)
  }
  console.log('\nbundle-size OK')
}

main()
