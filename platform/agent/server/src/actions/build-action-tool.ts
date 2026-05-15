import type { Tool, ToolResult } from '@seta/agent-core'
import { z } from 'zod'
import type { AgentActionRow } from '../schema'

type OpenApiOperation = {
  path: string
  method: string
  parameters?: Array<{
    name: string
    in: string
    schema?: Record<string, unknown>
    required?: boolean
  }>
  requestBody?: { content?: { 'application/json'?: { schema?: Record<string, unknown> } } }
  servers?: Array<{ url: string }>
}

function extractInputSchema(spec: Record<string, unknown>): Record<string, unknown> {
  const op = spec as OpenApiOperation
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const param of op.parameters ?? []) {
    if (param.in === 'query' || param.in === 'path') {
      properties[param.name] = param.schema ?? { type: 'string' }
      if (param.required) required.push(param.name)
    }
  }

  const bodySchema = op.requestBody?.content?.['application/json']?.schema as
    | Record<string, unknown>
    | undefined
  if (bodySchema?.properties && typeof bodySchema.properties === 'object') {
    Object.assign(properties, bodySchema.properties)
    if (Array.isArray(bodySchema.required)) required.push(...(bodySchema.required as string[]))
  }

  return { type: 'object', properties, required, additionalProperties: false }
}

async function executeAction(
  action: AgentActionRow,
  args: Record<string, unknown>,
): Promise<ToolResult<unknown>> {
  const op = action.spec as OpenApiOperation
  const auth = action.auth as { type?: string; token?: string; header?: string } | null

  const serverUrl = op.servers?.[0]?.url ?? ''
  let path = op.path
  const queryParams = new URLSearchParams()

  for (const param of op.parameters ?? []) {
    const val = args[param.name]
    if (val === undefined) continue
    if (param.in === 'path') {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(val)))
    } else if (param.in === 'query') {
      queryParams.set(param.name, String(val))
    }
  }

  const url = `${serverUrl}${path}${queryParams.size > 0 ? `?${queryParams}` : ''}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (auth?.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  } else if (auth?.type === 'api_key' && auth.header && auth.token) {
    headers[auth.header] = auth.token
  }

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(op.method.toUpperCase())
  const bodyArgs: Record<string, unknown> = {}
  if (hasBody) {
    const bodySchema = op.requestBody?.content?.['application/json']?.schema as
      | Record<string, unknown>
      | undefined
    const bodyProps = bodySchema?.properties ? Object.keys(bodySchema.properties as object) : []
    for (const key of bodyProps) {
      if (key in args) bodyArgs[key] = args[key]
    }
  }

  try {
    const resp = await fetch(url, {
      method: op.method.toUpperCase(),
      headers,
      ...(hasBody ? { body: JSON.stringify(bodyArgs) } : {}),
    })
    if (!resp.ok) {
      return { ok: false, error: { name: 'action_http_error', message: `HTTP ${resp.status}` } }
    }
    const data = resp.status === 204 ? null : await resp.json()
    return { ok: true, value: data }
  } catch (err) {
    return { ok: false, error: { name: 'action_network_error', message: String(err) } }
  }
}

export function buildActionTool(action: AgentActionRow): Tool {
  const jsonSchema = extractInputSchema(action.spec)
  const inputSchema = {
    '~standard': {
      version: 1 as const,
      vendor: 'zod' as const,
      validate: (data: unknown) => {
        const result = z.record(z.string(), z.unknown()).safeParse(data)
        return result.success ? { value: result.data } : { issues: result.error.issues }
      },
    },
    _def: jsonSchema,
  } as never

  return {
    id: action.name,
    description: action.description,
    inputSchema,
    outputSchema: inputSchema,
    execute: async (input) => executeAction(action, input as Record<string, unknown>),
  }
}
