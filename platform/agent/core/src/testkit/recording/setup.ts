import path from 'node:path'
import { bypass, HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { hashRequest } from './hash'
import { getRecordingMode } from './mode'
import { loadRecordingFile, recordingFilePath, saveRecordingFile } from './store'
import { captureStreamingResponse, createStreamingResponse, isStreamingResponse } from './streaming'
import type {
  LLMRecording,
  LLMRecordingHandle,
  RecordingFile,
  RecordingMode,
  SetupLLMRecordingOptions,
  TransformRequest,
} from './types'

const SKIP_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'api-key',
  'content-encoding',
  'transfer-encoding',
  'set-cookie',
])

function filterHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    if (!SKIP_HEADERS.has(key.toLowerCase())) out[key] = value
  })
  return out
}

function providerFromUrl(url: string): string | undefined {
  try {
    const host = new URL(url).hostname
    if (host.endsWith('anthropic.com')) return 'anthropic'
    if (host.endsWith('openai.com')) return 'openai'
    return host
  } catch {
    return undefined
  }
}

function modelFromBody(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'model' in body) {
    const m = (body as { model?: unknown }).model
    if (typeof m === 'string') return m
  }
  return undefined
}

async function readRequestBody(request: Request): Promise<unknown> {
  const ct = request.headers.get('content-type')?.toLowerCase() ?? ''
  const cloned = request.clone()
  if (ct.includes('application/json') || ct.includes('+json')) {
    return cloned.json().catch(() => ({}))
  }
  if (ct.startsWith('text/')) {
    return cloned.text().catch(() => '')
  }
  return cloned.text().catch(() => '')
}

interface RecorderState {
  mode: RecordingMode
  filepath: string
  file: RecordingFile
  dirty: boolean
  transformRequest?: TransformRequest
  name: string
}

function emptyFile(name: string): RecordingFile {
  return { meta: { name, createdAt: new Date().toISOString() }, recordings: [] }
}

function lookupRecording(file: RecordingFile, hash: string): LLMRecording | undefined {
  return file.recordings.find((r) => r.hash === hash)
}

function buildMissError(state: RecorderState, hash: string, url: string, body: unknown): Error {
  const preview = JSON.stringify(body).slice(0, 200)
  return new Error(
    `[@seta/agent-core/testkit] No matching recording for "${state.name}". ` +
      `hash=${hash} url=${url} body=${preview}. ` +
      `Set RECORD=1 to capture a new recording, or RECORD=force to re-record all.`,
  )
}

async function captureFromBypass(
  request: Request,
  hash: string,
  storedUrl: string,
  storedBody: unknown,
): Promise<LLMRecording> {
  const real = await fetch(bypass(request))
  const headers = filterHeaders(real.headers)
  const isStreaming = isStreamingResponse(real.headers)
  if (isStreaming) {
    const { chunks, timings } = await captureStreamingResponse(real)
    return {
      hash,
      request: { url: storedUrl, method: request.method, body: storedBody },
      response: {
        status: real.status,
        statusText: real.statusText,
        headers,
        chunks,
        chunkTimings: timings,
        isStreaming: true,
      },
    }
  }
  const ct = real.headers.get('content-type')?.toLowerCase() ?? ''
  const body: unknown = ct.includes('json')
    ? await real
        .clone()
        .json()
        .catch(() => undefined)
    : await real
        .clone()
        .text()
        .catch(() => undefined)
  return {
    hash,
    request: { url: storedUrl, method: request.method, body: storedBody },
    response: {
      status: real.status,
      statusText: real.statusText,
      headers,
      body,
      isStreaming: false,
    },
  }
}

function recordingToResponse(recording: LLMRecording): Response {
  if (recording.response.isStreaming) return createStreamingResponse(recording)
  const headers = recording.response.headers
  const body = recording.response.body
  const init: ResponseInit = {
    status: recording.response.status,
    statusText: recording.response.statusText,
    headers,
  }
  if (body === undefined) return new Response(null, init)
  if (typeof body === 'string') return new Response(body, init)
  return new Response(JSON.stringify(body), init)
}

export function setupLLMRecording(opts: SetupLLMRecordingOptions): LLMRecordingHandle {
  const recordingsDir = opts.recordingsDir ?? path.join(process.cwd(), '__recordings__')
  const filepath = recordingFilePath(recordingsDir, opts.name)
  let server: ReturnType<typeof setupServer> | null = null
  let started = false

  const state: RecorderState = {
    mode: getRecordingMode(),
    filepath,
    file: emptyFile(opts.name),
    dirty: false,
    name: opts.name,
    ...(opts.transformRequest ? { transformRequest: opts.transformRequest } : {}),
  }

  async function handle(request: Request): Promise<Response> {
    const rawBody = await readRequestBody(request)
    const transformed = state.transformRequest
      ? state.transformRequest({ url: request.url, body: rawBody })
      : { url: request.url, body: rawBody }
    const hash = hashRequest(transformed.url, transformed.body)

    if (state.mode === 'force') {
      const recording = await captureFromBypass(request, hash, transformed.url, transformed.body)
      state.file.recordings.push(recording)
      if (!state.file.meta.provider) {
        const p = providerFromUrl(request.url)
        if (p) state.file.meta.provider = p
      }
      if (!state.file.meta.model) {
        const m = modelFromBody(transformed.body)
        if (m) state.file.meta.model = m
      }
      state.dirty = true
      return recordingToResponse(recording)
    }

    const hit = lookupRecording(state.file, hash)
    if (hit) return recordingToResponse(hit)

    if (state.mode === 'replay') {
      throw buildMissError(state, hash, transformed.url, transformed.body)
    }

    const recording = await captureFromBypass(request, hash, transformed.url, transformed.body)
    state.file.recordings.push(recording)
    if (!state.file.meta.provider) {
      const p = providerFromUrl(request.url)
      if (p) state.file.meta.provider = p
    }
    if (!state.file.meta.model) {
      const m = modelFromBody(transformed.body)
      if (m) state.file.meta.model = m
    }
    state.dirty = true
    return recordingToResponse(recording)
  }

  const resolver = async ({ request }: { request: Request }): Promise<Response> => {
    try {
      const res = await handle(request)
      return new HttpResponse(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return HttpResponse.json({ error: message }, { status: 500 })
    }
  }

  function makeServer(): ReturnType<typeof setupServer> {
    return setupServer(
      http.all('https://api.anthropic.com/*', resolver),
      http.all('https://api.openai.com/*', resolver),
    )
  }

  function loadOrReset(): void {
    if (state.mode === 'force') {
      state.file = emptyFile(opts.name)
      return
    }
    const existing = loadRecordingFile(filepath)
    state.file = existing ?? emptyFile(opts.name)
  }

  function flush(): void {
    if (!state.dirty) return
    state.file.meta.updatedAt = new Date().toISOString()
    saveRecordingFile(filepath, state.file)
    state.dirty = false
  }

  return {
    start(): void {
      if (started) throw new Error('[@seta/agent-core/testkit] setupLLMRecording: already started')
      started = true
      loadOrReset()
      server = makeServer()
      server.listen({ onUnhandledRequest: 'bypass' })
    },
    stop(): void {
      if (!started) return
      try {
        flush()
      } finally {
        server?.close()
        server = null
        started = false
      }
    },
  }
}
