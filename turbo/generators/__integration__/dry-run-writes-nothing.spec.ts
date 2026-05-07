import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTree } from '../lib/tree'
import { flush } from '../lib/flush'
import { apply as moduleApply } from '../generators/module.gen'

describe('dry-run', () => {
  it('module generator with dryRun=true writes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen-dry-'))
    try {
      const tree = createTree(dir)
      moduleApply(tree, { name: 'billing' })
      flush(tree, { dryRun: true })
      expect(existsSync(join(dir, 'apps/api/src/modules/billing'))).toBe(false)
      expect(readdirSync(dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
