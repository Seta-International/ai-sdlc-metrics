import { Inject, Injectable } from '@nestjs/common'
import {
  GraphAuthError,
  GraphNotFoundError,
  GraphPreconditionFailedError,
  GraphQuotaError,
  GraphServerError,
  GraphThrottledError,
  GraphUnknownError,
} from './errors'
import { IdentityQueryFacade } from '../../../identity/application/facades/identity-query.facade'
import {
  MS_GRAPH_TOKEN_ACQUIRER,
  type IMsGraphTokenAcquirer,
} from '../../domain/ports/ms-graph-token-acquirer.port'

export interface GraphResponse<T> {
  status: number
  body: T | null
  etag: string | null
}

export interface GraphGetOptions {
  ifNoneMatch?: string
  useBeta?: boolean
}

export interface GraphMutateOptions {
  ifMatch?: string
  useBeta?: boolean
  preferReturnRepresentation?: boolean
}

const V1 = 'https://graph.microsoft.com/v1.0'
const BETA = 'https://graph.microsoft.com/beta'

const PLANNER_QUOTA_CODES = new Set([
  'MaximumPlannerPlans',
  'MaximumTasksInProject',
  'MaximumActiveTasksInProject',
  'MaximumBucketsInProject',
  'MaximumReferencesOnTask',
  'MaximumChecklistItemsOnTask',
  'MaximumAssigneesInTasks',
  'MaximumUsersSharedWithProject',
  'MaximumTasksCreatedByUser',
  'MaximumTasksAssignedToUser',
])

@Injectable()
export class MsGraphClient {
  constructor(
    private readonly identityFacade: IdentityQueryFacade,
    @Inject(MS_GRAPH_TOKEN_ACQUIRER)
    private readonly tokenAcquirer: IMsGraphTokenAcquirer,
  ) {}

  async get<T>(
    tenantId: string,
    path: string,
    opts: GraphGetOptions = {},
  ): Promise<GraphResponse<T>> {
    return this.request<T>(tenantId, 'GET', path, undefined, {
      ifNoneMatch: opts.ifNoneMatch,
      useBeta: opts.useBeta,
    })
  }

  async post<T>(
    tenantId: string,
    path: string,
    body: unknown,
    opts: GraphMutateOptions = {},
  ): Promise<GraphResponse<T>> {
    return this.request<T>(tenantId, 'POST', path, body, opts)
  }

  async patch<T>(
    tenantId: string,
    path: string,
    body: unknown,
    opts: GraphMutateOptions = {},
  ): Promise<GraphResponse<T>> {
    return this.request<T>(tenantId, 'PATCH', path, body, opts)
  }

  async delete(
    tenantId: string,
    path: string,
    opts: GraphMutateOptions = {},
  ): Promise<GraphResponse<void>> {
    return this.request<void>(tenantId, 'DELETE', path, undefined, opts)
  }

  async getAllPages<T>(tenantId: string, path: string, opts: GraphGetOptions = {}): Promise<T[]> {
    const collected: T[] = []
    let url: string | undefined = (opts.useBeta ? BETA : V1) + path
    while (url) {
      const page: GraphResponse<{ value: T[]; '@odata.nextLink'?: string }> =
        await this.requestAbsolute<{ value: T[]; '@odata.nextLink'?: string }>(
          tenantId,
          'GET',
          url,
          undefined,
          { ifNoneMatch: opts.ifNoneMatch },
        )
      if (page.body?.value) collected.push(...page.body.value)
      url = page.body?.['@odata.nextLink']
    }
    return collected
  }

  private async request<T>(
    tenantId: string,
    method: string,
    path: string,
    body: unknown,
    opts: {
      ifMatch?: string
      ifNoneMatch?: string
      useBeta?: boolean
      preferReturnRepresentation?: boolean
    },
  ): Promise<GraphResponse<T>> {
    const url = (opts.useBeta ? BETA : V1) + path
    return this.requestAbsolute<T>(tenantId, method, url, body, opts)
  }

  private async requestAbsolute<T>(
    tenantId: string,
    method: string,
    url: string,
    body: unknown,
    opts: { ifMatch?: string; ifNoneMatch?: string; preferReturnRepresentation?: boolean },
  ): Promise<GraphResponse<T>> {
    const cred = await this.identityFacade.getGraphCredential(tenantId)
    if (!cred) throw new GraphAuthError('No MS Graph credential for tenant', 401, null)
    const token = await this.tokenAcquirer.acquire(cred)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (opts.ifMatch) headers['If-Match'] = opts.ifMatch
    if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch
    if (opts.preferReturnRepresentation) headers['Prefer'] = 'return=representation'

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (response.status === 304) {
      return { status: 304, body: null, etag: response.headers.get('etag') }
    }
    if (response.status === 204) {
      return { status: 204, body: null, etag: response.headers.get('etag') }
    }

    if (!response.ok) {
      const text = await response.text()
      this.throwTypedError(response.status, text, response.headers)
    }

    const contentType = response.headers.get('content-type') ?? ''
    const parsedBody = contentType.includes('application/json')
      ? ((await response.json()) as T)
      : null
    const etag =
      ((parsedBody as Record<string, unknown>)?.['@odata.etag'] as string) ??
      response.headers.get('etag')
    return { status: response.status, body: parsedBody, etag }
  }

  private throwTypedError(status: number, text: string, headers: Headers): never {
    let parsed: unknown = null
    try {
      parsed = JSON.parse(text)
    } catch {
      // leave parsed as null
    }

    if (status === 412) {
      throw new GraphPreconditionFailedError('412 Precondition Failed', status, parsed ?? text)
    }
    if (status === 429) {
      const ra = parseInt(headers.get('retry-after') ?? '30', 10)
      throw new GraphThrottledError(
        `429 Throttled; retry-after=${ra}`,
        parsed ?? text,
        isNaN(ra) ? 30 : ra,
      )
    }
    if (status === 401) {
      throw new GraphAuthError('401 Unauthorized', status, parsed ?? text)
    }
    if (status === 403) {
      const parsedError = (parsed as Record<string, Record<string, unknown>> | null)?.['error']
      const limitCode = parsedError?.['code']
      if (typeof limitCode === 'string' && PLANNER_QUOTA_CODES.has(limitCode)) {
        throw new GraphQuotaError(`403 Quota: ${limitCode}`, parsed, limitCode)
      }
      throw new GraphAuthError('403 Forbidden', status, parsed ?? text)
    }
    if (status === 404) {
      throw new GraphNotFoundError('404 Not Found', status, parsed ?? text)
    }
    if (status >= 500) {
      throw new GraphServerError(`${status} Server Error`, status, parsed ?? text)
    }
    throw new GraphUnknownError(`${status} ${text.slice(0, 200)}`, status, parsed ?? text)
  }
}
