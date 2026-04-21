import { describe, it, expect } from 'vitest'
import type { AgentToolMeta, AgentToolDescriptor } from './agent-tool-meta'

describe('AgentToolMeta type', () => {
  it('compiles against a fully-populated sample with every field', () => {
    const sample: AgentToolMeta = {
      whenToUse: 'Use when listing active employees for a department',
      whenNotToUse: 'Do not use to retrieve payroll information',
      examples: [
        {
          input: 'List all engineers in the Singapore office',
          callArgs: { departmentId: 'dept-uuid', officeCode: 'SG' },
        },
        {
          input: 'Show me HR team members',
          callArgs: { departmentId: 'hr-uuid' },
        },
      ],
      tenantAuthoredFreeText: ['notes', 'customLabel'],
      approvalFreshness: 'revalidate',
      approvalTtl: '48h',
      compositionSensitive: { minGroupSize: 5 },
      ceilings: { bytesScanned: 1_000_000, wallclockMs: 5000 },
      collectionContract: { pageSize: 50, cursorStyle: 'forward' },
      projection: {
        requiredFields: ['id', 'fullName', 'email'],
        optionalFields: ['department', 'officeCode'],
      },
    }

    expect(sample.whenToUse).toBeTruthy()
    expect(sample.whenNotToUse).toBeTruthy()
    expect(sample.examples.length).toBeGreaterThanOrEqual(1)
    expect(sample.compositionSensitive?.minGroupSize).toBe(5)
    expect(sample.ceilings?.bytesScanned).toBe(1_000_000)
    expect(sample.collectionContract?.cursorStyle).toBe('forward')
    expect(sample.projection?.requiredFields).toContain('id')
  })

  it('compiles with only required fields', () => {
    const minimal: AgentToolMeta = {
      whenToUse: 'Use to get employee by ID',
      whenNotToUse: 'Do not use for bulk lookups',
      examples: [{ input: 'Get employee 123', callArgs: { employeeId: '123' } }],
    }

    expect(minimal.whenToUse).toBeTruthy()
    expect(minimal.tenantAuthoredFreeText).toBeUndefined()
    expect(minimal.approvalFreshness).toBeUndefined()
    expect(minimal.ceilings).toBeUndefined()
  })

  it('approvalFreshness accepts both valid literal values', () => {
    const withRevalidate: AgentToolMeta = {
      whenToUse: 'submit leave request',
      whenNotToUse: 'read-only operations',
      examples: [{ input: 'submit leave', callArgs: { leaveType: 'annual' } }],
      approvalFreshness: 'revalidate',
    }
    const withAcceptStale: AgentToolMeta = {
      whenToUse: 'submit timesheet',
      whenNotToUse: 'read-only operations',
      examples: [{ input: 'submit timesheet', callArgs: {} }],
      approvalFreshness: 'accept-stale',
    }

    expect(withRevalidate.approvalFreshness).toBe('revalidate')
    expect(withAcceptStale.approvalFreshness).toBe('accept-stale')
  })

  it('collectionContract accepts both cursorStyle values', () => {
    const forward: AgentToolMeta = {
      whenToUse: 'list',
      whenNotToUse: 'single lookup',
      examples: [{ input: 'list items', callArgs: {} }],
      collectionContract: { pageSize: 25, cursorStyle: 'forward' },
    }
    const bidirectional: AgentToolMeta = {
      whenToUse: 'browse',
      whenNotToUse: 'single lookup',
      examples: [{ input: 'browse items', callArgs: {} }],
      collectionContract: { pageSize: 25, cursorStyle: 'bidirectional' },
    }

    expect(forward.collectionContract?.cursorStyle).toBe('forward')
    expect(bidirectional.collectionContract?.cursorStyle).toBe('bidirectional')
  })
})

describe('AgentToolDescriptor type', () => {
  it('compiles against a fully-populated sample', () => {
    const descriptor: AgentToolDescriptor = {
      name: 'people.listEmployees',
      procedure: 'query',
      permission: 'people:employees:read',
      inputSchema: { type: 'object', properties: { departmentId: { type: 'string' } } },
      outputSchema: {
        type: 'object',
        properties: { employees: { type: 'array' }, nextCursor: { type: 'string' } },
      },
      meta: {
        whenToUse: 'List employees in a department',
        whenNotToUse: 'Single employee lookup',
        examples: [{ input: 'list engineers', callArgs: { departmentId: 'uuid' } }],
        collectionContract: { pageSize: 50, cursorStyle: 'forward' },
      },
    }

    expect(descriptor.name).toBe('people.listEmployees')
    expect(descriptor.procedure).toBe('query')
    expect(descriptor.permission).toBeTruthy()
    expect(descriptor.meta.whenToUse).toBeTruthy()
  })

  it('procedure accepts mutation', () => {
    const mutationDescriptor: AgentToolDescriptor = {
      name: 'time.submitLeave',
      procedure: 'mutation',
      permission: 'time:leave:submit',
      inputSchema: {},
      outputSchema: {},
      meta: {
        whenToUse: 'Submit a leave request',
        whenNotToUse: 'Read leave balances',
        examples: [{ input: 'take annual leave next week', callArgs: { type: 'annual' } }],
        approvalFreshness: 'revalidate',
      },
    }

    expect(mutationDescriptor.procedure).toBe('mutation')
  })
})
