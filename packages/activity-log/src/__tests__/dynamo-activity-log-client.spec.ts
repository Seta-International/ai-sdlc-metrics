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

  it('writeBatch() sends BatchWriteCommand with chunked entries', async () => {
    mockSend.mockResolvedValue({ UnprocessedItems: {} })
    const entries = [entry, { ...entry, actorId: 'actor-2' }]

    await client.writeBatch(entries)

    expect(mockSend).toHaveBeenCalledOnce()
    const batchInput = mockSend.mock.calls[0]![0].input
    expect(batchInput.RequestItems['test-activity-log']).toHaveLength(2)
  })

  it('writeBatch() throws when DynamoDB returns UnprocessedItems', async () => {
    mockSend.mockResolvedValue({
      UnprocessedItems: { 'test-activity-log': [{ PutRequest: { Item: {} } }] },
    })

    await expect(client.writeBatch([entry])).rejects.toThrow(
      'DynamoDB batch write partially failed',
    )
  })

  it('queryByTenant() returns items with mapped fields', async () => {
    mockSend.mockResolvedValue({
      Items: [
        {
          tenantId: 'tenant-1',
          actorId: 'actor-1',
          actorName: 'Canh Ta',
          action: 'leave.approved',
          resourceType: 'leave_request',
          resourceId: 'lr-1',
          summary: 'test',
          metadata: { key: 'value' },
          timestamp: '2026-04-11T10:00:00.000Z',
        },
      ],
      LastEvaluatedKey: { tenantId: 'tenant-1', sortKey: 'abc' },
    })

    const result = await client.queryByTenant('tenant-1')

    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.actorId).toBe('actor-1')
    expect(result.items[0]!.timestamp).toBeInstanceOf(Date)
    expect(result.cursor).toBeDefined()
    expect(typeof result.cursor).toBe('string')
  })

  it('queryByTenant() passes cursor as ExclusiveStartKey', async () => {
    const lastKey = { tenantId: 'tenant-1', sortKey: 'abc' }
    const cursor = Buffer.from(JSON.stringify(lastKey)).toString('base64url')
    mockSend.mockResolvedValue({ Items: [], LastEvaluatedKey: undefined })

    await client.queryByTenant('tenant-1', { cursor })

    const queryInput = mockSend.mock.calls[0]![0].input
    expect(queryInput.ExclusiveStartKey).toEqual(lastKey)
  })

  it('query() throws on invalid cursor', async () => {
    await expect(
      client.queryByTenant('tenant-1', { cursor: 'not-valid-base64url-json!!!' }),
    ).rejects.toThrow('Invalid pagination cursor')
  })
})
