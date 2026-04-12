import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DynamoActivityLogClient } from '../dynamo-activity-log-client'
import type { ActivityEntry } from '../types'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-dynamodb', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  DynamoDBClient: vi.fn(function (this: any) {
    this.send = mockSend
  }),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn(() => ({ send: mockSend })) },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  PutCommand: vi.fn(function (this: any, input: unknown) {
    this.input = input
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BatchWriteCommand: vi.fn(function (this: any, input: unknown) {
    this.input = input
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  QueryCommand: vi.fn(function (this: any, input: unknown) {
    this.input = input
  }),
}))

const entry: ActivityEntry = {
  tenantId: 'tenant-1',
  actorId: 'actor-1',
  actorName: 'Canh Ta',
  action: 'leave.approved',
  resourceType: 'leave_request',
  resourceId: 'lr-1',
  summary: 'Canh approved leave for Nguyen',
}

describe('DynamoActivityLogClient', () => {
  let client: DynamoActivityLogClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
    client = new DynamoActivityLogClient({
      tableName: 'test-activity-log',
      region: 'ap-southeast-1',
    })
  })

  it('write() sends a PutCommand with correct table and keys', async () => {
    await client.write(entry)

    expect(mockSend).toHaveBeenCalledOnce()
    const putInput = mockSend.mock.calls[0]![0].input
    expect(putInput.TableName).toBe('test-activity-log')
    expect(putInput.Item.tenantId).toBe('tenant-1')
    expect(putInput.Item.actorId).toBe('actor-1')
    expect(putInput.Item.action).toBe('leave.approved')
    expect(putInput.Item.expiresAt).toBeTypeOf('number')
  })

  it('write() uses provided timestamp', async () => {
    const ts = new Date('2026-04-11T10:00:00Z')
    await client.write({ ...entry, timestamp: ts })

    const putInput = mockSend.mock.calls[0]![0].input
    expect(putInput.Item.sortKey).toContain('2026-04-11T10:00:00')
  })

  it('queryByTenant() sends a QueryCommand with correct key condition', async () => {
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined })

    const result = await client.queryByTenant('tenant-1', { limit: 10 })

    expect(result.items).toEqual([])
    expect(result.cursor).toBeUndefined()
    const queryInput = mockSend.mock.calls[0]![0].input
    expect(queryInput.TableName).toBe('test-activity-log')
    expect(queryInput.Limit).toBe(10)
  })

  it('queryByActor() uses GSI-1', async () => {
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined })

    await client.queryByActor('tenant-1', 'actor-1')

    const queryInput = mockSend.mock.calls[0]![0].input
    expect(queryInput.IndexName).toBe('gsi1-actor')
  })

  it('queryByResource() uses GSI-2', async () => {
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined })

    await client.queryByResource('tenant-1', 'leave_request', 'lr-1')

    const queryInput = mockSend.mock.calls[0]![0].input
    expect(queryInput.IndexName).toBe('gsi2-resource')
  })
})
