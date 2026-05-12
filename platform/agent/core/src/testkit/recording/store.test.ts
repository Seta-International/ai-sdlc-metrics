import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadRecordingFile, recordingFilePath, saveRecordingFile } from './store'
import type { RecordingFile } from './types'

describe('store', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-store-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('recordingFilePath joins dir + name + .json', () => {
    expect(recordingFilePath(dir, 'my-test')).toBe(path.join(dir, 'my-test.json'))
  })

  it('loadRecordingFile returns null when the file does not exist', () => {
    expect(loadRecordingFile(recordingFilePath(dir, 'missing'))).toBeNull()
  })

  it('saveRecordingFile writes pretty-printed JSON with a trailing newline', () => {
    const file: RecordingFile = {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [],
    }
    saveRecordingFile(recordingFilePath(dir, 'demo'), file)
    const raw = fs.readFileSync(path.join(dir, 'demo.json'), 'utf-8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).toContain('  "meta"')
    const parsed = JSON.parse(raw) as RecordingFile
    expect(parsed.meta.name).toBe('demo')
    expect(parsed.recordings).toEqual([])
  })

  it('loadRecordingFile round-trips what saveRecordingFile wrote', () => {
    const file: RecordingFile = {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [
        {
          hash: 'abc1234567890def',
          request: { url: 'https://x/y', method: 'POST', body: { a: 1 } },
          response: {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: { ok: true },
            isStreaming: false,
          },
        },
      ],
    }
    const filepath = recordingFilePath(dir, 'demo')
    saveRecordingFile(filepath, file)
    expect(loadRecordingFile(filepath)).toEqual(file)
  })

  it('saveRecordingFile creates the parent directory if needed', () => {
    const nested = path.join(dir, 'a', 'b', 'c')
    saveRecordingFile(recordingFilePath(nested, 'demo'), {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [],
    })
    expect(fs.existsSync(path.join(nested, 'demo.json'))).toBe(true)
  })

  it('saveRecordingFile uses tmp+rename — the final file is either fully written or absent', () => {
    const filepath = recordingFilePath(dir, 'demo')
    saveRecordingFile(filepath, {
      meta: { name: 'demo', createdAt: '2026-05-12T00:00:00.000Z' },
      recordings: [],
    })
    // No leftover .tmp file:
    const leftovers = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))
    expect(leftovers).toEqual([])
  })

  it('loadRecordingFile throws when the JSON is structurally invalid', () => {
    const filepath = recordingFilePath(dir, 'bad')
    fs.writeFileSync(filepath, '[]') // legacy array form is no longer accepted
    expect(() => loadRecordingFile(filepath)).toThrow(/invalid recording file/i)
  })
})
