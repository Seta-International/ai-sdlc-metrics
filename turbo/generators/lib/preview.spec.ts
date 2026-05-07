import { describe, it, expect } from 'vitest'
import { renderPlan } from './preview'
import type { PendingChange } from './tree'

describe('renderPlan', () => {
  it('groups CREATE/EDIT/DELETE/TODO and right-pads action labels', () => {
    const changes: PendingChange[] = [
      { kind: 'create', path: 'a.ts', contents: 'x' },
      { kind: 'edit', path: 'b.ts', before: 'old', after: 'new' },
      { kind: 'delete', path: 'c.ts', before: 'gone' },
    ]
    const todos = ['Run db:generate after applying', 'Run bun install']
    const out = renderPlan(changes, todos)
    expect(out).toContain('CREATE  a.ts')
    expect(out).toContain('EDIT    b.ts')
    expect(out).toContain('DELETE  c.ts')
    expect(out).toContain('TODO    Run db:generate after applying')
    expect(out).toContain('TODO    Run bun install')
  })

  it('shows a friendly empty-plan message', () => {
    expect(renderPlan([], [])).toContain('No changes to apply')
  })
})
