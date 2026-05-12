import fs from 'node:fs'
import path from 'node:path'
import type { RecordingFile } from './types'

export function recordingFilePath(recordingsDir: string, name: string): string {
  return path.join(recordingsDir, `${name}.json`)
}

function isRecordingFile(raw: unknown): raw is RecordingFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const obj = raw as Record<string, unknown>
  return typeof obj.meta === 'object' && obj.meta !== null && Array.isArray(obj.recordings)
}

export function loadRecordingFile(filepath: string): RecordingFile | null {
  if (!fs.existsSync(filepath)) return null
  const raw: unknown = JSON.parse(fs.readFileSync(filepath, 'utf-8'))
  if (!isRecordingFile(raw)) {
    throw new Error(`Invalid recording file format: ${filepath}`)
  }
  return raw
}

export function saveRecordingFile(filepath: string, file: RecordingFile): void {
  fs.mkdirSync(path.dirname(filepath), { recursive: true })
  const tmp = `${filepath}.tmp`
  const json = `${JSON.stringify(file, null, 2)}\n`
  fs.writeFileSync(tmp, json)
  fs.renameSync(tmp, filepath)
}
