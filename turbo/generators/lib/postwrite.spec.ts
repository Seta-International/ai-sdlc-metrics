import { describe, it, expect } from 'vitest'
import { buildTypecheckCommand, buildLintCommand } from './postwrite'

describe('buildTypecheckCommand', () => {
  it('targets api-only when no zone', () => {
    expect(buildTypecheckCommand({ apiOnly: true })).toBe('turbo run typecheck --filter=api')
  })
  it('includes the zone when provided', () => {
    expect(buildTypecheckCommand({ zoneName: 'billing' })).toBe(
      'turbo run typecheck --filter=api --filter=@future/web-billing',
    )
  })
})

describe('buildLintCommand', () => {
  it('passes --fix and limits to touched workspaces', () => {
    expect(buildLintCommand({ targets: ['api'] })).toBe('turbo run lint --filter=api -- --fix')
  })
})
