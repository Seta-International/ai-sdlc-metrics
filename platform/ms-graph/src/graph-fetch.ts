import { trace } from '@opentelemetry/api'
import type { AuditEntry } from '@seta/audit'
import { tenantContext } from '@seta/tenant'
import { normalizePath } from './audit-middleware'
import {
  GraphNotFound,
  GraphPermissionDenied,
  GraphPreconditionFailed,
  GraphRateLimited,
  GraphUnauthorized,
  GraphUnavailable,
} from './errors'

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
export type AuditActor = AuditEntry['actor']

export interface GraphCall {
  token: string
  method: Method
  path: string
  body?: unknown
  etag?: string
  query?: Record<string, string | number>
  headers?: Record<string, string>
  actor: AuditActor
  connectorId: string
}

export interface GraphResponse<T> {
  data: T
  etag: string | null
  status: number
  rateLimit?: { remaining?: number; limit?: number; resetAfter?: number }
}

export interface GraphFetchDeps {
  recordAudit: (entry: AuditEntry) => Promise<void>
  baseUrl?: string
  now?: () => number
  fetchImpl?: typeof fetch
  retryDelayCapMs?: number
}

export interface BatchRequest {
  id: string
  method: Method
  url: string
  body?: unknown
  headers?: Record<string, string>
  dependsOn?: string[]
}

export interface BatchResponseItem<T = unknown> {
  id: string
  status: number
  body?: T
  etag: string | null
  error?: { code: string; message: string }
}

export interface GraphFetch {
  call<T>(input: GraphCall): Promise<GraphResponse<T>>
  batch(input: {
    token: string
    actor: AuditActor
    connectorId: string
    requests: BatchRequest[]
  }): Promise<BatchResponseItem[]>
  paginate<T>(input: GraphCall): AsyncIterable<T>
}

function tryGetTenantId(): string {
  try {
    return tenantContext.getTenantId()
  } catch {
    return ''
  }
}

const MAX_RETRIES = 3
const BASE_URL = 'https://graph.microsoft.com/v1.0'
const tracer = trace.getTracer('@seta/ms-graph')

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetry(_method: Method, status: number): boolean {
  if (status === 429) return true
  if (status >= 500 && status <= 599) return true
  return false
}

function isIdempotent(method: Method): boolean {
  return method === 'GET' || method === 'PUT' || method === 'DELETE' || method === 'PATCH'
}

function mapStatusError(status: number, path: string): never {
  switch (status) {
    case 404:
      throw new GraphNotFound(path)
    case 403:
      throw new GraphPermissionDenied()
    case 412:
      throw new GraphPreconditionFailed()
    case 401:
      throw new GraphUnauthorized()
    default:
      throw new GraphUnavailable(`unexpected status ${status}`)
  }
}

function extractEtag(data: Record<string, unknown> | null, headers: Headers): string | null {
  if (data && typeof data['@odata.etag'] === 'string') return data['@odata.etag']
  const hdr = headers.get('ETag') ?? headers.get('etag')
  return hdr ?? null
}

async function execFetch(deps: GraphFetchDeps, input: GraphCall): Promise<GraphResponse<unknown>> {
  const { baseUrl = BASE_URL, fetchImpl = fetch, retryDelayCapMs = 10_000 } = deps

  const url = new URL(`${baseUrl}${input.path}`)
  if (input.query) {
    for (const [k, v] of Object.entries(input.query)) url.searchParams.set(k, String(v))
  }

  const reqHeaders: Record<string, string> = {
    Authorization: `Bearer ${input.token}`,
    'Content-Type': 'application/json',
    ...input.headers,
  }
  if (input.etag) reqHeaders['If-Match'] = input.etag

  let retries = 0

  while (true) {
    const fetchOpts: RequestInit = {
      method: input.method,
      headers: reqHeaders,
    }
    if (input.body !== undefined) fetchOpts.body = JSON.stringify(input.body)
    const resp = await fetchImpl(url.toString(), fetchOpts)

    if (resp.status === 204) {
      return { data: null, etag: null, status: 204 }
    }

    const canRetry =
      shouldRetry(input.method, resp.status) &&
      retries < MAX_RETRIES &&
      (isIdempotent(input.method) || resp.status === 429)

    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get('Retry-After') ?? '1')
      if (canRetry) {
        retries++
        await delay(Math.min(retryAfter * 1000, retryDelayCapMs))
        continue
      }
      throw new GraphRateLimited(retryAfter)
    }

    if (resp.status >= 500 && resp.status <= 599) {
      if (canRetry) {
        retries++
        const backoffMs = Math.min(2 ** (retries - 1) * 1000, retryDelayCapMs)
        await delay(backoffMs)
        continue
      }
      throw new GraphUnavailable(`server error ${resp.status}`)
    }

    if (!resp.ok) {
      mapStatusError(resp.status, input.path)
    }

    const data = (await resp.json()) as Record<string, unknown>
    const etag = extractEtag(data, resp.headers)

    return { data, etag, status: resp.status }
  }
}

export function createGraphFetch(deps: GraphFetchDeps): GraphFetch {
  async function call<T>(input: GraphCall): Promise<GraphResponse<T>> {
    const span = tracer.startSpan(`graph.${input.method} ${input.path}`, {
      attributes: {
        'graph.method': input.method,
        'graph.path': input.path,
        'graph.connector_id': input.connectorId,
      },
    })

    let result: GraphResponse<unknown>
    try {
      result = await execFetch(deps, input)
      span.setAttribute('graph.status', result.status)
      span.end()
    } catch (err) {
      span.end()
      await deps.recordAudit({
        tenantId: tryGetTenantId(),
        actor: input.actor,
        connectorId: input.connectorId,
        providerId: 'entra',
        operation: `graph.${input.method}.${normalizePath(input.path)}`,
        result: 'failure',
        metadata: { error: err instanceof Error ? err.message : String(err) },
      })
      throw err
    }

    await deps.recordAudit({
      tenantId: tryGetTenantId(),
      actor: input.actor,
      connectorId: input.connectorId,
      providerId: 'entra',
      operation: `graph.${input.method}.${normalizePath(input.path)}`,
      result: 'ok',
      metadata: { status: result.status },
    })

    return result as GraphResponse<T>
  }

  async function batch(input: {
    token: string
    actor: AuditActor
    connectorId: string
    requests: BatchRequest[]
  }): Promise<BatchResponseItem[]> {
    if (input.requests.length > 20) {
      throw new Error('batch requests must be <= 20')
    }

    const { baseUrl = BASE_URL, fetchImpl = fetch } = deps

    const envelope = {
      requests: input.requests.map((r) => ({
        id: r.id,
        method: r.method,
        url: r.url,
        headers: {
          ...(r.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...r.headers,
        },
        ...(r.body !== undefined ? { body: r.body } : {}),
        ...(r.dependsOn ? { dependsOn: r.dependsOn } : {}),
      })),
    }

    const resp = await fetchImpl(`${baseUrl}/$batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(envelope),
    })

    if (!resp.ok) {
      let body = ''
      try {
        body = await resp.text()
      } catch {
        /* ignore */
      }
      throw new GraphUnavailable(`$batch failed with status ${resp.status}: ${body.slice(0, 300)}`)
    }

    const json = (await resp.json()) as {
      responses: Array<{ id: string; status: number; body?: Record<string, unknown> }>
    }

    const results: BatchResponseItem[] = json.responses.map((r) => {
      const etag = r.body ? extractEtag(r.body, new Headers()) : null
      return {
        id: r.id,
        status: r.status,
        body: r.body,
        etag,
      }
    })

    for (const r of results) {
      const req = input.requests.find((x) => x.id === r.id)
      const path = req?.url ?? '?'
      await deps.recordAudit({
        tenantId: tryGetTenantId(),
        actor: input.actor,
        connectorId: input.connectorId,
        providerId: 'entra',
        operation: `graph.${req?.method ?? 'UNKNOWN'}.${normalizePath(path)}`,
        result: r.status >= 200 && r.status < 300 ? 'ok' : 'failure',
        metadata: { status: r.status },
      })
    }

    return results
  }

  async function* paginate<T>(input: GraphCall): AsyncIterable<T> {
    let currentInput: GraphCall = input

    while (true) {
      const res = await call<{ value: T[]; '@odata.nextLink'?: string }>(currentInput)
      const page = res.data
      if (page.value) {
        for (const item of page.value) yield item
      }
      const nextLink = page['@odata.nextLink']
      if (!nextLink) break
      const nextUrl = new URL(nextLink)
      const nextPath = nextUrl.pathname.replace(/^\/v1\.0/, '') + nextUrl.search
      currentInput = { ...input, path: nextPath }
    }
  }

  return { call, batch, paginate }
}
