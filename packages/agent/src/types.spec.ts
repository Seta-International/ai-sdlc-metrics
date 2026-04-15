import { describe, it, expect } from 'vitest'
import type {
  ModuleKey,
  AgentContext,
  AgentInsight,
  AgentInlineActionConfig,
  AgentSessionStatus,
  AgentMessageRole,
  AgentMessage,
  AgentSession,
  AgentPanelState,
} from './types'

describe('Agent types', () => {
  it('AgentContext accepts valid module keys', () => {
    const ctx: AgentContext = {
      module: 'people',
      entity: 'employee',
      id: '018f1a2b-3c4d-7000-8000-000000000001',
    }
    expect(ctx.module).toBe('people')
    expect(ctx.entity).toBe('employee')
    expect(ctx.id).toBe('018f1a2b-3c4d-7000-8000-000000000001')
  })

  it('AgentContext accepts optional metadata', () => {
    const ctx: AgentContext = {
      module: 'time',
      entity: 'leave-request',
      id: '018f1a2b-3c4d-7000-8000-000000000002',
      metadata: { department: 'Engineering', status: 'pending' },
    }
    expect(ctx.metadata).toEqual({ department: 'Engineering', status: 'pending' })
  })

  it('AgentInsight has required fields', () => {
    const insight: AgentInsight = {
      id: '018f1a2b-3c4d-7000-8000-000000000003',
      module: 'people',
      entity: 'employee',
      entityId: '018f1a2b-3c4d-7000-8000-000000000001',
      severity: 'warning',
      title: 'Visa expires Jun 15',
      description: 'Employee visa expires in 30 days.',
      createdAt: new Date('2026-04-15'),
    }
    expect(insight.severity).toBe('warning')
    expect(insight.actionLabel).toBeUndefined()
  })

  it('AgentInsight accepts optional action fields', () => {
    const insight: AgentInsight = {
      id: '018f1a2b-3c4d-7000-8000-000000000004',
      module: 'people',
      entity: 'employee',
      entityId: '018f1a2b-3c4d-7000-8000-000000000001',
      severity: 'critical',
      title: 'Contract expired',
      description: 'Employment contract expired yesterday.',
      actionLabel: 'Draft renewal',
      actionHref: '/employees/018f1a2b-3c4d-7000-8000-000000000001',
      createdAt: new Date('2026-04-15'),
    }
    expect(insight.actionLabel).toBe('Draft renewal')
    expect(insight.actionHref).toBe('/employees/018f1a2b-3c4d-7000-8000-000000000001')
  })

  it('AgentInlineActionConfig has required fields', () => {
    const action: AgentInlineActionConfig = {
      key: 'summarize',
      label: 'Summarize',
    }
    expect(action.key).toBe('summarize')
    expect(action.permission).toBeUndefined()
  })

  it('AgentMessage has required fields', () => {
    const msg: AgentMessage = {
      id: '018f1a2b-3c4d-7000-8000-000000000005',
      sessionId: '018f1a2b-3c4d-7000-8000-000000000006',
      role: 'assistant',
      content: 'Here is the summary.',
      createdAt: new Date('2026-04-15'),
    }
    expect(msg.role).toBe('assistant')
    expect(msg.toolName).toBeUndefined()
  })

  it('AgentSession has required fields', () => {
    const session: AgentSession = {
      id: '018f1a2b-3c4d-7000-8000-000000000006',
      status: 'active',
      messages: [],
      createdAt: new Date('2026-04-15'),
    }
    expect(session.status).toBe('active')
  })

  it('AgentPanelState tracks open/closed', () => {
    const state: AgentPanelState = {
      isOpen: false,
      activeSessionId: null,
    }
    expect(state.isOpen).toBe(false)
    expect(state.activeSessionId).toBeNull()
  })
})
