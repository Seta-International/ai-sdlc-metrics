import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply, pickFreePort } from '../generators/zone.gen'

describe('zone generator', () => {
  it('produces a Next.js zone with the next free port', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-zone-'))
    try {
      mkdirSync(join(dir, 'apps/web-people'), { recursive: true })
      writeFileSync(
        join(dir, 'apps/web-people/package.json'),
        JSON.stringify({ scripts: { dev: 'next dev --port 3001' } }),
      )
      const tree = createTree(dir)
      apply(tree, { name: 'billing' })
      flush(tree, { dryRun: false })
      const pkg = JSON.parse(readFileSync(join(dir, 'apps/web-billing/package.json'), 'utf8'))
      expect(pkg.scripts.dev).toBe('next dev --port 3002')
      expect(existsSync(join(dir, 'apps/web-billing/src/app/page.tsx'))).toBe(true)
      expect(existsSync(join(dir, 'apps/web-billing/src/navigation.ts'))).toBe(true)
      expect(existsSync(join(dir, 'apps/web-billing/src/app/_components/billing-list.tsx'))).toBe(
        true,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('pickFreePort returns 3001 in an empty apps/', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-zone-empty-'))
    try {
      mkdirSync(join(dir, 'apps'))
      expect(pickFreePort(dir)).toBe(3001)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
