import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  BatchWriteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import { uuidv7 } from 'uuidv7'
import type {
  ActivityLogClient,
  ActivityLogConfig,
  ActivityEntry,
  QueryOpts,
  PaginatedResult,
} from './types'

const DEFAULT_LIMIT = 50
const DEFAULT_TTL_DAYS = 365

export class DynamoActivityLogClient implements ActivityLogClient {
  private readonly docClient: DynamoDBDocumentClient
  private readonly tableName: string
  private readonly ttlDays: number

  constructor(config: ActivityLogConfig) {
    const ddb = new DynamoDBClient({ region: config.region })
    this.docClient = DynamoDBDocumentClient.from(ddb)
    this.tableName = config.tableName
    this.ttlDays = config.ttlDays ?? DEFAULT_TTL_DAYS
  }

  async write(entry: ActivityEntry): Promise<void> {
    const now = entry.timestamp ?? new Date()
    const eventId = uuidv7()
    const sortKey = `${now.toISOString()}#${eventId}`

    await this.docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          tenantId: entry.tenantId,
          sortKey,
          actorId: entry.actorId,
          actorName: entry.actorName,
          action: entry.action,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
          summary: entry.summary,
          metadata: entry.metadata ?? {},
          timestamp: now.toISOString(),
          // GSI keys
          gsi1pk: `${entry.tenantId}#${entry.actorId}`,
          gsi2pk: `${entry.tenantId}#${entry.resourceType}#${entry.resourceId}`,
          // TTL
          expiresAt: Math.floor(now.getTime() / 1000) + this.ttlDays * 86400,
        },
      }),
    )
  }

  async writeBatch(entries: ActivityEntry[]): Promise<void> {
    // DynamoDB BatchWriteItem supports max 25 items
    const chunks: ActivityEntry[][] = []
    for (let i = 0; i < entries.length; i += 25) {
      chunks.push(entries.slice(i, i + 25))
    }

    for (const chunk of chunks) {
      const requests = chunk.map((entry) => {
        const now = entry.timestamp ?? new Date()
        const eventId = uuidv7()
        const sortKey = `${now.toISOString()}#${eventId}`
        return {
          PutRequest: {
            Item: {
              tenantId: entry.tenantId,
              sortKey,
              actorId: entry.actorId,
              actorName: entry.actorName,
              action: entry.action,
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              summary: entry.summary,
              metadata: entry.metadata ?? {},
              timestamp: now.toISOString(),
              gsi1pk: `${entry.tenantId}#${entry.actorId}`,
              gsi2pk: `${entry.tenantId}#${entry.resourceType}#${entry.resourceId}`,
              expiresAt: Math.floor(now.getTime() / 1000) + this.ttlDays * 86400,
            },
          },
        }
      })

      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: { [this.tableName]: requests },
        }),
      )
    }
  }

  async queryByTenant(
    tenantId: string,
    opts: QueryOpts = {},
  ): Promise<PaginatedResult<ActivityEntry>> {
    return this.query({
      keyCondition: 'tenantId = :pk',
      expressionValues: { ':pk': tenantId },
      opts,
    })
  }

  async queryByActor(
    tenantId: string,
    actorId: string,
    opts: QueryOpts = {},
  ): Promise<PaginatedResult<ActivityEntry>> {
    return this.query({
      indexName: 'gsi1-actor',
      keyCondition: 'gsi1pk = :pk',
      expressionValues: { ':pk': `${tenantId}#${actorId}` },
      opts,
    })
  }

  async queryByResource(
    tenantId: string,
    resourceType: string,
    resourceId: string,
    opts: QueryOpts = {},
  ): Promise<PaginatedResult<ActivityEntry>> {
    return this.query({
      indexName: 'gsi2-resource',
      keyCondition: 'gsi2pk = :pk',
      expressionValues: { ':pk': `${tenantId}#${resourceType}#${resourceId}` },
      opts,
    })
  }

  private async query(params: {
    indexName?: string
    keyCondition: string
    expressionValues: Record<string, string>
    opts: QueryOpts
  }): Promise<PaginatedResult<ActivityEntry>> {
    let keyCondition = params.keyCondition
    const exprValues: Record<string, unknown> = { ...params.expressionValues }

    if (params.opts.from) {
      keyCondition += ' AND sortKey >= :from'
      exprValues[':from'] = params.opts.from.toISOString()
    }
    if (params.opts.to) {
      keyCondition += ' AND sortKey <= :to'
      exprValues[':to'] = params.opts.to.toISOString()
    }

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: params.indexName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: exprValues,
        Limit: params.opts.limit ?? DEFAULT_LIMIT,
        ScanIndexForward: false, // newest first
        ExclusiveStartKey: params.opts.cursor
          ? JSON.parse(Buffer.from(params.opts.cursor, 'base64url').toString())
          : undefined,
      }),
    )

    const items: ActivityEntry[] = (result.Items ?? []).map((item) => ({
      tenantId: item['tenantId'] as string,
      actorId: item['actorId'] as string,
      actorName: item['actorName'] as string,
      action: item['action'] as string,
      resourceType: item['resourceType'] as string,
      resourceId: item['resourceId'] as string,
      summary: item['summary'] as string,
      metadata: item['metadata'] as Record<string, unknown>,
      timestamp: new Date(item['timestamp'] as string),
    }))

    return {
      items,
      cursor: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
        : undefined,
    }
  }
}
