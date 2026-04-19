/**
 * Unit test — reduced-motion CSS
 * Plan 05 Task 5 — Step 4
 *
 * Verifies that the global CSS file contains the `prefers-reduced-motion`
 * media query that disables panel slide and drag animations for users who
 * have enabled "Reduce Motion" in their OS accessibility settings.
 *
 * Run with: bunx vitest run --reporter=verbose src/a11y/reduced-motion.spec.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

function extractMediaBlock(css: string, mediaQuery: string): string | null {
  const mediaIdx = css.indexOf(mediaQuery)
  if (mediaIdx === -1) return null
  const openIdx = css.indexOf('{', mediaIdx)
  if (openIdx === -1) return null
  let depth = 1
  let i = openIdx + 1
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') depth--
    i++
  }
  return css.slice(openIdx + 1, i - 1)
}

describe('reduced-motion CSS', () => {
  const css = readFileSync(join(__dirname, '../../src/app/globals.css'), 'utf8')

  it('has prefers-reduced-motion media query', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('disables transition on task-detail-panel inside prefers-reduced-motion block', () => {
    const block = extractMediaBlock(css, 'prefers-reduced-motion: reduce')
    expect(block).not.toBeNull()
    expect(block!).toContain('task-detail-panel')
  })

  it('disables dnd-kit drag transitions inside prefers-reduced-motion block', () => {
    const block = extractMediaBlock(css, 'prefers-reduced-motion: reduce')
    expect(block).not.toBeNull()
    expect(block!).toContain('[data-dragging]')
  })
})
