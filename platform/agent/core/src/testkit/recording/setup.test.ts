import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupLLMRecording } from './setup'
import { loadRecordingFile, recordingFilePath, saveRecordingFile } from './store'
import type { RecordingFile } from './types'

type FetchInput = Parameters<typeof fetch>[0]

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

describe('setupLLMRecording', () => {
  let dir: string
  const originalRecord = process.env.RECORD

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-setup-'))
    delete process.env.RECORD
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
    if (originalRecord === undefined) delete process.env.RECORD
    else process.env.RECORD = originalRecord
  })

  it('start() then stop() does not throw on a fresh dir', () => {
    const rec = setupLLMRecording({ name: 'fresh', recordingsDir: dir })
    rec.start()
    rec.stop()
  })

  it('replay mode + missing recording returns a 500 with a helpful error', async () => {
    const rec = setupLLMRecording({ name: 'missing', recordingsDir: dir })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-5-haiku-latest', messages: [] }),
      })
      expect(res.status).toBe(500)
      const data = (await res.json()) as { error: string }
      expect(data.error).toMatch(/no matching recording for "missing"/i)
      expect(data.error).toMatch(/api\.anthropic\.com/)
      expect(data.error).toMatch(/RECORD=1/)
    } finally {
      rec.stop()
    }
  })

  it('replay mode + matching recording returns the canned response', async () => {
    const filepath = recordingFilePath(dir, 'replay-hit')
    const { hashRequest } = await import('./hash')
    const body = { model: 'm', messages: [] }
    const file: RecordingFile = {
      meta: { name: 'replay-hit', createdAt: new Date().toISOString() },
      recordings: [
        {
          hash: hashRequest(ANTHROPIC_URL, body),
          request: { url: ANTHROPIC_URL, method: 'POST', body },
          response: {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            body: { id: 'msg_test', content: [{ type: 'text', text: 'pong' }] },
            isStreaming: false,
          },
        },
      ],
    }
    saveRecordingFile(filepath, file)

    const rec = setupLLMRecording({ name: 'replay-hit', recordingsDir: dir })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { id: string }
      expect(data.id).toBe('msg_test')
    } finally {
      rec.stop()
    }
  })

  it('record mode (RECORD=1) writes a new entry when none exists', async () => {
    process.env.RECORD = '1'
    const filepath = recordingFilePath(dir, 'record-miss')

    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: FetchInput, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url === ANTHROPIC_URL) {
        return new Response(JSON.stringify({ id: 'msg_recorded', content: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return realFetch(input as FetchInput, init)
    }) as typeof fetch

    try {
      const rec = setupLLMRecording({ name: 'record-miss', recordingsDir: dir })
      rec.start()
      try {
        const res = await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'm', messages: [] }),
        })
        expect(res.status).toBe(200)
      } finally {
        rec.stop()
      }
      const stored = loadRecordingFile(filepath)
      expect(stored).not.toBeNull()
      expect(stored?.recordings).toHaveLength(1)
      expect(stored?.recordings[0]?.response.body).toEqual({ id: 'msg_recorded', content: [] })
      expect(stored?.meta.provider).toBe('anthropic')
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('force mode (RECORD=force) overwrites the recordings array', async () => {
    process.env.RECORD = 'force'
    const filepath = recordingFilePath(dir, 'force')
    saveRecordingFile(filepath, {
      meta: { name: 'force', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: 'old',
          request: { url: ANTHROPIC_URL, method: 'POST', body: { model: 'old' } },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: { id: 'old' },
            isStreaming: false,
          },
        },
      ],
    })

    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url === ANTHROPIC_URL) {
        return new Response(JSON.stringify({ id: 'fresh' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return realFetch(input as FetchInput)
    }) as typeof fetch

    try {
      const rec = setupLLMRecording({ name: 'force', recordingsDir: dir })
      rec.start()
      try {
        await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'new' }),
        })
      } finally {
        rec.stop()
      }
      const stored = loadRecordingFile(filepath)
      expect(stored?.recordings).toHaveLength(1)
      expect(stored?.recordings[0]?.request.body).toEqual({ model: 'new' })
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('record mode hash hit replays without re-recording', async () => {
    process.env.RECORD = '1'
    const filepath = recordingFilePath(dir, 'record-hit')
    const { hashRequest } = await import('./hash')
    const body = { model: 'm', messages: [] }
    saveRecordingFile(filepath, {
      meta: { name: 'record-hit', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: hashRequest(ANTHROPIC_URL, body),
          request: { url: ANTHROPIC_URL, method: 'POST', body },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: { id: 'cached' },
            isStreaming: false,
          },
        },
      ],
    })

    const rec = setupLLMRecording({ name: 'record-hit', recordingsDir: dir })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { id: string }
      expect(data.id).toBe('cached')
    } finally {
      rec.stop()
    }
  })

  it('transformRequest normalizes volatile fields before hashing', async () => {
    const filepath = recordingFilePath(dir, 'transform')
    const { hashRequest } = await import('./hash')
    const canonicalBody = { model: 'm', run_id: 'NORMALIZED', messages: [] }
    saveRecordingFile(filepath, {
      meta: { name: 'transform', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: hashRequest(ANTHROPIC_URL, canonicalBody),
          request: { url: ANTHROPIC_URL, method: 'POST', body: canonicalBody },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: { id: 'ok' },
            isStreaming: false,
          },
        },
      ],
    })

    const rec = setupLLMRecording({
      name: 'transform',
      recordingsDir: dir,
      transformRequest: ({ url, body }) => ({
        url,
        body: { ...(body as Record<string, unknown>), run_id: 'NORMALIZED' },
      }),
    })
    rec.start()
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'm', run_id: 'each-run-different', messages: [] }),
      })
      const data = (await res.json()) as { id: string }
      expect(data.id).toBe('ok')
    } finally {
      rec.stop()
    }
  })

  it('non-LLM requests pass through (onUnhandledRequest: bypass)', async () => {
    const rec = setupLLMRecording({ name: 'bypass', recordingsDir: dir })
    rec.start()
    try {
      const realFetch = globalThis.fetch
      globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
        if (url.startsWith('https://example.invalid/')) {
          return new Response('ok', { status: 200 })
        }
        return realFetch(input as FetchInput)
      }) as typeof fetch
      try {
        const res = await fetch('https://example.invalid/x')
        expect(res.status).toBe(200)
      } finally {
        globalThis.fetch = realFetch
      }
    } finally {
      rec.stop()
    }
  })

  it('start() twice without stop() throws', () => {
    const rec = setupLLMRecording({ name: 'double-start', recordingsDir: dir })
    rec.start()
    try {
      expect(() => rec.start()).toThrow(/already started/i)
    } finally {
      rec.stop()
    }
  })

  it('strips sensitive request headers from the recording', async () => {
    process.env.RECORD = '1'
    const filepath = recordingFilePath(dir, 'header-strip')

    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: FetchInput): Promise<Response> => {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
      if (url === ANTHROPIC_URL) {
        return new Response(JSON.stringify({ id: 'ok' }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            authorization: 'Bearer leaked',
            'set-cookie': 'session=bad',
            'x-anthropic-id': 'keep-me',
          },
        })
      }
      return realFetch(input as FetchInput)
    }) as typeof fetch

    try {
      const rec = setupLLMRecording({ name: 'header-strip', recordingsDir: dir })
      rec.start()
      try {
        await fetch(ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        })
      } finally {
        rec.stop()
      }
      const stored = loadRecordingFile(filepath)
      const headers = stored?.recordings[0]?.response.headers ?? {}
      expect(headers.authorization).toBeUndefined()
      expect(headers['set-cookie']).toBeUndefined()
      expect(headers['x-anthropic-id']).toBe('keep-me')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
