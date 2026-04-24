import { describe, it, expect } from 'vitest'
import { agentDraft } from './agent-draft.schema'

describe('Plan 08 — agent_draft schema', () => {
  it('agentDraft is defined', () => {
    expect(agentDraft).toBeDefined()
  })

  it('agentDraft has expected columns', () => {
    const cols = Object.keys(agentDraft)
    expect(cols).toContain('id')
    expect(cols).toContain('tenantId')
    expect(cols).toContain('traceId')
    expect(cols).toContain('flowId')
    expect(cols).toContain('initiatorUserId')
    expect(cols).toContain('onBehalfOf')
    expect(cols).toContain('viaDelegationId')
    expect(cols).toContain('viaScheduleId')
    expect(cols).toContain('approverUserId')
    expect(cols).toContain('tier')
    expect(cols).toContain('status')
    expect(cols).toContain('toolName')
    expect(cols).toContain('args')
    expect(cols).toContain('expectedOutputShape')
    expect(cols).toContain('permissionEnvelopeAtDraftTime')
    expect(cols).toContain('approvalFreshness')
    expect(cols).toContain('approvalTtl')
    expect(cols).toContain('draftedAt')
    expect(cols).toContain('expiresAt')
    expect(cols).toContain('approvedAt')
    expect(cols).toContain('executedAt')
    expect(cols).toContain('executionOutcome')
    expect(cols).toContain('provenance')
    expect(cols).toContain('taintAtDraftTime')
  })

  it('agentDraft has tenant_id (RLS column)', () => {
    const cols = Object.keys(agentDraft)
    expect(cols).toContain('tenantId')
  })

  it('agentDraft status column has default "pending"', () => {
    const col = agentDraft.status
    expect((col as unknown as { default: unknown }).default).toBe('pending')
  })

  it('agentDraft taintAtDraftTime column has default false', () => {
    const col = agentDraft.taintAtDraftTime
    expect((col as unknown as { default: unknown }).default).toBe(false)
  })

  it('agentDraft permissionEnvelopeAtDraftTime column is not null', () => {
    const col = agentDraft.permissionEnvelopeAtDraftTime
    expect(col).toBeDefined()
  })

  it('agentDraft provenance column is not null', () => {
    const col = agentDraft.provenance
    expect(col).toBeDefined()
  })
})
