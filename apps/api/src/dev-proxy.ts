import { type Server as HttpServer, request as httpRequest, type IncomingMessage } from 'node:http'
import { connect as netConnect } from 'node:net'
import { type Duplex, Readable } from 'node:stream'
import { logger } from '@seta/observability'
import { type Context, Hono } from 'hono'

const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

export type DevProxyMapping = { readonly prefix: string; readonly port: number }

export const FRONTEND_DEV_PROXY: readonly DevProxyMapping[] = [
  { prefix: 'console', port: 5174 },
  { prefix: 'studio', port: 5180 },
]

export function createDevProxyApp(mappings: readonly DevProxyMapping[]): Hono {
  const app = new Hono()
  for (const mapping of mappings) {
    const handler = (c: Context) => proxyHttp(c, mapping.port)
    app.all(`/${mapping.prefix}`, handler)
    app.all(`/${mapping.prefix}/*`, handler)
  }
  return app
}

export function attachDevProxyUpgrade(
  server: HttpServer,
  mappings: readonly DevProxyMapping[],
): void {
  server.on('upgrade', (req, clientSocket, head) => {
    const url = req.url ?? '/'
    const match = mappings.find((m) => url === `/${m.prefix}` || url.startsWith(`/${m.prefix}/`))
    if (!match) {
      clientSocket.destroy()
      return
    }
    pipeWebSocketUpgrade(match.port, req, clientSocket, head)
  })
}

async function proxyHttp(c: Context, targetPort: number): Promise<Response> {
  const reqUrl = new URL(c.req.url)
  const headers = sanitizeForwardedHeaders(c.req.raw.headers, `localhost:${targetPort}`)

  try {
    return await new Promise<Response>((resolve, reject) => {
      const upstream = httpRequest(
        {
          hostname: 'localhost',
          port: targetPort,
          method: c.req.method,
          path: `${reqUrl.pathname}${reqUrl.search}`,
          headers,
        },
        (res) => resolve(buildResponseFromUpstream(res)),
      )
      upstream.on('error', reject)

      const body = c.req.raw.body
      if (body && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
        Readable.fromWeb(body).pipe(upstream)
      } else {
        upstream.end()
      }
    })
  } catch (err) {
    logger.error({ err, path: c.req.path, port: targetPort }, 'dev-proxy upstream unreachable')
    return new Response(`Dev proxy: upstream localhost:${targetPort} unreachable`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
}

function sanitizeForwardedHeaders(input: Headers, host: string): Record<string, string> {
  const out: Record<string, string> = {}
  const connectionValue = input.get('connection')
  const connectionTokens = connectionValue
    ? new Set(connectionValue.split(',').map((s) => s.trim().toLowerCase()))
    : new Set<string>()

  for (const [name, value] of input) {
    const lower = name.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (connectionTokens.has(lower)) continue
    out[lower] = value
  }
  out.host = host
  return out
}

function buildResponseFromUpstream(upstream: IncomingMessage): Response {
  const headers = new Headers()
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (value == null) continue
    const lower = name.toLowerCase()
    if (HOP_BY_HOP_HEADERS.has(lower)) continue
    if (Array.isArray(value)) {
      for (const v of value) headers.append(lower, v)
    } else {
      headers.set(lower, String(value))
    }
  }
  const body = Readable.toWeb(upstream) as ReadableStream<Uint8Array>
  return new Response(body, {
    status: upstream.statusCode ?? 502,
    headers,
  })
}

function pipeWebSocketUpgrade(
  targetPort: number,
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
): void {
  const upstream = netConnect(targetPort, 'localhost')

  const tearDown = (err: Error) => {
    logger.error({ err, url: req.url, port: targetPort }, 'dev-proxy ws error')
    upstream.destroy()
    clientSocket.destroy()
  }
  upstream.on('error', tearDown)
  clientSocket.on('error', tearDown)

  upstream.once('connect', () => {
    const headerBlock = serializeRawHeadersWithHost(req.rawHeaders, `localhost:${targetPort}`)
    upstream.write(
      `${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/${req.httpVersion}\r\n${headerBlock}\r\n\r\n`,
    )
    if (head.length > 0) upstream.write(head)
    upstream.pipe(clientSocket)
    clientSocket.pipe(upstream)
  })
}

function serializeRawHeadersWithHost(rawHeaders: readonly string[], host: string): string {
  const lines: string[] = []
  let sawHost = false
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i]
    const value = rawHeaders[i + 1]
    if (name == null || value == null) continue
    if (name.toLowerCase() === 'host') {
      lines.push(`Host: ${host}`)
      sawHost = true
    } else {
      lines.push(`${name}: ${value}`)
    }
  }
  if (!sawHost) lines.push(`Host: ${host}`)
  return lines.join('\r\n')
}
