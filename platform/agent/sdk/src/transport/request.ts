import type { z } from 'zod'
import type { AgentClientOptions } from '../types'
import { AgentClientError } from './AgentClientError'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface JsonRequest<T> {
  method?: Method
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  schema: z.ZodType<T>
  expect?: 'json'
}

interface StreamRequest {
  method?: Method
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  expect: 'stream'
}

export function request<T>(opts: AgentClientOptions, path: string, init: JsonRequest<T>): Promise<T>
export function request(
  opts: AgentClientOptions,
  path: string,
  init: StreamRequest,
): Promise<Response>
export async function request(
  opts: AgentClientOptions,
  path: string,
  init: JsonRequest<unknown> | StreamRequest,
): Promise<unknown> {
  const url = new URL(path, opts.baseUrl).toString()
  const fetchImpl = opts.fetch ?? fetch
  const headers = new Headers(opts.headers)
  for (const [k, v] of Object.entries(init.headers ?? {})) headers.set(k, v)
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const fetchInit: RequestInit = {
    method: init.method ?? 'GET',
    headers,
    credentials: opts.credentials ?? 'include',
  }
  if (init.body !== undefined) fetchInit.body = JSON.stringify(init.body)
  if (init.signal) fetchInit.signal = init.signal

  let res: Response
  try {
    res = await fetchImpl(url, fetchInit)
  } catch (cause) {
    if (init.signal?.aborted) throw new AgentClientError({ kind: 'abort' })
    throw new AgentClientError({ kind: 'network', cause })
  }

  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // body may be non-JSON
    }
    throw new AgentClientError({ kind: 'http', status: res.status, body })
  }

  if (init.expect === 'stream') return res

  let json: unknown
  try {
    json = await res.json()
  } catch (cause) {
    throw new AgentClientError({ kind: 'parse', cause })
  }
  const parsed = init.schema.safeParse(json)
  if (!parsed.success) throw new AgentClientError({ kind: 'parse', cause: parsed.error })
  return parsed.data
}
