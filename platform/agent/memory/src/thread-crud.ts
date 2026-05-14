import { randomUUID } from 'node:crypto'
import type { TransactionSql } from 'postgres'
import type { Thread } from './schema'

export type StorageOrderBy = Partial<Record<'createdAt' | 'updatedAt', 'asc' | 'desc'>>

export interface ListThreadsOptions {
  page?: number | undefined              // 0-indexed (default 0)
  perPage?: number | false | undefined   // false = return all (default 100)
  orderBy?: StorageOrderBy | undefined
  filter?: {
    resourceId?: string | undefined
    metadata?: Record<string, unknown> | undefined
  } | undefined
}

export interface ListThreadsResult {
  threads: Thread[]
  page: number
  perPage: number | false
  hasMore: boolean
  total: number
}

export interface CreateThreadInput {
  resourceId: string         // required, matches Mastra
  threadId?: string | undefined
  title?: string | null | undefined
  metadata?: Record<string, unknown> | null | undefined
}

export interface GetThreadInput {
  threadId: string
  resourceId?: string | undefined
}

export interface SaveThreadInput {
  id: string
  resourceId: string         // required, matches Mastra's StorageThreadType
  title?: string | null | undefined
  metadata?: Record<string, unknown> | null | undefined
}

export interface SaveThreadArgs {
  thread: SaveThreadInput
}

export interface ThreadPatch {
  title: string                       // required, matches Mastra's replace semantics
  metadata: Record<string, unknown>   // required, matches Mastra's replace semantics
}

export type UpdateThreadInput = ThreadPatch & { id: string }

export interface DeleteThreadInput {
  threadId: string
}

type ThreadRow = {
  id: string
  tenant_id: string
  resource_id: string | null
  title: string | null
  metadata: Record<string, unknown> | null
  message_count: number
  created_at: Date
  updated_at: Date
}

function toThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    resourceId: r.resource_id,
    title: r.title,
    metadata: r.metadata,
    messageCount: r.message_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function getThread(
  tx: TransactionSql,
  _tenantId: string,
  threadId: string,
): Promise<Thread | null> {
  return getThreadById(tx, _tenantId, { threadId })
}

export async function getThreadById(
  tx: TransactionSql,
  _tenantId: string,
  input: GetThreadInput,
): Promise<Thread | null> {
  const rows = await tx<ThreadRow[]>`
    SELECT id, tenant_id, resource_id, title, metadata, message_count, created_at, updated_at
    FROM agent_memory.threads
    WHERE id = ${input.threadId}
    LIMIT 1
  `
  const thread = rows[0] ? toThread(rows[0]) : null
  if (!thread || (input.resourceId !== undefined && thread.resourceId !== input.resourceId)) return null
  return thread
}

export async function listThreads(
  tx: TransactionSql,
  _tenantId: string,
  opts?: ListThreadsOptions,
): Promise<ListThreadsResult> {
  const page = Math.max(0, opts?.page ?? 0)  // 0-indexed
  const perPage = opts?.perPage ?? 100
  const offset = page * (perPage === false ? 0 : perPage)

  const orderEntry = opts?.orderBy ? Object.entries(opts.orderBy)[0] : undefined
  const col = orderEntry?.[0] === 'createdAt' ? 'created_at' : 'updated_at'
  const dir = orderEntry?.[1]?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  const resourceId = opts?.filter?.resourceId ?? null
  const metadata = opts?.filter?.metadata ?? null

  const resourceFilter = resourceId != null ? tx`AND resource_id = ${resourceId}` : tx``
  const metaFilter = metadata != null
    ? tx`AND metadata @> ${tx.json(metadata as never)}`
    : tx``
  const limitClause = perPage !== false ? tx`LIMIT ${perPage + 1}` : tx``

  const rows = await tx<ThreadRow[]>`
    SELECT id, tenant_id, resource_id, title, metadata, message_count, created_at, updated_at
    FROM agent_memory.threads
    WHERE TRUE ${resourceFilter} ${metaFilter}
    ORDER BY ${tx.unsafe(col)} ${tx.unsafe(dir)}
    ${limitClause}
    OFFSET ${offset}
  `
  const countRows = await tx<Array<{ n: string }>>`
    SELECT COUNT(*)::text AS n
    FROM agent_memory.threads
    WHERE TRUE ${resourceFilter} ${metaFilter}
  `

  const hasMore = perPage !== false && rows.length > perPage
  const slice = hasMore ? rows.slice(0, perPage) : rows

  return {
    threads: slice.map(toThread),
    page,
    perPage,
    hasMore,
    total: parseInt(countRows[0]?.n ?? '0', 10),
  }
}

export async function createThread(
  tx: TransactionSql,
  tenantId: string,
  input: CreateThreadInput,
): Promise<Thread> {
  const id = input.threadId ?? randomUUID()
  const rows = await tx<ThreadRow[]>`
    INSERT INTO agent_memory.threads (id, tenant_id, resource_id, title, metadata)
    VALUES (
      ${id},
      ${tenantId},
      ${input.resourceId},
      ${input.title ?? null},
      ${input.metadata ? tx.json(input.metadata as never) : null}
    )
    RETURNING id, tenant_id, resource_id, title, metadata, message_count, created_at, updated_at
  `
  return toThread(rows[0]!)
}

export async function saveThread(
  tx: TransactionSql,
  tenantId: string,
  input: SaveThreadInput | SaveThreadArgs,
): Promise<Thread> {
  const thread = 'thread' in input ? input.thread : input
  const rows = await tx<ThreadRow[]>`
    INSERT INTO agent_memory.threads (id, tenant_id, resource_id, title, metadata)
    VALUES (
      ${thread.id},
      ${tenantId},
      ${thread.resourceId},
      ${thread.title ?? null},
      ${thread.metadata ? tx.json(thread.metadata as never) : null}
    )
    ON CONFLICT (id) DO UPDATE
      SET resource_id = EXCLUDED.resource_id,
          title       = EXCLUDED.title,
          metadata    = EXCLUDED.metadata,
          updated_at  = now()
    RETURNING id, tenant_id, resource_id, title, metadata, message_count, created_at, updated_at
  `
  return toThread(rows[0]!)
}

export async function updateThread(
  tx: TransactionSql,
  _tenantId: string,
  input: UpdateThreadInput,
): Promise<Thread | null> {
  const rows = await tx<ThreadRow[]>`
    UPDATE agent_memory.threads
    SET
      title      = ${input.title},
      metadata   = ${tx.json(input.metadata as never)},
      updated_at = now()
    WHERE id = ${input.id}
    RETURNING id, tenant_id, resource_id, title, metadata, message_count, created_at, updated_at
  `
  return rows[0] ? toThread(rows[0]) : null
}

export async function deleteThread(
  tx: TransactionSql,
  _tenantId: string,
  input: string | DeleteThreadInput,
): Promise<void> {
  const threadId = typeof input === 'string' ? input : input.threadId
  await tx`DELETE FROM agent_memory.messages WHERE thread_id = ${threadId}`
  await tx`DELETE FROM agent_memory.threads WHERE id = ${threadId}`
}
